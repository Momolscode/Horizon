import "server-only";
import { createTransport } from "nodemailer";
import type { Pool, PoolClient } from "pg";
import { MAX_EMAIL_ATTEMPTS, renderEmail, retryDelayMinutes, type EmailKind } from "@/modules/notifications/emails";

/**
 * E-mails transactionnels (docs/DECISIONS.md D-019). L'événement enregistre l'e-mail dans
 * `email_outbox` dans sa propre transaction ; l'envoi SMTP a lieu ensuite, hors transaction,
 * avec relances. Sans SMTP configuré, rien n'est envoyé et l'administration l'affiche.
 */
type Queryable = Pool | PoolClient;

export type OutgoingMessage = { to: string; from: string; subject: string; text: string };
export type MailTransport = { send(message: OutgoingMessage): Promise<void> };

export function mailSettings() {
  const smtpUrl = process.env.SMTP_URL?.trim() || null;
  const from = process.env.MAIL_FROM?.trim() || null;
  return {
    configured: Boolean(smtpUrl && from),
    smtpUrl,
    from,
    siteUrl: process.env.SITE_URL?.trim() || null,
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null,
  };
}

let cachedTransport: { url: string; transport: MailTransport } | null = null;
function smtpTransport(url: string): MailTransport {
  if (cachedTransport?.url !== url) {
    // Délais courts : l'envoi a lieu après la réponse HTTP, sur une fonction serveur à durée limitée.
    const mailer = createTransport({ url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
    cachedTransport = {
      url,
      transport: {
        send: async (message) => {
          await mailer.sendMail(message);
        },
      },
    };
  }
  return cachedTransport.transport;
}

/** Enregistre un e-mail à envoyer (idempotent grâce à `dedupeKey`). À appeler dans la transaction de l'événement. */
export async function enqueueEmail(c: Queryable, email: { userId: string; kind: EmailKind; payload: Record<string, unknown>; dedupeKey: string }): Promise<boolean> {
  const res = await c.query(
    `insert into public.email_outbox (user_id, kind, payload, dedupe_key) values ($1, $2, $3, $4) on conflict (dedupe_key) do nothing returning id`,
    [email.userId, email.kind, JSON.stringify(email.payload), email.dedupeKey],
  );
  return Boolean(res.rowCount);
}

/** Message d'erreur sans secret (identifiants SMTP), sur une ligne, borné. */
function safeError(error: unknown, secrets: Array<string | null>): string {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) if (secret) message = message.split(secret).join("***");
  return message.replace(/\s+/g, " ").trim().slice(0, 300) || "erreur inconnue";
}

function smtpSecrets(url: string | null): string[] {
  if (!url) return [];
  try {
    const parsed = new URL(url);
    return [url, parsed.password, decodeURIComponent(parsed.password)].filter(Boolean);
  } catch {
    return [url];
  }
}

export type DeliveryReport = { status: "not_configured" } | { status: "done"; sent: number; retried: number; failed: number };

/**
 * Envoie les e-mails dus. Chaque e-mail est réservé (verrou court, `skip locked`) avant l'envoi :
 * deux instances n'envoient pas le même message. Garantie « au moins une fois » : un arrêt entre
 * l'envoi SMTP et son enregistrement peut provoquer un doublon, jamais une perte silencieuse.
 */
export async function deliverPendingEmails(db: Pool, options: { transport?: MailTransport; limit?: number } = {}): Promise<DeliveryReport> {
  const settings = mailSettings();
  if (!settings.from || (!options.transport && !settings.smtpUrl)) return { status: "not_configured" };
  const transport = options.transport ?? smtpTransport(settings.smtpUrl!);
  const secrets = smtpSecrets(settings.smtpUrl);
  const claimed = await db.query(
    `update public.email_outbox o set locked_until = now() + interval '10 minutes', attempts = o.attempts + 1
       from auth.users u
      where u.id = o.user_id
        and o.id in (select id from public.email_outbox
                      where sent_at is null and failed_at is null and next_attempt_at <= now() and (locked_until is null or locked_until < now())
                      order by created_at limit $1 for update skip locked)
      returning o.id, o.kind, o.payload, o.attempts, u.email`,
    [options.limit ?? 20],
  );
  const report = { status: "done" as const, sent: 0, retried: 0, failed: 0 };
  for (const row of claimed.rows as Array<{ id: string; kind: string; payload: unknown; attempts: number; email: string | null }>) {
    const rendered = renderEmail(row.kind, row.payload, { siteUrl: settings.siteUrl, supportEmail: settings.supportEmail });
    if (!row.email || !rendered) {
      await db.query(`update public.email_outbox set failed_at = now(), locked_until = null, last_error = $2 where id = $1`, [
        row.id,
        row.email ? "Contenu enregistré invalide : e-mail non envoyé." : "Compte sans adresse e-mail.",
      ]);
      report.failed++;
      continue;
    }
    try {
      await transport.send({ to: row.email, from: settings.from, subject: rendered.subject, text: rendered.text });
      await db.query(`update public.email_outbox set sent_at = now(), locked_until = null, last_error = null where id = $1`, [row.id]);
      report.sent++;
    } catch (error) {
      const final = row.attempts >= MAX_EMAIL_ATTEMPTS;
      await db.query(
        `update public.email_outbox set locked_until = null, last_error = $2,
                next_attempt_at = now() + make_interval(mins => $3), failed_at = case when $4 then now() end
          where id = $1`,
        [row.id, safeError(error, secrets), retryDelayMinutes(row.attempts), final],
      );
      if (final) report.failed++;
      else report.retried++;
    }
  }
  return report;
}

/** Remet en file les e-mails abandonnés (après correction de la configuration SMTP, par exemple). */
export async function retryFailedEmails(db: Queryable): Promise<number> {
  const res = await db.query(`update public.email_outbox set failed_at = null, attempts = 0, next_attempt_at = now(), last_error = null where failed_at is not null and sent_at is null`);
  return res.rowCount ?? 0;
}

/** Minimisation : les e-mails envoyés sont oubliés après 30 jours, les échecs après 90. */
export async function purgeOldEmails(db: Queryable): Promise<number> {
  const res = await db.query(
    `delete from public.email_outbox where sent_at < now() - interval '30 days' or (failed_at is not null and failed_at < now() - interval '90 days')`,
  );
  return res.rowCount ?? 0;
}

export async function mailStatus(db: Queryable) {
  const res = await db.query(
    `select count(*) filter (where sent_at is null and failed_at is null)::int as pending,
            count(*) filter (where failed_at is not null and sent_at is null)::int as failed,
            count(*) filter (where sent_at > now() - interval '7 days')::int as sent_7d,
            (select last_error from public.email_outbox where last_error is not null and sent_at is null order by created_at desc limit 1) as last_error
       from public.email_outbox`,
  );
  const settings = mailSettings();
  return { configured: settings.configured, siteUrlConfigured: Boolean(settings.siteUrl), ...(res.rows[0] as { pending: number; failed: number; sent_7d: number; last_error: string | null }) };
}

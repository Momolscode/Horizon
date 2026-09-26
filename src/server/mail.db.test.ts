import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createUser, deleteUsers, pool } from "@/test/db";
import { deliverPendingEmails, enqueueEmail, mailStatus, purgeOldEmails, retryFailedEmails, type MailTransport, type OutgoingMessage } from "./mail";

/** File d'e-mails transactionnels (D-019) sur PostgreSQL réel ; envoi SMTP réel vers Mailpit (pile locale). */
const saved = { SMTP_URL: process.env.SMTP_URL, MAIL_FROM: process.env.MAIL_FROM, SITE_URL: process.env.SITE_URL };
const MAILPIT = "http://127.0.0.1:54324";
const stamp = Date.now().toString(36);
const users: string[] = [];
let user: string;
let address: string;

const payload = { placeId: "lyon-fourviere", placeName: `Basilique ${stamp}` };
const row = async (dedupeKey: string) => (await pool.query(`select * from public.email_outbox where dedupe_key = $1`, [dedupeKey])).rows[0];
const collecting = (sent: OutgoingMessage[], delayMs = 0): MailTransport => ({
  send: async (message) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    sent.push(message);
  },
});

beforeAll(async () => {
  user = await createUser("mail");
  users.push(user);
  address = String((await pool.query(`select email from auth.users where id = $1`, [user])).rows[0].email);
  process.env.MAIL_FROM = "HORIZON (test) <no-reply@horizon.local>";
  process.env.SITE_URL = "https://horizon.example";
  delete process.env.SMTP_URL;
});
afterEach(async () => {
  await pool.query(`delete from public.email_outbox where user_id = any($1::uuid[])`, [users]);
});
afterAll(async () => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await deleteUsers(users);
  await pool.end();
});

describe("file d'e-mails", () => {
  it("un événement produit un seul e-mail (clé de déduplication)", async () => {
    expect(await enqueueEmail(pool, { userId: user, kind: "review_withdrawn", payload, dedupeKey: `t1-${stamp}` })).toBe(true);
    expect(await enqueueEmail(pool, { userId: user, kind: "review_withdrawn", payload, dedupeKey: `t1-${stamp}` })).toBe(false);
    expect((await pool.query(`select count(*)::int as n from public.email_outbox where dedupe_key = $1`, [`t1-${stamp}`])).rows[0].n).toBe(1);
    // Aucune adresse n'est copiée dans la file ; le navigateur n'y a aucun accès.
    expect(JSON.stringify(await row(`t1-${stamp}`))).not.toContain(address);
  });

  it("envoi : adresse lue dans le compte, e-mail marqué envoyé et jamais renvoyé", async () => {
    await enqueueEmail(pool, { userId: user, kind: "review_withdrawn", payload, dedupeKey: `t2-${stamp}` });
    const sent: OutgoingMessage[] = [];
    await deliverPendingEmails(pool, { transport: collecting(sent) });
    const mine = sent.filter((m) => m.to === address);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ from: "HORIZON (test) <no-reply@horizon.local>", subject: `Votre avis sur « Basilique ${stamp} » a été retiré` });
    expect(mine[0]!.text).toContain("https://horizon.example/lieux/lyon-fourviere");
    expect(await row(`t2-${stamp}`)).toMatchObject({ attempts: 1, failed_at: null, locked_until: null, last_error: null });
    expect((await row(`t2-${stamp}`)).sent_at).not.toBeNull();
    await deliverPendingEmails(pool, { transport: collecting(sent) });
    expect(sent.filter((m) => m.to === address)).toHaveLength(1);
  });

  it("sans configuration SMTP : rien n'est envoyé, rien n'est perdu, l'administration le voit", async () => {
    await enqueueEmail(pool, { userId: user, kind: "review_withdrawn", payload, dedupeKey: `t3-${stamp}` });
    expect(await deliverPendingEmails(pool)).toEqual({ status: "not_configured" });
    delete process.env.MAIL_FROM;
    expect(await deliverPendingEmails(pool, { transport: collecting([]) })).toEqual({ status: "not_configured" });
    const status = await mailStatus(pool);
    expect(status.configured).toBe(false);
    expect(status.pending).toBeGreaterThanOrEqual(1);
    process.env.MAIL_FROM = "HORIZON (test) <no-reply@horizon.local>";
    expect(await row(`t3-${stamp}`)).toMatchObject({ attempts: 0, sent_at: null, failed_at: null });
  });

  it("échec SMTP : relances espacées, identifiants masqués, abandon après 5 tentatives, remise en file", async () => {
    process.env.SMTP_URL = "smtp://horizon:s3cr3t-pass@127.0.0.1:1";
    const failing: MailTransport = {
      send: async () => {
        throw new Error("Invalid login for smtp://horizon:s3cr3t-pass@127.0.0.1:1 (s3cr3t-pass)\n535 5.7.8");
      },
    };
    try {
      await enqueueEmail(pool, { userId: user, kind: "review_withdrawn", payload, dedupeKey: `t4-${stamp}` });
      await deliverPendingEmails(pool, { transport: failing });
      let current = await row(`t4-${stamp}`);
      expect(current).toMatchObject({ attempts: 1, sent_at: null, failed_at: null, locked_until: null });
      expect(current.last_error).not.toContain("s3cr3t-pass");
      expect(current.last_error).toContain("***");
      expect(current.last_error).not.toMatch(/\n/);
      expect(new Date(current.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 30_000);
      // Pas encore dû : non retenté.
      await deliverPendingEmails(pool, { transport: failing });
      expect((await row(`t4-${stamp}`)).attempts).toBe(1);
      for (let attempt = 2; attempt <= 5; attempt++) {
        await pool.query(`update public.email_outbox set next_attempt_at = now() where dedupe_key = $1`, [`t4-${stamp}`]);
        await deliverPendingEmails(pool, { transport: failing });
      }
      current = await row(`t4-${stamp}`);
      expect(current.attempts).toBe(5);
      expect(current.failed_at).not.toBeNull();
      expect((await mailStatus(pool)).failed).toBeGreaterThanOrEqual(1);
      // Abandonné : plus aucune tentative, jusqu'à la remise en file.
      await pool.query(`update public.email_outbox set next_attempt_at = now() where dedupe_key = $1`, [`t4-${stamp}`]);
      await deliverPendingEmails(pool, { transport: failing });
      expect((await row(`t4-${stamp}`)).attempts).toBe(5);
      expect(await retryFailedEmails(pool)).toBeGreaterThanOrEqual(1);
      const sent: OutgoingMessage[] = [];
      await deliverPendingEmails(pool, { transport: collecting(sent) });
      expect(sent.filter((m) => m.to === address)).toHaveLength(1);
    } finally {
      delete process.env.SMTP_URL;
    }
  });

  it("deux envois simultanés (deux instances) : chaque e-mail part une seule fois", async () => {
    for (let i = 0; i < 6; i++) await enqueueEmail(pool, { userId: user, kind: "review_withdrawn", payload, dedupeKey: `t5-${stamp}-${i}` });
    const sent: OutgoingMessage[] = [];
    await Promise.all([deliverPendingEmails(pool, { transport: collecting(sent, 40) }), deliverPendingEmails(pool, { transport: collecting(sent, 40) })]);
    expect(sent.filter((m) => m.to === address)).toHaveLength(6);
    expect((await pool.query(`select count(*)::int as n from public.email_outbox where user_id = $1 and sent_at is not null`, [user])).rows[0].n).toBe(6);
  });

  it("la suppression du compte supprime ses e-mails en file", async () => {
    const ghost = await createUser("mail-ghost");
    await enqueueEmail(pool, { userId: ghost, kind: "review_withdrawn", payload, dedupeKey: `t6-${stamp}` });
    await deleteUsers([ghost]);
    expect(await row(`t6-${stamp}`)).toBeUndefined();
  });

  it("purge : envoyés depuis plus de 30 jours et abandons de plus de 90 jours", async () => {
    await pool.query(
      `insert into public.email_outbox (user_id, kind, payload, dedupe_key, sent_at, failed_at) values
         ($1, 'review_withdrawn', '{}', $2, now() - interval '31 days', null),
         ($1, 'review_withdrawn', '{}', $3, now() - interval '2 days', null),
         ($1, 'review_withdrawn', '{}', $4, null, now() - interval '91 days'),
         ($1, 'review_withdrawn', '{}', $5, null, now() - interval '10 days')`,
      [user, `t7a-${stamp}`, `t7b-${stamp}`, `t7c-${stamp}`, `t7d-${stamp}`],
    );
    await purgeOldEmails(pool);
    const left = (await pool.query(`select dedupe_key from public.email_outbox where user_id = $1 order by dedupe_key`, [user])).rows.map((r) => r.dedupe_key);
    expect(left).toEqual([`t7b-${stamp}`, `t7d-${stamp}`]);
  });

  it("envoi SMTP réel vers le serveur de test local (Mailpit) : message reçu, texte en français", async () => {
    process.env.SMTP_URL = "smtp://127.0.0.1:54325";
    try {
      await enqueueEmail(pool, { userId: user, kind: "review_withdrawn", payload, dedupeKey: `t8-${stamp}` });
      const report = await deliverPendingEmails(pool);
      expect(report).toMatchObject({ status: "done" });
      expect((await row(`t8-${stamp}`)).sent_at).not.toBeNull();
      let found: { ID: string; Subject: string } | undefined;
      for (let i = 0; i < 20 && !found; i++) {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`);
        found = ((await res.json()) as { messages: Array<{ ID: string; Subject: string }> }).messages.find((m) => m.Subject.includes(`Basilique ${stamp}`));
        if (!found) await new Promise((r) => setTimeout(r, 250));
      }
      expect(found?.Subject).toBe(`Votre avis sur « Basilique ${stamp} » a été retiré`);
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${found!.ID}`)).json()) as { Text: string; From: { Address: string } };
      expect(message.From.Address).toBe("no-reply@horizon.local");
      expect(message.Text).toContain("il n'est plus affiché, mais il n'est pas supprimé");
      expect(message.Text).toContain("https://horizon.example/contributions");
    } finally {
      delete process.env.SMTP_URL;
    }
  });
});

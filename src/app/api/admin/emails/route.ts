import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/server/db";
import { adminRoute, audit } from "@/server/admin";
import { deliverPendingEmails, mailStatus, retryFailedEmails } from "@/server/mail";

/** État de la file d'e-mails (configuration SMTP, en attente, en échec). */
export const GET = adminRoute(async () => NextResponse.json(await mailStatus(getPool())));

/** Envoie maintenant les e-mails dus ; `retryFailed` remet d'abord en file les e-mails abandonnés. */
export const POST = adminRoute(
  async ({ request, admin }) => {
    const parsed = z.object({ retryFailed: z.boolean() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const pool = getPool();
    const requeued = parsed.data.retryFailed ? await retryFailedEmails(pool) : 0;
    const report = await deliverPendingEmails(pool);
    await audit(pool, admin.id, "email.flush", "email_outbox", null, { requeued, ...report });
    if (report.status === "not_configured") {
      return NextResponse.json({ error: "not_configured", message: "SMTP non configuré (SMTP_URL et MAIL_FROM) : aucun e-mail envoyé." }, { status: 503 });
    }
    return NextResponse.json({ requeued, ...report });
  },
  { mutation: true },
);

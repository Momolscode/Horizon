/**
 * Envoie les e-mails en file, relance les tentatives dues et purge les anciens (docs/HANDOVER.md).
 * À planifier (cron, toutes les 5 à 15 min) en production : l'envoi immédiat après un événement
 * est une commodité, pas une garantie.
 * Usage : DATABASE_URL=... SMTP_URL=... MAIL_FROM=... npm run mail:flush [-- --retry-failed]
 */
import { Pool } from "pg";
import { deliverPendingEmails, mailStatus, purgeOldEmails, retryFailedEmails } from "@/server/mail";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("Usage : DATABASE_URL=... SMTP_URL=... MAIL_FROM=... npm run mail:flush [-- --retry-failed]");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const purged = await purgeOldEmails(pool);
    const requeued = process.argv.includes("--retry-failed") ? await retryFailedEmails(pool) : 0;
    const totals = { sent: 0, retried: 0, failed: 0 };
    // Lots de 20 jusqu'à épuisement (borné à 50 lots par exécution).
    for (let batch = 0; batch < 50; batch++) {
      const report = await deliverPendingEmails(pool);
      if (report.status === "not_configured") {
        console.error("SMTP non configuré (SMTP_URL et MAIL_FROM) : aucun e-mail envoyé.");
        process.exitCode = 2;
        break;
      }
      totals.sent += report.sent;
      totals.retried += report.retried;
      totals.failed += report.failed;
      if (report.sent + report.retried + report.failed === 0) break;
    }
    const status = await mailStatus(pool);
    console.log(
      `Envoyés : ${totals.sent} · à relancer : ${totals.retried} · abandonnés : ${totals.failed} · remis en file : ${requeued} · purgés : ${purged} · encore en attente : ${status.pending}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

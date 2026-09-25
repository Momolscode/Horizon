/**
 * Accorde (ou retire) le rôle administrateur à un compte existant.
 * Usage : DATABASE_URL=... npx tsx scripts/admin-grant.ts personne@exemple.fr [--revoke]
 */
import { Client } from "pg";

async function main() {
  const email = process.argv[2];
  const revoke = process.argv.includes("--revoke");
  if (!email || !process.env.DATABASE_URL) {
    console.error("Usage : DATABASE_URL=... npx tsx scripts/admin-grant.ts <email> [--revoke]");
    process.exit(1);
  }
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const user = await db.query(`select id from auth.users where lower(email) = lower($1)`, [email]);
    if (!user.rowCount) throw new Error(`Aucun compte pour ${email}`);
    const id = user.rows[0].id as string;
    if (revoke) await db.query(`delete from public.admins where user_id = $1`, [id]);
    else await db.query(`insert into public.admins (user_id) values ($1) on conflict do nothing`, [id]);
    await db.query(`insert into public.admin_audit_log (admin_id, action, target_type, target_id, details) values (null, $1, 'admin', $2, '{"source":"script"}')`, [
      revoke ? "admin.revoke" : "admin.grant",
      id,
    ]);
    console.log(`${revoke ? "Rôle retiré" : "Rôle accordé"} : ${email}`);
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

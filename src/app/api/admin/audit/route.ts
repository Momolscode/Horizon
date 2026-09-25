import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminRoute } from "@/server/admin";

export const GET = adminRoute(async () => {
  const res = await getPool().query(
    `select l.id, l.action, l.target_type, l.target_id, l.details, l.created_at, coalesce(p.pseudonym, 'compte supprimé') as admin
       from public.admin_audit_log l left join public.profiles p on p.id = l.admin_id
      order by l.id desc limit 100`,
  );
  return NextResponse.json({ entries: res.rows });
});

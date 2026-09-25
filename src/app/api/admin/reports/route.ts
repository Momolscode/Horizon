import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminRoute } from "@/server/admin";

export const GET = adminRoute(async () => {
  const res = await getPool().query(
    `select r.id, r.place_id, p.name as place_name, r.kind, r.message, r.status, r.created_at
       from public.error_reports r join public.places p on p.id = r.place_id
      order by (r.status = 'open') desc, r.created_at desc limit 200`,
  );
  return NextResponse.json({ reports: res.rows });
});

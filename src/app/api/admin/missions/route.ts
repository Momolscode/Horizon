import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminRoute } from "@/server/admin";

export const GET = adminRoute(async () => {
  const res = await getPool().query(`select id, period, title, description, criteria, xp, active, safety_reviewed from public.missions order by period, id`);
  return NextResponse.json({ missions: res.rows });
});

import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminRoute } from "@/server/admin";

export const GET = adminRoute(async () => {
  const res = await getPool().query(
    `select id, destination_id, name, category, status, fictional, verification ->> 'status' as verification, summary, updated_at from public.places order by destination_id, name`,
  );
  return NextResponse.json({ places: res.rows });
});

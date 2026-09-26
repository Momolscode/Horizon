import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminOverview, adminRoute, loadMetrics } from "@/server/admin";
import { mailStatus } from "@/server/mail";

export const GET = adminRoute(async () => {
  const pool = getPool();
  const [counts, metrics, mail] = await Promise.all([adminOverview(pool), loadMetrics(pool), mailStatus(pool)]);
  return NextResponse.json({ counts, metrics, mail });
});

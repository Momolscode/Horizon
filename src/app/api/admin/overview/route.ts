import { NextResponse } from "next/server";
import { getPool } from "@/server/db";
import { adminOverview, adminRoute, loadMetrics } from "@/server/admin";

export const GET = adminRoute(async () => {
  const pool = getPool();
  const [counts, metrics] = await Promise.all([adminOverview(pool), loadMetrics(pool)]);
  return NextResponse.json({ counts, metrics });
});

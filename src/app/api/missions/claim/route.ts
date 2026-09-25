import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/server/request-guard";
import { z } from "zod";
import { MissionClaimError } from "@/modules/progression/missions";
import { databaseConfigured, getPool, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { getCachedCatalog } from "@/server/catalog";
import { claimMission } from "@/server/missions";
import { ProgressionError } from "@/server/progression";
import { rateLimit } from "@/server/rate-limit";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`missions:${user.id}`, 30, 10 * 60 * 1000).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = z.object({ missionId: z.string().min(1).max(60) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const catalog = (await getCachedCatalog(getPool())).catalog;
    const result = await withTransaction((client) => claimMission(client, user.id, parsed.data.missionId, catalog));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MissionClaimError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "already_claimed" ? 409 : 422 });
    if (error instanceof ProgressionError) return NextResponse.json({ error: "progression", message: error.message }, { status: error.status });
    console.error("mission : échec", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

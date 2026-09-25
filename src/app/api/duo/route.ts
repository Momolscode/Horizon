import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, getPool, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { DuoError, duoOverview, inviteToDuo } from "@/server/duo";
import { rateLimit } from "@/server/rate-limit";

/** Vue Duo du compte connecté : invitations, excursions à deux, visites à confirmer. */
export async function GET() {
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const client = await getPool().connect();
  try {
    return NextResponse.json(await duoOverview(client, user.id));
  } catch (error) {
    console.error("duo : échec de lecture", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  } finally {
    client.release();
  }
}

/** Le propriétaire invite un ami (identifiant de leur amitié) à préparer l'excursion à deux. */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`duo:${user.id}`, 30, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = z.object({ excursionId: z.uuid(), friendshipId: z.uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await withTransaction((c) => inviteToDuo(c, user.id, parsed.data.excursionId, parsed.data.friendshipId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DuoError) return NextResponse.json({ error: "duo", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

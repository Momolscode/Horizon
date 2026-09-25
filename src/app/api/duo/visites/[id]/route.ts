import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/server/request-guard";
import { VisitRejectedError } from "@/modules/progression/engine";
import { databaseConfigured, getPool, withTransaction } from "@/server/db";
import { getCachedCatalog } from "@/server/catalog";
import { getSessionUser } from "@/server/auth";
import { DuoError, respondVisitRequest } from "@/server/duo";
import { ProgressionError } from "@/server/progression";
import { rateLimit } from "@/server/rate-limit";

/** Confirmation (ou refus) d'une visite déclarée pour deux par l'autre personne. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/duo/visites/[id]">) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`visits:${user.id}`, 30, 10 * 60 * 1000).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { id } = await params;
  const parsed = z.object({ action: z.enum(["accept", "decline"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const catalog = (await getCachedCatalog(getPool())).catalog;
    const result = await withTransaction((c) => respondVisitRequest(c, user.id, id, parsed.data.action === "accept", catalog));
    if (result.kind === "expired") return NextResponse.json({ error: "expired", message: "Demande expirée ou devenue sans objet : rien n'a été crédité." }, { status: 410 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DuoError) return NextResponse.json({ error: "duo", message: error.message }, { status: error.status });
    if (error instanceof VisitRejectedError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "daily_cap" ? 429 : 422 });
    if (error instanceof ProgressionError) return NextResponse.json({ error: "progression", message: error.message }, { status: error.status });
    console.error("duo : confirmation, échec", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

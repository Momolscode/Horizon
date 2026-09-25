import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/server/request-guard";
import { z } from "zod";
import { VISIT_STATUSES } from "@/modules/progression/config";
import { VisitRejectedError, isRealDate } from "@/modules/progression/engine";
import { databaseConfigured, getPool, withTransaction } from "@/server/db";
import { getCachedCatalog } from "@/server/catalog";
import { getSessionUser } from "@/server/auth";
import { ProgressionError, recordVisit } from "@/server/progression";
import { rateLimit } from "@/server/rate-limit";

const VisitBody = z.object({
  placeId: z.string().min(1).max(80),
  requestedStatus: z.enum(VISIT_STATUSES),
  visitedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  idempotencyKey: z.string().min(8).max(100),
  position: z
    .object({ lat: z.number(), lng: z.number(), accuracyM: z.number(), capturedAt: z.string().max(40) })
    .nullable(),
  note: z.string().max(2000).nullable(),
});

/**
 * Déclaration de visite — seule voie d'écriture de la progression.
 * Identité vérifiée côté serveur ; XP calculée par le moteur partagé, dans une transaction.
 */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = rateLimit(`visits:${user.id}`, 30, 10 * 60 * 1000);
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = VisitBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map((i) => i.path.join(".")) }, { status: 400 });

  // Garde-fou calendaire : date réelle, pas plus d'un jour dans le futur (le moteur borne aussi, fuseau compris).
  const tomorrow = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  if (!isRealDate(parsed.data.visitedOn) || parsed.data.visitedOn > tomorrow) return NextResponse.json({ error: "invalid_date" }, { status: 400 });

  try {
    const catalog = (await getCachedCatalog(getPool())).catalog;
    const result = await withTransaction((client) => recordVisit(client, user.id, parsed.data, catalog));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof VisitRejectedError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "daily_cap" ? 429 : 422 });
    if (error instanceof ProgressionError) return NextResponse.json({ error: "progression", message: error.message }, { status: error.status });
    console.error("visite : échec", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

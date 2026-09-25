import { NextResponse } from "next/server";
import { getPool, withTransaction } from "@/server/db";
import { invalidateCatalogCache } from "@/server/catalog";
import { managedReviews, updateEstablishmentInfo } from "@/server/contributions";
import { contributionErrorResponse, requireAccount } from "@/server/route-helpers";

/** Avis publiés d'une fiche gérée, avec l'état de la réponse de l'établissement. */
export async function GET(request: Request, { params }: RouteContext<"/api/pro/lieux/[id]">) {
  const user = await requireAccount(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  const client = await getPool().connect();
  try {
    return NextResponse.json({ reviews: await managedReviews(client, user.id, id) });
  } catch (error) {
    return contributionErrorResponse(error, "avis gérés");
  } finally {
    client.release();
  }
}

/** L'établissement vérifié corrige ses informations pratiques. */
export async function PATCH(request: Request, { params }: RouteContext<"/api/pro/lieux/[id]">) {
  const user = await requireAccount(request, { mutation: true, limit: { key: "establishment", max: 30, windowMs: 3600 * 1000 } });
  if (user instanceof Response) return user;
  const { id } = await params;
  try {
    await withTransaction(async (c) => updateEstablishmentInfo(c, user.id, id, await request.json().catch(() => null)));
    invalidateCatalogCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return contributionErrorResponse(error, "informations de l'établissement");
  }
}

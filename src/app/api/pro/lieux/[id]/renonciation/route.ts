import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { invalidateCatalogCache } from "@/server/catalog";
import { relinquishClaim } from "@/server/contributions";
import { contributionErrorResponse, requireAccount } from "@/server/route-helpers";

/** L'établissement renonce à gérer sa fiche ; il peut effacer les informations qu'il a fournies. */
export async function POST(request: Request, { params }: RouteContext<"/api/pro/lieux/[id]/renonciation">) {
  const user = await requireAccount(request, { mutation: true, limit: { key: "establishment", max: 30, windowMs: 3600 * 1000 } });
  if (user instanceof Response) return user;
  const parsed = z.object({ clearInfo: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const { id } = await params;
  try {
    await withTransaction((c) => relinquishClaim(c, user.id, id, parsed.data));
    if (parsed.data.clearInfo) invalidateCatalogCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return contributionErrorResponse(error, "renoncement à la gestion");
  }
}

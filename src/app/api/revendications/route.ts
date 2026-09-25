import { NextResponse } from "next/server";
import { withTransaction } from "@/server/db";
import { submitClaim } from "@/server/contributions";
import { contributionErrorResponse, requireAccount } from "@/server/route-helpers";

/** Revendiquer une fiche (SIRET + preuve) : active seulement après validation par un administrateur. */
export async function POST(request: Request) {
  const user = await requireAccount(request, { mutation: true, limit: { key: "claims", max: 5, windowMs: 24 * 3600 * 1000 } });
  if (user instanceof Response) return user;
  try {
    const id = await withTransaction(async (c) => submitClaim(c, user.id, await request.json().catch(() => null)));
    return NextResponse.json({ id });
  } catch (error) {
    return contributionErrorResponse(error, "revendication");
  }
}

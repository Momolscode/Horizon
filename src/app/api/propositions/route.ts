import { NextResponse } from "next/server";
import { withTransaction } from "@/server/db";
import { submitProposal } from "@/server/contributions";
import { contributionErrorResponse, requireAccount } from "@/server/route-helpers";

/** Proposer un lieu (restaurant, commerce, activité, loisir) : publié après modération. */
export async function POST(request: Request) {
  const user = await requireAccount(request, { mutation: true, limit: { key: "proposals", max: 10, windowMs: 24 * 3600 * 1000 } });
  if (user instanceof Response) return user;
  const body = (await request.json().catch(() => null)) as { proposal?: unknown; confirmNotDuplicate?: unknown } | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const result = await withTransaction((c) => submitProposal(c, user.id, body.proposal, body.confirmNotDuplicate === true));
    return NextResponse.json(result);
  } catch (error) {
    return contributionErrorResponse(error, "proposition");
  }
}

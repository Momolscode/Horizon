import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { submitReply } from "@/server/contributions";
import { contributionErrorResponse, requireAccount } from "@/server/route-helpers";

/** Réponse publique et gratuite de l'établissement à un avis, publiée après modération. */
export async function POST(request: Request) {
  const user = await requireAccount(request, { mutation: true, limit: { key: "replies", max: 30, windowMs: 3600 * 1000 } });
  if (user instanceof Response) return user;
  const parsed = z.object({ reviewId: z.uuid(), body: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await withTransaction((c) => submitReply(c, user.id, parsed.data.reviewId, parsed.data.body));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return contributionErrorResponse(error, "réponse à un avis");
  }
}

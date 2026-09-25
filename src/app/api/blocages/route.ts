import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { blockUser, unblockUser, SocialError } from "@/server/social";

/** Blocage (et déblocage) par pseudonyme. Bloquer supprime toute relation existante. */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = z.object({ pseudonym: z.string().min(2).max(32), action: z.enum(["block", "unblock"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await withTransaction((c) => (parsed.data.action === "block" ? blockUser(c, user.id, parsed.data.pseudonym) : unblockUser(c, user.id, parsed.data.pseudonym)));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SocialError) return NextResponse.json({ error: "social", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

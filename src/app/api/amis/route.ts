import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { requestFriend, socialOverview, SocialError } from "@/server/social";
import { rateLimit } from "@/server/rate-limit";

export async function GET() {
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await withTransaction((c) => socialOverview(c, user.id)));
}

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`friends:${user.id}`, 20, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = z.object({ pseudonym: z.string().min(2).max(32) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await withTransaction((c) => requestFriend(c, user.id, parsed.data.pseudonym));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SocialError) return NextResponse.json({ error: "social", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

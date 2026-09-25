import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { removeFriendship, respondFriend, SocialError } from "@/server/social";

async function guard(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return { error: blocked } as const;
  if (!databaseConfigured()) return { error: NextResponse.json({ error: "database_not_configured" }, { status: 503 }) } as const;
  const user = await getSessionUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) } as const;
  return { user } as const;
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/amis/[id]">) {
  const g = await guard(request);
  if ("error" in g) return g.error;
  const { id } = await params;
  const parsed = z.object({ action: z.enum(["accept", "decline"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await withTransaction((c) => respondFriend(c, g.user.id, id, parsed.data.action));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SocialError) return NextResponse.json({ error: "social", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/amis/[id]">) {
  const g = await guard(request);
  if ("error" in g) return g.error;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await withTransaction((c) => removeFriendship(c, g.user.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SocialError) return NextResponse.json({ error: "social", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

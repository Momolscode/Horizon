import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/server/request-guard";
import { z } from "zod";
import { databaseConfigured, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { createShare, ShareError } from "@/server/shares";
import { rateLimit } from "@/server/rate-limit";

export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`shares:${user.id}`, 20, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = z.object({ excursionId: z.uuid(), includeDate: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const token = await withTransaction((c) => createShare(c, user.id, parsed.data.excursionId, parsed.data.includeDate));
    return NextResponse.json({ token, path: `/partage/${token}` });
  } catch (error) {
    if (error instanceof ShareError) return NextResponse.json({ error: "share", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

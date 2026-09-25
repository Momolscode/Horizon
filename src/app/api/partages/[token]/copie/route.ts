import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { copyShare, ShareError } from "@/server/shares";
import { rateLimit } from "@/server/rate-limit";

/** Copie une excursion partagée dans son propre compte (la copie est indépendante). */
export async function POST(request: Request, { params }: RouteContext<"/api/partages/[token]/copie">) {
  const blocked = rejectCrossSite(request, { requireJson: false });
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`copies:${user.id}`, 20, 60 * 60 * 1000).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { token } = await params;
  try {
    const excursionId = await withTransaction((c) => copyShare(c, user.id, token));
    return NextResponse.json({ excursionId });
  } catch (error) {
    if (error instanceof ShareError) return NextResponse.json({ error: "share", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

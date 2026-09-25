import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { revokeShare, ShareError } from "@/server/shares";

/** Révocation immédiate d'un lien de partage (propriétaire uniquement). */
export async function DELETE(request: Request, { params }: RouteContext<"/api/partages/[token]">) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { token } = await params;
  try {
    await withTransaction((c) => revokeShare(c, user.id, token));
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ShareError) return NextResponse.json({ error: "share", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

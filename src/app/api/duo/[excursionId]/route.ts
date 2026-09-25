import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { DuoError, leaveDuo, removeDuoGuest, respondDuoInvitation } from "@/server/duo";

/**
 * accept / decline : réponse de la personne invitée ; leave : elle quitte l'excursion ;
 * remove : le propriétaire retire l'invité ou annule l'invitation.
 */
export async function PATCH(request: Request, { params }: RouteContext<"/api/duo/[excursionId]">) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { excursionId } = await params;
  const parsed = z.object({ action: z.enum(["accept", "decline", "leave", "remove"]) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.uuid().safeParse(excursionId).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    await withTransaction(async (c) => {
      const action = parsed.data.action;
      if (action === "accept" || action === "decline") await respondDuoInvitation(c, user.id, excursionId, action === "accept");
      else if (action === "leave") await leaveDuo(c, user.id, excursionId);
      else await removeDuoGuest(c, user.id, excursionId);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof DuoError) return NextResponse.json({ error: "duo", message: error.message }, { status: error.status });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

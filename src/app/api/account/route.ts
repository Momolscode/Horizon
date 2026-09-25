import { NextResponse } from "next/server";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, withTransaction } from "@/server/db";
import { getSessionUser } from "@/server/auth";

/**
 * Suppression du compte : supprime l'utilisateur Auth, ce qui supprime en cascade
 * profil, collections, excursions, visites, parcelles, journal XP et badges.
 * Les signalements sont conservés sans auteur (on delete set null).
 * Sauvegardes : voir docs/HANDOVER.md § Données personnelles.
 */
export async function DELETE(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const confirm = new URL(request.url).searchParams.get("confirm");
  if (confirm !== "SUPPRIMER") return NextResponse.json({ error: "confirmation_required" }, { status: 400 });
  try {
    await withTransaction(async (client) => {
      await client.query(`delete from auth.users where id = $1`, [user.id]);
    });
  } catch (error) {
    console.error("suppression de compte : échec", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

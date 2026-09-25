import { NextResponse } from "next/server";
import { databaseConfigured, getPool } from "@/server/db";
import { getCachedCatalog } from "@/server/catalog";

/** Catalogue publié (consultation sans compte). */
export async function GET() {
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  try {
    const index = await getCachedCatalog(getPool());
    return NextResponse.json(index.catalog, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    console.error("catalogue indisponible", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 503 });
  }
}

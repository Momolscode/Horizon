import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceScreen } from "@/components/screens/PlaceScreen";
import { readModeConfig } from "@/config/mode";
import { getDemoCatalog } from "@/modules/catalog/demo";
import { databaseConfigured, getPool } from "@/server/db";
import { getCachedCatalog } from "@/server/catalog";

export const metadata: Metadata = { title: "Lieu" };

/** Identifiant inconnu : vraie réponse 404 plutôt qu'une page vide en 200. */
async function placeExists(id: string): Promise<boolean> {
  const mode = readModeConfig();
  if (mode.mode === "demo") return getDemoCatalog().placesById.has(id);
  if (!databaseConfigured()) return true; // l'écran d'erreur de configuration s'en charge
  try {
    return (await getCachedCatalog(getPool())).placesById.has(id);
  } catch {
    return true; // base indisponible : l'interface affiche l'erreur explicite
  }
}

export default async function LieuPage({ params }: PageProps<"/lieux/[id]">) {
  const { id } = await params;
  if (!(await placeExists(id))) notFound();
  return <PlaceScreen id={id} />;
}

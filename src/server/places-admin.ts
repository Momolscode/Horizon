import "server-only";
import type { PoolClient } from "pg";
import { audit } from "./admin";
import { loadCatalogFromDb } from "./catalog";

export type PlacePatch = {
  status?: "draft" | "published" | "archived";
  name?: string;
  summary?: string;
  description?: string;
  verification?: { status: "verified" | "unverified"; checkedAt: string | null; note: string };
};

export class PlaceUpdateError extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Modification d'un lieu par un administrateur, dans la transaction `c`.
 * Le catalogue qui en résulte est relu et validé AVANT validation de la transaction :
 * une modification qui le rendrait incohérent (parcours médaille sous son minimum,
 * valeur « connue » sur un lieu non vérifié…) est refusée au lieu de casser le mode connecté.
 */
export async function updatePlace(c: PoolClient, adminId: string, placeId: string, patch: PlacePatch): Promise<void> {
  const res = await c.query(
    `update public.places set
       status = coalesce($2, status), name = coalesce($3, name), summary = coalesce($4, summary),
       description = coalesce($5, description), verification = coalesce($6::jsonb, verification), updated_by = $7
     where id = $1 returning id`,
    [placeId, patch.status ?? null, patch.name ?? null, patch.summary ?? null, patch.description ?? null, patch.verification ? JSON.stringify(patch.verification) : null, adminId],
  );
  if (!res.rowCount) throw new PlaceUpdateError(404, "Lieu introuvable.");
  try {
    await loadCatalogFromDb(c);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "catalogue invalide";
    throw new PlaceUpdateError(409, `Modification refusée : elle rendrait le catalogue incohérent (${detail}).`);
  }
  await audit(c, adminId, "place.update", "place", placeId, { fields: Object.keys(patch) });
}

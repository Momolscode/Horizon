import "server-only";
import type { Pool, PoolClient } from "pg";
import { buildCatalogIndex, type CatalogIndex } from "@/modules/catalog/catalog";
import type { Catalog } from "@/modules/catalog/schema";

type Queryable = Pick<Pool | PoolClient, "query">;

/**
 * Lit le catalogue publié en base et le valide avec le même schéma Zod que la démo.
 * Une ligne invalide fait échouer le chargement : mieux vaut une erreur visible
 * qu'une fiche fausse.
 */
export async function loadCatalogFromDb(db: Queryable): Promise<CatalogIndex> {
  const [sources, destinations, places] = await Promise.all([
    db.query(`select id, label, kind, url, license, terms, to_char(retrieved_at, 'YYYY-MM-DD') as retrieved_at from public.sources order by id`),
    db.query(
      `select id, name, region, country_code, locale, currency, timezone,
              extensions.st_y(center::extensions.geometry) as lat, extensions.st_x(center::extensions.geometry) as lng,
              center_source_id, bbox, tagline, description, palette, medal_title, medal_place_ids
         from public.destinations where published order by id`,
    ),
    db.query(
      `select id, destination_id, name, category, themes, setting,
              extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lng,
              location_precision, summary, description, history, lesser_known, practical, restaurant, art,
              source_ids, verification, fictional, sponsored
         from public.places where status = 'published' order by id`,
    ),
  ]);
  // Un lieu dépublié (brouillon, archivé) sort aussi des parcours médaille : le
  // catalogue reste cohérent. Un parcours réduit sous son minimum est refusé en amont
  // par l'administration (voir updatePlace).
  const publishedIds = new Set(places.rows.map((r) => String(r.id)));
  const catalog: Catalog = {
    version: 1,
    kind: "production",
    notice: "Catalogue servi par la base de données de l'installation.",
    sources: sources.rows.map((r) => ({ id: r.id, label: r.label, kind: r.kind, url: r.url, license: r.license, terms: r.terms, retrievedAt: r.retrieved_at })),
    destinations: destinations.rows.map((r) => ({
      id: r.id,
      name: r.name,
      region: r.region,
      countryCode: String(r.country_code).trim(),
      locale: r.locale,
      currency: String(r.currency).trim(),
      timezone: r.timezone,
      center: { lat: Number(r.lat), lng: Number(r.lng) },
      centerSourceId: r.center_source_id,
      bbox: (r.bbox as number[]).map(Number) as [number, number, number, number],
      tagline: r.tagline,
      description: r.description,
      palette: r.palette,
      medalRoute: { title: r.medal_title, placeIds: (r.medal_place_ids as string[]).filter((id) => publishedIds.has(id)) },
    })),
    places: places.rows.map((r) => ({
      id: r.id,
      destinationId: r.destination_id,
      name: r.name,
      category: r.category,
      themes: r.themes,
      setting: r.setting,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
      locationPrecision: r.location_precision,
      summary: r.summary,
      description: r.description,
      history: r.history,
      lesserKnown: r.lesser_known,
      practical: r.practical,
      ...(r.restaurant ? { restaurant: r.restaurant } : {}),
      art: r.art,
      sourceIds: r.source_ids,
      verification: r.verification,
      fictional: r.fictional,
      sponsored: r.sponsored,
    })),
  };
  return buildCatalogIndex(catalog);
}

let cache: { index: CatalogIndex; at: number; stamp: string } | null = null;
const TTL_MS = 10 * 60_000;

/**
 * Empreinte bon marché du contenu publié : toute création, modification, publication ou
 * suppression de lieu ou de destination la change (déclencheurs updated_at, compte).
 */
async function catalogStamp(db: Queryable): Promise<string> {
  const res = await db.query(
    `select (select count(*) from public.places)::text || ':' || coalesce((select max(updated_at) from public.places)::text, '') || ':' ||
            (select count(*) from public.destinations where published)::text as stamp`,
  );
  return String(res.rows[0].stamp);
}

/**
 * Cache mémoire par instance, revalidé à chaque lecture par l'empreinte ci-dessus : une
 * instance ne sert jamais un catalogue périmé après une publication faite par une autre
 * instance (routes séparées, fonctions serverless). Rechargement complet au plus tard après 10 min.
 */
export async function getCachedCatalog(db: Queryable): Promise<CatalogIndex> {
  const stamp = await catalogStamp(db);
  if (cache && cache.stamp === stamp && Date.now() - cache.at < TTL_MS) return cache.index;
  const index = await loadCatalogFromDb(db);
  cache = { index, at: Date.now(), stamp };
  return index;
}

export function invalidateCatalogCache() {
  cache = null;
}

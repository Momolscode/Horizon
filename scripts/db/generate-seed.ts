/**
 * Génère supabase/seed.sql à partir du catalogue TypeScript (source unique).
 * Les cellules H3 sont calculées ici avec h3-js et enregistrées avec leur résolution.
 * Usage : npm run db:seed:sql
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { frDemoCatalog } from "../../data/catalog/fr-demo";
import { buildCatalogIndex } from "../../src/modules/catalog/catalog";
import { PARCEL_RESOLUTION, PROGRESSION_CONFIG_VERSION, LEVELS, VISIT_RULES, NEW_PARCEL_XP, PROXIMITY } from "../../src/modules/progression/config";
import { parcelForLocation } from "../../src/modules/progression/parcels";

const { catalog } = buildCatalogIndex(frDemoCatalog);

const q = (v: string | null | undefined) => (v === null || v === undefined ? "null" : `'${v.replace(/'/g, "''")}'`);
const j = (v: unknown) => (v === null || v === undefined ? "null" : `${q(JSON.stringify(v))}::jsonb`);
const arr = (v: string[]) => `array[${v.map(q).join(", ")}]::text[]`;
const point = (lat: number, lng: number) => `extensions.st_setsrid(extensions.st_makepoint(${lng}, ${lat}), 4326)::extensions.geography`;

const lines: string[] = [
  "-- Généré par scripts/db/generate-seed.ts — ne pas modifier à la main.",
  `-- Catalogue : ${catalog.kind} v${catalog.version}. ${catalog.notice}`,
  "begin;",
];

for (const s of catalog.sources) {
  lines.push(
    `insert into public.sources (id, label, kind, url, license, terms, retrieved_at) values (${q(s.id)}, ${q(s.label)}, ${q(s.kind)}, ${q(s.url)}, ${q(s.license)}, ${q(s.terms)}, ${q(s.retrievedAt)}) on conflict (id) do update set label = excluded.label, kind = excluded.kind, url = excluded.url, license = excluded.license, terms = excluded.terms, retrieved_at = excluded.retrieved_at;`,
  );
}
for (const d of catalog.destinations) {
  lines.push(
    `insert into public.destinations (id, name, region, country_code, locale, currency, timezone, center, center_source_id, bbox, tagline, description, palette, medal_title, medal_place_ids) values (${q(d.id)}, ${q(d.name)}, ${q(d.region)}, ${q(d.countryCode)}, ${q(d.locale)}, ${q(d.currency)}, ${q(d.timezone)}, ${point(d.center.lat, d.center.lng)}, ${q(d.centerSourceId)}, array[${d.bbox.join(", ")}]::double precision[], ${q(d.tagline)}, ${q(d.description)}, ${q(d.palette)}, ${q(d.medalRoute.title)}, ${arr(d.medalRoute.placeIds)}) on conflict (id) do update set name = excluded.name, region = excluded.region, center = excluded.center, bbox = excluded.bbox, tagline = excluded.tagline, description = excluded.description, palette = excluded.palette, medal_title = excluded.medal_title, medal_place_ids = excluded.medal_place_ids;`,
  );
}
for (const p of catalog.places) {
  const cell = parcelForLocation(p.location, PARCEL_RESOLUTION);
  lines.push(
    `insert into public.places (id, destination_id, name, category, themes, setting, location, location_precision, h3_cell, h3_res, summary, description, history, lesser_known, practical, restaurant, art, source_ids, verification, fictional, sponsored, status) values (${q(p.id)}, ${q(p.destinationId)}, ${q(p.name)}, ${q(p.category)}, ${arr(p.themes)}, ${q(p.setting)}, ${point(p.location.lat, p.location.lng)}, ${q(p.locationPrecision)}, ${q(cell)}, ${PARCEL_RESOLUTION}, ${q(p.summary)}, ${q(p.description)}, ${q(p.history)}, ${p.lesserKnown}, ${j(p.practical)}, ${j(p.restaurant ?? null)}, ${j(p.art)}, ${arr(p.sourceIds)}, ${j(p.verification)}, ${p.fictional}, ${j(p.sponsored)}, 'published') on conflict (id) do update set destination_id = excluded.destination_id, name = excluded.name, category = excluded.category, themes = excluded.themes, setting = excluded.setting, location = excluded.location, location_precision = excluded.location_precision, h3_cell = excluded.h3_cell, h3_res = excluded.h3_res, summary = excluded.summary, description = excluded.description, history = excluded.history, lesser_known = excluded.lesser_known, practical = excluded.practical, restaurant = excluded.restaurant, art = excluded.art, source_ids = excluded.source_ids, verification = excluded.verification, fictional = excluded.fictional, sponsored = excluded.sponsored;`,
  );
}
lines.push(
  `insert into public.progression_settings (version, parcel_resolution, config) values (${PROGRESSION_CONFIG_VERSION}, ${PARCEL_RESOLUTION}, ${j({ levels: LEVELS, visitRules: VISIT_RULES, newParcelXp: NEW_PARCEL_XP, proximity: PROXIMITY })}) on conflict (version) do nothing;`,
);
lines.push("commit;", "");

const out = path.join(process.cwd(), "supabase", "seed.sql");
writeFileSync(out, lines.join("\n"));
console.log(`Écrit ${out} (${catalog.places.length} lieux, ${catalog.destinations.length} destinations).`);

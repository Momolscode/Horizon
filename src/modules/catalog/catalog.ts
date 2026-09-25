import { CATEGORIES } from "./categories";
import { CatalogSchema, validateCatalogIntegrity, type Catalog, type Destination, type Place } from "./schema";

export type CatalogIndex = {
  catalog: Catalog;
  placesById: Map<string, Place>;
  destinationsById: Map<string, Destination>;
  placesByDestination: Map<string, Place[]>;
};

/** Valide (schéma + références croisées) puis indexe un catalogue. */
export function buildCatalogIndex(input: unknown): CatalogIndex {
  const catalog = CatalogSchema.parse(input);
  const errors = validateCatalogIntegrity(catalog);
  if (errors.length > 0) throw new Error(`Catalogue incohérent :\n- ${errors.join("\n- ")}`);
  const placesById = new Map(catalog.places.map((p) => [p.id, p]));
  const destinationsById = new Map(catalog.destinations.map((d) => [d.id, d]));
  const placesByDestination = new Map<string, Place[]>();
  for (const place of catalog.places) {
    const list = placesByDestination.get(place.destinationId) ?? [];
    list.push(place);
    placesByDestination.set(place.destinationId, list);
  }
  return { catalog, placesById, destinationsById, placesByDestination };
}

export function categoryLabel(place: Place): string {
  return CATEGORIES[place.category].label;
}

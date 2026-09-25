import { frDemoCatalog } from "@data/catalog/fr-demo";
import { buildCatalogIndex, type CatalogIndex } from "./catalog";

let cached: CatalogIndex | null = null;

/** Catalogue de démonstration validé (schéma + références) au premier accès. */
export function getDemoCatalog(): CatalogIndex {
  cached ??= buildCatalogIndex(frDemoCatalog);
  return cached;
}

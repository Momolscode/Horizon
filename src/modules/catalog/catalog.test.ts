import { describe, expect, it } from "vitest";
import { frDemoCatalog } from "@data/catalog/fr-demo";
import { buildCatalogIndex } from "./catalog";
import { CatalogSchema, validateCatalogIntegrity } from "./schema";

describe("catalogue de démonstration", () => {
  const index = buildCatalogIndex(frDemoCatalog);
  const { catalog } = index;

  it("respecte le schéma et les références croisées", () => {
    expect(CatalogSchema.safeParse(frDemoCatalog).success).toBe(true);
    expect(validateCatalogIntegrity(catalog)).toEqual([]);
  });

  it("contient 4 destinations et une quarantaine de lieux", () => {
    expect(catalog.destinations).toHaveLength(4);
    expect(catalog.places.length).toBeGreaterThanOrEqual(36);
    for (const destination of catalog.destinations) {
      expect(index.placesByDestination.get(destination.id)?.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("est identifié comme démonstration et ne présente aucune valeur comme vérifiée", () => {
    expect(catalog.kind).toBe("demo");
    for (const place of catalog.places) {
      expect(place.verification.status).toBe("unverified");
      expect(place.locationPrecision).toBe("approximate");
      for (const value of Object.values(place.practical)) {
        if (value) expect(value.status).not.toBe("known");
      }
    }
  });

  it("nomme explicitement les établissements fictifs", () => {
    const fictional = catalog.places.filter((p) => p.fictional);
    expect(fictional.length).toBeGreaterThan(0);
    for (const place of fictional) {
      expect(place.name.toLowerCase()).toMatch(/fictif|fictive/);
      expect(place.sourceIds).toEqual(["horizon-demo-fixture"]);
    }
  });

  it("ne transforme pas un coût inconnu en gratuité", () => {
    const museums = catalog.places.filter((p) => p.category === "museum");
    expect(museums.length).toBeGreaterThan(0);
    for (const museum of museums) expect(museum.practical.price.status).toBe("unknown");
  });

  it("chaque parcours de médaille ne contient que des lieux réels de la destination", () => {
    for (const destination of catalog.destinations) {
      for (const id of destination.medalRoute.placeIds) {
        const place = index.placesById.get(id);
        expect(place?.destinationId).toBe(destination.id);
        expect(place?.fictional).toBe(false);
      }
    }
  });

  it("rejette un catalogue avec un identifiant dupliqué ou des coordonnées invalides", () => {
    const broken = structuredClone(frDemoCatalog);
    broken.places.push({ ...broken.places[0]! });
    expect(() => buildCatalogIndex(broken)).toThrow(/dupliqué/);

    const invalid = structuredClone(frDemoCatalog);
    invalid.places[0]!.location = { lat: 123, lng: 6 };
    expect(CatalogSchema.safeParse(invalid).success).toBe(false);
  });

  it("refuse une valeur « connue » sur un lieu non vérifié", () => {
    const tampered = structuredClone(frDemoCatalog);
    tampered.places[0]!.practical.price = { status: "known", value: { kind: "free" }, sourceId: "horizon-editorial-2026-09", checkedAt: null };
    expect(validateCatalogIntegrity(CatalogSchema.parse(tampered))).toContainEqual(expect.stringMatching(/non vérifié/));
  });
});

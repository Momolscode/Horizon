import { describe, expect, it } from "vitest";
import { catalog } from "@/test/fixtures";
import { DEFAULT_FILTERS, filterPlaces, searchCatalog } from "./search";

describe("recherche", () => {
  it("trouve un lieu sans accent ni majuscule", () => {
    const hits = searchCatalog(catalog, "fourviere");
    expect(hits[0]?.kind).toBe("place");
    expect(hits.some((h) => h.kind === "place" && h.place.id === "lyon-fourviere")).toBe(true);
  });

  it("trouve une ville et la place avant ses lieux", () => {
    const hits = searchCatalog(catalog, "annecy");
    expect(hits[0]).toMatchObject({ kind: "destination", destination: { id: "annecy" } });
  });

  it("trouve un village du catalogue", () => {
    expect(searchCatalog(catalog, "talloires").some((h) => h.kind === "place" && h.place.id === "annecy-talloires")).toBe(true);
  });

  it("ne renvoie rien pour une requête trop courte ou absente du catalogue", () => {
    expect(searchCatalog(catalog, "a")).toEqual([]);
    expect(searchCatalog(catalog, "zzqx")).toEqual([]);
  });
});

describe("filtres", () => {
  it("« Gratuit » n'inclut jamais un coût inconnu comme gratuit", () => {
    const report = filterPlaces(catalog, { ...DEFAULT_FILTERS, budget: "free", includeUnknownPrice: false });
    expect(report.places.length).toBeGreaterThan(0);
    for (const p of report.places) {
      expect(p.practical.price.status).not.toBe("unknown");
    }
    expect(report.hiddenForUnknown.price).toBeGreaterThan(0);
  });

  it("filtre par catégorie et destination", () => {
    const report = filterPlaces(catalog, { ...DEFAULT_FILTERS, destinationId: "lyon", categories: ["museum"] });
    expect(report.places.map((p) => p.id).sort()).toEqual(["lyon-beaux-arts", "lyon-confluences"]);
  });

  it("filtre par distance à vol d'oiseau depuis un point", () => {
    const origin = { lat: 45.7625, lng: 4.8272 }; // Vieux Lyon
    const report = filterPlaces(catalog, { ...DEFAULT_FILTERS, origin, maxDistanceKm: 1 });
    expect(report.places.every((p) => p.destinationId === "lyon")).toBe(true);
    expect(report.places.some((p) => p.id === "lyon-tete-d-or")).toBe(false);
  });

  it("« Ouvert maintenant » écarte les lieux sans horaires et n'est disponible qu'avec des horaires", () => {
    // Samedi 3 octobre 2026, 12h30 à Paris
    const now = new Date("2026-10-03T10:30:00Z");
    const report = filterPlaces(catalog, { ...DEFAULT_FILTERS, destinationId: "lyon", openNow: true }, now);
    expect(report.openNowAvailable).toBe(true);
    expect(report.places.map((p) => p.id).sort()).toEqual(["lyon-resto-bouchon-fictif"]);
    expect(report.hiddenForUnknown.hours).toBeGreaterThan(0);
  });

  it("l'accessibilité exigée écarte les informations inconnues et les lieux non accessibles", () => {
    const report = filterPlaces(catalog, { ...DEFAULT_FILTERS, wheelchair: true });
    for (const p of report.places) {
      expect(p.practical.accessibility.status).not.toBe("unknown");
    }
    expect(report.places.some((p) => p.id === "lyon-resto-bouchon-fictif")).toBe(false);
  });

  it("filtre les préférences alimentaires sur les restaurants", () => {
    const report = filterPlaces(catalog, { ...DEFAULT_FILTERS, diets: ["vegan"] });
    expect(report.places.length).toBeGreaterThan(0);
    for (const p of report.places) expect(p.category).toBe("restaurant");
  });
});

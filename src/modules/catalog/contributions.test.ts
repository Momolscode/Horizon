import { describe, expect, it } from "vitest";
import { baseRequest, catalog, idGenerator } from "@/test/fixtures";
import { buildCatalogIndex } from "./catalog";
import {
  applyEstablishmentUpdate,
  buildCommunityPlace,
  COMMUNITY_SOURCE_ID,
  ClaimSchema,
  destinationForPoint,
  findLikelyDuplicates,
  isValidSiret,
  nameSimilarity,
  placeIdFor,
  ProposalSchema,
  weeklyFromSimple,
  type Proposal,
} from "./contributions";
import { practicalLines } from "./present";
import { validateCatalogIntegrity, type Catalog } from "./schema";
import { DEFAULT_FILTERS, filterPlaces, searchCatalog } from "@/modules/discovery/search";
import { buildSections } from "@/modules/discovery/sections";
import { surprise } from "@/modules/excursions/surprise";

const lyon = catalog.destinations.find((d) => d.id === "lyon")!;
const proposal: Proposal = {
  destinationId: "lyon",
  name: "La Cordonnerie du Vieux Lyon",
  category: "shop",
  location: { lat: 45.7622, lng: 4.8272 },
  summary: "Artisan cordonnier installé dans une traboule, réparations sur place.",
  website: null,
  price: "unknown",
  restaurantStyle: null,
};

describe("propositions de lieux", () => {
  it("valide une proposition et exige le type de cuisine pour un restaurant", () => {
    expect(ProposalSchema.safeParse(proposal).success).toBe(true);
    expect(ProposalSchema.safeParse({ ...proposal, category: "restaurant" }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...proposal, category: "restaurant", restaurantStyle: "bistrot" }).success).toBe(true);
    // Catégories réservées au catalogue éditorial (monument, musée…) : non proposables.
    expect(ProposalSchema.safeParse({ ...proposal, category: "monument" }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...proposal, summary: "court" }).success).toBe(false);
  });

  it("n'accepte que les points situés dans une destination couverte", () => {
    expect(destinationForPoint(catalog, proposal.location)?.id).toBe("lyon");
    expect(destinationForPoint(catalog, { lat: 48.8566, lng: 2.3522 })).toBeNull(); // Paris : hors destinations
  });

  it("construit un lieu valide, non vérifié, sans aucune valeur « connue »", () => {
    const place = buildCommunityPlace({ ...proposal, price: "lte15", website: "https://exemple.fr" }, { id: "lyon-cordonnerie", destination: lyon, approvedOn: "2026-09-25" });
    expect(place.sourceIds).toEqual([COMMUNITY_SOURCE_ID]);
    expect(place.verification.status).toBe("unverified");
    expect(place.locationPrecision).toBe("approximate");
    expect(place.practical.openingHours.status).toBe("unknown");
    expect(place.practical.price).toMatchObject({ status: "estimate", value: { kind: "paid", minPerPerson: 0, maxPerPerson: 15 } });
    expect(Object.values(place.practical).some((v) => v?.status === "known")).toBe(false);
    // Intégré au catalogue, il respecte les contrôles d'intégrité (avec la source communautaire).
    const extended: Catalog = {
      ...catalog,
      sources: [...catalog.sources, { id: COMMUNITY_SOURCE_ID, label: "Proposition d'un membre", kind: "community", url: null, license: "Contribution", terms: "Non vérifié", retrievedAt: null }],
      places: [...catalog.places, place],
    };
    expect(validateCatalogIntegrity(extended)).toEqual([]);
    expect(() => buildCatalogIndex(extended)).not.toThrow();
  });

  it("un restaurant proposé porte son type de cuisine et des régimes inconnus", () => {
    const place = buildCommunityPlace({ ...proposal, category: "restaurant", restaurantStyle: "bistrot" }, { id: "lyon-x", destination: lyon, approvedOn: "2026-09-25" });
    expect(place.restaurant).toEqual({ style: "bistrot", diets: { status: "unknown" } });
  });

  it("génère des identifiants uniques et lisibles", () => {
    expect(placeIdFor("lyon", "Café de l'Été !", new Set())).toBe("lyon-cafe-de-l-ete");
    expect(placeIdFor("lyon", "Café de l'Été", new Set(["lyon-cafe-de-l-ete"]))).toBe("lyon-cafe-de-l-ete-2");
  });
});

describe("détection des doublons", () => {
  const existing = [
    { id: "a", name: "Le Petit Canut (bouchon fictif)", location: { lat: 45.7735, lng: 4.8322 } },
    { id: "b", name: "Maison Saône", location: { lat: 45.7735, lng: 4.8322 } },
    { id: "c", name: "Petit Canut", location: { lat: 45.7900, lng: 4.8322 } },
  ];

  it("signale un nom proche à moins de 100 m, et seulement dans ce cas", () => {
    const dup = findLikelyDuplicates({ name: "Au petit canut", location: { lat: 45.7736, lng: 4.8323 } }, existing);
    expect(dup.map((d) => d.id)).toEqual(["a"]); // « b » : trop différent ; « c » : trop loin (~1,8 km)
    expect(dup[0]!.distanceM).toBeLessThan(100);
  });

  it("compare les noms sans tenir compte des accents, de la casse ni des articles", () => {
    expect(nameSimilarity("Crêperie du Port", "creperie du port")).toBe(1);
    expect(nameSimilarity("Chez Paul", "Paul")).toBe(1);
    expect(nameSimilarity("Kayak Évasion", "Boulangerie Martin")).toBeLessThan(0.3);
  });
});

describe("revendication et informations de l'établissement", () => {
  it("contrôle la forme du SIRET (14 chiffres, clé de Luhn ; numéros fictifs)", () => {
    expect(isValidSiret("12345678900007")).toBe(true);
    expect(isValidSiret("123 456 789 00007")).toBe(true);
    expect(isValidSiret("12345678900008")).toBe(false);
    expect(isValidSiret("1234")).toBe(false);
    expect(ClaimSchema.safeParse({ placeId: "lyon-x", siret: "12345678900007", proofKind: "email_domain", proofText: "contact@exemple.fr" }).success).toBe(true);
  });

  it("marque chaque valeur fournie comme « fournie par l'établissement », datée et non vérifiée", () => {
    const place = buildCommunityPlace(proposal, { id: "lyon-cordonnerie", destination: lyon, approvedOn: "2026-09-25" });
    const hours = weeklyFromSimple({ mon: null, tue: { open: "09:00", close: "18:00" }, sat: { open: "10:00", close: "12:30" } });
    const updated = applyEstablishmentUpdate(place, { website: "https://cordonnerie.example", price: "lte30", openingHours: hours, bookingMode: "none" }, "2026-09-26");
    expect(updated.practical.openingHours).toMatchObject({ status: "estimate", by: "establishment" });
    expect(updated.practical.website).toMatchObject({ status: "estimate", by: "establishment", value: "https://cordonnerie.example" });
    const lines = practicalLines(updated, lyon);
    expect(lines.find((l) => l.id === "hours")!.certainty).toBe("establishment");
    expect(lines.find((l) => l.id === "hours")!.note).toContain("Fourni par l'établissement le 2026-09-26");
    // « Je ne sais pas » rend la valeur inconnue (jamais une valeur par défaut).
    const cleared = applyEstablishmentUpdate(updated, { website: null, price: "unknown", openingHours: null, bookingMode: "unknown" }, "2026-09-27");
    expect(cleared.practical.price.status).toBe("unknown");
    expect(cleared.practical.openingHours.status).toBe("unknown");
  });
});

describe("statut payant", () => {
  it("n'influence ni la recherche, ni les filtres, ni les sections, ni « Surprends-nous »", () => {
    const paid: Catalog = { ...catalog, places: catalog.places.map((p) => (p.destinationId === "lyon" ? { ...p, sponsored: { label: "Partenaire" } } : p)) };
    const unpaid: Catalog = { ...catalog, places: catalog.places.map((p) => ({ ...p, sponsored: null })) };
    const ids = (places: Array<{ id: string }>) => places.map((p) => p.id);
    const now = new Date("2026-10-03T10:00:00Z");
    expect(ids(filterPlaces(paid, { ...DEFAULT_FILTERS, destinationId: "lyon" }, now).places)).toEqual(ids(filterPlaces(unpaid, { ...DEFAULT_FILTERS, destinationId: "lyon" }, now).places));
    expect(searchCatalog(paid, "lyon").map((h) => (h.kind === "place" ? h.place.id : h.destination.id))).toEqual(searchCatalog(unpaid, "lyon").map((h) => (h.kind === "place" ? h.place.id : h.destination.id)));
    const sections = (c: Catalog) => buildSections({ catalog: c, destinationId: "lyon", position: null, visitedIds: new Set(), friendRecommendations: [] }).map((s) => [s.id, s.items.map((i) => i.place.id)]);
    expect(sections(paid)).toEqual(sections(unpaid));
    const steps = (c: Catalog) => surprise(baseRequest(), c, idGenerator()).steps.map((s) => s.placeId);
    expect(steps(paid)).toEqual(steps(unpaid));
  });
});

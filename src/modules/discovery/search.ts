import { CATEGORIES, type CategoryId, type Diet, type ThemeId } from "@/modules/catalog/categories";
import type { Catalog, Destination, LatLng, Place } from "@/modules/catalog/schema";
import { straightLineMeters } from "@/modules/shared/geo";
import { normalizeText } from "@/modules/shared/hash";
import { hasUsableHours, localPartsAt, openStatusAt } from "@/modules/shared/time";

export type SearchHit =
  | { kind: "destination"; destination: Destination; score: number }
  | { kind: "place"; place: Place; score: number };

/** Recherche insensible aux accents dans les villes, villages et lieux du catalogue. */
export function searchCatalog(catalog: Catalog, query: string, limit = 12): SearchHit[] {
  const q = normalizeText(query);
  if (q.length < 2) return [];
  const terms = q.split(" ").filter(Boolean);
  const scoreText = (text: string, weight: number) => {
    const t = normalizeText(text);
    let score = 0;
    for (const term of terms) {
      if (t.startsWith(term)) score += 3 * weight;
      else if (t.includes(` ${term}`)) score += 2 * weight;
      else if (t.includes(term)) score += 1 * weight;
      else return 0; // tous les termes doivent apparaître
    }
    return score;
  };
  const hits: SearchHit[] = [];
  for (const destination of catalog.destinations) {
    const score = Math.max(scoreText(destination.name, 3), scoreText(`${destination.name} ${destination.region}`, 1));
    if (score > 0) hits.push({ kind: "destination", destination, score: score + 1 });
  }
  const destinationNames = new Map(catalog.destinations.map((d) => [d.id, d.name]));
  for (const place of catalog.places) {
    const score = Math.max(
      scoreText(place.name, 2),
      scoreText(`${place.name} ${destinationNames.get(place.destinationId) ?? ""} ${CATEGORIES[place.category].label}`, 1),
    );
    if (score > 0) hits.push({ kind: "place", place, score });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type PlaceFilters = {
  destinationId: string | null;
  categories: CategoryId[];
  themes: ThemeId[];
  /** "free" : gratuit uniquement ; nombre : prix minimal par personne ≤ valeur. */
  budget: "any" | "free" | number;
  /** Inclure les lieux au coût inconnu quand un budget est fixé (affichés comme tels). */
  includeUnknownPrice: boolean;
  /** Distance maximale à vol d'oiseau depuis `origin`, en km. */
  maxDistanceKm: number | null;
  origin: LatLng | null;
  /** Durée de visite maximale, en minutes. */
  maxVisitMinutes: number | null;
  includeUnknownDuration: boolean;
  openNow: boolean;
  wheelchair: boolean;
  setting: "any" | "indoor" | "outdoor";
  diets: Diet[];
};

export const DEFAULT_FILTERS: PlaceFilters = {
  destinationId: null,
  categories: [],
  themes: [],
  budget: "any",
  includeUnknownPrice: true,
  maxDistanceKm: null,
  origin: null,
  maxVisitMinutes: null,
  includeUnknownDuration: true,
  openNow: false,
  wheelchair: false,
  setting: "any",
  diets: [],
};

export type FilterReport = {
  places: Place[];
  /** Nombre de lieux écartés parce que l'information nécessaire est inconnue. */
  hiddenForUnknown: { price: number; duration: number; hours: number; accessibility: number };
  /** « Ouvert maintenant » n'est proposé que si au moins un lieu du périmètre a des horaires exploitables. */
  openNowAvailable: boolean;
};

export function filterPlaces(catalog: Catalog, filters: PlaceFilters, now: Date = new Date()): FilterReport {
  const hidden = { price: 0, duration: 0, hours: 0, accessibility: 0 };
  const destinationTz = new Map(catalog.destinations.map((d) => [d.id, d.timezone]));
  const scope = catalog.places.filter((p) => !filters.destinationId || p.destinationId === filters.destinationId);
  const openNowAvailable = scope.some((p) => hasUsableHours(p.practical.openingHours));

  const places = scope.filter((place) => {
    if (filters.categories.length > 0 && !filters.categories.includes(place.category)) return false;
    if (filters.themes.length > 0 && !filters.themes.some((t) => place.themes.includes(t))) return false;
    if (filters.setting !== "any" && place.setting !== filters.setting && place.setting !== "mixed") return false;

    if (filters.budget !== "any") {
      const price = place.practical.price;
      if (price.status === "unknown") {
        if (!filters.includeUnknownPrice) {
          hidden.price += 1;
          return false;
        }
      } else if (filters.budget === "free") {
        if (price.value.kind !== "free") return false;
      } else if (price.value.kind === "paid" && price.value.minPerPerson > filters.budget) {
        return false;
      }
    }

    if (filters.maxDistanceKm !== null && filters.origin) {
      if (straightLineMeters(filters.origin, place.location) > filters.maxDistanceKm * 1000) return false;
    }

    if (filters.maxVisitMinutes !== null) {
      const duration = place.practical.visitMinutes;
      if (duration.status === "unknown") {
        if (!filters.includeUnknownDuration) {
          hidden.duration += 1;
          return false;
        }
      } else if (duration.value > filters.maxVisitMinutes) return false;
    }

    if (filters.openNow) {
      const hours = place.practical.openingHours;
      if (!hasUsableHours(hours)) {
        hidden.hours += 1;
        return false;
      }
      const { date, minutes } = localPartsAt(now, destinationTz.get(place.destinationId) ?? "Europe/Paris");
      if (openStatusAt(hours, date, minutes) !== "open") return false;
    }

    if (filters.wheelchair) {
      const access = place.practical.accessibility;
      if (access.status === "unknown") {
        hidden.accessibility += 1;
        return false;
      }
      if (access.value.wheelchair !== "yes") return false;
    }

    if (filters.diets.length > 0) {
      if (!place.restaurant) return false;
      const diets = place.restaurant.diets;
      if (diets.status === "unknown") return false;
      if (!filters.diets.every((d) => diets.value.includes(d))) return false;
    }
    return true;
  });

  return { places, hiddenForUnknown: hidden, openNowAvailable };
}

export function isFree(place: Place): boolean {
  return place.practical.price.status !== "unknown" && place.practical.price.value.kind === "free";
}

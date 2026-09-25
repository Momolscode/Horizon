import type { Catalog, Place } from "@/modules/catalog/schema";
import { straightLineMeters } from "@/modules/shared/geo";
import { seededUnit } from "@/modules/shared/hash";
import { hasUsableHours, openDuring, parseHHMM, formatMinutes } from "@/modules/shared/time";
import {
  DEFAULT_VISIT_MINUTES,
  MAX_HOP_KM,
  perPersonCap,
  scheduleExcursion,
  transferMarginMinutes,
  type Schedule,
} from "./schedule";
import type { ExcursionStep, Interest, SurpriseRequest } from "./types";

/**
 * « Surprends-nous » — moteur DÉTERMINISTE et explicable.
 * Mêmes entrées (y compris la graine) ⇒ même proposition. Aucune IA requise.
 * Il ne choisit que des lieux existants du catalogue et n'invente ni horaire,
 * ni prix, ni disponibilité.
 */

export type Reason = { label: string; weight: number };

export type ScoredPlace = { place: Place; score: number; reasons: Reason[] };

export type Exclusion = { placeId: string; reason: string };

export type SurpriseResult = {
  status: "ok" | "insufficient";
  steps: ExcursionStep[];
  reasonsByPlace: Record<string, string[]>;
  schedule: Schedule;
  excluded: Exclusion[];
  explanation: string[];
};

const MEAL_WINDOWS = [
  { id: "lunch", label: "déjeuner", start: 12 * 60, end: 14 * 60 },
  { id: "dinner", label: "dîner", start: 19 * 60, end: 21 * 60 + 30 },
] as const;

const INTEREST_MATCH: Record<Interest, (p: Place) => boolean> = {
  culture: (p) => p.themes.includes("culture") || p.themes.includes("heritage"),
  sport: (p) => p.themes.includes("sport") || p.category === "hike",
  food: (p) => p.themes.includes("food"),
  economy: (p) => p.practical.price.status !== "unknown" && p.practical.price.value.kind === "free",
  relax: (p) => p.themes.includes("relax"),
  nature: (p) => p.themes.includes("nature"),
};

const INTEREST_REASON: Record<Interest, string> = {
  culture: "Correspond à votre envie de culture",
  sport: "Pour bouger un peu",
  food: "Pour les gourmands",
  economy: "Gratuit (selon les informations disponibles)",
  relax: "Un moment de détente",
  nature: "Au grand air",
};

function isMealPlace(place: Place): boolean {
  return place.category === "restaurant" || place.category === "market";
}

function visitMinutesOf(place: Place): number {
  return place.practical.visitMinutes.status === "unknown" ? DEFAULT_VISIT_MINUTES : place.practical.visitMinutes.value;
}

/** Filtres stricts : un lieu écarté l'est pour une raison affichable. */
export function hardFilter(place: Place, request: SurpriseRequest): string | null {
  const cap = perPersonCap(request.budget, request.party.size);
  const price = place.practical.price;
  if (cap !== null && price.status !== "unknown" && price.value.kind === "paid" && price.value.minPerPerson > cap) {
    return "Au-delà du budget par personne";
  }
  if (request.needs.wheelchair) {
    const a = place.practical.accessibility;
    if (a.status === "unknown") return "Accessibilité en fauteuil non renseignée";
    if (a.value.wheelchair !== "yes") return "Non signalé comme accessible en fauteuil";
  }
  if (isMealPlace(place) && place.restaurant && request.needs.diets.length > 0) {
    const d = place.restaurant.diets;
    if (d.status === "unknown" || !request.needs.diets.every((x) => d.value.includes(x))) return "Préférences alimentaires non confirmées";
  }
  if (request.includeMeal === "no" && place.category === "restaurant") return "Repas non souhaité";
  return null;
}

export function scorePlace(place: Place, request: SurpriseRequest): ScoredPlace {
  const reasons: Reason[] = [];
  let score = 1;
  for (const interest of request.interests) {
    if (INTEREST_MATCH[interest](place)) {
      score += 2;
      reasons.push({ label: INTEREST_REASON[interest], weight: 2 });
    }
  }
  const kind = request.party.kind;
  if (kind === "family" && place.themes.includes("family")) {
    score += 1.5;
    reasons.push({ label: "Adapté aux familles", weight: 1.5 });
  }
  if (kind === "couple" && (["viewpoint", "park", "lake", "beach"].includes(place.category) || place.restaurant?.style === "gastronomique" || place.restaurant?.style === "bistrot")) {
    score += 1;
    reasons.push({ label: "Idéal à deux", weight: 1 });
  }
  if (kind === "friends" && (["leisure", "market", "beach"].includes(place.category) || place.themes.includes("food"))) {
    score += 1;
    reasons.push({ label: "Sympa entre amis", weight: 1 });
  }
  if (kind === "solo" && ["museum", "hike", "viewpoint"].includes(place.category)) {
    score += 0.5;
    reasons.push({ label: "Se savoure aussi en solo", weight: 0.5 });
  }
  if (place.lesserKnown) {
    score += 0.75;
    reasons.push({ label: "Lieu moins connu, pour sortir des sentiers battus", weight: 0.75 });
  }
  if (request.budget.amount !== null && place.practical.price.status === "unknown") {
    score -= 0.25;
  }
  if (place.fictional) score -= 0.5;
  // Variation déterministe : « Relancer » change la graine, pas la logique.
  score += seededUnit(request.seed, place.id) * 0.9;
  return { place, score, reasons };
}

function mealWindowToFill(request: SurpriseRequest): (typeof MEAL_WINDOWS)[number] | null {
  if (request.includeMeal === "no") return null;
  const start = parseHHMM(request.startTime);
  const end = start + request.durationMinutes;
  for (const window of MEAL_WINDOWS) {
    const overlap = Math.min(end, window.end) - Math.max(start, window.start);
    if (overlap >= 45) return window;
  }
  return request.includeMeal === "yes" ? (MEAL_WINDOWS.find((w) => w.start >= start) ?? MEAL_WINDOWS[0]) : null;
}

function distancePenalty(meters: number, request: SurpriseRequest): number {
  const km = meters / 1000;
  const scale = { walk: 0.9, bike: 0.25, transit: 0.2, car: 0.06 }[request.transport];
  return km * scale;
}

function fitsHours(place: Place, date: string, arrival: number, departure: number): "open" | "closed" | "unknown" {
  const hours = place.practical.openingHours;
  if (!hasUsableHours(hours)) return "unknown";
  return openDuring(hours.value, date, arrival, departure) ? "open" : "closed";
}

export function surprise(request: SurpriseRequest, catalog: Catalog, newId: () => string): SurpriseResult {
  const destination = catalog.destinations.find((d) => d.id === request.destinationId);
  const explanation: string[] = [];
  const excluded: Exclusion[] = [];
  const pool: ScoredPlace[] = [];

  for (const place of catalog.places) {
    if (place.destinationId !== request.destinationId) continue;
    const blocked = hardFilter(place, request);
    if (blocked) {
      excluded.push({ placeId: place.id, reason: blocked });
      continue;
    }
    pool.push(scorePlace(place, request));
  }

  const start = parseHHMM(request.startTime);
  const end = start + request.durationMinutes;
  const target = Math.max(3, Math.min(5, Math.floor(request.durationMinutes / 75)));
  const meal = mealWindowToFill(request);
  const chosen: ScoredPlace[] = [];
  const stepReasons: Record<string, string[]> = {};
  let clock = start;
  let previous: Place | null = null;
  let mealPlaced = meal === null;

  while (chosen.length < target) {
    const needMealNow = !mealPlaced && meal !== null && clock >= meal.start - 45 && clock <= meal.end - 45;
    const remainingSlots = target - chosen.length;
    const mustReserveMeal = !mealPlaced && meal !== null && remainingSlots === 1 && clock < meal.end;

    let best: { candidate: ScoredPlace; value: number; arrival: number; departure: number; hours: string; meters: number } | null = null;
    for (const candidate of pool) {
      if (chosen.some((c) => c.place.id === candidate.place.id)) continue;
      const mealCandidate = isMealPlace(candidate.place);
      if (needMealNow || mustReserveMeal) {
        if (!mealCandidate) continue;
      } else if (candidate.place.category === "restaurant") {
        continue; // les restaurants ne sont proposés qu'au moment d'un repas
      } else if (mealCandidate && chosen.some((c) => isMealPlace(c.place))) {
        continue;
      }
      const meters: number = previous ? straightLineMeters(previous.location, candidate.place.location) : 0;
      if (previous && meters / 1000 > MAX_HOP_KM[request.transport]) continue;
      const arrival: number = clock + (previous ? transferMarginMinutes(meters, request.transport) : 0);
      const departure = arrival + visitMinutesOf(candidate.place);
      if (departure > end + 15) continue;
      // Ne pas « sauter » la fenêtre du repas avec une visite trop longue.
      if (!mealCandidate && meal && !mealPlaced && clock < meal.start - 45 && departure > meal.end - 45) continue;
      const hours = fitsHours(candidate.place, request.date, arrival, departure);
      if (hours === "closed") continue;
      let value: number = candidate.score - distancePenalty(meters, request);
      if (previous && previous.category === candidate.place.category) value -= 1.5;
      if (chosen.some((c) => c.place.category === candidate.place.category)) value -= 0.75;
      if (hours === "open") value += 0.25;
      if (!best || value > best.value || (value === best.value && candidate.place.id < best.candidate.place.id)) {
        best = { candidate, value, arrival, departure, hours, meters };
      }
    }

    if (!best) {
      if (needMealNow && !mustReserveMeal) {
        // Pas de table compatible : on le dit plutôt que d'inventer.
        mealPlaced = true;
        explanation.push(`Aucun lieu de repas compatible trouvé pour le ${meal!.label} : prévoyez une solution sur place.`);
        continue;
      }
      break;
    }

    const place: Place = best.candidate.place;
    const reasons = best.candidate.reasons
      .slice()
      .sort((a, b) => b.weight - a.weight)
      .map((r) => r.label);
    if (isMealPlace(place) && meal && !mealPlaced) {
      reasons.unshift(`Pause ${meal.label} vers ${formatMinutes(best.arrival)}`);
      mealPlaced = true;
    }
    if (previous) {
      const km = best.meters / 1000;
      reasons.push(km < 1 ? `À ${Math.round(best.meters / 10) * 10} m à vol d'oiseau de l'étape précédente` : `À ${km.toFixed(1).replace(".", ",")} km à vol d'oiseau de l'étape précédente`);
    }
    if (best.hours === "unknown") reasons.push("Horaires inconnus : à vérifier");
    stepReasons[place.id] = reasons.length > 0 ? reasons : ["Complète l'itinéraire"];
    chosen.push(best.candidate);
    clock = best.departure;
    previous = place;
  }

  const steps: ExcursionStep[] = chosen.map((c) => ({ id: newId(), placeId: c.place.id, visitMinutes: visitMinutesOf(c.place), note: null }));
  const schedule = scheduleExcursion({ ...request, steps }, catalog);
  const status = steps.length >= 3 ? "ok" : "insufficient";

  if (status === "insufficient") {
    explanation.unshift(
      `Seulement ${steps.length} étape(s) compatible(s) avec vos critères${destination ? ` à ${destination.name}` : ""}. Élargissez le budget, la durée ou le mode de déplacement.`,
    );
  } else {
    explanation.unshift(
      `${steps.length} étapes choisies parmi ${pool.length} lieux compatibles${destination ? ` à ${destination.name}` : ""}, selon vos envies, les distances à vol d'oiseau et les horaires connus.`,
    );
  }
  if (excluded.length > 0) explanation.push(`${excluded.length} lieu(x) écarté(s) par vos contraintes (budget, accessibilité, alimentation).`);
  if (schedule.budget.unknownSteps > 0) explanation.push(`${schedule.budget.unknownSteps} étape(s) au coût inconnu : le budget total n'est pas garanti.`);

  return { status, steps, reasonsByPlace: stepReasons, schedule, excluded, explanation };
}

/** Alternatives pour remplacer une étape, classées et expliquées. */
export function alternativesFor(
  request: SurpriseRequest,
  steps: ExcursionStep[],
  index: number,
  catalog: Catalog,
  limit = 4,
): Array<{ place: Place; reasons: string[]; score: number }> {
  const current = steps[index];
  if (!current) return [];
  const byId = new Map(catalog.places.map((p) => [p.id, p]));
  const prev = index > 0 ? byId.get(steps[index - 1]!.placeId) : undefined;
  const next = index < steps.length - 1 ? byId.get(steps[index + 1]!.placeId) : undefined;
  const currentPlace = byId.get(current.placeId);
  const used = new Set(steps.map((s) => s.placeId));
  const results: Array<{ place: Place; reasons: string[]; score: number }> = [];
  for (const place of catalog.places) {
    if (place.destinationId !== request.destinationId || used.has(place.id)) continue;
    if (hardFilter(place, request)) continue;
    if (currentPlace && isMealPlace(currentPlace) !== isMealPlace(place)) continue;
    const scored = scorePlace(place, request);
    let value = scored.score;
    const reasons = scored.reasons.map((r) => r.label);
    for (const neighbour of [prev, next]) {
      if (!neighbour) continue;
      const meters = straightLineMeters(neighbour.location, place.location);
      value -= distancePenalty(meters, request);
    }
    if (prev) {
      const meters = straightLineMeters(prev.location, place.location);
      reasons.push(`À ${(meters / 1000).toFixed(1).replace(".", ",")} km à vol d'oiseau de l'étape précédente`);
    }
    results.push({ place, reasons, score: value });
  }
  return results.sort((a, b) => b.score - a.score || a.place.id.localeCompare(b.place.id)).slice(0, limit);
}

export function moveStep(steps: ExcursionStep[], from: number, to: number): ExcursionStep[] {
  if (from < 0 || from >= steps.length || to < 0 || to >= steps.length) return steps;
  const copy = steps.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item!);
  return copy;
}

export function replaceStep(steps: ExcursionStep[], index: number, place: Place, newId: () => string): ExcursionStep[] {
  return steps.map((s, i) => (i === index ? { id: newId(), placeId: place.id, visitMinutes: visitMinutesOf(place), note: null } : s));
}

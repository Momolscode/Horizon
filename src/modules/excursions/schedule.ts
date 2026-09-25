import type { Catalog, Place } from "@/modules/catalog/schema";
import { straightLineMeters } from "@/modules/shared/geo";
import { hasUsableHours, openDuring, parseHHMM } from "@/modules/shared/time";
import type { ExcursionStep, Transport, TripPreferences } from "./types";

/**
 * Ordonnancement d'une excursion. Aucune API d'itinéraire n'est branchée par
 * défaut : les marges de déplacement sont ESTIMÉES à partir de la distance à vol
 * d'oiseau et affichées comme telles, jamais comme un temps de trajet réel.
 */

const SPEED_KMH: Record<Transport, number> = { walk: 4.5, bike: 14, transit: 15, car: 28 };
const FIXED_OVERHEAD_MIN: Record<Transport, number> = { walk: 3, bike: 5, transit: 10, car: 10 };
/** Facteur de détour appliqué à la distance à vol d'oiseau pour la marge estimée. */
export const DETOUR_FACTOR = 1.35;
/** Au-delà, l'enchaînement est jugé peu raisonnable pour le mode choisi (vol d'oiseau). */
export const MAX_HOP_KM: Record<Transport, number> = { walk: 3.5, bike: 12, transit: 15, car: 60 };
export const DEFAULT_VISIT_MINUTES = 60;

export function transferMarginMinutes(meters: number, transport: Transport): number {
  if (meters < 60) return 0;
  const km = (meters / 1000) * DETOUR_FACTOR;
  return Math.ceil((km / SPEED_KMH[transport]) * 60 + FIXED_OVERHEAD_MIN[transport]);
}

export type IssueCode =
  | "closed"
  | "hours_unknown"
  | "price_unknown"
  | "duration_unknown"
  | "overruns"
  | "far_for_transport"
  | "wheelchair_unknown"
  | "wheelchair_no"
  | "diet_unknown"
  | "fictional"
  | "estimate";

export type Issue = { code: IssueCode; severity: "info" | "warning" | "error"; message: string };

export type ScheduledStep = {
  step: ExcursionStep;
  place: Place;
  arrival: number;
  departure: number;
  transfer: { straightLineM: number; marginMinutes: number } | null;
  hours: "open" | "closed" | "unknown";
  issues: Issue[];
};

export type BudgetSummary = {
  perPerson: { min: number; max: number };
  group: { min: number; max: number };
  unknownSteps: number;
  includesEstimates: boolean;
  perPersonCap: number | null;
  verdict: "within" | "over" | "uncertain" | "no_budget";
};

export type Schedule = {
  steps: ScheduledStep[];
  start: number;
  end: number;
  plannedEnd: number;
  overrunMinutes: number;
  budget: BudgetSummary;
  issues: Issue[];
};

export type ScheduleInput = {
  date: string;
  startTime: string;
  durationMinutes: number;
  steps: ExcursionStep[];
} & Pick<TripPreferences, "party" | "budget" | "transport" | "needs">;

export function perPersonCap(budget: TripPreferences["budget"], partySize: number): number | null {
  if (budget.amount === null) return null;
  return budget.basis === "group" ? budget.amount / Math.max(1, partySize) : budget.amount;
}

export function computeBudget(places: Place[], prefs: Pick<TripPreferences, "party" | "budget">): BudgetSummary {
  let min = 0;
  let max = 0;
  let unknownSteps = 0;
  let includesEstimates = false;
  for (const place of places) {
    const price = place.practical.price;
    if (price.status === "unknown") {
      unknownSteps += 1;
      continue;
    }
    if (price.status === "estimate") includesEstimates = true;
    if (price.value.kind === "paid") {
      min += price.value.minPerPerson;
      max += price.value.maxPerPerson;
    }
  }
  const size = prefs.party.size;
  const cap = perPersonCap(prefs.budget, size);
  let verdict: BudgetSummary["verdict"] = "no_budget";
  if (cap !== null) {
    if (min > cap) verdict = "over";
    else if (unknownSteps > 0 || max > cap) verdict = "uncertain";
    else verdict = "within";
  }
  return {
    perPerson: { min, max },
    group: { min: min * size, max: max * size },
    unknownSteps,
    includesEstimates,
    perPersonCap: cap,
    verdict,
  };
}

export function stepIssues(place: Place, prefs: Pick<TripPreferences, "needs">): Issue[] {
  const issues: Issue[] = [];
  if (place.fictional) issues.push({ code: "fictional", severity: "warning", message: "Établissement fictif de démonstration." });
  if (place.practical.price.status === "unknown") issues.push({ code: "price_unknown", severity: "info", message: "Coût inconnu : non compté comme gratuit." });
  if (place.practical.visitMinutes.status === "unknown")
    issues.push({ code: "duration_unknown", severity: "info", message: `Durée non renseignée : ${DEFAULT_VISIT_MINUTES} min prévues par défaut.` });
  if (prefs.needs.wheelchair) {
    const a = place.practical.accessibility;
    if (a.status === "unknown") issues.push({ code: "wheelchair_unknown", severity: "warning", message: "Accessibilité en fauteuil non renseignée." });
    else if (a.value.wheelchair === "no") issues.push({ code: "wheelchair_no", severity: "error", message: "Signalé comme non accessible en fauteuil." });
  }
  if (prefs.needs.diets.length > 0 && place.restaurant) {
    const d = place.restaurant.diets;
    if (d.status === "unknown" || !prefs.needs.diets.every((x) => d.value.includes(x))) {
      issues.push({ code: "diet_unknown", severity: "warning", message: "Préférences alimentaires non confirmées pour ce lieu." });
    }
  }
  return issues;
}

/** Recalcule horaires, marges, alertes et budget d'une liste d'étapes. */
export function scheduleExcursion(input: ScheduleInput, catalog: Catalog): Schedule {
  const byId = new Map(catalog.places.map((p) => [p.id, p]));
  const start = parseHHMM(input.startTime);
  const plannedEnd = start + input.durationMinutes;
  let clock = start;
  let previous: Place | null = null;
  const steps: ScheduledStep[] = [];
  const globalIssues: Issue[] = [];

  for (const step of input.steps) {
    const place = byId.get(step.placeId);
    if (!place) {
      globalIssues.push({ code: "closed", severity: "error", message: `Étape introuvable dans le catalogue (${step.placeId}).` });
      continue;
    }
    let transfer: ScheduledStep["transfer"] = null;
    const issues = stepIssues(place, input);
    if (previous) {
      const meters = straightLineMeters(previous.location, place.location);
      const margin = transferMarginMinutes(meters, input.transport);
      transfer = { straightLineM: Math.round(meters), marginMinutes: margin };
      clock += margin;
      if (meters / 1000 > MAX_HOP_KM[input.transport]) {
        issues.push({
          code: "far_for_transport",
          severity: "warning",
          message: `À ${(meters / 1000).toFixed(1).replace(".", ",")} km à vol d'oiseau de l'étape précédente : trajet long pour ce mode de déplacement.`,
        });
      }
    }
    const arrival = clock;
    const departure = arrival + step.visitMinutes;
    let hours: ScheduledStep["hours"] = "unknown";
    const known = place.practical.openingHours;
    if (hasUsableHours(known)) {
      hours = openDuring(known.value, input.date, arrival, departure) ? "open" : "closed";
      if (hours === "closed") {
        issues.push({
          code: "closed",
          severity: "error",
          message: known.status === "estimate" ? "Fermé à cet horaire selon des horaires fictifs de démonstration." : "Fermé à cet horaire.",
        });
      } else if (known.status === "estimate") {
        issues.push({ code: "estimate", severity: "info", message: "Horaires estimés ou fictifs : à confirmer." });
      }
    } else {
      issues.push({ code: "hours_unknown", severity: "info", message: "Horaires inconnus : vérifier avant de partir." });
    }
    steps.push({ step, place, arrival, departure, transfer, hours, issues });
    clock = departure;
    previous = place;
  }

  const end = clock;
  const overrunMinutes = Math.max(0, end - plannedEnd);
  if (overrunMinutes > 0) {
    globalIssues.push({
      code: "overruns",
      severity: "warning",
      message: `Le programme dépasse la durée prévue de ${overrunMinutes} min.`,
    });
  }
  const budget = computeBudget(
    steps.map((s) => s.place),
    input,
  );
  return { steps, start, end, plannedEnd, overrunMinutes, budget, issues: globalIssues };
}

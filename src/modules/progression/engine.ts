import type { Catalog, Place } from "@/modules/catalog/schema";
import { straightLineMeters, isValidLatLng } from "@/modules/shared/geo";
import {
  BADGES,
  LEVELS,
  NEW_PARCEL_XP,
  PARCEL_RESOLUTION,
  PROXIMITY,
  VISIT_RULES,
  levelForXp,
  medalBadgeId,
  type VisitStatus,
} from "./config";
import { parcelForLocation, strongerState, type Parcel, type ParcelState } from "./parcels";

/**
 * Moteur de progression PUR, partagé par le mode démo (appliqué localement) et
 * le mode connecté (appliqué côté serveur dans une transaction). Le client ne
 * décide jamais de son XP : en mode connecté, seul le serveur appelle ce moteur.
 */

export type ProximityResult = "within" | "too_far" | "inaccurate" | "invalid" | "stale";

export type ProximityCheck = {
  result: ProximityResult;
  distanceM: number | null;
  accuracyM: number | null;
  radiusM: number;
};

export type Visit = {
  id: string;
  placeId: string;
  status: VisitStatus;
  /** Date locale de la visite (fuseau de la destination). */
  visitedOn: string;
  createdAt: string;
  idempotencyKey: string;
  proximity: ProximityCheck | null;
  /** Souvenir privé facultatif. */
  note: string | null;
};

export type LedgerReason = "first_visit" | "proximity_bonus" | "new_parcel" | "level_reward" | "mission" | "admin_adjustment";

export type LedgerEntry = {
  id: string;
  kind: "xp" | "points";
  amount: number;
  reason: LedgerReason;
  refId: string;
  /** Clé d'unicité : une même récompense ne peut être créditée deux fois. */
  uniqueKey: string;
  createdAt: string;
};

export type BadgeAward = { id: string; awardedAt: string };

export type ProgressionSnapshot = {
  visits: Visit[];
  parcels: Parcel[];
  ledger: LedgerEntry[];
  badges: BadgeAward[];
};

export const EMPTY_SNAPSHOT: ProgressionSnapshot = { visits: [], parcels: [], ledger: [], badges: [] };

export type PositionFix = { lat: number; lng: number; accuracyM: number; capturedAt: string };

export function proximityRadiusFor(place: Place): number {
  return ["lake", "hike", "beach", "viewpoint", "park"].includes(place.category) ? PROXIMITY.largeSiteRadiusM : PROXIMITY.defaultRadiusM;
}

/** Contrôle ponctuel et limité : ce n'est pas une preuve infalsifiable de présence. */
export function evaluateProximity(place: Place, fix: PositionFix | null, now: Date): ProximityCheck {
  const radiusM = proximityRadiusFor(place);
  if (!fix || !isValidLatLng(fix) || !Number.isFinite(fix.accuracyM) || fix.accuracyM < 0) {
    return { result: "invalid", distanceM: null, accuracyM: null, radiusM };
  }
  const capturedAt = Date.parse(fix.capturedAt);
  if (!Number.isFinite(capturedAt) || now.getTime() - capturedAt > PROXIMITY.maxPositionAgeMs || capturedAt - now.getTime() > 60_000) {
    return { result: "stale", distanceM: null, accuracyM: fix.accuracyM, radiusM };
  }
  const distanceM = Math.round(straightLineMeters(place.location, fix));
  if (fix.accuracyM > PROXIMITY.maxAccuracyM) return { result: "inaccurate", distanceM, accuracyM: fix.accuracyM, radiusM };
  return { result: distanceM <= radiusM ? "within" : "too_far", distanceM, accuracyM: fix.accuracyM, radiusM };
}

export type VisitRequest = {
  placeId: string;
  /** Statut demandé ; "proximity_checked" n'est accordé que si le contrôle réussit. */
  requestedStatus: VisitStatus;
  visitedOn: string;
  idempotencyKey: string;
  position: PositionFix | null;
  note: string | null;
};

export type VisitOutcome = {
  duplicate: boolean;
  visit: Visit;
  ledger: LedgerEntry[];
  parcel: { parcel: Parcel; isNew: boolean; previousState: ParcelState | null } | null;
  badges: BadgeAward[];
  xpGained: number;
  pointsGained: number;
  levelBefore: number;
  levelAfter: number;
  /** Explication lisible du statut retenu (ex. contrôle échoué → visite déclarée). */
  statusExplanation: string;
};

export type EngineDeps = { now: Date; newId: () => string; mode: "demo" | "connected" };

export class VisitRejectedError extends Error {
  constructor(
    message: string,
    readonly code: "unknown_place" | "status_not_allowed" | "invalid_date",
  ) {
    super(message);
  }
}

export function totals(snapshot: ProgressionSnapshot): { xp: number; points: number } {
  let xp = 0;
  let points = 0;
  for (const entry of snapshot.ledger) {
    if (entry.kind === "xp") xp += entry.amount;
    else points += entry.amount;
  }
  return { xp, points };
}

export type ProgressionStats = {
  realVisits: number;
  distinctPlacesVisited: number;
  distinctCategories: number;
  freePlacesVisited: number;
  parcels: number;
  destinationsWithVisit: number;
};

export function computeStats(snapshot: ProgressionSnapshot, catalog: Catalog): ProgressionStats {
  const byId = new Map(catalog.places.map((p) => [p.id, p]));
  const real = snapshot.visits.filter((v) => VISIT_RULES[v.status].countsAsRealVisit);
  const placeIds = new Set(real.map((v) => v.placeId));
  const places = [...placeIds].map((id) => byId.get(id)).filter((p): p is Place => Boolean(p));
  return {
    realVisits: real.length,
    distinctPlacesVisited: placeIds.size,
    distinctCategories: new Set(places.map((p) => p.category)).size,
    freePlacesVisited: places.filter((p) => p.practical.price.status !== "unknown" && p.practical.price.value.kind === "free").length,
    parcels: snapshot.parcels.length,
    destinationsWithVisit: new Set(places.map((p) => p.destinationId)).size,
  };
}

/** Badges dont les critères sont remplis par l'état donné. */
export function eligibleBadges(snapshot: ProgressionSnapshot, catalog: Catalog): string[] {
  const stats = computeStats(snapshot, catalog);
  const ids: string[] = [];
  if (stats.realVisits >= 1) ids.push("premiere-visite");
  if (snapshot.parcels.some((p) => p.state !== "simulated")) ids.push("premiere-parcelle");
  if (stats.distinctCategories >= 3) ids.push("curieux");
  if (stats.freePlacesVisited >= 3) ids.push("petit-budget");
  const { xp } = totals(snapshot);
  const level = levelForXp(xp).current.level;
  for (const def of LEVELS) {
    if (def.level <= level && def.reward?.kind === "badge") ids.push(def.reward.id);
  }
  const realPlaceIds = new Set(snapshot.visits.filter((v) => VISIT_RULES[v.status].countsAsRealVisit).map((v) => v.placeId));
  for (const destination of catalog.destinations) {
    if (destination.medalRoute.placeIds.every((id) => realPlaceIds.has(id))) ids.push(medalBadgeId(destination.id));
  }
  return ids;
}

export function badgeLabel(id: string, catalog: Catalog): string {
  if (id.startsWith("medaille:")) {
    const destination = catalog.destinations.find((d) => `medaille:${d.id}` === id);
    return destination ? `Médaille « ${destination.medalRoute.title} »` : "Médaille de destination";
  }
  return BADGES[id]?.label ?? id;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Calcule le résultat d'une visite sans effet de bord. Idempotent : une clé déjà
 * vue renvoie la visite existante, sans aucune récompense.
 */
export function planVisit(request: VisitRequest, snapshot: ProgressionSnapshot, catalog: Catalog, deps: EngineDeps): VisitOutcome {
  const levelBefore = levelForXp(totals(snapshot).xp).current.level;
  const existing = snapshot.visits.find((v) => v.idempotencyKey === request.idempotencyKey);
  if (existing) {
    return {
      duplicate: true,
      visit: existing,
      ledger: [],
      parcel: null,
      badges: [],
      xpGained: 0,
      pointsGained: 0,
      levelBefore,
      levelAfter: levelBefore,
      statusExplanation: "Demande déjà traitée : aucune récompense supplémentaire.",
    };
  }

  const place = catalog.places.find((p) => p.id === request.placeId);
  if (!place) throw new VisitRejectedError("Lieu inconnu.", "unknown_place");
  if (!DATE_RE.test(request.visitedOn)) throw new VisitRejectedError("Date de visite invalide.", "invalid_date");
  if (deps.mode === "connected" && !VISIT_RULES[request.requestedStatus].allowedInConnectedMode) {
    throw new VisitRejectedError("Les visites simulées n'existent qu'en démonstration.", "status_not_allowed");
  }

  // Statut effectif : un contrôle de proximité doit réussir, sinon la visite reste déclarée.
  let status: VisitStatus = request.requestedStatus;
  let proximity: ProximityCheck | null = null;
  let statusExplanation = VISIT_RULES[status].label;
  if (request.requestedStatus === "proximity_checked") {
    proximity = evaluateProximity(place, request.position, deps.now);
    if (proximity.result !== "within") {
      status = "declared";
      const reasons: Record<Exclude<ProximityResult, "within">, string> = {
        too_far: `position à ${proximity.distanceM} m du lieu (rayon ${proximity.radiusM} m)`,
        inaccurate: `précision insuffisante (${Math.round(proximity.accuracyM ?? 0)} m, maximum ${PROXIMITY.maxAccuracyM} m)`,
        invalid: "position absente ou invalide",
        stale: "position trop ancienne",
      };
      statusExplanation = `Contrôle non concluant (${reasons[proximity.result]}) : la visite est conservée comme déclarée.`;
    } else {
      statusExplanation = `Position ponctuelle à ${proximity.distanceM} m du lieu (précision ${Math.round(proximity.accuracyM ?? 0)} m).`;
    }
  }

  const rule = VISIT_RULES[status];
  const createdAt = deps.now.toISOString();
  const visit: Visit = {
    id: deps.newId(),
    placeId: place.id,
    status,
    visitedOn: request.visitedOn,
    createdAt,
    idempotencyKey: request.idempotencyKey,
    proximity,
    note: request.note?.trim() ? request.note.trim().slice(0, 2000) : null,
  };

  const ledgerKeys = new Set(snapshot.ledger.map((e) => e.uniqueKey));
  const ledger: LedgerEntry[] = [];
  const credit = (kind: LedgerEntry["kind"], amount: number, reason: LedgerReason, refId: string) => {
    const uniqueKey = `${reason}:${refId}`;
    if (amount <= 0 || ledgerKeys.has(uniqueKey)) return;
    ledgerKeys.add(uniqueKey);
    ledger.push({ id: deps.newId(), kind, amount, reason, refId, uniqueKey, createdAt });
  };

  if (rule.countsAsRealVisit) credit("xp", rule.firstVisitXp, "first_visit", place.id);
  if (status === "proximity_checked") credit("xp", rule.proximityBonusXp, "proximity_bonus", place.id);

  let parcelResult: VisitOutcome["parcel"] = null;
  if (rule.revealsParcel) {
    const cell = parcelForLocation(place.location, PARCEL_RESOLUTION);
    const parcelState: ParcelState = status === "proximity_checked" ? "checked" : status === "declared" ? "declared" : "simulated";
    const existingParcel = snapshot.parcels.find((p) => p.cell === cell);
    if (existingParcel) {
      const upgraded = strongerState(existingParcel.state, parcelState);
      parcelResult = { parcel: { ...existingParcel, state: upgraded }, isNew: false, previousState: existingParcel.state };
    } else {
      parcelResult = {
        parcel: { cell, resolution: PARCEL_RESOLUTION, state: parcelState, firstRevealedAt: createdAt, placeId: place.id },
        isNew: true,
        previousState: null,
      };
    }
    if (rule.countsAsRealVisit) credit("xp", NEW_PARCEL_XP, "new_parcel", cell);
  }

  // Niveaux et récompenses de niveau (points uniquement via niveau, jamais via une visite seule).
  const xpBefore = totals(snapshot).xp;
  const xpGained = ledger.filter((e) => e.kind === "xp").reduce((sum, e) => sum + e.amount, 0);
  const levelAfter = levelForXp(xpBefore + xpGained).current.level;
  for (const def of LEVELS) {
    if (def.level > levelBefore && def.level <= levelAfter && def.reward?.kind === "points") {
      credit("points", def.reward.amount, "level_reward", `level-${def.level}`);
    }
  }

  const provisional = applyOutcomeParts(snapshot, visit, ledger, parcelResult?.parcel ?? null, []);
  const owned = new Set(snapshot.badges.map((b) => b.id));
  const badges = eligibleBadges(provisional, catalog)
    .filter((id) => !owned.has(id))
    .map((id) => ({ id, awardedAt: createdAt }));

  return {
    duplicate: false,
    visit,
    ledger,
    parcel: parcelResult,
    badges,
    xpGained,
    pointsGained: ledger.filter((e) => e.kind === "points").reduce((sum, e) => sum + e.amount, 0),
    levelBefore,
    levelAfter,
    statusExplanation,
  };
}

function applyOutcomeParts(
  snapshot: ProgressionSnapshot,
  visit: Visit,
  ledger: LedgerEntry[],
  parcel: Parcel | null,
  badges: BadgeAward[],
): ProgressionSnapshot {
  const parcels = parcel
    ? snapshot.parcels.some((p) => p.cell === parcel.cell)
      ? snapshot.parcels.map((p) => (p.cell === parcel.cell ? parcel : p))
      : [...snapshot.parcels, parcel]
    : snapshot.parcels;
  return {
    visits: [...snapshot.visits, visit],
    parcels,
    ledger: [...snapshot.ledger, ...ledger],
    badges: [...snapshot.badges, ...badges],
  };
}

/** Applique un résultat au snapshot local (mode démo). Sans effet si doublon. */
export function applyOutcome(snapshot: ProgressionSnapshot, outcome: VisitOutcome): ProgressionSnapshot {
  if (outcome.duplicate) return snapshot;
  return applyOutcomeParts(snapshot, outcome.visit, outcome.ledger, outcome.parcel?.parcel ?? null, outcome.badges);
}

/** Visites réelles d'un lieu (hors simulations). */
export function realVisitsFor(snapshot: ProgressionSnapshot, placeId: string): Visit[] {
  return snapshot.visits.filter((v) => v.placeId === placeId && VISIT_RULES[v.status].countsAsRealVisit);
}

export function medalProgress(snapshot: ProgressionSnapshot, catalog: Catalog, destinationId: string): { done: number; total: number } {
  const destination = catalog.destinations.find((d) => d.id === destinationId);
  if (!destination) return { done: 0, total: 0 };
  const visited = new Set(snapshot.visits.filter((v) => VISIT_RULES[v.status].countsAsRealVisit).map((v) => v.placeId));
  return { done: destination.medalRoute.placeIds.filter((id) => visited.has(id)).length, total: destination.medalRoute.placeIds.length };
}

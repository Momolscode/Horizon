import type { Catalog } from "@/modules/catalog/schema";
import { isFree } from "@/modules/discovery/search";
import { localPartsAt } from "@/modules/shared/time";
import { VISIT_RULES } from "./config";
import type { LedgerEntry, ProgressionSnapshot } from "./engine";

/**
 * Missions quotidiennes, hebdomadaires et mensuelles. Relues pour la sécurité :
 * aucune n'incite à entrer dans un lieu fermé, à un accès interdit ou à une prise de
 * risque ; toutes sont faisables près de chez soi et gratuitement.
 * La progression est CALCULÉE à partir des données réelles (jamais déclarée par le client).
 */
export type MissionPeriod = "daily" | "weekly" | "monthly";

export type MissionCriteria =
  | { type: "excursion_prepared"; count: number }
  | { type: "free_place_visited"; count: number }
  | { type: "parcels_revealed"; count: number }
  | { type: "distinct_categories_visited"; count: number };

export type MissionDefinition = {
  id: string;
  period: MissionPeriod;
  title: string;
  description: string;
  criteria: MissionCriteria;
  xp: number;
  safetyReviewed: true;
};

export const MISSIONS: MissionDefinition[] = [
  {
    id: "preparer-une-sortie",
    period: "daily",
    title: "Préparer une sortie",
    description: "Créez ou ajustez une excursion aujourd'hui, même pour un après-midi près de chez vous.",
    criteria: { type: "excursion_prepared", count: 1 },
    xp: 5,
    safetyReviewed: true,
  },
  {
    id: "tresor-gratuit",
    period: "weekly",
    title: "Trésor gratuit",
    description: "Visitez cette semaine un lieu en accès libre encore jamais visité : parc, point de vue, place, plage.",
    criteria: { type: "free_place_visited", count: 1 },
    xp: 15,
    safetyReviewed: true,
  },
  {
    id: "deux-univers",
    period: "weekly",
    title: "Deux univers",
    description: "Visitez cette semaine deux nouveaux lieux de catégories différentes.",
    criteria: { type: "distinct_categories_visited", count: 2 },
    xp: 15,
    safetyReviewed: true,
  },
  {
    id: "trois-parcelles",
    period: "monthly",
    title: "Lever trois voiles",
    description: "Révélez trois nouvelles parcelles ce mois-ci, en restant sur les espaces ouverts au public.",
    criteria: { type: "parcels_revealed", count: 3 },
    xp: 30,
    safetyReviewed: true,
  },
];

/** Clé de période dans le fuseau de référence : AAAA-MM-JJ, AAAA-Www (ISO), AAAA-MM. */
export function periodKey(period: MissionPeriod, now: Date, timeZone: string): string {
  const { date } = localPartsAt(now, timeZone);
  if (period === "daily") return date;
  if (period === "monthly") return date.slice(0, 7);
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y!, m! - 1, d!));
  const day = (utc.getUTCDay() + 6) % 7; // lundi = 0
  utc.setUTCDate(utc.getUTCDate() - day + 3); // jeudi de la semaine ISO
  const isoYear = utc.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const week = 1 + Math.round(((utc.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function inPeriod(isoOrDate: string, period: MissionPeriod, key: string, timeZone: string): boolean {
  const instant = isoOrDate.length === 10 ? new Date(`${isoOrDate}T12:00:00Z`) : new Date(isoOrDate);
  if (Number.isNaN(instant.getTime())) return false;
  return periodKey(period, instant, timeZone) === key;
}

export type MissionInputs = {
  snapshot: ProgressionSnapshot;
  catalog: Catalog;
  /** Dates de dernière modification des excursions (ISO). */
  excursionUpdates: string[];
};

export type MissionStatus = {
  mission: MissionDefinition;
  periodKey: string;
  progress: number;
  target: number;
  completed: boolean;
  claimed: boolean;
};

export function missionUniqueKey(missionId: string, key: string): string {
  return `mission:${missionId}:${key}`;
}

export function evaluateMission(mission: MissionDefinition, inputs: MissionInputs, now: Date, timeZone: string): MissionStatus {
  const key = periodKey(mission.period, now, timeZone);
  const { snapshot, catalog } = inputs;
  const byId = new Map(catalog.places.map((p) => [p.id, p]));
  // Heure d'enregistrement (serveur en mode connecté), pas la date déclarée : une visite
  // antidatée ou postdatée ne peut pas faire compter une période.
  // Seule la PREMIÈRE visite réelle d'un lieu compte : redéclarer chaque semaine un lieu
  // déjà visité ne fait pas progresser les missions (pas d'XP récurrente sans nouveauté).
  const firstRealVisit = new Map<string, (typeof snapshot.visits)[number]>();
  for (const v of snapshot.visits) {
    if (!VISIT_RULES[v.status].countsAsRealVisit) continue;
    const known = firstRealVisit.get(v.placeId);
    if (!known || v.createdAt < known.createdAt) firstRealVisit.set(v.placeId, v);
  }
  const realVisits = [...firstRealVisit.values()].filter((v) => inPeriod(v.createdAt, mission.period, key, timeZone));
  let progress = 0;
  switch (mission.criteria.type) {
    case "excursion_prepared":
      progress = inputs.excursionUpdates.filter((d) => inPeriod(d, mission.period, key, timeZone)).length;
      break;
    case "free_place_visited":
      progress = new Set(realVisits.filter((v) => byId.get(v.placeId) && isFree(byId.get(v.placeId)!)).map((v) => v.placeId)).size;
      break;
    case "distinct_categories_visited":
      progress = new Set(realVisits.map((v) => byId.get(v.placeId)?.category).filter(Boolean)).size;
      break;
    case "parcels_revealed":
      progress = snapshot.parcels.filter((p) => p.state !== "simulated" && inPeriod(p.firstRevealedAt, mission.period, key, timeZone)).length;
      break;
  }
  const target = mission.criteria.count;
  const claimed = snapshot.ledger.some((e) => e.uniqueKey === missionUniqueKey(mission.id, key));
  return { mission, periodKey: key, progress: Math.min(progress, target), target, completed: progress >= target, claimed };
}

export function evaluateMissions(inputs: MissionInputs, now: Date, timeZone: string, missions: MissionDefinition[] = MISSIONS): MissionStatus[] {
  return missions.map((m) => evaluateMission(m, inputs, now, timeZone));
}

export class MissionClaimError extends Error {
  constructor(
    message: string,
    readonly code: "unknown_mission" | "not_completed" | "already_claimed",
  ) {
    super(message);
  }
}

/** Écriture du journal pour une mission accomplie (idempotente par période). */
export function planMissionClaim(
  missionId: string,
  inputs: MissionInputs,
  now: Date,
  timeZone: string,
  newId: () => string,
  missions: MissionDefinition[] = MISSIONS,
  missionXp: Record<string, number> = {},
): LedgerEntry {
  const mission = missions.find((m) => m.id === missionId);
  if (!mission) throw new MissionClaimError("Mission inconnue.", "unknown_mission");
  const status = evaluateMission(mission, inputs, now, timeZone);
  if (status.claimed) throw new MissionClaimError("Récompense déjà obtenue pour cette période.", "already_claimed");
  if (!status.completed) throw new MissionClaimError("Mission pas encore accomplie.", "not_completed");
  return {
    id: newId(),
    kind: "xp",
    amount: missionXp[mission.id] ?? mission.xp,
    reason: "mission",
    refId: `${mission.id}:${status.periodKey}`,
    uniqueKey: missionUniqueKey(mission.id, status.periodKey),
    createdAt: now.toISOString(),
  };
}

/** Fuseau de référence des missions (les destinations actuelles sont en France métropolitaine). */
export const MISSION_TIMEZONE = "Europe/Paris";

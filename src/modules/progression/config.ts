/**
 * Barèmes de progression. Modifiables ici (démo et valeurs par défaut) ; en mode
 * connecté, la table `progression_settings` enregistre la version appliquée.
 *
 * Séparation stricte :
 * - XP : non dépensable, sert aux niveaux ;
 * - niveaux : dérivés de l'XP totale ;
 * - badges : distinctions, sans valeur monétaire ;
 * - points récompense : dépensables plus tard (aucune offre active aujourd'hui).
 */

import { z } from "zod";

export const PROGRESSION_CONFIG_VERSION = 1;

/**
 * Résolution H3 de référence pour les parcelles. 8 ≈ 0,74 km² par cellule
 * (arête moyenne ≈ 530 m selon h3-js) : une visite révèle un quartier, pas une ville entière.
 * Chaque parcelle enregistre sa résolution : changer cette valeur n'efface pas
 * l'existant (voir docs/DECISIONS.md, D-007).
 */
export const PARCEL_RESOLUTION = 8;

export const VISIT_STATUSES = ["declared", "proximity_checked", "simulated"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export type VisitRule = {
  label: string;
  /** Inscrit dans le carnet. */
  journal: boolean;
  /** Révèle la parcelle du lieu. */
  revealsParcel: boolean;
  /** Compte comme visite réelle (statistiques, badges, missions, médailles). */
  countsAsRealVisit: boolean;
  /** XP de première visite du lieu. */
  firstVisitXp: number;
  /** Bonus unique la première fois qu'un contrôle de proximité réussit pour ce lieu. */
  proximityBonusXp: number;
  /** Autorisé en mode connecté. */
  allowedInConnectedMode: boolean;
};

export const VISIT_RULES: Record<VisitStatus, VisitRule> = {
  declared: {
    label: "Visite déclarée",
    journal: true,
    revealsParcel: true,
    countsAsRealVisit: true,
    firstVisitXp: 20,
    proximityBonusXp: 0,
    allowedInConnectedMode: true,
  },
  proximity_checked: {
    label: "Visite contrôlée par position ponctuelle",
    journal: true,
    revealsParcel: true,
    countsAsRealVisit: true,
    firstVisitXp: 20,
    proximityBonusXp: 15,
    allowedInConnectedMode: true,
  },
  simulated: {
    label: "Visite simulée (démonstration)",
    journal: true,
    revealsParcel: true,
    countsAsRealVisit: false,
    firstVisitXp: 0,
    proximityBonusXp: 0,
    allowedInConnectedMode: false,
  },
};

/**
 * Barèmes modifiables par l'administration (nouvelle version, jamais rétroactive :
 * les écritures déjà créditées restent inchangées). Les niveaux et leurs seuils
 * restent définis dans le code (les modifier changerait le niveau des comptes existants).
 */
export const ProgressionConfigSchema = z.object({
  version: z.number().int().positive(),
  xp: z.object({
    declaredFirstVisit: z.number().int().min(0).max(200),
    checkedFirstVisit: z.number().int().min(0).max(200),
    proximityBonus: z.number().int().min(0).max(200),
    newParcel: z.number().int().min(0).max(100),
  }),
  missionXp: z.record(z.string().regex(/^[a-z0-9-]+$/), z.number().int().min(0).max(200)),
});
export type ProgressionConfig = z.infer<typeof ProgressionConfigSchema>;

/** Plafond de visites enregistrées par compte sur 24 heures glissantes (anti-abus). */
export const DAILY_VISIT_CAP = 20;
/** Fenêtre de dates acceptée pour une visite : jusqu'à 365 jours en arrière, 1 jour en avant (fuseaux). */
export const VISIT_DATE_WINDOW = { pastDays: 365, futureDays: 1 } as const;

/** XP accordée une seule fois par nouvelle parcelle révélée par une visite réelle. */
export const NEW_PARCEL_XP = 5;

export const DEFAULT_PROGRESSION_CONFIG: ProgressionConfig = {
  version: PROGRESSION_CONFIG_VERSION,
  xp: {
    declaredFirstVisit: VISIT_RULES.declared.firstVisitXp,
    checkedFirstVisit: VISIT_RULES.proximity_checked.firstVisitXp,
    proximityBonus: VISIT_RULES.proximity_checked.proximityBonusXp,
    newParcel: NEW_PARCEL_XP,
  },
  missionXp: {},
};

/** Contrôle de proximité : position ponctuelle consentie, jamais un suivi continu. */
export const PROXIMITY = {
  /** Au-delà, la précision annoncée par l'appareil est jugée inexploitable. */
  maxAccuracyM: 100,
  defaultRadiusM: 150,
  /** Grands sites (lacs, randonnées, plages, points de vue). */
  largeSiteRadiusM: 400,
  /** Âge maximal de la position fournie. */
  maxPositionAgeMs: 2 * 60 * 1000,
} as const;

export type LevelReward =
  | { kind: "badge"; id: string; label: string }
  | { kind: "theme"; id: string; label: string }
  | { kind: "comfort"; id: string; label: string }
  | { kind: "points"; amount: number; label: string };

export type LevelDefinition = { level: number; minXp: number; title: string; reward: LevelReward | null };

export const LEVELS: LevelDefinition[] = [
  { level: 1, minXp: 0, title: "Curieux", reward: null },
  { level: 2, minXp: 60, title: "Éclaireur", reward: { kind: "badge", id: "eclaireur", label: "Badge « Éclaireur »" } },
  { level: 3, minXp: 150, title: "Flâneur", reward: { kind: "theme", id: "aurore", label: "Thème de carte « Aurore »" } },
  { level: 4, minXp: 280, title: "Arpenteur", reward: { kind: "points", amount: 50, label: "50 points récompense" } },
  {
    level: 5,
    minXp: 450,
    title: "Explorateur",
    reward: { kind: "theme", id: "carnet-nuit", label: "Style de passeport « Carnet de nuit »" },
  },
  { level: 6, minXp: 680, title: "Baroudeur", reward: { kind: "points", amount: 80, label: "80 points récompense" } },
  { level: 7, minXp: 960, title: "Cartographe", reward: { kind: "badge", id: "cartographe", label: "Badge « Cartographe »" } },
  { level: 8, minXp: 1300, title: "Voyageur au long cours", reward: { kind: "points", amount: 120, label: "120 points récompense" } },
];

export type BadgeDefinition = { id: string; label: string; description: string; icon: string };

export const BADGES: Record<string, BadgeDefinition> = {
  "premiere-visite": { id: "premiere-visite", label: "Premier pas", description: "Première visite réelle inscrite au carnet.", icon: "Footprints" },
  "premiere-parcelle": {
    id: "premiere-parcelle",
    label: "Premier voile levé",
    description: "Première parcelle révélée sur votre carte.",
    icon: "Hexagon",
  },
  curieux: { id: "curieux", label: "Curieux de tout", description: "Visites dans au moins 3 catégories différentes.", icon: "Sparkles" },
  "petit-budget": {
    id: "petit-budget",
    label: "Trésors gratuits",
    description: "3 lieux gratuits visités (gratuité estimée ou connue).",
    icon: "PiggyBank",
  },
  eclaireur: { id: "eclaireur", label: "Éclaireur", description: "Niveau 2 atteint.", icon: "Compass" },
  cartographe: { id: "cartographe", label: "Cartographe", description: "Niveau 7 atteint.", icon: "Map" },
};

export function medalBadgeId(destinationId: string): string {
  return `medaille:${destinationId}`;
}

export function levelForXp(totalXp: number): { current: LevelDefinition; next: LevelDefinition | null; progress: number } {
  let current = LEVELS[0]!;
  for (const def of LEVELS) if (totalXp >= def.minXp) current = def;
  const next = LEVELS.find((l) => l.level === current.level + 1) ?? null;
  const progress = next ? (totalXp - current.minXp) / (next.minXp - current.minXp) : 1;
  return { current, next, progress: Math.max(0, Math.min(1, progress)) };
}

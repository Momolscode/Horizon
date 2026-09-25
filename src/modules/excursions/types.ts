import { z } from "zod";
import { DIETS } from "@/modules/catalog/categories";

export const PARTY_KINDS = ["solo", "couple", "friends", "family"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];
export const PARTY_LABELS: Record<PartyKind, string> = { solo: "Seul·e", couple: "En couple", friends: "Entre amis", family: "En famille" };

export const TRANSPORTS = ["walk", "bike", "transit", "car"] as const;
export type Transport = (typeof TRANSPORTS)[number];
export const TRANSPORT_LABELS: Record<Transport, string> = { walk: "À pied", bike: "À vélo", transit: "Transports en commun", car: "En voiture" };

export const INTERESTS = ["culture", "sport", "food", "economy", "relax", "nature"] as const;
export type Interest = (typeof INTERESTS)[number];
export const INTEREST_LABELS: Record<Interest, string> = {
  culture: "Culture",
  sport: "Sport",
  food: "Gourmandise",
  economy: "Économique",
  relax: "Détente",
  nature: "Nature",
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const TripPreferencesSchema = z.object({
  party: z.object({ kind: z.enum(PARTY_KINDS), size: z.number().int().min(1).max(12) }),
  budget: z.object({
    /** null = pas de limite fixée. */
    amount: z.number().nonnegative().max(10_000).nullable(),
    basis: z.enum(["per_person", "group"]),
  }),
  transport: z.enum(TRANSPORTS),
  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length),
  needs: z.object({ wheelchair: z.boolean(), diets: z.array(z.enum(DIETS)) }),
  includeMeal: z.enum(["auto", "yes", "no"]),
});
export type TripPreferences = z.infer<typeof TripPreferencesSchema>;

export const SurpriseRequestSchema = TripPreferencesSchema.extend({
  destinationId: z.string().min(1),
  date: isoDate,
  startTime: hhmm,
  durationMinutes: z.number().int().min(90).max(12 * 60),
  seed: z.number().int().nonnegative(),
});
export type SurpriseRequest = z.infer<typeof SurpriseRequestSchema>;

export const ExcursionStepSchema = z.object({
  id: z.string().min(1),
  placeId: z.string().min(1),
  /** Durée prévue sur place (minutes). */
  visitMinutes: z.number().int().min(10).max(600),
  note: z.string().max(500).nullable().default(null),
});
export type ExcursionStep = z.infer<typeof ExcursionStepSchema>;

export const ExcursionSchema = SurpriseRequestSchema.omit({ seed: true }).extend({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  seed: z.number().int().nonnegative().nullable(),
  steps: z.array(ExcursionStepSchema).max(12),
  origin: z.enum(["surprise", "manual", "copy"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Excursion = z.infer<typeof ExcursionSchema>;

export const DEFAULT_PREFERENCES: TripPreferences = {
  party: { kind: "couple", size: 2 },
  budget: { amount: 60, basis: "per_person" },
  transport: "walk",
  interests: ["culture", "nature"],
  needs: { wheelchair: false, diets: [] },
  includeMeal: "auto",
};

import { z } from "zod";
import { ExcursionSchema, TripPreferencesSchema, DEFAULT_PREFERENCES } from "@/modules/excursions/types";
import { VISIT_STATUSES } from "@/modules/progression/config";

/**
 * État utilisateur manipulé par l'interface. En démo, il est stocké localement
 * (navigateur) ; en mode connecté, il est lu depuis la base (données serveur).
 */

const ProximitySchema = z.object({
  result: z.enum(["within", "too_far", "inaccurate", "invalid", "stale"]),
  distanceM: z.number().nullable(),
  accuracyM: z.number().nullable(),
  radiusM: z.number(),
});

export const VisitSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  status: z.enum(VISIT_STATUSES),
  visitedOn: z.string(),
  createdAt: z.string(),
  idempotencyKey: z.string(),
  proximity: ProximitySchema.nullable(),
  note: z.string().nullable(),
});

export const ParcelSchema = z.object({
  cell: z.string(),
  resolution: z.number().int(),
  state: z.enum(["simulated", "declared", "checked"]),
  firstRevealedAt: z.string(),
  placeId: z.string(),
});

export const LedgerEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["xp", "points"]),
  amount: z.number().int(),
  reason: z.enum(["first_visit", "proximity_bonus", "new_parcel", "level_reward", "mission", "admin_adjustment"]),
  refId: z.string(),
  uniqueKey: z.string(),
  createdAt: z.string(),
});

export const ProgressionSnapshotSchema = z.object({
  visits: z.array(VisitSchema),
  parcels: z.array(ParcelSchema),
  ledger: z.array(LedgerEntrySchema),
  badges: z.array(z.object({ id: z.string(), awardedAt: z.string() })),
});

export const CollectionSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  placeIds: z.array(z.string()),
  createdAt: z.string(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const VISIBILITIES = ["private", "friends", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const SettingsSchema = z.object({
  theme: z.enum(["system", "light", "dark"]),
  mapTheme: z.enum(["auto", "aurore"]),
  passportStyle: z.enum(["classique", "carnet-nuit"]),
  units: z.enum(["metric", "imperial"]),
  motion: z.enum(["system", "reduced"]),
  language: z.enum(["fr"]),
  /** Notifications : désactivées tant que l'infrastructure push n'est pas configurée. */
  notifications: z.object({
    enabled: z.boolean(),
    reminders: z.boolean(),
    changes: z.boolean(),
    quietHours: z.object({ start: z.string(), end: z.string() }),
    maxPerWeek: z.number().int().min(0).max(14),
  }),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const ErrorReportSchema = z.object({
  id: z.string(),
  placeId: z.string(),
  kind: z.enum(["location", "hours", "price", "closed", "description", "other"]),
  message: z.string().min(3).max(1000),
  createdAt: z.string(),
  status: z.enum(["stored_locally", "submitted"]),
});
export type ErrorReport = z.infer<typeof ErrorReportSchema>;

export const UserStateSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.object({
    pseudonym: z.string().min(2).max(32),
    visibility: z.enum(VISIBILITIES),
    createdAt: z.string(),
  }),
  preferences: z.object({
    onboarded: z.boolean(),
    trip: TripPreferencesSchema,
    /** Temps disponible habituel (minutes), proposé par défaut dans « Surprends-nous ». */
    availableMinutes: z.number().int().min(90).max(720),
    homeDestinationId: z.string().nullable(),
  }),
  settings: SettingsSchema,
  collections: z.array(CollectionSchema),
  excursions: z.array(ExcursionSchema),
  progression: ProgressionSnapshotSchema,
  reports: z.array(ErrorReportSchema),
  /** Fiches déjà consultées (missions « découvrir »). */
  seenPlaceIds: z.array(z.string()),
});
export type UserState = z.infer<typeof UserStateSchema>;

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  mapTheme: "auto",
  passportStyle: "classique",
  units: "metric",
  motion: "system",
  language: "fr",
  notifications: { enabled: false, reminders: true, changes: true, quietHours: { start: "21:00", end: "08:00" }, maxPerWeek: 3 },
};

export function initialUserState(now: Date = new Date(), pseudonym = "Voyageur"): UserState {
  return {
    schemaVersion: 1,
    profile: { pseudonym, visibility: "private", createdAt: now.toISOString() },
    preferences: { onboarded: false, trip: DEFAULT_PREFERENCES, availableMinutes: 300, homeDestinationId: null },
    settings: DEFAULT_SETTINGS,
    collections: [{ id: "favoris", name: "Favoris", placeIds: [], createdAt: now.toISOString() }],
    excursions: [],
    progression: { visits: [], parcels: [], ledger: [], badges: [] },
    reports: [],
    seenPlaceIds: [],
  };
}

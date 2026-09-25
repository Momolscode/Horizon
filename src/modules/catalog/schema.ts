import { z } from "zod";
import { CATEGORY_IDS, DIETS, RESTAURANT_STYLES, THEME_IDS } from "./categories";

/**
 * Schéma du catalogue (destinations, lieux, sources).
 *
 * Principe : une information pratique est soit connue (avec sa source), soit une
 * estimation explicitement étiquetée, soit inconnue. Une valeur inconnue n'est
 * jamais remplacée par une valeur par défaut (un coût inconnu n'est pas gratuit).
 */

export const LatLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type LatLng = z.infer<typeof LatLngSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, "Heure attendue au format HH:MM");

export const SourceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(["editorial", "open_data", "official", "partner", "demo_fixture"]),
  url: z.url().nullable(),
  license: z.string().min(1),
  /** Conditions d'utilisation résumées (réutilisation, attribution, transfert). */
  terms: z.string().min(1),
  retrievedAt: isoDate.nullable(),
});
export type Source = z.infer<typeof SourceSchema>;

/** Valeur pratique : connue (sourcée), estimée (étiquetée) ou inconnue. */
export function known<T extends z.ZodTypeAny>(value: T) {
  return z.discriminatedUnion("status", [
    z.object({ status: z.literal("known"), value, sourceId: z.string().min(1), checkedAt: isoDate.nullable() }),
    z.object({ status: z.literal("estimate"), value, note: z.string().min(1) }),
    z.object({ status: z.literal("unknown") }),
  ]);
}
export type Known<T> =
  | { status: "known"; value: T; sourceId: string; checkedAt: string | null }
  | { status: "estimate"; value: T; note: string }
  | { status: "unknown" };

export const PriceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("free") }),
  /** Prix par personne, en unités de la devise de la destination. */
  z.object({ kind: z.literal("paid"), minPerPerson: z.number().nonnegative(), maxPerPerson: z.number().nonnegative() }),
]);
export type Price = z.infer<typeof PriceSchema>;

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const OpeningHoursSchema = z.object({
  /** Plages horaires locales à la destination (fuseau de la destination). */
  weekly: z.partialRecord(z.enum(WEEKDAYS), z.array(z.tuple([hhmm, hhmm]))),
  /** Jours exceptionnels : fermeture ou plages spécifiques. */
  exceptions: z.array(z.object({ date: isoDate, ranges: z.array(z.tuple([hhmm, hhmm])) })).default([]),
});
export type OpeningHours = z.infer<typeof OpeningHoursSchema>;

export const AccessibilitySchema = z.object({
  wheelchair: z.enum(["yes", "partial", "no"]),
  details: z.string().optional(),
});

export const DifficultySchema = z.object({
  level: z.enum(["easy", "moderate", "hard"]),
  distanceKm: z.number().positive().optional(),
  elevationGainM: z.number().nonnegative().optional(),
});

export const BookingSchema = z.object({
  mode: z.enum(["none", "recommended", "required"]),
  url: z.url().nullable(),
});

export const PlaceSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  destinationId: z.string().min(1),
  name: z.string().min(1),
  category: z.enum(CATEGORY_IDS),
  themes: z.array(z.enum(THEME_IDS)).min(1),
  setting: z.enum(["indoor", "outdoor", "mixed"]),
  location: LatLngSchema,
  /** Précision des coordonnées : "approximate" tant qu'elles n'ont pas été vérifiées. */
  locationPrecision: z.enum(["verified", "approximate"]),
  summary: z.string().min(1).max(220),
  description: z.string().min(1),
  history: z.string().nullable(),
  /** Lieu moins connu : utilisé pour ne pas limiter les recommandations aux lieux populaires. */
  lesserKnown: z.boolean().default(false),
  practical: z.object({
    price: known(PriceSchema),
    openingHours: known(OpeningHoursSchema),
    /** Durée de visite conseillée, en minutes. */
    visitMinutes: known(z.number().int().positive()),
    accessibility: known(AccessibilitySchema),
    difficulty: known(DifficultySchema).optional(),
    booking: known(BookingSchema),
    website: known(z.url()),
  }),
  restaurant: z
    .object({
      style: z.enum(RESTAURANT_STYLES),
      diets: known(z.array(z.enum(DIETS))),
    })
    .optional(),
  /** Visuel : illustration générée (aucune photo tierce sans licence vérifiée). */
  art: z.object({ motif: z.string().min(1), palette: z.string().min(1) }),
  sourceIds: z.array(z.string().min(1)).min(1),
  verification: z.object({
    status: z.enum(["verified", "unverified"]),
    checkedAt: isoDate.nullable(),
    note: z.string().min(1),
  }),
  /** Établissement fictif créé pour la démonstration (jamais un lieu réel). */
  fictional: z.boolean().default(false),
  /** Placement commercial : toujours identifié à l'écran. */
  sponsored: z.object({ label: z.string().min(1) }).nullable().default(null),
});
export type Place = z.infer<typeof PlaceSchema>;

export const DestinationSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  region: z.string().min(1),
  countryCode: z.string().length(2),
  locale: z.string().min(2),
  currency: z.string().length(3),
  timezone: z.string().min(1),
  center: LatLngSchema,
  centerSourceId: z.string().min(1),
  /** Emprise [ouest, sud, est, nord] servant de périmètre aux pourcentages. */
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  tagline: z.string().min(1),
  description: z.string().min(1),
  palette: z.string().min(1),
  /** Parcours de la médaille : liste finie de lieux, pas chaque rue ou commerce. */
  medalRoute: z.object({ title: z.string().min(1), placeIds: z.array(z.string()).min(3) }),
});
export type Destination = z.infer<typeof DestinationSchema>;

export const CatalogSchema = z.object({
  version: z.number().int().positive(),
  kind: z.enum(["demo", "production"]),
  notice: z.string().min(1),
  sources: z.array(SourceSchema).min(1),
  destinations: z.array(DestinationSchema).min(1),
  places: z.array(PlaceSchema).min(1),
});
export type Catalog = z.infer<typeof CatalogSchema>;

/** Contrôles de cohérence au-delà du schéma (références croisées). */
export function validateCatalogIntegrity(catalog: Catalog): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(catalog.sources.map((s) => s.id));
  const destinationIds = new Set(catalog.destinations.map((d) => d.id));
  const placeIds = new Set<string>();

  for (const place of catalog.places) {
    if (placeIds.has(place.id)) errors.push(`Identifiant de lieu dupliqué : ${place.id}`);
    placeIds.add(place.id);
    if (!destinationIds.has(place.destinationId)) errors.push(`${place.id} : destination inconnue ${place.destinationId}`);
    for (const id of place.sourceIds) if (!sourceIds.has(id)) errors.push(`${place.id} : source inconnue ${id}`);
    for (const [field, value] of Object.entries(place.practical)) {
      if (value && value.status === "known" && !sourceIds.has(value.sourceId)) {
        errors.push(`${place.id}.${field} : source inconnue ${value.sourceId}`);
      }
      if (value && value.status === "known" && place.verification.status !== "verified") {
        errors.push(`${place.id}.${field} : valeur « connue » sur un lieu non vérifié`);
      }
    }
    if (place.category === "restaurant" && !place.restaurant) errors.push(`${place.id} : informations restaurant manquantes`);
    const destination = catalog.destinations.find((d) => d.id === place.destinationId);
    if (destination) {
      const [w, s, e, n] = destination.bbox;
      const { lat, lng } = place.location;
      if (lng < w || lng > e || lat < s || lat > n) errors.push(`${place.id} : hors de l'emprise de ${destination.id}`);
    }
  }
  for (const destination of catalog.destinations) {
    if (!sourceIds.has(destination.centerSourceId)) errors.push(`${destination.id} : source du centre inconnue`);
    for (const id of destination.medalRoute.placeIds) {
      if (!placeIds.has(id)) errors.push(`${destination.id} : lieu de parcours inconnu ${id}`);
    }
  }
  return errors;
}

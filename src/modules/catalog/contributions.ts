import { z } from "zod";
import { bboxContains, straightLineMeters } from "@/modules/shared/geo";
import { RESTAURANT_STYLES, type CategoryId, type ThemeId } from "./categories";
import { LatLngSchema, OpeningHoursSchema, PlaceSchema, WEEKDAYS, type Catalog, type Destination, type LatLng, type Place } from "./schema";

/**
 * Référencement élargi (docs/DECISIONS.md D-017) : propositions de lieux par les membres,
 * détection des doublons, revendication par les professionnels (SIRET) et informations
 * fournies par l'établissement. Logique pure, partagée par le serveur et l'interface.
 */

/** Source attachée à tout lieu publié à partir d'une proposition de membre. */
export const COMMUNITY_SOURCE_ID = "contribution-membres";

/** Catégories ouvertes aux propositions : restaurants, commerces, activités, loisirs. */
export const PROPOSABLE_CATEGORIES = ["restaurant", "shop", "outdoor", "leisure"] as const satisfies readonly CategoryId[];
export type ProposableCategory = (typeof PROPOSABLE_CATEGORIES)[number];

/** Fourchettes de prix proposées au formulaire (par personne), toujours « estimées ». */
export const PRICE_CHOICES = {
  unknown: { label: "Je ne sais pas", range: null },
  free: { label: "Gratuit", range: null },
  lte15: { label: "Jusqu'à 15 €", range: [0, 15] },
  lte30: { label: "15 à 30 €", range: [15, 30] },
  lte60: { label: "30 à 60 €", range: [30, 60] },
  gt60: { label: "Plus de 60 €", range: [60, 120] },
} as const;
export type PriceChoice = keyof typeof PRICE_CHOICES;
const PRICE_KEYS = Object.keys(PRICE_CHOICES) as [PriceChoice, ...PriceChoice[]];

export const ProposalSchema = z
  .object({
    destinationId: z.string().min(1).max(40),
    name: z.string().trim().min(2).max(120),
    category: z.enum(PROPOSABLE_CATEGORIES),
    location: LatLngSchema,
    summary: z.string().trim().min(10).max(220),
    website: z.url().max(300).nullable(),
    price: z.enum(PRICE_KEYS),
    restaurantStyle: z.enum(RESTAURANT_STYLES).nullable(),
  })
  .refine((p) => p.category !== "restaurant" || p.restaurantStyle !== null, { message: "Type de cuisine requis pour un restaurant", path: ["restaurantStyle"] });
export type Proposal = z.infer<typeof ProposalSchema>;

/** Destination couverte contenant le point (les fiches hors destinations sont refusées). */
export function destinationForPoint(catalog: Catalog, point: LatLng): Destination | null {
  return catalog.destinations.find((d) => bboxContains(d.bbox, point)) ?? null;
}

/** Nom normalisé : minuscules, sans accents ni ponctuation, espaces réduits. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(le|la|les|l|du|de|des|d|au|aux|et|restaurant|chez)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): string[] {
  const t = ` ${s} `;
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Similarité de Dice sur les bigrammes (0 à 1), après normalisation. */
export function nameSimilarity(a: string, b: string): number {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bx = bigrams(x);
  const counts = new Map<string, number>();
  for (const g of bigrams(y)) counts.set(g, (counts.get(g) ?? 0) + 1);
  let common = 0;
  for (const g of bx) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      common++;
      counts.set(g, n - 1);
    }
  }
  return (2 * common) / (bx.length + bigrams(y).length);
}

export type DuplicateCandidate = { id: string; name: string; location: LatLng };
export const DUPLICATE_RADIUS_M = 100;
export const DUPLICATE_SIMILARITY = 0.5;

/** Doublons probables : nom proche ET à moins de 100 m (les deux conditions). */
export function findLikelyDuplicates(candidate: { name: string; location: LatLng }, existing: DuplicateCandidate[]): Array<DuplicateCandidate & { distanceM: number }> {
  return existing
    .map((e) => ({ ...e, distanceM: Math.round(straightLineMeters(candidate.location, e.location)) }))
    .filter((e) => e.distanceM <= DUPLICATE_RADIUS_M && nameSimilarity(candidate.name, e.name) >= DUPLICATE_SIMILARITY)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** Identifiant de lieu : « destination-nom », avec suffixe numérique si déjà pris. */
export function placeIdFor(destinationId: string, name: string, taken: Set<string>): string {
  const slug =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "lieu";
  const base = `${destinationId}-${slug}`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

const CATEGORY_DEFAULTS: Record<ProposableCategory, { themes: ThemeId[]; setting: Place["setting"]; motif: string; visitMinutes: number }> = {
  restaurant: { themes: ["food"], setting: "indoor", motif: "table", visitMinutes: 75 },
  shop: { themes: ["leisure"], setting: "indoor", motif: "market", visitMinutes: 30 },
  outdoor: { themes: ["sport", "nature"], setting: "outdoor", motif: "summit", visitMinutes: 120 },
  leisure: { themes: ["leisure", "family"], setting: "mixed", motif: "gallery", visitMinutes: 90 },
};

/**
 * Lieu publié à partir d'une proposition approuvée. Tout est « non vérifié » : prix estimé
 * (ou inconnu), horaires et accessibilité inconnus, coordonnées approximatives.
 */
export function buildCommunityPlace(proposal: Proposal, options: { id: string; destination: Destination; approvedOn: string }): Place {
  const d = CATEGORY_DEFAULTS[proposal.category];
  const choice = PRICE_CHOICES[proposal.price];
  const note = `Indiqué par un membre, non vérifié (publié le ${options.approvedOn}).`;
  const place = {
    id: options.id,
    destinationId: options.destination.id,
    name: proposal.name,
    category: proposal.category,
    themes: d.themes,
    setting: d.setting,
    location: proposal.location,
    locationPrecision: "approximate",
    summary: proposal.summary,
    description: proposal.summary,
    history: null,
    lesserKnown: false,
    practical: {
      price:
        proposal.price === "unknown"
          ? { status: "unknown" }
          : { status: "estimate", value: proposal.price === "free" ? { kind: "free" } : { kind: "paid", minPerPerson: choice.range![0], maxPerPerson: choice.range![1] }, note },
      openingHours: { status: "unknown" },
      visitMinutes: { status: "estimate", value: d.visitMinutes, note: "Durée indicative selon la catégorie." },
      accessibility: { status: "unknown" },
      booking: { status: "unknown" },
      website: proposal.website ? { status: "estimate", value: proposal.website, note } : { status: "unknown" },
    },
    ...(proposal.category === "restaurant" && proposal.restaurantStyle ? { restaurant: { style: proposal.restaurantStyle, diets: { status: "unknown" } } } : {}),
    art: { motif: d.motif, palette: options.destination.palette },
    sourceIds: [COMMUNITY_SOURCE_ID],
    verification: { status: "unverified", checkedAt: null, note: "Proposé par un membre et publié après modération ; informations non vérifiées." },
    fictional: false,
    sponsored: null,
  };
  return PlaceSchema.parse(place);
}

/** SIRET : 14 chiffres et clé de Luhn (contrôle de forme, pas de preuve d'existence). */
export function isValidSiret(value: string): boolean {
  const digits = value.replace(/\s/g, "");
  if (!/^\d{14}$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let n = Number(digits[13 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
  }
  return sum % 10 === 0;
}

export const ClaimSchema = z.object({
  placeId: z.string().min(1).max(80),
  siret: z
    .string()
    .transform((s) => s.replace(/\s/g, ""))
    .refine(isValidSiret, "SIRET invalide (14 chiffres, clé de contrôle)"),
  proofKind: z.enum(["email_domain", "document"]),
  /** Adresse e-mail professionnelle, ou description du justificatif que l'on peut transmettre. */
  proofText: z.string().trim().min(5).max(500),
});
export type Claim = z.infer<typeof ClaimSchema>;

/** Informations pratiques modifiables par l'établissement qui a revendiqué sa fiche. */
export const EstablishmentUpdateSchema = z.object({
  website: z.url().max(300).nullable(),
  price: z.enum(PRICE_KEYS),
  openingHours: OpeningHoursSchema.nullable(),
  bookingMode: z.enum(["none", "recommended", "required", "unknown"]),
});
export type EstablishmentUpdate = z.infer<typeof EstablishmentUpdateSchema>;

/**
 * Applique la mise à jour de l'établissement : chaque valeur fournie devient une estimation
 * « fournie par l'établissement » datée ; « je ne sais pas » la rend inconnue.
 */
export function applyEstablishmentUpdate(place: Place, update: EstablishmentUpdate, date: string): Place {
  const note = `Fourni par l'établissement le ${date} (non vérifié par HORIZON).`;
  const byEstablishment = <T,>(value: T) => ({ status: "estimate" as const, value, note, by: "establishment" as const });
  const choice = PRICE_CHOICES[update.price];
  const practical: Place["practical"] = {
    ...place.practical,
    website: update.website ? byEstablishment(update.website) : { status: "unknown" },
    price:
      update.price === "unknown"
        ? { status: "unknown" }
        : byEstablishment(update.price === "free" ? { kind: "free" as const } : { kind: "paid" as const, minPerPerson: choice.range![0], maxPerPerson: choice.range![1] }),
    openingHours: update.openingHours ? byEstablishment(update.openingHours) : { status: "unknown" },
    booking: update.bookingMode === "unknown" ? { status: "unknown" } : byEstablishment({ mode: update.bookingMode, url: update.website }),
  };
  return PlaceSchema.parse({ ...place, practical });
}

/** Formulaire d'horaires simplifié : une plage par jour (vide = fermé). */
export function weeklyFromSimple(days: Partial<Record<(typeof WEEKDAYS)[number], { open: string; close: string } | null>>) {
  const weekly: Partial<Record<(typeof WEEKDAYS)[number], Array<[string, string]>>> = {};
  for (const d of WEEKDAYS) {
    const r = days[d];
    weekly[d] = r && r.open && r.close ? [[r.open, r.close]] : [];
  }
  return OpeningHoursSchema.parse({ weekly, exceptions: [] });
}

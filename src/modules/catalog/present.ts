import { formatMoney, formatMoneyRange } from "@/modules/shared/money";
import { formatDuration, localPartsAt, type OpenStatus } from "@/modules/shared/time";
import { WEEKDAYS, type Destination, type Known, type Place } from "./schema";
import { DIET_LABELS, RESTAURANT_STYLE_LABELS } from "./categories";

/**
 * Mise en forme des informations pratiques. Règle : une valeur inconnue est
 * affichée comme inconnue, une estimation est affichée comme telle.
 */
export type PracticalLine = {
  id: string;
  label: string;
  value: string;
  /** "establishment" : valeur fournie par l'établissement (non vérifiée par HORIZON). */
  certainty: "known" | "estimate" | "establishment" | "unknown";
  note: string | null;
};

function line<T>(id: string, label: string, known: Known<T> | undefined, format: (v: T) => string, unknownText = "Non renseigné"): PracticalLine | null {
  if (!known) return null;
  if (known.status === "unknown") return { id, label, value: unknownText, certainty: "unknown", note: null };
  return {
    id,
    label,
    value: format(known.value),
    certainty: known.status === "estimate" && known.by === "establishment" ? "establishment" : known.status,
    note: known.status === "estimate" ? known.note : known.checkedAt ? `Vérifié le ${known.checkedAt}` : null,
  };
}

const DAY_LABELS: Record<(typeof WEEKDAYS)[number], string> = { mon: "lun.", tue: "mar.", wed: "mer.", thu: "jeu.", fri: "ven.", sat: "sam.", sun: "dim." };

export function priceText(place: Place, destination: Destination): string {
  const price = place.practical.price;
  if (price.status === "unknown") return "Coût inconnu";
  if (price.value.kind === "free") return "Gratuit";
  return `${formatMoneyRange(price.value.minPerPerson, price.value.maxPerPerson, destination.currency, destination.locale)} / pers.`;
}

export function practicalLines(place: Place, destination: Destination): PracticalLine[] {
  const p = place.practical;
  const lines: Array<PracticalLine | null> = [
    line(
      "price",
      "Prix",
      p.price,
      (v) => (v.kind === "free" ? "Gratuit" : `${formatMoneyRange(v.minPerPerson, v.maxPerPerson, destination.currency, destination.locale)} par personne`),
      "Coût inconnu",
    ),
    line(
      "hours",
      "Horaires",
      p.openingHours,
      (v) =>
        WEEKDAYS.map((d) => {
          const ranges = v.weekly[d];
          return `${DAY_LABELS[d]} ${ranges && ranges.length > 0 ? ranges.map(([a, b]) => `${a}–${b}`).join(", ") : "fermé"}`;
        }).join(" · "),
      "Horaires inconnus",
    ),
    line("duration", "Durée conseillée", p.visitMinutes, (v) => formatDuration(v)),
    p.difficulty
      ? line("difficulty", "Difficulté", p.difficulty, (v) => {
          const level = { easy: "Facile", moderate: "Modérée", hard: "Difficile" }[v.level];
          const extra = [v.distanceKm ? `${v.distanceKm} km` : null, v.elevationGainM ? `${v.elevationGainM} m D+` : null].filter(Boolean).join(", ");
          return extra ? `${level} (${extra})` : level;
        })
      : null,
    line("accessibility", "Accessibilité fauteuil", p.accessibility, (v) => ({ yes: "Accessible", partial: "Partiellement accessible", no: "Non accessible" })[v.wheelchair] + (v.details ? ` — ${v.details}` : "")),
    line("booking", "Réservation", p.booking, (v) => ({ none: "Sans réservation", recommended: "Réservation conseillée", required: "Réservation obligatoire" })[v.mode]),
    line("website", "Site web", p.website, (v) => v),
    place.restaurant ? { id: "style", label: "Type de cuisine", value: RESTAURANT_STYLE_LABELS[place.restaurant.style], certainty: place.fictional ? "estimate" : "known", note: place.fictional ? "Donnée fictive." : null } : null,
    place.restaurant
      ? line("diets", "Régimes proposés", place.restaurant.diets, (v) => (v.length ? v.map((d) => DIET_LABELS[d]).join(", ") : "Aucune option renseignée"))
      : null,
  ];
  return lines.filter((l): l is PracticalLine => l !== null);
}

export function openStatusLabel(place: Place, destination: Destination, now: Date = new Date()): { status: OpenStatus; label: string } {
  const hours = place.practical.openingHours;
  if (hours.status === "unknown") return { status: "unknown", label: "Horaires inconnus" };
  const { date, minutes, weekday } = localPartsAt(now, destination.timezone);
  const exception = hours.value.exceptions.find((e) => e.date === date);
  const ranges = exception ? exception.ranges : (hours.value.weekly[weekday] ?? []);
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  const current = ranges.find(([a, b]) => minutes >= toMin(a) && minutes < toMin(b));
  const suffix = hours.status === "estimate" ? " (horaires estimés)" : "";
  if (current) return { status: "open", label: `Ouvert jusqu'à ${current[1]}${suffix}` };
  const next = ranges.find(([a]) => toMin(a) > minutes);
  return { status: "closed", label: next ? `Fermé · ouvre à ${next[0]}${suffix}` : `Fermé aujourd'hui${suffix}` };
}

export function freeLabel(amount: number | null, currency = "EUR"): string {
  if (amount === null) return "Sans limite";
  if (amount === 0) return "Gratuit";
  return formatMoney(amount, currency);
}

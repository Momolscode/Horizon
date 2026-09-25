import type { Known, OpeningHours, Weekday } from "@/modules/catalog/schema";
import { WEEKDAYS } from "@/modules/catalog/schema";

/** Minutes depuis minuit pour une heure "HH:MM" (accepte "24:00"). */
export function parseHHMM(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Heure invalide : ${value}`);
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (minutes > 24 * 60) throw new Error(`Heure invalide : ${value}`);
  return minutes;
}

export function formatMinutes(total: number): string {
  const normalized = ((Math.round(total) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, "0")}`;
}

/** Jour de la semaine d'une date calendaire locale "AAAA-MM-JJ" (indépendant du fuseau). */
export function weekdayOf(localDate: string): Weekday {
  const [y, m, d] = localDate.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`Date invalide : ${localDate}`);
  const jsDay = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay(); // 0 = dimanche
  return WEEKDAYS[(jsDay + 6) % 7]!;
}

/** Date calendaire, jour et minutes locales d'un instant dans un fuseau IANA. */
export function localPartsAt(instant: Date, timeZone: string): { date: string; weekday: Weekday; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return { date, weekday: weekdayOf(date), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export type OpenStatus = "open" | "closed" | "unknown";

function rangesFor(hours: OpeningHours, localDate: string): Array<[string, string]> {
  const exception = hours.exceptions.find((e) => e.date === localDate);
  if (exception) return exception.ranges;
  return hours.weekly[weekdayOf(localDate)] ?? [];
}

/** Ouvert pendant tout l'intervalle [start, end[ (minutes locales du jour) ? */
export function openDuring(hours: OpeningHours, localDate: string, start: number, end: number): boolean {
  return rangesFor(hours, localDate).some(([open, close]) => {
    const o = parseHHMM(open);
    const c = parseHHMM(close);
    return start >= o && end <= c;
  });
}

export function openStatusAt(hours: Known<OpeningHours>, localDate: string, minute: number): OpenStatus {
  if (hours.status === "unknown") return "unknown";
  return openDuring(hours.value, localDate, minute, minute + 1) ? "open" : "closed";
}

/** Des horaires exploitables existent-ils (connus ou estimés et étiquetés) ? */
export function hasUsableHours(hours: Known<OpeningHours>): hours is Exclude<Known<OpeningHours>, { status: "unknown" }> {
  return hours.status !== "unknown";
}

export function todayIn(timeZone: string, now: Date = new Date()): string {
  return localPartsAt(now, timeZone).date;
}

export function addDays(localDate: string, days: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + days, 12));
  return dt.toISOString().slice(0, 10);
}

export function formatLocalDate(localDate: string, locale = "fr-FR"): string {
  const [y, m, d] = localDate.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y!, m! - 1, d!, 12)),
  );
}

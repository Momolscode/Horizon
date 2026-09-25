import { z } from "zod";
import type { LatLng } from "@/modules/catalog/schema";

/**
 * Adaptateur météo. Par défaut : aucun fournisseur → « prévisions indisponibles ».
 * HORIZON n'invente jamais une météo ni une alerte.
 */
export type DailyForecast = { date: string; summary: string; tempMinC: number; tempMaxC: number; precipitationProbability: number | null; wet: boolean };

export type WeatherResult =
  | { status: "ok"; provider: string; attribution: string; days: DailyForecast[] }
  | { status: "unavailable"; reason: string };

export interface WeatherProvider {
  readonly id: string;
  forecast(location: LatLng, dates: string[], signal?: AbortSignal): Promise<WeatherResult>;
}

export class NoWeatherProvider implements WeatherProvider {
  readonly id = "none";
  async forecast(): Promise<WeatherResult> {
    return { status: "unavailable", reason: "Aucun service météo n'est configuré : prévisions indisponibles." };
  }
}

// Codes météo WMO (https://open-meteo.com/en/docs) — résumé volontairement simple.
function describeWmo(code: number): { summary: string; wet: boolean } {
  if (code === 0) return { summary: "Ciel dégagé", wet: false };
  if (code <= 3) return { summary: "Nuageux", wet: false };
  if (code <= 48) return { summary: "Brouillard", wet: false };
  if (code <= 67 || (code >= 80 && code <= 82)) return { summary: "Pluie", wet: true };
  if (code <= 77 || code === 85 || code === 86) return { summary: "Neige", wet: true };
  if (code >= 95) return { summary: "Orage", wet: true };
  return { summary: "Conditions variables", wet: false };
}

const OpenMeteoSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()).optional(),
  }),
});

/**
 * Open-Meteo : gratuit pour un usage non commercial ; un usage commercial exige
 * un abonnement (conditions à vérifier : https://open-meteo.com/en/terms).
 * Activé uniquement par NEXT_PUBLIC_WEATHER_PROVIDER=open-meteo.
 */
export class OpenMeteoProvider implements WeatherProvider {
  readonly id = "open-meteo";
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 5000,
    private readonly baseUrl = "https://api.open-meteo.com/v1/forecast",
  ) {}

  async forecast(location: LatLng, dates: string[], signal?: AbortSignal): Promise<WeatherResult> {
    if (dates.length === 0) return { status: "unavailable", reason: "Aucune date demandée." };
    const sorted = [...dates].sort();
    const url = `${this.baseUrl}?latitude=${location.lat}&longitude=${location.lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${sorted[0]}&end_date=${sorted[sorted.length - 1]}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    signal?.addEventListener("abort", () => controller.abort());
    try {
      const res = await this.fetchImpl(url, { signal: controller.signal });
      if (res.status === 429) return { status: "unavailable", reason: "Quota du service météo atteint : prévisions indisponibles." };
      if (!res.ok) return { status: "unavailable", reason: `Service météo indisponible (HTTP ${res.status}).` };
      const parsed = OpenMeteoSchema.safeParse(await res.json());
      if (!parsed.success) return { status: "unavailable", reason: "Réponse météo invalide : prévisions ignorées." };
      const d = parsed.data.daily;
      const days: DailyForecast[] = d.time
        .map((date, i) => {
          const code = d.weather_code[i];
          const max = d.temperature_2m_max[i];
          const min = d.temperature_2m_min[i];
          if (code === undefined || max === undefined || min === undefined) return null;
          const { summary, wet } = describeWmo(code);
          return { date, summary, wet, tempMaxC: max, tempMinC: min, precipitationProbability: d.precipitation_probability_max?.[i] ?? null };
        })
        .filter((x): x is DailyForecast => x !== null && dates.includes(x.date));
      if (days.length === 0) return { status: "unavailable", reason: "Pas de prévision disponible pour ces dates (trop lointaines ?)." };
      return { status: "ok", provider: this.id, attribution: "Données météo : Open-Meteo.com", days };
    } catch {
      return { status: "unavailable", reason: "Service météo injoignable (délai dépassé ou hors connexion)." };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function weatherProvider(id = process.env.NEXT_PUBLIC_WEATHER_PROVIDER): WeatherProvider {
  if (id === "open-meteo") return new OpenMeteoProvider();
  return new NoWeatherProvider();
}

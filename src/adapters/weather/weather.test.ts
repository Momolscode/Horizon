import { describe, expect, it } from "vitest";
import { NoWeatherProvider, OpenMeteoProvider, weatherProvider } from "./index";

const loc = { lat: 45.9, lng: 6.12 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("adaptateur météo", () => {
  it("sans fournisseur, annonce l'indisponibilité au lieu d'inventer", async () => {
    expect(weatherProvider(undefined)).toBeInstanceOf(NoWeatherProvider);
    expect(await new NoWeatherProvider().forecast()).toMatchObject({ status: "unavailable" });
  });

  it("valide la réponse du fournisseur", async () => {
    const provider = new OpenMeteoProvider(async () =>
      jsonResponse({ daily: { time: ["2026-10-03"], weather_code: [61], temperature_2m_max: [14], temperature_2m_min: [8], precipitation_probability_max: [80] } }),
    );
    const result = await provider.forecast(loc, ["2026-10-03"]);
    expect(result).toMatchObject({ status: "ok", days: [{ date: "2026-10-03", wet: true, summary: "Pluie" }] });
  });

  it("rejette une réponse malformée, un quota dépassé ou une erreur réseau", async () => {
    expect(await new OpenMeteoProvider(async () => jsonResponse({ nope: true })).forecast(loc, ["2026-10-03"])).toMatchObject({ status: "unavailable" });
    expect(await new OpenMeteoProvider(async () => jsonResponse({}, 429)).forecast(loc, ["2026-10-03"])).toMatchObject({ status: "unavailable", reason: expect.stringMatching(/Quota/) });
    expect(
      await new OpenMeteoProvider(async () => {
        throw new TypeError("offline");
      }).forecast(loc, ["2026-10-03"]),
    ).toMatchObject({ status: "unavailable" });
  });

  it("abandonne après le délai imparti", async () => {
    const slow: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const result = await new OpenMeteoProvider(slow, 20).forecast(loc, ["2026-10-03"]);
    expect(result).toMatchObject({ status: "unavailable", reason: expect.stringMatching(/injoignable/) });
  });

  it("signale l'absence de prévision pour des dates lointaines", async () => {
    const provider = new OpenMeteoProvider(async () => jsonResponse({ daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }));
    expect(await provider.forecast(loc, ["2027-06-01"])).toMatchObject({ status: "unavailable" });
  });
});

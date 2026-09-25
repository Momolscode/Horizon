import { describe, expect, it } from "vitest";
import { formatDistance, isValidLatLng, straightLineMeters } from "./geo";
import { normalizeText, seededUnit } from "./hash";
import { addDays, localPartsAt, openDuring, openStatusAt, parseHHMM, weekdayOf } from "./time";

describe("géographie", () => {
  it("calcule une distance à vol d'oiseau plausible (Lyon → Marseille ≈ 277 km)", () => {
    const d = straightLineMeters({ lat: 45.772, lng: 4.8281 }, { lat: 43.2919, lng: 5.3731 });
    expect(d / 1000).toBeGreaterThan(270);
    expect(d / 1000).toBeLessThan(285);
  });

  it("rejette les coordonnées invalides", () => {
    expect(isValidLatLng({ lat: 45, lng: 6 })).toBe(true);
    expect(isValidLatLng({ lat: 91, lng: 6 })).toBe(false);
    expect(isValidLatLng({ lat: Number.NaN, lng: 6 })).toBe(false);
    expect(isValidLatLng({ lat: "45", lng: 6 })).toBe(false);
    expect(isValidLatLng(null)).toBe(false);
  });

  it("formate les distances", () => {
    expect(formatDistance(420)).toBe("420 m");
    expect(formatDistance(1520)).toBe("1,5 km");
    expect(formatDistance(1609.344, "imperial")).toBe("1.0 mi");
  });
});

describe("temps et fuseaux", () => {
  it("s'exécute avec un fuseau machine différent de celui des destinations", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/New_York");
  });

  it("calcule l'heure locale de la destination (heure d'été et d'hiver)", () => {
    expect(localPartsAt(new Date("2026-07-01T10:00:00Z"), "Europe/Paris")).toEqual({ date: "2026-07-01", weekday: "wed", minutes: 12 * 60 });
    expect(localPartsAt(new Date("2026-12-01T10:00:00Z"), "Europe/Paris")).toEqual({ date: "2026-12-01", weekday: "tue", minutes: 11 * 60 });
    // 23h30 UTC le 3 octobre = 1h30 le 4 octobre à Paris
    expect(localPartsAt(new Date("2026-10-03T23:30:00Z"), "Europe/Paris").date).toBe("2026-10-04");
  });

  it("détermine le jour d'une date calendaire indépendamment du fuseau", () => {
    expect(weekdayOf("2026-10-03")).toBe("sat");
    expect(weekdayOf("2026-10-05")).toBe("mon");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("évalue les horaires d'ouverture", () => {
    const hours = { weekly: { sat: [["12:00", "14:00"] as [string, string]] }, exceptions: [{ date: "2026-10-10", ranges: [] }] };
    expect(openDuring(hours, "2026-10-03", parseHHMM("12:15"), parseHHMM("13:30"))).toBe(true);
    expect(openDuring(hours, "2026-10-03", parseHHMM("13:30"), parseHHMM("14:30"))).toBe(false);
    expect(openDuring(hours, "2026-10-10", parseHHMM("12:15"), parseHHMM("13:00"))).toBe(false); // fermeture exceptionnelle
    expect(openStatusAt({ status: "unknown" }, "2026-10-03", 600)).toBe("unknown");
  });
});

describe("utilitaires", () => {
  it("normalise le texte sans accents", () => {
    expect(normalizeText("  Fourvière   d’Annecy ")).toBe("fourviere d annecy");
  });
  it("produit une variation déterministe", () => {
    expect(seededUnit(1, "a")).toBe(seededUnit(1, "a"));
    expect(seededUnit(1, "a")).not.toBe(seededUnit(2, "a"));
  });
});

import { describe, expect, it } from "vitest";
import { MIN_DENOMINATOR, computeMetrics, formatRatio, weekStart, type Account, type Activity } from "./metrics";

const NOW = new Date("2026-10-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

describe("indicateurs produit", () => {
  it("affiche « Données insuffisantes » sans données, sans inventer de traction", () => {
    const m = computeMetrics([], [], NOW);
    expect(m.accounts).toBe(0);
    expect(m.activation.sufficient).toBe(false);
    expect(formatRatio(m.activation)).toBe("Données insuffisantes (n = 0)");
    expect(m.active7d).toBe(0);
  });

  it("calcule l'activation avec son dénominateur (cohorte 7 à 37 jours)", () => {
    const accounts: Account[] = Array.from({ length: 25 }, (_, i) => ({ id: `u${i}`, createdAt: daysAgo(10) }));
    accounts.push({ id: "recent", createdAt: daysAgo(2) }); // hors cohorte : fenêtre de 7 jours incomplète
    const activities: Activity[] = accounts.slice(0, 10).map((a) => ({ userId: a.id, at: daysAgo(8), kind: "visit" }));
    activities.push({ userId: "u11", at: daysAgo(1), kind: "visit" }); // après la fenêtre de 7 jours : ne compte pas
    const m = computeMetrics(accounts, activities, NOW);
    expect(m.activation).toMatchObject({ numerator: 10, denominator: 25, sufficient: true });
    expect(formatRatio(m.activation)).toBe("40,0 % (10/25)");
  });

  it("compte les utilisateurs actifs sur 7 et 30 jours, sans les comptes inconnus", () => {
    const accounts: Account[] = [
      { id: "a", createdAt: daysAgo(60) },
      { id: "b", createdAt: daysAgo(60) },
    ];
    const activities: Activity[] = [
      { userId: "a", at: daysAgo(3), kind: "app_open" },
      { userId: "b", at: daysAgo(20), kind: "excursion" },
      { userId: "exclu", at: daysAgo(1), kind: "visit" }, // compte de test ou administrateur retiré en amont
    ];
    const m = computeMetrics(accounts, activities, NOW);
    expect(m.active7d).toBe(1);
    expect(m.active30d).toBe(2);
  });

  it("calcule la rétention par cohorte hebdomadaire et marque les semaines non écoulées", () => {
    const cohort = weekStart(daysAgo(21));
    const accounts: Account[] = Array.from({ length: MIN_DENOMINATOR }, (_, i) => ({ id: `c${i}`, createdAt: `${cohort}T10:00:00Z` }));
    const week1 = new Date(Date.parse(`${cohort}T12:00:00Z`) + 8 * 86_400_000).toISOString();
    const activities: Activity[] = accounts.slice(0, 5).map((a) => ({ userId: a.id, at: week1, kind: "visit" }));
    const m = computeMetrics(accounts, activities, NOW);
    const row = m.retention.find((r) => r.cohortWeek === cohort)!;
    expect(row.size).toBe(20);
    expect(row.week1).toMatchObject({ numerator: 5, denominator: 20, sufficient: true });
    expect(row.week4.value).toBeNull(); // semaine 4 pas encore écoulée
  });
});

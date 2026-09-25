import { describe, expect, it } from "vitest";
import { baseRequest, catalog, idGenerator } from "@/test/fixtures";
import { parseHHMM } from "@/modules/shared/time";
import { computeBudget, scheduleExcursion, transferMarginMinutes } from "./schedule";
import { alternativesFor, moveStep, replaceStep, surprise } from "./surprise";

describe("Surprends-nous", () => {
  it("propose 3 à 5 étapes de la destination demandée", () => {
    const result = surprise(baseRequest(), catalog, idGenerator());
    expect(result.status).toBe("ok");
    expect(result.steps.length).toBeGreaterThanOrEqual(3);
    expect(result.steps.length).toBeLessThanOrEqual(5);
    const ids = result.steps.map((s) => s.placeId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("lyon-")).toBe(true);
  });

  it("est déterministe pour une même graine", () => {
    const a = surprise(baseRequest({ seed: 7 }), catalog, idGenerator());
    const b = surprise(baseRequest({ seed: 7 }), catalog, idGenerator());
    expect(a.steps.map((s) => s.placeId)).toEqual(b.steps.map((s) => s.placeId));
  });

  it("varie avec la graine sans casser les contraintes", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 12; seed += 1) {
      const r = surprise(baseRequest({ seed }), catalog, idGenerator());
      expect(r.status).toBe("ok");
      seen.add(r.steps.map((s) => s.placeId).join(","));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("place une pause repas ouverte à l'heure du déjeuner", () => {
    const result = surprise(baseRequest({ startTime: "10:00", durationMinutes: 360 }), catalog, idGenerator());
    const meal = result.schedule.steps.find((s) => s.place.category === "restaurant" || s.place.category === "market");
    expect(meal).toBeDefined();
    expect(meal!.arrival).toBeGreaterThanOrEqual(parseHHMM("11:15"));
    expect(meal!.arrival).toBeLessThanOrEqual(parseHHMM("13:30"));
    expect(meal!.hours).not.toBe("closed");
  });

  it("n'ajoute pas de restaurant quand le repas n'est pas souhaité", () => {
    const result = surprise(baseRequest({ includeMeal: "no" }), catalog, idGenerator());
    expect(result.schedule.steps.some((s) => s.place.category === "restaurant")).toBe(false);
  });

  it("n'utilise que des étapes ouvertes quand les horaires sont connus", () => {
    for (let seed = 0; seed < 10; seed += 1) {
      const result = surprise(baseRequest({ seed, startTime: "11:30" }), catalog, idGenerator());
      for (const step of result.schedule.steps) expect(step.hours).not.toBe("closed");
    }
  });

  it("respecte un budget serré et signale les coûts inconnus", () => {
    const result = surprise(baseRequest({ budget: { amount: 15, basis: "per_person" }, interests: ["economy", "nature"] }), catalog, idGenerator());
    for (const step of result.schedule.steps) {
      const price = step.place.practical.price;
      if (price.status !== "unknown" && price.value.kind === "paid") expect(price.value.minPerPerson).toBeLessThanOrEqual(15);
    }
    expect(["within", "uncertain"]).toContain(result.schedule.budget.verdict);
  });

  it("distingue budget par personne et budget du groupe", () => {
    const perPerson = surprise(baseRequest({ party: { kind: "friends", size: 4 }, budget: { amount: 30, basis: "per_person" } }), catalog, idGenerator());
    const group = surprise(baseRequest({ party: { kind: "friends", size: 4 }, budget: { amount: 30, basis: "group" } }), catalog, idGenerator());
    expect(perPerson.schedule.budget.perPersonCap).toBe(30);
    expect(group.schedule.budget.perPersonCap).toBe(7.5);
    // Le budget groupe de 30 € pour 4 exclut les tables à plus de 7,50 € par personne.
    expect(group.excluded.some((e) => e.reason === "Au-delà du budget par personne")).toBe(true);
  });

  it("dit honnêtement quand les critères ne permettent pas trois étapes", () => {
    const result = surprise(baseRequest({ needs: { wheelchair: true, diets: [] } }), catalog, idGenerator());
    expect(result.status).toBe("insufficient");
    expect(result.explanation[0]).toMatch(/Seulement/);
    expect(result.excluded.length).toBeGreaterThan(0);
  });

  it("explique chaque étape", () => {
    const result = surprise(baseRequest(), catalog, idGenerator());
    for (const step of result.steps) expect(result.reasonsByPlace[step.placeId]?.length).toBeGreaterThan(0);
  });

  it("ne dépend pas du fuseau de la machine (heures locales de la destination)", () => {
    const result = surprise(baseRequest({ startTime: "10:00" }), catalog, idGenerator());
    expect(result.schedule.start).toBe(600);
  });
});

describe("édition d'excursion", () => {
  it("remplace une étape par une alternative expliquée", () => {
    const request = baseRequest();
    const result = surprise(request, catalog, idGenerator());
    const alternatives = alternativesFor(request, result.steps, 0, catalog);
    expect(alternatives.length).toBeGreaterThan(0);
    expect(result.steps.some((s) => s.placeId === alternatives[0]!.place.id)).toBe(false);
    const replaced = replaceStep(result.steps, 0, alternatives[0]!.place, idGenerator("r"));
    expect(replaced[0]!.placeId).toBe(alternatives[0]!.place.id);
    expect(replaced.slice(1)).toEqual(result.steps.slice(1));
  });

  it("détecte un conflit horaire après réorganisation", () => {
    const steps = [
      { id: "a", placeId: "lyon-resto-bouchon-fictif", visitMinutes: 80, note: null },
      { id: "b", placeId: "lyon-vieux-lyon", visitMinutes: 90, note: null },
    ];
    const request = baseRequest({ startTime: "12:00", durationMinutes: 240 });
    expect(scheduleExcursion({ ...request, steps }, catalog).steps[0]!.hours).toBe("open");
    const moved = moveStep(steps, 0, 1);
    const schedule = scheduleExcursion({ ...request, steps: moved }, catalog);
    const resto = schedule.steps.find((s) => s.place.id === "lyon-resto-bouchon-fictif")!;
    expect(resto.hours).toBe("closed");
    expect(resto.issues.some((i) => i.code === "closed")).toBe(true);
  });

  it("signale le dépassement de durée et les longues distances", () => {
    const steps = [
      { id: "a", placeId: "annecy-semnoz", visitMinutes: 150, note: null },
      { id: "b", placeId: "annecy-talloires", visitMinutes: 90, note: null },
    ];
    const schedule = scheduleExcursion({ ...baseRequest({ destinationId: "annecy", durationMinutes: 120 }), steps }, catalog);
    expect(schedule.overrunMinutes).toBeGreaterThan(0);
    expect(schedule.steps[1]!.issues.some((i) => i.code === "far_for_transport")).toBe(true);
  });

  it("présente les marges comme des estimations croissantes avec la distance", () => {
    expect(transferMarginMinutes(30, "walk")).toBe(0);
    expect(transferMarginMinutes(1000, "walk")).toBeGreaterThan(transferMarginMinutes(1000, "bike"));
  });

  it("ne compte pas un coût inconnu comme gratuit dans le budget", () => {
    const museum = catalog.places.find((p) => p.id === "lyon-confluences")!;
    const budget = computeBudget([museum], { party: { kind: "solo", size: 1 }, budget: { amount: 10, basis: "per_person" } });
    expect(budget.unknownSteps).toBe(1);
    expect(budget.verdict).toBe("uncertain");
  });
});

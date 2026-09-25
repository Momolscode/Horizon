import { getDemoCatalog } from "@/modules/catalog/demo";
import type { SurpriseRequest } from "@/modules/excursions/types";

export const catalog = getDemoCatalog().catalog;

export function idGenerator(prefix = "id") {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function baseRequest(overrides: Partial<SurpriseRequest> = {}): SurpriseRequest {
  return {
    destinationId: "lyon",
    date: "2026-10-03", // samedi
    startTime: "10:00",
    durationMinutes: 360,
    party: { kind: "couple", size: 2 },
    budget: { amount: 60, basis: "per_person" },
    transport: "walk",
    interests: ["culture", "food"],
    needs: { wheelchair: false, diets: [] },
    includeMeal: "auto",
    seed: 1,
    ...overrides,
  };
}

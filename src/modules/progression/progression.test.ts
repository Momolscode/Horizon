import { describe, expect, it } from "vitest";
import { catalog, idGenerator } from "@/test/fixtures";
import { LEVELS, NEW_PARCEL_XP, PARCEL_RESOLUTION, VISIT_RULES, levelForXp } from "./config";
import {
  EMPTY_SNAPSHOT,
  VisitRejectedError,
  applyOutcome,
  evaluateProximity,
  medalProgress,
  planVisit,
  totals,
  type ProgressionSnapshot,
  type VisitRequest,
} from "./engine";
import { cellsForView, cellsInBbox, displayResolutionForZoom, exploredAtResolution, parcelForLocation } from "./parcels";

const NOW = new Date("2026-10-03T10:00:00Z");
const place = (id: string) => catalog.places.find((p) => p.id === id)!;

function request(placeId: string, overrides: Partial<VisitRequest> = {}): VisitRequest {
  return { placeId, requestedStatus: "declared", visitedOn: "2026-10-03", idempotencyKey: `k-${placeId}`, position: null, note: null, ...overrides };
}

function deps(mode: "demo" | "connected" = "demo") {
  return { now: NOW, newId: idGenerator("x"), mode };
}

describe("visites et XP", () => {
  it("une visite déclarée crédite l'XP de première visite et révèle la parcelle", () => {
    const outcome = planVisit(request("lyon-fourviere"), EMPTY_SNAPSHOT, catalog, deps());
    expect(outcome.duplicate).toBe(false);
    expect(outcome.visit.status).toBe("declared");
    expect(outcome.xpGained).toBe(VISIT_RULES.declared.firstVisitXp + NEW_PARCEL_XP);
    expect(outcome.parcel?.isNew).toBe(true);
    expect(outcome.parcel?.parcel.resolution).toBe(PARCEL_RESOLUTION);
    expect(outcome.parcel?.parcel.cell).toBe(parcelForLocation(place("lyon-fourviere").location));
    expect(outcome.badges.map((b) => b.id)).toEqual(expect.arrayContaining(["premiere-visite", "premiere-parcelle"]));
  });

  it("une nouvelle tentative avec la même clé ne crédite rien (double clic, réseau)", () => {
    const first = planVisit(request("lyon-fourviere"), EMPTY_SNAPSHOT, catalog, deps());
    const snapshot = applyOutcome(EMPTY_SNAPSHOT, first);
    const retry = planVisit(request("lyon-fourviere"), snapshot, catalog, deps());
    expect(retry.duplicate).toBe(true);
    expect(retry.xpGained).toBe(0);
    expect(applyOutcome(snapshot, retry)).toBe(snapshot);
  });

  it("revisiter un lieu avec une autre clé ne recrédite pas la première visite", () => {
    let snapshot: ProgressionSnapshot = EMPTY_SNAPSHOT;
    snapshot = applyOutcome(snapshot, planVisit(request("lyon-fourviere"), snapshot, catalog, deps()));
    const again = planVisit(request("lyon-fourviere", { idempotencyKey: "autre" }), snapshot, catalog, deps());
    expect(again.duplicate).toBe(false);
    expect(again.xpGained).toBe(0);
    snapshot = applyOutcome(snapshot, again);
    expect(snapshot.visits).toHaveLength(2);
    expect(totals(snapshot).xp).toBe(VISIT_RULES.declared.firstVisitXp + NEW_PARCEL_XP);
  });

  it("un contrôle de proximité réussi accorde un bonus unique", () => {
    const p = place("lyon-fourviere");
    const position = { lat: p.location.lat + 0.0003, lng: p.location.lng, accuracyM: 20, capturedAt: NOW.toISOString() };
    const outcome = planVisit(request(p.id, { requestedStatus: "proximity_checked", position }), EMPTY_SNAPSHOT, catalog, deps());
    expect(outcome.visit.status).toBe("proximity_checked");
    expect(outcome.parcel?.parcel.state).toBe("checked");
    expect(outcome.xpGained).toBe(VISIT_RULES.proximity_checked.firstVisitXp + VISIT_RULES.proximity_checked.proximityBonusXp + NEW_PARCEL_XP);
    expect(outcome.pointsGained).toBe(0); // aucun avantage financier pour un contrôle GPS seul
  });

  it("une position imprécise conserve le statut déclaré, avec explication", () => {
    const p = place("lyon-fourviere");
    const position = { ...p.location, accuracyM: 900, capturedAt: NOW.toISOString() };
    const outcome = planVisit(request(p.id, { requestedStatus: "proximity_checked", position }), EMPTY_SNAPSHOT, catalog, deps());
    expect(outcome.visit.status).toBe("declared");
    expect(outcome.visit.proximity?.result).toBe("inaccurate");
    expect(outcome.statusExplanation).toMatch(/précision insuffisante/);
  });

  it("une position trop éloignée, ancienne ou invalide ne vaut pas contrôle", () => {
    const p = place("lyon-fourviere");
    expect(evaluateProximity(p, { lat: 45.9, lng: 4.8, accuracyM: 10, capturedAt: NOW.toISOString() }, NOW).result).toBe("too_far");
    expect(evaluateProximity(p, { ...p.location, accuracyM: 10, capturedAt: "2026-10-03T09:00:00Z" }, NOW).result).toBe("stale");
    expect(evaluateProximity(p, { lat: Number.NaN, lng: 4.8, accuracyM: 10, capturedAt: NOW.toISOString() }, NOW).result).toBe("invalid");
    expect(evaluateProximity(p, { lat: 200, lng: 4.8, accuracyM: 10, capturedAt: NOW.toISOString() }, NOW).result).toBe("invalid");
    expect(evaluateProximity(p, null, NOW).result).toBe("invalid");
  });

  it("une visite simulée révèle la parcelle en démo sans XP ni statistique réelle", () => {
    const outcome = planVisit(request("lyon-fourviere", { requestedStatus: "simulated" }), EMPTY_SNAPSHOT, catalog, deps());
    expect(outcome.xpGained).toBe(0);
    expect(outcome.parcel?.parcel.state).toBe("simulated");
    expect(outcome.badges.map((b) => b.id)).not.toContain("premiere-visite");
  });

  it("le mode connecté refuse les visites simulées", () => {
    expect(() => planVisit(request("lyon-fourviere", { requestedStatus: "simulated" }), EMPTY_SNAPSHOT, catalog, deps("connected"))).toThrow(VisitRejectedError);
  });

  it("refuse un lieu inconnu ou une date invalide", () => {
    expect(() => planVisit(request("inexistant"), EMPTY_SNAPSHOT, catalog, deps())).toThrow(/Lieu inconnu/);
    expect(() => planVisit(request("lyon-fourviere", { visitedOn: "03/10/2026" }), EMPTY_SNAPSHOT, catalog, deps())).toThrow(/Date/);
    expect(() => planVisit(request("lyon-fourviere", { visitedOn: "2026-02-31" }), EMPTY_SNAPSHOT, catalog, deps())).toThrow(/Date/);
  });

  it("borne la date de visite : pas dans le futur, au plus un an en arrière", () => {
    expect(() => planVisit(request("lyon-fourviere", { visitedOn: "2026-10-06" }), EMPTY_SNAPSHOT, catalog, deps())).toThrow(/période acceptée/);
    expect(() => planVisit(request("lyon-fourviere", { visitedOn: "2025-09-01" }), EMPTY_SNAPSHOT, catalog, deps())).toThrow(/période acceptée/);
    expect(planVisit(request("lyon-fourviere", { visitedOn: "2026-10-04" }), EMPTY_SNAPSHOT, catalog, deps()).duplicate).toBe(false);
  });

  it("plafonne les visites enregistrées sur 24 heures", () => {
    let snapshot: ProgressionSnapshot = EMPTY_SNAPSHOT;
    for (let i = 0; i < 20; i += 1) snapshot = applyOutcome(snapshot, planVisit(request(catalog.places[i]!.id, { idempotencyKey: `cap-${i}` }), snapshot, catalog, deps()));
    expect(() => planVisit(request(catalog.places[20]!.id, { idempotencyKey: "cap-20" }), snapshot, catalog, deps())).toThrow(/Plafond/);
  });

  it("une parcelle déclarée puis contrôlée est renforcée, sans nouvelle XP de parcelle", () => {
    const p = place("lyon-fourviere");
    let snapshot = applyOutcome(EMPTY_SNAPSHOT, planVisit(request(p.id), EMPTY_SNAPSHOT, catalog, deps()));
    const position = { ...p.location, accuracyM: 15, capturedAt: NOW.toISOString() };
    const checked = planVisit(request(p.id, { idempotencyKey: "k2", requestedStatus: "proximity_checked", position }), snapshot, catalog, deps());
    expect(checked.parcel).toMatchObject({ isNew: false, previousState: "declared", parcel: { state: "checked" } });
    expect(checked.xpGained).toBe(VISIT_RULES.proximity_checked.proximityBonusXp);
    snapshot = applyOutcome(snapshot, checked);
    expect(snapshot.parcels).toHaveLength(1);
  });

  it("les points de niveau ne sont crédités qu'une fois", () => {
    const level4 = LEVELS.find((l) => l.level === 4)!;
    const seeded: ProgressionSnapshot = {
      ...EMPTY_SNAPSHOT,
      ledger: [{ id: "s", kind: "xp", amount: level4.minXp - 5, reason: "admin_adjustment", refId: "seed", uniqueKey: "admin_adjustment:seed", createdAt: NOW.toISOString() }],
    };
    const outcome = planVisit(request("lyon-fourviere"), seeded, catalog, deps());
    expect(outcome.levelAfter).toBe(4);
    expect(outcome.pointsGained).toBe(50);
    const after = applyOutcome(seeded, outcome);
    const next = planVisit(request("lyon-vieux-lyon"), after, catalog, deps());
    expect(next.pointsGained).toBe(0);
  });

  it("la médaille récompense le parcours défini de la destination", () => {
    const destination = catalog.destinations.find((d) => d.id === "lyon")!;
    let snapshot: ProgressionSnapshot = EMPTY_SNAPSHOT;
    let lastBadges: string[] = [];
    for (const id of destination.medalRoute.placeIds) {
      const outcome = planVisit(request(id), snapshot, catalog, deps());
      lastBadges = outcome.badges.map((b) => b.id);
      snapshot = applyOutcome(snapshot, outcome);
    }
    expect(lastBadges).toContain("medaille:lyon");
    expect(medalProgress(snapshot, catalog, "lyon")).toEqual({ done: destination.medalRoute.placeIds.length, total: destination.medalRoute.placeIds.length });
  });

  it("calcule le niveau à partir de l'XP totale", () => {
    expect(levelForXp(0).current.level).toBe(1);
    expect(levelForXp(60).current.level).toBe(2);
    expect(levelForXp(59).progress).toBeCloseTo(59 / 60);
  });
});

describe("parcelles H3", () => {
  it("choisit une résolution d'affichage selon le zoom, jamais plus fine que la référence", () => {
    expect(displayResolutionForZoom(14)).toBe(PARCEL_RESOLUTION);
    expect(displayResolutionForZoom(10.5)).toBe(PARCEL_RESOLUTION - 1);
    expect(displayResolutionForZoom(6)).toBeNull();
  });

  it("ne génère que les cellules de la zone visible et se replie sur une résolution plus grossière", () => {
    const view = cellsForView([4.8, 45.74, 4.86, 45.78], 13);
    expect(view.resolution).toBe(PARCEL_RESOLUTION);
    expect(view.cells.length).toBeGreaterThan(0);
    expect(view.cells.length).toBeLessThan(200);
    const wide = cellsForView([2, 44, 7, 47], 12, 500);
    expect(wide.resolution === null || wide.cells.length <= 500).toBe(true);
    expect(cellsForView([4.8, 45.74, 4.86, 45.78], 5).cells).toEqual([]);
  });

  it("agrège les parcelles explorées vers une résolution plus grossière avec un dénominateur", () => {
    const cell = parcelForLocation({ lat: 45.7622, lng: 4.8224 });
    const agg = exploredAtResolution([{ cell, resolution: 8, state: "declared", firstRevealedAt: "", placeId: "x" }], 7);
    const [entry] = [...agg.values()];
    expect(entry).toEqual({ explored: 1, total: 7, state: "declared" });
  });

  it("compte les cellules de l'emprise d'une destination (dénominateur des pourcentages)", () => {
    const annecy = catalog.destinations.find((d) => d.id === "annecy")!;
    const count = cellsInBbox(annecy.bbox);
    expect(count).toBeGreaterThan(300);
    expect(count).toBeLessThan(2000);
  });
});

describe("récompenses de niveau rattrapées", () => {
  it("un niveau franchi hors visite (mission, correction) est récompensé une seule fois", async () => {
    const { planLedgerAddition } = await import("./engine");
    const level4 = LEVELS.find((l) => l.level === 4)!;
    const bonus = { id: "m1", kind: "xp" as const, amount: level4.minXp, reason: "mission" as const, refId: "x", uniqueKey: "mission:x:1", createdAt: NOW.toISOString() };
    const first = planLedgerAddition(EMPTY_SNAPSHOT, [bonus], catalog, idGenerator("l"), NOW.toISOString());
    expect(first.ledger.filter((e) => e.reason === "level_reward").map((e) => e.amount)).toEqual([50]);
    expect(first.badges.map((b) => b.id)).toContain("eclaireur");
    const after = { ...EMPTY_SNAPSHOT, ledger: first.ledger, badges: first.badges };
    const again = planLedgerAddition(after, [bonus], catalog, idGenerator("l"), NOW.toISOString());
    expect(again.ledger).toEqual([]);
    // La visite suivante ne recrédite pas non plus la récompense.
    const visit = planVisit(request("lyon-fourviere"), after, catalog, deps());
    expect(visit.pointsGained).toBe(0);
  });
});

describe("barèmes configurables", () => {
  it("applique la version de barème fournie, sans modifier les écritures passées", async () => {
    const { DEFAULT_PROGRESSION_CONFIG } = await import("./config");
    const custom = { ...DEFAULT_PROGRESSION_CONFIG, version: 2, xp: { ...DEFAULT_PROGRESSION_CONFIG.xp, declaredFirstVisit: 30, newParcel: 0 } };
    const first = planVisit(request("lyon-fourviere"), EMPTY_SNAPSHOT, catalog, deps());
    const after = applyOutcome(EMPTY_SNAPSHOT, first);
    const second = planVisit(request("lyon-vieux-lyon"), after, catalog, { ...deps(), config: custom });
    expect(first.xpGained).toBe(25);
    expect(second.xpGained).toBe(30);
    expect(after.ledger.reduce((s, e) => s + e.amount, 0)).toBe(25);
  });
});

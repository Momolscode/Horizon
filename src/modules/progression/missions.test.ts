import { describe, expect, it } from "vitest";
import { catalog, idGenerator } from "@/test/fixtures";
import { EMPTY_SNAPSHOT, applyOutcome, planVisit, type ProgressionSnapshot } from "./engine";
import { MISSIONS, MissionClaimError, evaluateMissions, periodKey, planMissionClaim } from "./missions";

const TZ = "Europe/Paris";
const NOW = new Date("2026-10-03T10:00:00Z"); // samedi

function visit(snapshot: ProgressionSnapshot, placeId: string, key: string, status: "declared" | "simulated" = "declared") {
  return applyOutcome(
    snapshot,
    planVisit({ placeId, requestedStatus: status, visitedOn: "2026-10-03", idempotencyKey: key, position: null, note: null }, snapshot, catalog, {
      now: NOW,
      newId: idGenerator(key),
      mode: "demo",
    }),
  );
}

describe("missions", () => {
  it("sont toutes relues pour la sécurité et sans récompense financière", () => {
    for (const m of MISSIONS) {
      expect(m.safetyReviewed).toBe(true);
      expect(m.xp).toBeGreaterThan(0);
    }
  });

  it("calcule les clés de période (jour, semaine ISO, mois) dans le fuseau donné", () => {
    expect(periodKey("daily", NOW, TZ)).toBe("2026-10-03");
    expect(periodKey("weekly", NOW, TZ)).toBe("2026-W40");
    expect(periodKey("monthly", NOW, TZ)).toBe("2026-10");
    // 31 décembre 2026 (jeudi) → semaine 53 de 2026 ; 1er janvier 2027 → même semaine ISO
    expect(periodKey("weekly", new Date("2026-12-31T12:00:00Z"), TZ)).toBe("2026-W53");
    expect(periodKey("weekly", new Date("2027-01-01T12:00:00Z"), TZ)).toBe("2026-W53");
    // 23h30 UTC le 3 octobre = 4 octobre à Paris
    expect(periodKey("daily", new Date("2026-10-03T23:30:00Z"), TZ)).toBe("2026-10-04");
  });

  it("calcule la progression à partir des visites réelles (les simulations ne comptent pas)", () => {
    let s = visit(EMPTY_SNAPSHOT, "lyon-tete-d-or", "a", "simulated");
    let status = evaluateMissions({ snapshot: s, catalog, excursionUpdates: [] }, NOW, TZ).find((m) => m.mission.id === "tresor-gratuit")!;
    expect(status.completed).toBe(false);
    s = visit(s, "lyon-tete-d-or", "b");
    status = evaluateMissions({ snapshot: s, catalog, excursionUpdates: [] }, NOW, TZ).find((m) => m.mission.id === "tresor-gratuit")!;
    expect(status).toMatchObject({ completed: true, progress: 1, target: 1, claimed: false });
  });

  it("ne crédite une mission qu'une fois par période", () => {
    const s = visit(EMPTY_SNAPSHOT, "lyon-tete-d-or", "a");
    const inputs = { snapshot: s, catalog, excursionUpdates: [] };
    const entry = planMissionClaim("tresor-gratuit", inputs, NOW, TZ, idGenerator("m"));
    expect(entry).toMatchObject({ reason: "mission", amount: 15, uniqueKey: "mission:tresor-gratuit:2026-W40", kind: "xp" });
    const claimed = { ...s, ledger: [...s.ledger, entry] };
    expect(() => planMissionClaim("tresor-gratuit", { ...inputs, snapshot: claimed }, NOW, TZ, idGenerator("m"))).toThrow(MissionClaimError);
    // La semaine suivante, la mission est de nouveau disponible (mais pas accomplie sans nouvelle visite).
    const nextWeek = new Date("2026-10-10T10:00:00Z");
    const status = evaluateMissions({ snapshot: claimed, catalog, excursionUpdates: [] }, nextWeek, TZ).find((m) => m.mission.id === "tresor-gratuit")!;
    expect(status).toMatchObject({ claimed: false, completed: false });
  });

  it("ignore une visite enregistrée une autre semaine, même si sa date déclarée tombe dans la période", () => {
    const s = visit(EMPTY_SNAPSHOT, "lyon-tete-d-or", "a");
    const backdated = { ...s, visits: s.visits.map((v) => ({ ...v, createdAt: "2026-09-20T10:00:00.000Z", visitedOn: "2026-10-03" })) };
    const status = evaluateMissions({ snapshot: backdated, catalog, excursionUpdates: [] }, NOW, TZ).find((m) => m.mission.id === "tresor-gratuit")!;
    expect(status.completed).toBe(false);
  });

  it("ne compte pas la redéclaration d'un lieu déjà visité une semaine précédente", () => {
    const s = visit(EMPTY_SNAPSHOT, "lyon-tete-d-or", "a");
    const lastWeek = { ...s, visits: s.visits.map((v) => ({ ...v, createdAt: "2026-09-20T10:00:00.000Z", visitedOn: "2026-09-20" })) };
    // Nouvelle déclaration du même parc cette semaine.
    const again = visit(lastWeek, "lyon-tete-d-or", "b");
    expect(again.visits).toHaveLength(2);
    const status = evaluateMissions({ snapshot: again, catalog, excursionUpdates: [] }, NOW, TZ);
    expect(status.find((m) => m.mission.id === "tresor-gratuit")!.completed).toBe(false);
    expect(status.find((m) => m.mission.id === "deux-univers")!.progress).toBe(0);
  });

  it("refuse une mission non accomplie ou inconnue", () => {
    const inputs = { snapshot: EMPTY_SNAPSHOT, catalog, excursionUpdates: [] };
    expect(() => planMissionClaim("trois-parcelles", inputs, NOW, TZ, idGenerator())).toThrow(/pas encore accomplie/);
    expect(() => planMissionClaim("inconnue", inputs, NOW, TZ, idGenerator())).toThrow(/inconnue/);
  });

  it("compte la préparation d'une excursion du jour", () => {
    const status = evaluateMissions({ snapshot: EMPTY_SNAPSHOT, catalog, excursionUpdates: ["2026-10-03T08:00:00Z", "2026-10-01T08:00:00Z"] }, NOW, TZ).find(
      (m) => m.mission.id === "preparer-une-sortie",
    )!;
    expect(status.completed).toBe(true);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServer, createUser, deleteUsers, pool } from "@/test/db";
import { NEW_PARCEL_XP, VISIT_RULES } from "@/modules/progression/config";
import { VisitRejectedError, type VisitRequest } from "@/modules/progression/engine";
import { loadCatalogFromDb } from "./catalog";
import { ProgressionError, adminAdjust, loadSnapshot, recordVisit } from "./progression";
import type { Catalog } from "@/modules/catalog/schema";

/**
 * Attribution serveur transactionnelle et idempotente, sur PostgreSQL réel.
 * Les appels concurrents utilisent des connexions et transactions distinctes.
 */
let catalog: Catalog;
const users: string[] = [];

const FIRST = VISIT_RULES.declared.firstVisitXp + NEW_PARCEL_XP;

function req(overrides: Partial<VisitRequest> = {}): VisitRequest {
  return { placeId: "lyon-fourviere", requestedStatus: "declared", visitedOn: "2026-10-03", idempotencyKey: `cle-${Math.random().toString(36).slice(2, 12)}`, position: null, note: null, ...overrides };
}

async function xpOf(userId: string) {
  const res = await pool.query(`select coalesce(sum(amount), 0)::int as xp, count(*)::int as n from public.xp_ledger where user_id = $1 and kind = 'xp'`, [userId]);
  return res.rows[0] as { xp: number; n: number };
}

beforeAll(async () => {
  catalog = (await loadCatalogFromDb(pool)).catalog;
});

afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

async function newUser(label: string) {
  const id = await createUser(label);
  users.push(id);
  return id;
}

describe("catalogue lu en base", () => {
  it("passe la même validation que la démo (schéma et références)", () => {
    expect(catalog.places).toHaveLength(40);
    expect(catalog.destinations.map((d) => d.id).sort()).toEqual(["annecy", "la-rochelle", "lyon", "marseille"]);
  });
});

describe("enregistrement d'une visite", () => {
  it("crédite l'XP, révèle la parcelle et attribue les badges", async () => {
    const u = await newUser("v1");
    const { outcome } = await asServer((c) => recordVisit(c, u, req(), catalog));
    expect(outcome.xpGained).toBe(FIRST);
    const rows = await pool.query(`select (select count(*) from public.visits where user_id = $1)::int as visits, (select count(*) from public.parcels where user_id = $1)::int as parcels, (select count(*) from public.badges_awarded where user_id = $1)::int as badges`, [u]);
    expect(rows.rows[0]).toEqual({ visits: 1, parcels: 1, badges: 2 });
    expect((await xpOf(u)).xp).toBe(FIRST);
  });

  it("une nouvelle tentative avec la même clé ne crédite rien", async () => {
    const u = await newUser("v2");
    const r = req({ idempotencyKey: "cle-retente-0001" });
    await asServer((c) => recordVisit(c, u, r, catalog));
    const second = await asServer((c) => recordVisit(c, u, r, catalog));
    expect(second.outcome.duplicate).toBe(true);
    const count = await pool.query(`select count(*)::int as n from public.visits where user_id = $1`, [u]);
    expect(count.rows[0].n).toBe(1);
    expect((await xpOf(u)).xp).toBe(FIRST);
  });

  it("10 requêtes simultanées avec la même clé (double clic, réseau) : une seule visite, un seul crédit", async () => {
    const u = await newUser("v3");
    const r = req({ idempotencyKey: "cle-simultanee-01" });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => asServer((c) => recordVisit(c, u, r, catalog))));
    expect(results.every((x) => x.status === "fulfilled")).toBe(true);
    const created = results.filter((x) => x.status === "fulfilled" && !x.value.outcome.duplicate);
    expect(created).toHaveLength(1);
    const count = await pool.query(`select count(*)::int as n from public.visits where user_id = $1`, [u]);
    expect(count.rows[0].n).toBe(1);
    expect((await xpOf(u)).xp).toBe(FIRST);
  });

  it("10 visites simultanées du même lieu avec des clés différentes : XP de première visite créditée une fois", async () => {
    const u = await newUser("v4");
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => asServer((c) => recordVisit(c, u, req({ idempotencyKey: `cle-differente-${i}` }), catalog))));
    expect(results.every((x) => x.status === "fulfilled")).toBe(true);
    const visits = await pool.query(`select count(*)::int as n from public.visits where user_id = $1`, [u]);
    expect(visits.rows[0].n).toBe(10);
    const ledger = await pool.query(`select reason, count(*)::int as n from public.xp_ledger where user_id = $1 group by reason order by reason`, [u]);
    expect(ledger.rows).toEqual([
      { reason: "first_visit", n: 1 },
      { reason: "new_parcel", n: 1 },
    ]);
    expect((await xpOf(u)).xp).toBe(FIRST);
    const parcels = await pool.query(`select count(*)::int as n from public.parcels where user_id = $1`, [u]);
    expect(parcels.rows[0].n).toBe(1);
  });

  it("refuse les visites simulées et les lieux inconnus", async () => {
    const u = await newUser("v5");
    await expect(asServer((c) => recordVisit(c, u, req({ requestedStatus: "simulated" }), catalog))).rejects.toBeInstanceOf(VisitRejectedError);
    await expect(asServer((c) => recordVisit(c, u, req({ placeId: "inexistant" }), catalog))).rejects.toBeInstanceOf(VisitRejectedError);
    const count = await pool.query(`select count(*)::int as n from public.visits where user_id = $1`, [u]);
    expect(count.rows[0].n).toBe(0);
  });

  it("GPS imprécis ou coordonnées invalides : la visite reste déclarée, sans bonus", async () => {
    const u = await newUser("v6");
    const now = new Date();
    const place = catalog.places.find((p) => p.id === "lyon-fourviere")!;
    const imprecise = await asServer((c) =>
      recordVisit(c, u, req({ requestedStatus: "proximity_checked", position: { ...place.location, accuracyM: 800, capturedAt: now.toISOString() } }), catalog, now),
    );
    expect(imprecise.outcome.visit.status).toBe("declared");
    const invalid = await asServer((c) =>
      recordVisit(c, u, req({ requestedStatus: "proximity_checked", position: { lat: 999, lng: 4.8, accuracyM: 5, capturedAt: now.toISOString() } }), catalog, now),
    );
    expect(invalid.outcome.visit.status).toBe("declared");
    expect(invalid.outcome.visit.proximity?.result).toBe("invalid");
    const stored = await pool.query(`select proximity from public.visits where user_id = $1`, [u]);
    // Seules distance et précision sont stockées, jamais les coordonnées.
    for (const row of stored.rows) expect(Object.keys(row.proximity).sort()).toEqual(["accuracyM", "distanceM", "radiusM", "result"]);
    const bonus = await pool.query(`select count(*)::int as n from public.xp_ledger where user_id = $1 and reason = 'proximity_bonus'`, [u]);
    expect(bonus.rows[0].n).toBe(0);
  });

  it("un contrôle de proximité réussi renforce la parcelle et crédite le bonus une seule fois", async () => {
    const u = await newUser("v7");
    const now = new Date();
    const place = catalog.places.find((p) => p.id === "lyon-fourviere")!;
    const fix = { ...place.location, accuracyM: 12, capturedAt: now.toISOString() };
    await asServer((c) => recordVisit(c, u, req(), catalog, now));
    await asServer((c) => recordVisit(c, u, req({ requestedStatus: "proximity_checked", position: fix }), catalog, now));
    await asServer((c) => recordVisit(c, u, req({ requestedStatus: "proximity_checked", position: fix }), catalog, now));
    const parcel = await pool.query(`select state from public.parcels where user_id = $1`, [u]);
    expect(parcel.rows).toEqual([{ state: "checked" }]);
    expect((await xpOf(u)).xp).toBe(FIRST + VISIT_RULES.proximity_checked.proximityBonusXp);
  });

  it("isole la progression de chaque compte", async () => {
    const a = await newUser("iso-a");
    const b = await newUser("iso-b");
    await asServer((c) => recordVisit(c, a, req(), catalog));
    const snapB = await asServer((c) => loadSnapshot(c, b));
    expect(snapB.visits).toEqual([]);
    expect(snapB.ledger).toEqual([]);
  });
});

describe("corrections administratives", () => {
  it("sont tracées (auteur, motif) et non rejouables", async () => {
    const u = await newUser("adj");
    const admin = await newUser("admin");
    await pool.query(`insert into public.admins (user_id) values ($1)`, [admin]);
    const entry = await asServer((c) => adminAdjust(c, admin, u, { kind: "xp", amount: 40, note: "Visite perdue lors d'une panne", adjustmentId: "adj-0001" }));
    expect(entry.reason).toBe("admin_adjustment");
    const row = await pool.query(`select created_by, note from public.xp_ledger where id = $1`, [entry.id]);
    expect(row.rows[0]).toEqual({ created_by: admin, note: "Visite perdue lors d'une panne" });
    await expect(asServer((c) => adminAdjust(c, admin, u, { kind: "xp", amount: 40, note: "Visite perdue lors d'une panne", adjustmentId: "adj-0001" }))).rejects.toMatchObject({ status: 409 });
  });

  it("refusent un motif vide et un solde de points négatif", async () => {
    const u = await newUser("adj2");
    const admin = await newUser("admin2");
    await expect(asServer((c) => adminAdjust(c, admin, u, { kind: "xp", amount: 10, note: "" }))).rejects.toBeInstanceOf(ProgressionError);
    await expect(asServer((c) => adminAdjust(c, admin, u, { kind: "points", amount: -5, note: "Retrait erroné" }))).rejects.toMatchObject({ status: 400 });
    const res = await pool.query(`select count(*)::int as n from public.xp_ledger where user_id = $1`, [u]);
    expect(res.rows[0].n).toBe(0);
  });

  it("la base impose auteur et motif même sans passer par le code applicatif", async () => {
    const u = await newUser("adj3");
    await expect(
      pool.query(`insert into public.xp_ledger (id, user_id, kind, amount, reason, ref_id, unique_key) values (gen_random_uuid(), $1, 'xp', 500, 'admin_adjustment', 'x', 'admin_adjustment:x')`, [u]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

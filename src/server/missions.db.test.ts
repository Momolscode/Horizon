import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServer, createUser, deleteUsers, pool } from "@/test/db";
import { MissionClaimError } from "@/modules/progression/missions";
import type { Catalog } from "@/modules/catalog/schema";
import { loadCatalogFromDb } from "./catalog";
import { claimMission } from "./missions";
import { recordVisit } from "./progression";

let catalog: Catalog;
const users: string[] = [];

beforeAll(async () => {
  catalog = (await loadCatalogFromDb(pool)).catalog;
});
afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("missions côté serveur", () => {
  it("refuse une mission non accomplie, puis la crédite une seule fois malgré des réclamations simultanées", async () => {
    const u = await createUser("mission");
    users.push(u);
    const today = new Date().toISOString().slice(0, 10);
    await expect(asServer((c) => claimMission(c, u, "tresor-gratuit", catalog))).rejects.toBeInstanceOf(MissionClaimError);
    await asServer((c) => recordVisit(c, u, { placeId: "lyon-tete-d-or", requestedStatus: "declared", visitedOn: today, idempotencyKey: "cle-mission-01", position: null, note: null }, catalog));
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => asServer((c) => claimMission(c, u, "tresor-gratuit", catalog))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof MissionClaimError)).toBe(true);
    const ledger = await pool.query(`select count(*)::int as n from public.xp_ledger where user_id = $1 and reason = 'mission'`, [u]);
    expect(ledger.rows[0].n).toBe(1);
    const completion = await pool.query(`select mission_id from public.mission_completions where user_id = $1`, [u]);
    expect(completion.rows).toEqual([{ mission_id: "tresor-gratuit" }]);
  });

  it("n'accorde pas une mission désactivée par l'administration", async () => {
    const u = await createUser("mission-off");
    users.push(u);
    const today = new Date().toISOString().slice(0, 10);
    await asServer((c) => recordVisit(c, u, { placeId: "lyon-tete-d-or", requestedStatus: "declared", visitedOn: today, idempotencyKey: "cle-mission-02", position: null, note: null }, catalog));
    await pool.query(`update public.missions set active = false where id = 'tresor-gratuit'`);
    try {
      await expect(asServer((c) => claimMission(c, u, "tresor-gratuit", catalog))).rejects.toMatchObject({ status: 409 });
    } finally {
      await pool.query(`update public.missions set active = true where id = 'tresor-gratuit'`);
    }
  });
});

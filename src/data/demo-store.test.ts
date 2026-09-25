import { describe, expect, it } from "vitest";
import { catalog, idGenerator } from "@/test/fixtures";
import { DEMO_STORAGE_KEY, DemoStore, createMemoryStorage } from "./demo-store";

function makeStore(storage = createMemoryStorage()) {
  return new DemoStore({ catalog, storage, persistent: true, now: () => new Date("2026-10-03T10:00:00Z"), newId: idGenerator() });
}

describe("stockage de démonstration", () => {
  it("retrouve les données après un « rechargement » (nouvelle instance)", async () => {
    const storage = createMemoryStorage();
    const store = makeStore(storage);
    await store.togglePlaceInCollection("favoris", "lyon-fourviere");
    await store.declareVisit({ placeId: "lyon-fourviere", requestedStatus: "declared", visitedOn: "2026-10-03", idempotencyKey: "k1", position: null, note: "Superbe vue" });

    const reloaded = await makeStore(storage).load();
    expect(reloaded.collections[0]!.placeIds).toEqual(["lyon-fourviere"]);
    expect(reloaded.progression.visits).toHaveLength(1);
    expect(reloaded.progression.visits[0]!.note).toBe("Superbe vue");
    expect(reloaded.progression.parcels).toHaveLength(1);
  });

  it("ne crédite pas deux fois lors de deux clics simultanés", async () => {
    const store = makeStore();
    const request = { placeId: "lyon-fourviere", requestedStatus: "declared" as const, visitedOn: "2026-10-03", idempotencyKey: "same", position: null, note: null };
    const [a, b] = await Promise.all([store.declareVisit(request), store.declareVisit(request)]);
    expect([a.outcome.duplicate, b.outcome.duplicate].sort()).toEqual([false, true]);
    const state = await store.load();
    expect(state.progression.visits).toHaveLength(1);
    expect(state.progression.ledger.filter((e) => e.reason === "first_visit")).toHaveLength(1);
  });

  it("récupère proprement des données corrompues et le signale", async () => {
    const storage = createMemoryStorage();
    storage.setItem(DEMO_STORAGE_KEY, "{pas du json");
    const store = makeStore(storage);
    expect(store.status().notice).toMatch(/illisibles/);
    expect((await store.load()).progression.visits).toEqual([]);
    expect(storage.getItem(`${DEMO_STORAGE_KEY}:corrompu`)).toBe("{pas du json");
  });

  it("réinitialise toute la progression locale", async () => {
    const store = makeStore();
    await store.declareVisit({ placeId: "lyon-fourviere", requestedStatus: "declared", visitedOn: "2026-10-03", idempotencyKey: "k1", position: null, note: null });
    const reset = await store.reset();
    expect(reset.progression.visits).toEqual([]);
    expect(reset.collections.map((c) => c.id)).toEqual(["favoris"]);
  });

  it("valide les collections et les lieux", async () => {
    const store = makeStore();
    await expect(store.createCollection("   ")).rejects.toThrow(/invalide/);
    await expect(store.togglePlaceInCollection("favoris", "inconnu")).rejects.toThrow(/inconnu/);
    const state = await store.createCollection("Week-end à Lyon");
    expect(state.collections).toHaveLength(2);
  });

  it("signale un stockage non persistant", () => {
    const store = new DemoStore({ catalog, storage: createMemoryStorage(), persistent: false });
    expect(store.status().persistent).toBe(false);
    expect(store.status().storageLabel).toMatch(/perdue/);
  });
});

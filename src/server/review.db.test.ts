import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { asServer, createUser, deleteUsers, pool } from "@/test/db";
import { loadCatalogFromDb } from "./catalog";
import { PlaceUpdateError, updatePlace } from "./places-admin";
import { copyShare, createShare, getSharedExcursion } from "./shares";
import { moderateReview, ModerationError } from "./reviews";
import { blockUser, removeFriendship, requestFriend, respondFriend, socialOverview } from "./social";
import { adminAdjust, ProgressionError } from "./progression";

/**
 * Non-régression des constats de la revue finale indépendante (lecture seule).
 * Chaque test reproduit un scénario de défaillance décrit par la revue.
 */
let admin: string;
let alice: string;
let bob: string;
const users: string[] = [];

async function pseudonymOf(id: string) {
  return String((await pool.query(`select pseudonym from public.profiles where id = $1`, [id])).rows[0].pseudonym);
}

/** Transaction serveur toujours annulée : le catalogue partagé n'est jamais modifié. */
async function inRollback<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    return await fn(client);
  } finally {
    await client.query("rollback").catch(() => undefined);
    client.release();
  }
}

beforeAll(async () => {
  admin = await createUser("r-admin");
  alice = await createUser("r-alice");
  bob = await createUser("r-bob");
  users.push(admin, alice, bob);
  await pool.query(`insert into public.admins (user_id) values ($1)`, [admin]);
});
afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("administration du catalogue", () => {
  it("archiver un lieu d'un parcours médaille garde le catalogue chargeable", async () => {
    await inRollback(async (c) => {
      await updatePlace(c, admin, "lyon-fourviere", { status: "archived" });
      const { catalog } = await loadCatalogFromDb(c);
      expect(catalog.places.some((p) => p.id === "lyon-fourviere")).toBe(false);
      expect(catalog.destinations.find((d) => d.id === "lyon")!.medalRoute.placeIds).not.toContain("lyon-fourviere");
    });
  });

  it("une modification qui rendrait le catalogue incohérent est refusée (409), sans rien casser", async () => {
    await inRollback(async (c) => {
      await updatePlace(c, admin, "lyon-fourviere", { status: "archived" });
      await updatePlace(c, admin, "lyon-theatres-romains", { status: "draft" });
      // Le parcours de Lyon tomberait à 2 lieux (minimum 3).
      await expect(updatePlace(c, admin, "lyon-vieux-lyon", { status: "archived" })).rejects.toMatchObject({ status: 409 });
    });
    await expect(inRollback((c) => updatePlace(c, admin, "lieu-inexistant", { status: "draft" }))).rejects.toBeInstanceOf(PlaceUpdateError);
    // Le catalogue réel est intact.
    expect((await loadCatalogFromDb(pool)).catalog.places.some((p) => p.id === "lyon-fourviere")).toBe(true);
  });
});

describe("partage d'excursion", () => {
  it("ni les besoins, ni le budget, ni le groupe ne sont transmis ou recopiés", async () => {
    const prefs = {
      party: { kind: "family", size: 4 },
      budget: { amount: 25, basis: "per_person" },
      transport: "bike",
      interests: ["culture"],
      needs: { wheelchair: true, diets: ["halal"] },
      includeMeal: "auto",
    };
    const excursionId = (
      await pool.query(
        `insert into public.excursions (user_id, title, destination_id, date, start_time, duration_minutes, preferences, origin, steps)
         values ($1, 'Sortie privée', 'lyon', '2026-12-05', '10:00', 240, $2::jsonb, 'manual', '[{"id":"s1","placeId":"lyon-fourviere","visitMinutes":60,"note":null}]'::jsonb) returning id`,
        [alice, JSON.stringify(prefs)],
      )
    ).rows[0].id as string;
    const token = await asServer((c) => createShare(c, alice, excursionId, false));
    const shared = await getSharedExcursion(pool, token);
    expect(shared?.preferences).toEqual({ transport: "bike" });
    const copyId = await asServer((c) => copyShare(c, bob, token));
    const copy = (await pool.query(`select preferences from public.excursions where id = $1`, [copyId])).rows[0].preferences;
    expect(copy.transport).toBe("bike");
    expect(copy.needs).toEqual({ wheelchair: false, diets: [] });
    expect(copy.party.kind).not.toBe("family");
    expect(copy.budget.amount).not.toBe(25);
  });
});

describe("modération des avis", () => {
  it("une décision portant sur une version périmée de l'avis est refusée", async () => {
    const review = (
      await pool.query(`insert into public.reviews (user_id, place_id, rating, body) values ($1, 'lyon-vieux-lyon', 4, 'Un texte anodin et correct.') returning id, updated_at::text as version`, [alice])
    ).rows[0] as { id: string; version: string };
    // L'auteur remplace son texte après la lecture par l'administrateur.
    await pool.query(`update public.reviews set body = 'Un texte différent, jamais relu.' where id = $1`, [review.id]);
    await expect(asServer((c) => moderateReview(c, admin, review.id, { decision: "publish", reviewedVersion: review.version }))).rejects.toMatchObject({ status: 409 });
    expect((await pool.query(`select status from public.reviews where id = $1`, [review.id])).rows[0].status).toBe("pending");
    const fresh = String((await pool.query(`select updated_at::text as v from public.reviews where id = $1`, [review.id])).rows[0].v);
    await asServer((c) => moderateReview(c, admin, review.id, { decision: "publish", reviewedVersion: fresh }));
    expect((await pool.query(`select status from public.reviews where id = $1`, [review.id])).rows[0].status).toBe("published");
    await expect(asServer((c) => moderateReview(c, admin, "00000000-0000-4000-8000-000000000000", { decision: "reject", reviewedVersion: fresh }))).rejects.toBeInstanceOf(ModerationError);
  });
});

describe("amis et blocages", () => {
  it("le demandeur ne peut pas effacer un refus pour redemander en boucle", async () => {
    const bobPseudo = await pseudonymOf(bob);
    await asServer((c) => requestFriend(c, alice, bobPseudo));
    const id = String((await asServer((c) => socialOverview(c, bob))).incoming[0]!.id);
    await asServer((c) => respondFriend(c, bob, id, "decline"));
    await expect(asServer((c) => removeFriendship(c, alice, id))).rejects.toMatchObject({ status: 404 });
    // Nouvelle demande : toujours refusée tant que le refus existe.
    await expect(asServer((c) => requestFriend(c, alice, bobPseudo))).rejects.toMatchObject({ status: 409 });
    // La personne qui a refusé peut, elle, effacer le refus.
    await asServer((c) => removeFriendship(c, bob, id));
  });

  it("bloquer un pseudonyme inconnu répond comme un blocage réussi (pas d'énumération)", async () => {
    await expect(asServer((c) => blockUser(c, alice, "pseudo-qui-n-existe-pas"))).resolves.toBeUndefined();
  });
});

describe("corrections administratives", () => {
  it("un double envoi avec le même identifiant n'est appliqué qu'une fois", async () => {
    const adjustmentId = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
    await asServer((c) => adminAdjust(c, admin, bob, { kind: "xp", amount: 50, note: "Correction de test", adjustmentId }));
    await expect(asServer((c) => adminAdjust(c, admin, bob, { kind: "xp", amount: 50, note: "Correction de test", adjustmentId }))).rejects.toBeInstanceOf(ProgressionError);
    const total = (await pool.query(`select coalesce(sum(amount), 0)::int as t from public.xp_ledger where user_id = $1 and reason = 'admin_adjustment'`, [bob])).rows[0].t;
    expect(total).toBe(50);
  });

  it("deux retraits de points concurrents ne rendent jamais le solde négatif", async () => {
    await asServer((c) => adminAdjust(c, admin, alice, { kind: "points", amount: 10, note: "Crédit de test" }));
    const results = await Promise.allSettled([
      asServer((c) => adminAdjust(c, admin, alice, { kind: "points", amount: -10, note: "Retrait concurrent A" })),
      asServer((c) => adminAdjust(c, admin, alice, { kind: "points", amount: -10, note: "Retrait concurrent B" })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const balance = (await pool.query(`select coalesce(sum(amount), 0)::int as t from public.xp_ledger where user_id = $1 and kind = 'points'`, [alice])).rows[0].t;
    expect(balance).toBe(0);
  });
});

describe("données de référence", () => {
  it("missions et barème v1 sont fournis par une migration, pas seulement par le seed de démonstration", async () => {
    const applied = await pool.query(`select 1 from supabase_migrations.schema_migrations where version = '20260925000400'`);
    expect(applied.rowCount).toBe(1);
    expect((await pool.query(`select count(*)::int as n from public.missions`)).rows[0].n).toBeGreaterThanOrEqual(4);
    expect((await pool.query(`select 1 from public.progression_settings where version = 1`)).rowCount).toBe(1);
  });
});

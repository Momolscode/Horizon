import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServer, asUser, createUser, deleteUsers, pgErrorCode, pool } from "@/test/db";
import type { Catalog } from "@/modules/catalog/schema";
import { loadCatalogFromDb } from "./catalog";
import { adminAdjust, recordVisit } from "./progression";

/**
 * Tests de non-régression issus de la revue de sécurité indépendante.
 * Chacun reproduit un constat avant correction (migration 20260925000300_hardening.sql).
 */
let catalog: Catalog;
let alice: string;
let bob: string;
const users: string[] = [];

beforeAll(async () => {
  catalog = (await loadCatalogFromDb(pool)).catalog;
  alice = await createUser("h-alice");
  bob = await createUser("h-bob");
  users.push(alice, bob);
});
afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("fonctions internes non exposées", () => {
  it("anon et authenticated ne peuvent pas exécuter is_admin ni are_friends", async () => {
    for (const role of [null, alice] as const) {
      await asUser(role, async (c) => {
        expect(await pgErrorCode(c.query(`select public.is_admin($1)`, [bob]))).toBe("42501");
      });
      await asUser(role, async (c) => {
        expect(await pgErrorCode(c.query(`select public.are_friends($1, $2)`, [alice, bob]))).toBe("42501");
      });
    }
  });

  it("anon ne peut pas appeler friend_summaries ; un compte connecté oui", async () => {
    await asUser(null, async (c) => {
      expect(await pgErrorCode(c.query(`select * from public.friend_summaries()`))).toBe("42501");
    });
    await asUser(alice, async (c) => {
      expect((await c.query(`select * from public.friend_summaries()`)).rowCount).toBe(0);
    });
  });

  it("la requête de zone visible reste publique mais n'expose pas l'auteur des modifications", async () => {
    await asUser(null, async (c) => {
      const res = await c.query(`select * from public.places_in_view(4.80, 45.74, 4.86, 45.78, 10, null)`);
      expect(res.rowCount).toBeGreaterThan(0);
      expect(Object.keys(res.rows[0])).not.toContain("updated_by");
    });
    await asUser(null, async (c) => {
      expect(await pgErrorCode(c.query(`select updated_by from public.places limit 1`))).toBe("42501");
    });
  });
});

describe("identifiants d'utilisateurs non exposés", () => {
  it("les avis publiés ne révèlent pas l'identifiant de leur auteur ni du modérateur", async () => {
    await pool.query(`insert into public.reviews (user_id, place_id, rating, body, status) values ($1, 'lyon-fourviere', 5, 'Très beau panorama sur la ville.', 'published')`, [alice]);
    await asUser(null, async (c) => {
      expect(await pgErrorCode(c.query(`select user_id from public.reviews`))).toBe("42501");
    });
    await asUser(bob, async (c) => {
      const res = await c.query(`select * from public.reviews where user_id <> $1`, [bob]);
      expect(res.rowCount).toBe(0);
    });
    await asUser(null, async (c) => {
      const res = await c.query(`select * from public.published_reviews('lyon-fourviere')`);
      expect(res.rowCount).toBeGreaterThan(0);
      expect(Object.keys(res.rows[0])).not.toContain("user_id");
    });
  });
});

describe("privilèges par défaut resserrés", () => {
  it("aucun rôle client n'a TRUNCATE, TRIGGER ni écriture directe sur la progression", async () => {
    const res = await pool.query(
      `select r.rolname, t.tbl, p.priv
         from (values ('anon'), ('authenticated')) r(rolname)
         cross join (values ('xp_ledger'), ('visits'), ('parcels'), ('badges_awarded'), ('places'), ('profiles')) t(tbl)
         cross join (values ('TRUNCATE'), ('TRIGGER'), ('INSERT')) p(priv)
        where has_table_privilege(r.rolname, 'public.' || t.tbl, p.priv)
          and not (t.tbl = 'profiles' and p.priv = 'INSERT' and false)`,
    );
    expect(res.rows).toEqual([]);
  });

  it("un client ne peut pas imposer les dates de création d'une excursion ou d'un avis", async () => {
    await asUser(alice, async (c) => {
      const code = await pgErrorCode(
        c.query(
          `insert into public.excursions (title, destination_id, date, start_time, duration_minutes, preferences, origin, steps, created_at, updated_at)
           values ('Forgée', 'lyon', '2026-10-03', '10:00', 300, '{}'::jsonb, 'manual', '[]'::jsonb, '2020-01-01', '2020-01-01')`,
        ),
      );
      expect(code).toBe("42501");
    });
    await asUser(bob, async (c) => {
      const code = await pgErrorCode(c.query(`insert into public.reviews (place_id, rating, body, created_at) values ('lyon-vieux-lyon', 5, 'Avis daté du futur, forgé.', '9999-12-31')`));
      expect(code).toBe("42501");
    });
  });

  it("un client ne peut pas cibler un lieu non publié (oracle d'existence)", async () => {
    await pool.query(`update public.places set status = 'draft' where id = 'lyon-beaux-arts'`);
    try {
      const col = (await pool.query(`insert into public.collections (user_id, name) values ($1, 'Test brouillon') returning id`, [alice])).rows[0].id;
      await asUser(alice, async (c) => {
        expect(await pgErrorCode(c.query(`insert into public.collection_items (collection_id, place_id) values ($1, 'lyon-beaux-arts')`, [col]))).toBe("23514");
      });
    } finally {
      await pool.query(`update public.places set status = 'published' where id = 'lyon-beaux-arts'`);
    }
  });
});

describe("robustesse", () => {
  it("un administrateur ayant fait une correction peut supprimer son compte ; la trace reste", async () => {
    const admin = await createUser("h-admin");
    const target = await createUser("h-target");
    users.push(target);
    await pool.query(`insert into public.admins (user_id) values ($1)`, [admin]);
    await asServer((c) => adminAdjust(c, admin, target, { kind: "xp", amount: 10, note: "Correction de test" }));
    await deleteUsers([admin]);
    const trace = await pool.query(`select created_by from public.xp_ledger where user_id = $1 and reason = 'admin_adjustment'`, [target]);
    expect(trace.rows[0].created_by).toBe(admin);
  });

  it("plafonne le nombre de visites déclarées par jour et par compte", async () => {
    const u = await createUser("h-cap");
    users.push(u);
    const today = new Date().toISOString().slice(0, 10);
    const places = catalog.places.slice(0, 21);
    for (const [i, p] of places.slice(0, 20).entries()) {
      await asServer((c) => recordVisit(c, u, { placeId: p.id, requestedStatus: "declared", visitedOn: today, idempotencyKey: `cle-plafond-${i}`, position: null, note: null }, catalog));
    }
    await expect(
      asServer((c) => recordVisit(c, u, { placeId: places[20]!.id, requestedStatus: "declared", visitedOn: today, idempotencyKey: "cle-plafond-20", position: null, note: null }, catalog)),
    ).rejects.toMatchObject({ code: "daily_cap" });
  });
});

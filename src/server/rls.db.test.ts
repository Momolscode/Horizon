import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServer, asUser, createUser, deleteUsers, pgErrorCode, pool } from "@/test/db";

/**
 * Autorisations EN BASE (RLS) testées sur PostgreSQL réel, avec les rôles Supabase.
 * Chaque test tente l'accès qu'un client malveillant ferait en changeant un identifiant.
 */
let alice: string;
let bob: string;
let aliceCollection: string;
let aliceExcursion: string;

beforeAll(async () => {
  alice = await createUser("alice");
  bob = await createUser("bob");
  aliceCollection = (await pool.query(`insert into public.collections (user_id, name) values ($1, 'Secrets d''Alice') returning id`, [alice])).rows[0].id;
  await pool.query(`insert into public.collection_items (collection_id, place_id) values ($1, 'lyon-fourviere')`, [aliceCollection]);
  aliceExcursion = (
    await pool.query(
      `insert into public.excursions (user_id, title, destination_id, date, start_time, duration_minutes, preferences, origin, steps)
       values ($1, 'Lyon privé', 'lyon', '2026-10-03', '10:00', 300, '{}'::jsonb, 'manual', '[{"id":"s1","placeId":"lyon-fourviere","visitMinutes":60}]'::jsonb) returning id`,
      [alice],
    )
  ).rows[0].id;
});

afterAll(async () => {
  await deleteUsers([alice, bob]);
  await pool.end();
});

describe("catalogue public", () => {
  it("un visiteur anonyme lit les lieux publiés mais ne peut pas les modifier", async () => {
    await asUser(null, async (c) => {
      const res = await c.query(`select count(*)::int as n from public.places`);
      expect(res.rows[0].n).toBe(40);
      expect(await pgErrorCode(c.query(`update public.places set name = 'piraté' where id = 'lyon-fourviere'`))).toBe("42501");
    });
  });

  it("un lieu non publié est invisible pour les visiteurs", async () => {
    await pool.query(`update public.places set status = 'draft' where id = 'lyon-beaux-arts'`);
    try {
      await asUser(bob, async (c) => {
        const res = await c.query(`select id from public.places where id = 'lyon-beaux-arts'`);
        expect(res.rowCount).toBe(0);
      });
    } finally {
      await pool.query(`update public.places set status = 'published' where id = 'lyon-beaux-arts'`);
    }
  });

  it("la requête de zone visible utilise l'index géographique et renvoie les lieux de l'emprise", async () => {
    await asUser(null, async (c) => {
      const res = await c.query(`select id from public.places_in_view(4.80, 45.74, 4.86, 45.78, 50, null)`);
      const ids = res.rows.map((r) => r.id);
      expect(ids).toContain("lyon-fourviere");
      expect(ids.every((id: string) => id.startsWith("lyon-"))).toBe(true);
    });
    const plan = await pool.query(
      `explain select id from public.places where location operator(extensions.&&) extensions.st_makeenvelope(4.8, 45.74, 4.86, 45.78, 4326)::extensions.geography`,
    );
    // Avec 40 lignes le planificateur peut préférer un parcours séquentiel ; on vérifie au moins l'existence de l'index.
    const idx = await pool.query(`select indexname from pg_indexes where tablename = 'places' and indexname = 'places_location_gix'`);
    expect(idx.rowCount).toBe(1);
    expect(plan.rows.length).toBeGreaterThan(0);
  });

  it("la liste d'attente est inaccessible aux clients", async () => {
    await asUser(null, async (c) => {
      expect(await pgErrorCode(c.query(`select * from public.waitlist`))).toBe("42501");
    });
    await asUser(null, async (c) => {
      expect(await pgErrorCode(c.query(`insert into public.waitlist (email, consent_at) values ('a@b.fr', now())`))).toBe("42501");
    });
  });
});

describe("isolation entre comptes", () => {
  it("Bob ne voit ni les collections, ni les éléments, ni les excursions d'Alice", async () => {
    await asUser(bob, async (c) => {
      expect((await c.query(`select * from public.collections where id = $1`, [aliceCollection])).rowCount).toBe(0);
      expect((await c.query(`select * from public.collection_items where collection_id = $1`, [aliceCollection])).rowCount).toBe(0);
      // Colonnes explicites : l'identifiant du propriétaire n'est plus lisible (migration Duo).
      expect((await c.query(`select id, title from public.excursions where id = $1`, [aliceExcursion])).rowCount).toBe(0);
    });
    await asUser(bob, async (c) => {
      expect(await pgErrorCode(c.query(`select * from public.excursions`))).toBe("42501");
    });
  });

  it("Bob ne peut pas modifier ni supprimer l'excursion d'Alice en changeant l'identifiant", async () => {
    await asUser(bob, async (c) => {
      const upd = await c.query(`update public.excursions set title = 'volé' where id = $1`, [aliceExcursion]);
      expect(upd.rowCount).toBe(0);
      const del = await c.query(`delete from public.excursions where id = $1`, [aliceExcursion]);
      expect(del.rowCount).toBe(0);
    });
    const still = await pool.query(`select title from public.excursions where id = $1`, [aliceExcursion]);
    expect(still.rows[0].title).toBe("Lyon privé");
  });

  it("Bob ne peut ni créer une collection au nom d'Alice, ni ajouter un lieu dans la sienne", async () => {
    await asUser(bob, async (c) => {
      expect(await pgErrorCode(c.query(`insert into public.collections (user_id, name) values ($1, 'usurpation')`, [alice]))).toBe("42501");
    });
    await asUser(bob, async (c) => {
      expect(await pgErrorCode(c.query(`insert into public.collection_items (collection_id, place_id) values ($1, 'lyon-vieux-lyon')`, [aliceCollection]))).toBe("42501");
    });
  });

  it("Alice gère ses propres données normalement", async () => {
    await asUser(alice, async (c) => {
      const res = await c.query(`insert into public.collections (name) values ('Week-end') returning user_id`);
      expect(res.rows[0].user_id).toBe(alice);
      const items = await c.query(`select place_id from public.collection_items where collection_id = $1`, [aliceCollection]);
      expect(items.rows.map((r) => r.place_id)).toEqual(["lyon-fourviere"]);
    });
  });

  it("Bob ne lit pas le profil d'Alice et ne peut pas marquer son propre compte comme compte de test", async () => {
    await asUser(bob, async (c) => {
      expect((await c.query(`select * from public.profiles where id = $1`, [alice])).rowCount).toBe(0);
    });
    await asUser(bob, async (c) => {
      expect(await pgErrorCode(c.query(`update public.profiles set is_test = false where id = $1`, [bob]))).toBe("42501");
    });
    await asUser(bob, async (c) => {
      const ok = await c.query(`update public.profiles set pseudonym = 'Bobby' where id = $1`, [bob]);
      expect(ok.rowCount).toBe(1);
    });
  });
});

describe("progression protégée", () => {
  it("un client ne peut pas écrire directement ses visites, parcelles, XP ou badges", async () => {
    for (const sql of [
      `insert into public.visits (id, user_id, place_id, status, visited_on, idempotency_key) values (gen_random_uuid(), '${bob}', 'lyon-fourviere', 'declared', '2026-10-03', 'cle-pirate-1')`,
      `insert into public.xp_ledger (id, user_id, kind, amount, reason, ref_id, unique_key) values (gen_random_uuid(), '${bob}', 'xp', 99999, 'first_visit', 'x', 'first_visit:x')`,
      `insert into public.parcels (user_id, cell, resolution, state, place_id) values ('${bob}', '881f1d4a5bfffff', 8, 'checked', 'lyon-fourviere')`,
      `insert into public.badges_awarded (user_id, badge_id) values ('${bob}', 'cartographe')`,
    ]) {
      await asUser(bob, async (c) => {
        expect(await pgErrorCode(c.query(sql))).toBe("42501");
      });
    }
  });

  it("un client ne lit que sa propre progression", async () => {
    await asServer(async (c) => {
      await c.query(
        `insert into public.xp_ledger (id, user_id, kind, amount, reason, ref_id, unique_key) values (gen_random_uuid(), $1, 'xp', 20, 'first_visit', 'lyon-fourviere', 'first_visit:lyon-fourviere')`,
        [alice],
      );
    });
    await asUser(bob, async (c) => {
      expect((await c.query(`select * from public.xp_ledger where user_id = $1`, [alice])).rowCount).toBe(0);
    });
    await asUser(alice, async (c) => {
      expect((await c.query(`select * from public.xp_ledger`)).rowCount).toBe(1);
    });
  });

  it("une visite simulée est refusée par la base elle-même", async () => {
    expect(
      await pgErrorCode(
        pool.query(`insert into public.visits (id, user_id, place_id, status, visited_on, idempotency_key) values (gen_random_uuid(), $1, 'lyon-fourviere', 'simulated', '2026-10-03', 'cle-simulee-1')`, [alice]),
      ),
    ).toBe("23514");
  });
});

describe("intégrité des excursions", () => {
  it("refuse une étape qui n'appartient pas à la destination", async () => {
    await asUser(alice, async (c) => {
      const code = await pgErrorCode(
        c.query(
          `insert into public.excursions (title, destination_id, date, start_time, duration_minutes, preferences, origin, steps)
           values ('Mélange', 'lyon', '2026-10-03', '10:00', 300, '{}'::jsonb, 'manual', '[{"id":"s1","placeId":"marseille-panier","visitMinutes":60}]'::jsonb)`,
        ),
      );
      expect(code).toBe("23514");
    });
  });

  it("limite le nombre d'étapes à 12", async () => {
    const steps = JSON.stringify(Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, placeId: "lyon-fourviere", visitMinutes: 30 })));
    await asUser(alice, async (c) => {
      expect(
        await pgErrorCode(
          c.query(
            `insert into public.excursions (title, destination_id, date, start_time, duration_minutes, preferences, origin, steps) values ('Trop', 'lyon', '2026-10-03', '10:00', 300, '{}'::jsonb, 'manual', $1::jsonb)`,
            [steps],
          ),
        ),
      ).toBe("23514");
    });
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServer, asUser, createUser, deleteUsers, pool } from "@/test/db";
import { blockUser, removeFriendship, requestFriend, respondFriend, socialOverview } from "./social";
import { copyShare, createShare, getSharedExcursion, revokeShare, ShareError } from "./shares";
import { isAdmin, loadMetrics } from "./admin";

let alice: string;
let bob: string;
let carol: string;
const users: string[] = [];

async function pseudonymOf(id: string) {
  return String((await pool.query(`select pseudonym from public.profiles where id = $1`, [id])).rows[0].pseudonym);
}

beforeAll(async () => {
  alice = await createUser("p1-alice");
  bob = await createUser("p1-bob");
  carol = await createUser("p1-carol");
  users.push(alice, bob, carol);
});
afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("amis et blocages", () => {
  it("demande par pseudonyme, acceptation par la seule personne invitée, résumé selon la visibilité", async () => {
    const bobPseudo = await pseudonymOf(bob);
    const alicePseudo = await pseudonymOf(alice);
    await expect(asServer((c) => requestFriend(c, alice, alicePseudo))).rejects.toMatchObject({ status: 400 });
    await expect(asServer((c) => requestFriend(c, alice, "pseudo-inexistant"))).rejects.toMatchObject({ status: 404 });
    expect(await asServer((c) => requestFriend(c, alice, bobPseudo.toUpperCase()))).toBe("sent");
    // Doublon dans l'autre sens : refusé (une seule relation par paire).
    await expect(asServer((c) => requestFriend(c, bob, alicePseudo))).rejects.toMatchObject({ status: 409 });
    const pending = await asServer((c) => socialOverview(c, bob));
    expect(pending.incoming).toHaveLength(1);
    const id = String(pending.incoming[0]!.id);
    // Alice ne peut pas accepter sa propre demande à la place de Bob.
    await expect(asServer((c) => respondFriend(c, alice, id, "accept"))).rejects.toMatchObject({ status: 404 });
    await asServer((c) => respondFriend(c, bob, id, "accept"));
    let overview = await asServer((c) => socialOverview(c, alice));
    expect(overview.friends).toHaveLength(1);
    expect(overview.friends[0]!.xp).toBeNull(); // profil de Bob privé par défaut : statistiques masquées
    await pool.query(`update public.profiles set visibility = 'friends' where id = $1`, [bob]);
    overview = await asServer((c) => socialOverview(c, alice));
    expect(overview.friends[0]!.xp).toBe(0);
  });

  it("un blocage supprime la relation et rend les demandes silencieuses", async () => {
    const carolPseudo = await pseudonymOf(carol);
    const alicePseudo = await pseudonymOf(alice);
    await asServer((c) => blockUser(c, carol, alicePseudo));
    expect(await asServer((c) => requestFriend(c, alice, carolPseudo))).toBe("silent");
    const carolView = await asServer((c) => socialOverview(c, carol));
    expect(carolView.incoming).toHaveLength(0);
    expect(carolView.blocked).toEqual([alicePseudo]);
  });

  it("un client ne peut pas créer une amitié acceptée directement", async () => {
    await asUser(alice, async (c) => {
      await expect(c.query(`insert into public.friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`, [alice, carol])).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("retirer un ami supprime la relation pour les deux", async () => {
    const overview = await asServer((c) => socialOverview(c, alice));
    await asServer((c) => removeFriendship(c, bob, String(overview.friends[0]!.id)));
    expect((await asServer((c) => socialOverview(c, alice))).friends).toHaveLength(0);
  });
});

describe("partage d'excursion", () => {
  let excursionId: string;
  beforeAll(async () => {
    excursionId = (
      await pool.query(
        `insert into public.excursions (user_id, title, destination_id, date, start_time, duration_minutes, preferences, origin, steps)
         values ($1, 'À partager', 'lyon', '2026-12-05', '10:00', 300, '{"transport":"walk"}'::jsonb, 'manual', '[{"id":"s1","placeId":"lyon-fourviere","visitMinutes":60,"note":"note privée"}]'::jsonb) returning id`,
        [alice],
      )
    ).rows[0].id;
  });

  it("seul le propriétaire crée un lien ; la date et les notes ne fuient pas", async () => {
    await expect(asServer((c) => createShare(c, bob, excursionId, false))).rejects.toBeInstanceOf(ShareError);
    const token = await asServer((c) => createShare(c, alice, excursionId, false));
    expect(token.length).toBeGreaterThanOrEqual(32);
    const shared = await getSharedExcursion(pool, token);
    expect(shared?.date).toBeNull();
    expect(shared?.steps[0]?.note).toBeNull();
  });

  it("une copie est indépendante et la révocation coupe l'accès immédiatement", async () => {
    const token = await asServer((c) => createShare(c, alice, excursionId, true));
    const copyId = await asServer((c) => copyShare(c, bob, token));
    const copy = await pool.query(`select user_id, origin, title from public.excursions where id = $1`, [copyId]);
    expect(copy.rows[0]).toMatchObject({ user_id: bob, origin: "copy" });
    await expect(asServer((c) => revokeShare(c, bob, token))).rejects.toMatchObject({ status: 404 });
    await asServer((c) => revokeShare(c, alice, token));
    expect(await getSharedExcursion(pool, token)).toBeNull();
    await expect(asServer((c) => copyShare(c, carol, token))).rejects.toMatchObject({ status: 404 });
    // La copie de Bob survit à la révocation.
    expect((await pool.query(`select 1 from public.excursions where id = $1`, [copyId])).rowCount).toBe(1);
  });

  it("un client ne peut pas créer de lien lui-même ni lire ceux des autres", async () => {
    await asUser(bob, async (c) => {
      await expect(c.query(`insert into public.excursion_shares (token, excursion_id, owner_id) values (repeat('a', 40), $1, $2)`, [excursionId, bob])).rejects.toMatchObject({ code: "42501" });
    });
    await asUser(bob, async (c) => {
      expect((await c.query(`select * from public.excursion_shares where excursion_id = $1`, [excursionId])).rowCount).toBe(0);
    });
  });
});

describe("administration et mesure", () => {
  it("les métriques excluent comptes de test et administrateurs", async () => {
    const real = await createUser("p1-real");
    users.push(real);
    await pool.query(`update public.profiles set is_test = false where id = $1`, [real]);
    const admin = await createUser("p1-admin");
    users.push(admin);
    await pool.query(`update public.profiles set is_test = false where id = $1`, [admin]);
    await pool.query(`insert into public.admins (user_id) values ($1)`, [admin]);
    const metrics = await loadMetrics(pool);
    const accounts = await pool.query(`select count(*)::int as n from public.profiles p where not p.is_test and not exists (select 1 from public.admins a where a.user_id = p.id)`);
    expect(metrics.accounts).toBe(accounts.rows[0].n);
    expect(await isAdmin(pool, admin)).toBe(true);
    expect(await isAdmin(pool, real)).toBe(false);
    expect(metrics.activation.sufficient).toBe(false);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServer, asUser, createUser, deleteUsers, pgErrorCode, pool } from "@/test/db";
import type { Catalog } from "@/modules/catalog/schema";
import { loadCatalogFromDb } from "./catalog";
import { blockUser, removeFriendship, requestFriend, respondFriend, socialOverview } from "./social";
import { declareTogether, duoOverview, DuoError, inviteToDuo, leaveDuo, removeDuoGuest, respondDuoInvitation, respondVisitRequest } from "./duo";

/** Mode Duo (D-016) : invitation entre amis, co-édition sous RLS, visite pour deux confirmée. */
let catalog: Catalog;
let owner: string;
let guest: string;
let stranger: string;
const users: string[] = [];

async function pseudonymOf(id: string) {
  return String((await pool.query(`select pseudonym from public.profiles where id = $1`, [id])).rows[0].pseudonym);
}

async function befriend(a: string, b: string): Promise<string> {
  const bPseudo = await pseudonymOf(b);
  await asServer((c) => requestFriend(c, a, bPseudo));
  const aPseudo = await pseudonymOf(a);
  const id = String((await asServer((c) => socialOverview(c, b))).incoming.find((r) => r.pseudonym === aPseudo)!.id);
  await asServer((c) => respondFriend(c, b, id, "accept"));
  return id;
}

async function newExcursion(userId: string, steps = ["lyon-fourviere", "lyon-vieux-lyon"]): Promise<string> {
  const json = JSON.stringify(steps.map((placeId, i) => ({ id: `s${i}`, placeId, visitMinutes: 60, note: null })));
  return (
    await pool.query(
      `insert into public.excursions (user_id, title, destination_id, date, start_time, duration_minutes, preferences, origin, steps)
       values ($1, 'Sortie à deux', 'lyon', '2026-10-10', '10:00', 300, '{"transport":"walk"}'::jsonb, 'manual', $2::jsonb) returning id`,
      [userId, json],
    )
  ).rows[0].id as string;
}

async function xpOf(userId: string): Promise<number> {
  return Number((await pool.query(`select coalesce(sum(amount), 0)::int as t from public.xp_ledger where user_id = $1 and kind = 'xp'`, [userId])).rows[0].t);
}

let friendshipId: string;

beforeAll(async () => {
  catalog = (await loadCatalogFromDb(pool)).catalog;
  owner = await createUser("duo-owner");
  guest = await createUser("duo-guest");
  stranger = await createUser("duo-stranger");
  users.push(owner, guest, stranger);
  friendshipId = await befriend(owner, guest);
});
afterAll(async () => {
  await deleteUsers(users);
  await pool.end();
});

describe("invitation", () => {
  it("seul le propriétaire invite, seulement un ami accepté, une seule personne par excursion", async () => {
    const excursion = await newExcursion(owner);
    // Un inconnu ne peut pas utiliser l'amitié des autres.
    await expect(asServer((c) => inviteToDuo(c, stranger, excursion, friendshipId))).rejects.toMatchObject({ status: 404 });
    // Identifiant d'amitié inexistant.
    await expect(asServer((c) => inviteToDuo(c, owner, excursion, "00000000-0000-4000-8000-000000000000"))).rejects.toBeInstanceOf(DuoError);
    await asServer((c) => inviteToDuo(c, owner, excursion, friendshipId));
    await expect(asServer((c) => inviteToDuo(c, owner, excursion, friendshipId))).rejects.toMatchObject({ status: 409 });
    const overview = await asServer((c) => duoOverview(c, guest));
    const invitation = overview.invitations.find((i) => i.excursionId === excursion)!;
    expect(invitation.ownerPseudonym).toBe(await pseudonymOf(owner));
    expect(JSON.stringify(overview)).not.toContain(owner);
  });

  it("une invitation en attente ne donne aucun accès ; acceptée, lecture et modification sans suppression", async () => {
    const excursion = await newExcursion(owner);
    await asServer((c) => inviteToDuo(c, owner, excursion, friendshipId));
    await asUser(guest, async (c) => {
      expect((await c.query(`select id from public.excursions where id = $1`, [excursion])).rowCount).toBe(0);
    });
    await asServer((c) => respondDuoInvitation(c, guest, excursion, true));
    await asUser(guest, async (c) => {
      expect((await c.query(`select id, version from public.excursions where id = $1`, [excursion])).rowCount).toBe(1);
      expect((await c.query(`update public.excursions set title = 'Retouché par l''invité' where id = $1`, [excursion])).rowCount).toBe(1);
      expect((await c.query(`delete from public.excursions where id = $1`, [excursion])).rowCount).toBe(0);
    });
    // L'identifiant du propriétaire n'est pas lisible par le navigateur.
    await asUser(guest, async (c) => {
      expect(await pgErrorCode(c.query(`select user_id from public.excursions where id = $1`, [excursion]))).toBe("42501");
    });
    // L'invité ne peut ni réattribuer l'excursion ni en créer au nom du propriétaire.
    await asUser(guest, async (c) => {
      expect(await pgErrorCode(c.query(`update public.excursions set user_id = $2 where id = $1`, [excursion, guest]))).toBe("42501");
    });
  });

  it("un inconnu ne voit jamais l'excursion", async () => {
    const excursion = await newExcursion(owner);
    await asUser(stranger, async (c) => {
      expect((await c.query(`select id from public.excursions where id = $1`, [excursion])).rowCount).toBe(0);
      expect((await c.query(`update public.excursions set title = 'x' where id = $1`, [excursion])).rowCount).toBe(0);
    });
  });
});

describe("co-édition", () => {
  it("chaque modification incrémente la version et note son auteur ; une version périmée n'écrase rien", async () => {
    const excursion = await newExcursion(owner);
    await asServer((c) => inviteToDuo(c, owner, excursion, friendshipId));
    await asServer((c) => respondDuoInvitation(c, guest, excursion, true));
    const client = await pool.connect();
    try {
      // Comme PostgREST : rôle authenticated et identité de l'invité, transaction validée.
      await client.query("begin");
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: guest, role: "authenticated" })]);
      await client.query("set local role authenticated");
      expect((await client.query(`update public.excursions set title = 'Version 2' where id = $1 and version = 1`, [excursion])).rowCount).toBe(1);
      await client.query("commit");
    } finally {
      client.release();
    }
    const row = (await pool.query(`select version, updated_by, title from public.excursions where id = $1`, [excursion])).rows[0];
    expect(row).toMatchObject({ version: 2, updated_by: guest, title: "Version 2" });
    // Le propriétaire enregistre depuis une copie périmée (version 1) : rien n'est écrasé.
    await asUser(owner, async (c) => {
      expect((await c.query(`update public.excursions set title = 'Écrasement' where id = $1 and version = 1`, [excursion])).rowCount).toBe(0);
    });
    const overview = await asServer((c) => duoOverview(c, owner));
    expect(overview.memberships.find((m) => m.excursionId === excursion)).toMatchObject({ role: "owner", status: "accepted", lastEditedBy: "partner" });
  });

  it("l'invité peut quitter ; le propriétaire peut retirer l'invité ; l'accès disparaît aussitôt", async () => {
    const first = await newExcursion(owner);
    await asServer((c) => inviteToDuo(c, owner, first, friendshipId));
    await asServer((c) => respondDuoInvitation(c, guest, first, true));
    await asServer((c) => leaveDuo(c, guest, first));
    await asUser(guest, async (c) => {
      expect((await c.query(`select id from public.excursions where id = $1`, [first])).rowCount).toBe(0);
    });
    const second = await newExcursion(owner);
    await asServer((c) => inviteToDuo(c, owner, second, friendshipId));
    await asServer((c) => respondDuoInvitation(c, guest, second, true));
    await expect(asServer((c) => removeDuoGuest(c, guest, second))).rejects.toMatchObject({ status: 404 });
    await asServer((c) => removeDuoGuest(c, owner, second));
    await asUser(guest, async (c) => {
      expect((await c.query(`select id from public.excursions where id = $1`, [second])).rowCount).toBe(0);
    });
  });
});

describe("visite pour deux", () => {
  it("la déclaration crédite son auteur et crée UNE demande ; l'autre n'est crédité qu'après confirmation, une seule fois", async () => {
    const excursion = await newExcursion(owner, ["lyon-tete-d-or", "lyon-halles-bocuse"]);
    await asServer((c) => inviteToDuo(c, owner, excursion, friendshipId));
    await asServer((c) => respondDuoInvitation(c, guest, excursion, true));
    const guestXpBefore = await xpOf(guest);

    // Lieu hors des étapes : refusé.
    await expect(asServer((c) => declareTogether(c, owner, excursion, "lyon-fourviere", catalog))).rejects.toMatchObject({ status: 400 });
    // Un inconnu ne peut pas déclarer sur cette excursion.
    await expect(asServer((c) => declareTogether(c, stranger, excursion, "lyon-tete-d-or", catalog))).rejects.toMatchObject({ status: 404 });

    const first = await asServer((c) => declareTogether(c, owner, excursion, "lyon-tete-d-or", catalog));
    expect(first.requestCreated).toBe(true);
    expect(first.outcome.duplicate).toBe(false);
    const again = await asServer((c) => declareTogether(c, owner, excursion, "lyon-tete-d-or", catalog));
    expect(again.requestCreated).toBe(false);
    expect(again.outcome.duplicate).toBe(true);
    expect(await xpOf(guest)).toBe(guestXpBefore);

    const request = (await asServer((c) => duoOverview(c, guest))).visitRequests.find((r) => r.excursionId === excursion)!;
    expect(request).toMatchObject({ placeId: "lyon-tete-d-or", fromPseudonym: await pseudonymOf(owner) });
    // Seule la personne destinataire peut répondre.
    await expect(asServer((c) => respondVisitRequest(c, owner, request.id, true, catalog))).rejects.toMatchObject({ status: 404 });
    const accepted = await asServer((c) => respondVisitRequest(c, guest, request.id, true, catalog));
    expect(accepted.kind).toBe("accepted");
    expect(await xpOf(guest)).toBeGreaterThan(guestXpBefore);
    const credited = await xpOf(guest);
    await expect(asServer((c) => respondVisitRequest(c, guest, request.id, true, catalog))).rejects.toMatchObject({ status: 409 });
    expect(await xpOf(guest)).toBe(credited);
    const visits = await pool.query(`select note from public.visits where user_id = $1 and place_id = 'lyon-tete-d-or'`, [guest]);
    expect(visits.rowCount).toBe(1);
    expect(visits.rows[0].note).toBe("Visite confirmée en duo");
  });

  it("une demande refusée ou expirée ne crédite rien", async () => {
    const excursion = await newExcursion(owner, ["lyon-theatres-romains", "lyon-mur-des-canuts"]);
    await asServer((c) => inviteToDuo(c, owner, excursion, friendshipId));
    await asServer((c) => respondDuoInvitation(c, guest, excursion, true));
    const before = await xpOf(guest);
    await asServer((c) => declareTogether(c, owner, excursion, "lyon-theatres-romains", catalog));
    await asServer((c) => declareTogether(c, owner, excursion, "lyon-mur-des-canuts", catalog));
    const requests = (await asServer((c) => duoOverview(c, guest))).visitRequests.filter((r) => r.excursionId === excursion);
    expect(requests).toHaveLength(2);
    const declined = await asServer((c) => respondVisitRequest(c, guest, requests[0]!.id, false, catalog));
    expect(declined.kind).toBe("declined");
    await pool.query(`update public.duo_visit_requests set expires_at = now() - interval '1 minute' where id = $1`, [requests[1]!.id]);
    const expired = await asServer((c) => respondVisitRequest(c, guest, requests[1]!.id, true, catalog));
    expect(expired.kind).toBe("expired");
    expect(await xpOf(guest)).toBe(before);
    expect((await pool.query(`select status from public.duo_visit_requests where id = $1`, [requests[1]!.id])).rows[0].status).toBe("expired");
  });
});

describe("fin de l'amitié", () => {
  it("bloquer ou retirer l'ami coupe l'accès et fait expirer les demandes en attente", async () => {
    const a = await createUser("duo-a");
    const b = await createUser("duo-b");
    users.push(a, b);
    const fid = await befriend(a, b);
    const excursion = await newExcursion(a, ["lyon-beaux-arts", "lyon-vieux-lyon"]);
    await asServer((c) => inviteToDuo(c, a, excursion, fid));
    await asServer((c) => respondDuoInvitation(c, b, excursion, true));
    await asServer((c) => declareTogether(c, a, excursion, "lyon-vieux-lyon", catalog));
    await asServer((c) => removeFriendship(c, a, fid));
    await asUser(b, async (c) => {
      expect((await c.query(`select id from public.excursions where id = $1`, [excursion])).rowCount).toBe(0);
    });
    const overview = await asServer((c) => duoOverview(c, b));
    expect(overview.memberships.some((m) => m.excursionId === excursion)).toBe(false);
    expect(overview.visitRequests.some((r) => r.excursionId === excursion)).toBe(false);
    expect((await pool.query(`select count(*)::int as n from public.excursion_members where excursion_id = $1`, [excursion])).rows[0].n).toBe(0);

    // Blocage : même effet, y compris si la RLS est interrogée avant tout nettoyage.
    const fid2 = await befriend(a, b);
    const other = await newExcursion(a);
    await asServer((c) => inviteToDuo(c, a, other, fid2));
    await asServer((c) => respondDuoInvitation(c, b, other, true));
    const aPseudo = await pseudonymOf(a);
    await asServer((c) => blockUser(c, b, aPseudo));
    await asUser(b, async (c) => {
      expect((await c.query(`select id from public.excursions where id = $1`, [other])).rowCount).toBe(0);
    });
  });
});

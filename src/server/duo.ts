import "server-only";
import type { PoolClient } from "pg";
import type { Catalog } from "@/modules/catalog/schema";
import type { ExcursionStep } from "@/modules/excursions/types";
import type { ProgressionSnapshot, VisitOutcome } from "@/modules/progression/engine";
import { todayIn } from "@/modules/shared/time";
import { recordVisit } from "./progression";

/**
 * Mode Duo (docs/DECISIONS.md D-016). Toutes les opérations passent par ces fonctions,
 * appelées dans une transaction serveur ; le navigateur n'a aucun droit sur les tables Duo.
 */
export class DuoError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 410,
  ) {
    super(message);
  }
}

/** Deux comptes sont « partenaires possibles » : amitié acceptée et aucun blocage. */
const ACTIVE_PAIR = (a: string, b: string) => `
  exists (select 1 from public.friendships f
           where f.status = 'accepted'
             and least(f.requester_id, f.addressee_id) = least(${a}, ${b})
             and greatest(f.requester_id, f.addressee_id) = greatest(${a}, ${b}))
  and not exists (select 1 from public.blocks bl
                   where (bl.blocker_id = ${a} and bl.blocked_id = ${b}) or (bl.blocker_id = ${b} and bl.blocked_id = ${a}))`;

/** Le propriétaire invite un ami déjà accepté (désigné par l'identifiant de leur amitié). */
export async function inviteToDuo(c: PoolClient, ownerId: string, excursionId: string, friendshipId: string): Promise<void> {
  const excursion = await c.query(`select user_id from public.excursions where id = $1 for update`, [excursionId]);
  if (!excursion.rowCount || excursion.rows[0].user_id !== ownerId) throw new DuoError("Excursion introuvable.", 404);
  const friendship = await c.query(
    `select case when requester_id = $2 then addressee_id else requester_id end as guest_id
       from public.friendships where id = $1 and status = 'accepted' and $2 in (requester_id, addressee_id)`,
    [friendshipId, ownerId],
  );
  if (!friendship.rowCount) throw new DuoError("Ami introuvable.", 404);
  const guestId = String(friendship.rows[0].guest_id);
  const active = await c.query(`select ${ACTIVE_PAIR("$1::uuid", "$2::uuid")} as ok`, [ownerId, guestId]);
  if (!active.rows[0].ok) throw new DuoError("Ami introuvable.", 404);
  const inserted = await c.query(
    `insert into public.excursion_members (excursion_id, guest_id) values ($1, $2) on conflict (excursion_id) do nothing returning excursion_id`,
    [excursionId, guestId],
  );
  if (!inserted.rowCount) throw new DuoError("Cette excursion a déjà une personne invitée.", 409);
}

export async function respondDuoInvitation(c: PoolClient, guestId: string, excursionId: string, accept: boolean): Promise<void> {
  const res = accept
    ? await c.query(
        `update public.excursion_members set status = 'accepted', responded_at = now()
          where excursion_id = $1 and guest_id = $2 and status = 'pending' returning excursion_id`,
        [excursionId, guestId],
      )
    : await c.query(`delete from public.excursion_members where excursion_id = $1 and guest_id = $2 and status = 'pending' returning excursion_id`, [excursionId, guestId]);
  if (!res.rowCount) throw new DuoError("Invitation introuvable.", 404);
}

async function expirePendingRequests(c: PoolClient, excursionId: string) {
  await c.query(`update public.duo_visit_requests set status = 'expired', responded_at = now() where excursion_id = $1 and status = 'pending'`, [excursionId]);
}

/** La personne invitée quitte l'excursion (elle n'en garde aucune copie). */
export async function leaveDuo(c: PoolClient, guestId: string, excursionId: string): Promise<void> {
  const res = await c.query(`delete from public.excursion_members where excursion_id = $1 and guest_id = $2 returning excursion_id`, [excursionId, guestId]);
  if (!res.rowCount) throw new DuoError("Excursion Duo introuvable.", 404);
  await expirePendingRequests(c, excursionId);
}

/** Le propriétaire retire la personne invitée (ou annule l'invitation). */
export async function removeDuoGuest(c: PoolClient, ownerId: string, excursionId: string): Promise<void> {
  const res = await c.query(
    `delete from public.excursion_members m using public.excursions e
      where m.excursion_id = e.id and e.id = $1 and e.user_id = $2 returning m.excursion_id`,
    [excursionId, ownerId],
  );
  if (!res.rowCount) throw new DuoError("Excursion Duo introuvable.", 404);
  await expirePendingRequests(c, excursionId);
}

/** Nettoyage quand deux comptes cessent d'être amis ou que l'un bloque l'autre. */
export async function endDuosBetween(c: PoolClient, a: string, b: string): Promise<void> {
  await c.query(
    `delete from public.excursion_members m using public.excursions e
      where m.excursion_id = e.id and ((e.user_id = $1 and m.guest_id = $2) or (e.user_id = $2 and m.guest_id = $1))`,
    [a, b],
  );
  await c.query(
    `update public.duo_visit_requests set status = 'expired', responded_at = now()
      where status = 'pending' and ((from_user = $1 and to_user = $2) or (from_user = $2 and to_user = $1))`,
    [a, b],
  );
}

export type DuoOverview = {
  invitations: Array<{ excursionId: string; title: string; destinationId: string; date: string; ownerPseudonym: string; createdAt: string }>;
  memberships: Array<{ excursionId: string; role: "owner" | "guest"; status: "pending" | "accepted"; partnerPseudonym: string; lastEditedBy: "me" | "partner" | null; updatedAt: string }>;
  visitRequests: Array<{ id: string; excursionId: string; excursionTitle: string; placeId: string; visitedOn: string; fromPseudonym: string; expiresAt: string }>;
  sentRequests: Array<{ excursionId: string; placeId: string; status: "pending" | "accepted" | "declined" | "expired" }>;
};

/** Vue Duo d'un compte. Ne renvoie jamais d'identifiant de compte, seulement des pseudonymes. */
export async function duoOverview(c: PoolClient, userId: string): Promise<DuoOverview> {
  const [invitations, memberships, visitRequests, sentRequests] = await Promise.all([
    c.query(
      `select m.excursion_id, e.title, e.destination_id, e.date::text as date, p.pseudonym, m.created_at
         from public.excursion_members m
         join public.excursions e on e.id = m.excursion_id
         join public.profiles p on p.id = e.user_id
        where m.guest_id = $1 and m.status = 'pending' and ${ACTIVE_PAIR("e.user_id", "m.guest_id")}
        order by m.created_at`,
      [userId],
    ),
    c.query(
      `select e.id as excursion_id, 'owner' as role, m.status, p.pseudonym, e.updated_at,
              case when e.updated_by = $1 then 'me' when e.updated_by = m.guest_id then 'partner' end as last_edited_by
         from public.excursions e
         join public.excursion_members m on m.excursion_id = e.id
         join public.profiles p on p.id = m.guest_id
        where e.user_id = $1 and ${ACTIVE_PAIR("e.user_id", "m.guest_id")}
       union all
       select e.id, 'guest', m.status, p.pseudonym, e.updated_at,
              case when e.updated_by = $1 then 'me' when e.updated_by = e.user_id then 'partner' end
         from public.excursion_members m
         join public.excursions e on e.id = m.excursion_id
         join public.profiles p on p.id = e.user_id
        where m.guest_id = $1 and m.status = 'accepted' and ${ACTIVE_PAIR("e.user_id", "m.guest_id")}`,
      [userId],
    ),
    c.query(
      `select r.id, r.excursion_id, e.title, r.place_id, r.visited_on::text as visited_on, p.pseudonym, r.expires_at
         from public.duo_visit_requests r
         join public.excursions e on e.id = r.excursion_id
         join public.profiles p on p.id = r.from_user
        where r.to_user = $1 and r.status = 'pending' and r.expires_at > now()
        order by r.created_at`,
      [userId],
    ),
    c.query(
      `select excursion_id, place_id, case when status = 'pending' and expires_at <= now() then 'expired' else status end as status
         from public.duo_visit_requests where from_user = $1`,
      [userId],
    ),
  ]);
  return {
    invitations: invitations.rows.map((r) => ({
      excursionId: String(r.excursion_id),
      title: String(r.title),
      destinationId: String(r.destination_id),
      date: String(r.date),
      ownerPseudonym: String(r.pseudonym),
      createdAt: new Date(r.created_at).toISOString(),
    })),
    memberships: memberships.rows.map((r) => ({
      excursionId: String(r.excursion_id),
      role: r.role as "owner" | "guest",
      status: r.status as "pending" | "accepted",
      partnerPseudonym: String(r.pseudonym),
      lastEditedBy: (r.last_edited_by as "me" | "partner" | null) ?? null,
      updatedAt: new Date(r.updated_at).toISOString(),
    })),
    visitRequests: visitRequests.rows.map((r) => ({
      id: String(r.id),
      excursionId: String(r.excursion_id),
      excursionTitle: String(r.title),
      placeId: String(r.place_id),
      visitedOn: String(r.visited_on),
      fromPseudonym: String(r.pseudonym),
      expiresAt: new Date(r.expires_at).toISOString(),
    })),
    sentRequests: sentRequests.rows.map((r) => ({ excursionId: String(r.excursion_id), placeId: String(r.place_id), status: r.status })),
  };
}

type VisitResult = { outcome: VisitOutcome; snapshot: ProgressionSnapshot };

/**
 * « Nous y étions » : enregistre la visite de la personne qui déclare (règles habituelles)
 * et crée, pour l'autre, une demande à confirmer sous 7 jours. Rien n'est crédité à l'autre ici.
 */
export async function declareTogether(
  c: PoolClient,
  userId: string,
  excursionId: string,
  placeId: string,
  catalog: Catalog,
  now: Date = new Date(),
): Promise<VisitResult & { requestCreated: boolean }> {
  const duo = await c.query(
    `select e.user_id, m.guest_id, e.steps, e.destination_id
       from public.excursions e join public.excursion_members m on m.excursion_id = e.id
      where e.id = $1 and m.status = 'accepted' and $2 in (e.user_id, m.guest_id) and ${ACTIVE_PAIR("e.user_id", "m.guest_id")}`,
    [excursionId, userId],
  );
  if (!duo.rowCount) throw new DuoError("Excursion Duo introuvable.", 404);
  const row = duo.rows[0];
  const steps = (row.steps ?? []) as ExcursionStep[];
  if (!steps.some((s) => s.placeId === placeId)) throw new DuoError("Ce lieu n'est pas une étape de l'excursion.", 400);
  const destination = catalog.destinations.find((d) => d.id === row.destination_id);
  if (!destination) throw new DuoError("Destination inconnue.", 400);
  const partnerId = String(row.user_id === userId ? row.guest_id : row.user_id);
  const visitedOn = todayIn(destination.timezone, now);
  const result = await recordVisit(
    c,
    userId,
    { placeId, requestedStatus: "declared", visitedOn, idempotencyKey: `duo:${excursionId}:${placeId}`, position: null, note: "Visite déclarée en duo" },
    catalog,
    now,
  );
  const created = await c.query(
    `insert into public.duo_visit_requests (excursion_id, place_id, from_user, to_user, visited_on)
     values ($1, $2, $3, $4, $5) on conflict (excursion_id, place_id, to_user) do nothing returning id`,
    [excursionId, placeId, userId, partnerId, visitedOn],
  );
  return { ...result, requestCreated: Boolean(created.rowCount) };
}

export type RequestResponse = { kind: "accepted"; outcome: VisitOutcome; snapshot: ProgressionSnapshot } | { kind: "declined" } | { kind: "expired" };

/**
 * Réponse de l'autre personne. Acceptée : SA visite déclarée est créée par le serveur,
 * avec les règles habituelles (plafond, une récompense par lieu, idempotence).
 * Une demande expirée ou devenue sans objet (plus amis) est marquée expirée, sans crédit.
 */
export async function respondVisitRequest(c: PoolClient, userId: string, requestId: string, accept: boolean, catalog: Catalog, now: Date = new Date()): Promise<RequestResponse> {
  const res = await c.query(
    `select id, from_user, place_id, visited_on::text as visited_on, status, expires_at
       from public.duo_visit_requests where id = $1 and to_user = $2 for update`,
    [requestId, userId],
  );
  if (!res.rowCount) throw new DuoError("Demande introuvable.", 404);
  const r = res.rows[0];
  if (r.status !== "pending") throw new DuoError("Demande déjà traitée.", 409);
  const stillFriends = (await c.query(`select ${ACTIVE_PAIR("$1::uuid", "$2::uuid")} as ok`, [String(r.from_user), userId])).rows[0].ok;
  if (new Date(r.expires_at).getTime() <= now.getTime() || !stillFriends) {
    await c.query(`update public.duo_visit_requests set status = 'expired', responded_at = now() where id = $1`, [requestId]);
    return { kind: "expired" };
  }
  if (!accept) {
    await c.query(`update public.duo_visit_requests set status = 'declined', responded_at = now() where id = $1`, [requestId]);
    return { kind: "declined" };
  }
  const result = await recordVisit(
    c,
    userId,
    { placeId: String(r.place_id), requestedStatus: "declared", visitedOn: String(r.visited_on), idempotencyKey: `duo-request:${requestId}`, position: null, note: "Visite confirmée en duo" },
    catalog,
    now,
  );
  await c.query(`update public.duo_visit_requests set status = 'accepted', responded_at = now(), visit_id = $2 where id = $1`, [requestId, result.outcome.visit.id]);
  return { kind: "accepted", ...result };
}

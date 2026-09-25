import "server-only";
import type { PoolClient } from "pg";

export class SocialError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function findByPseudonym(client: PoolClient, pseudonym: string): Promise<string | null> {
  const res = await client.query(`select id from public.profiles where lower(pseudonym) = lower($1)`, [pseudonym.trim()]);
  return res.rowCount ? String(res.rows[0].id) : null;
}

async function blockedEitherWay(client: PoolClient, a: string, b: string): Promise<boolean> {
  const res = await client.query(`select 1 from public.blocks where (blocker_id = $1 and blocked_id = $2) or (blocker_id = $2 and blocked_id = $1)`, [a, b]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Demande d'ami par pseudonyme. Si l'un a bloqué l'autre, la réponse est identique
 * à un succès (le blocage n'est pas révélé) mais rien n'est créé.
 */
export async function requestFriend(client: PoolClient, userId: string, pseudonym: string): Promise<"sent" | "silent"> {
  const target = await findByPseudonym(client, pseudonym);
  if (!target) throw new SocialError("Aucun explorateur avec ce pseudonyme.", 404);
  if (target === userId) throw new SocialError("Vous ne pouvez pas vous ajouter vous-même.", 400);
  if (await blockedEitherWay(client, userId, target)) return "silent";
  const pending = await client.query(`select count(*)::int as n from public.friendships where requester_id = $1 and status = 'pending'`, [userId]);
  if (Number(pending.rows[0]?.n) >= 50) throw new SocialError("Trop de demandes en attente.", 429);
  const res = await client.query(
    `insert into public.friendships (requester_id, addressee_id) values ($1, $2) on conflict ((least(requester_id, addressee_id)), (greatest(requester_id, addressee_id))) do nothing returning id`,
    [userId, target],
  );
  if (res.rowCount === 0) throw new SocialError("Une relation ou une demande existe déjà.", 409);
  return "sent";
}

export async function respondFriend(client: PoolClient, userId: string, friendshipId: string, action: "accept" | "decline") {
  const res = await client.query(
    `update public.friendships set status = $3, responded_at = now() where id = $1 and addressee_id = $2 and status = 'pending' returning id`,
    [friendshipId, userId, action === "accept" ? "accepted" : "declined"],
  );
  if (res.rowCount === 0) throw new SocialError("Demande introuvable.", 404);
}

/**
 * Retire une relation. Un refus ne peut être effacé que par la personne qui a refusé :
 * sinon le demandeur pourrait supprimer le refus et redemander en boucle.
 */
export async function removeFriendship(client: PoolClient, userId: string, friendshipId: string) {
  const res = await client.query(
    `delete from public.friendships
      where id = $1 and (($2 = addressee_id) or ($2 = requester_id and status <> 'declined'))
      returning id`,
    [friendshipId, userId],
  );
  if (res.rowCount === 0) throw new SocialError("Relation introuvable.", 404);
}

/**
 * Blocage par pseudonyme. Un pseudonyme inconnu est ignoré silencieusement (même
 * réponse qu'un blocage réussi) : la route ne sert pas à tester l'existence d'un compte.
 */
export async function blockUser(client: PoolClient, userId: string, pseudonym: string) {
  const target = await findByPseudonym(client, pseudonym);
  if (!target) return;
  if (target === userId) throw new SocialError("Vous ne pouvez pas vous bloquer vous-même.", 400);
  await client.query(`insert into public.blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing`, [userId, target]);
  await client.query(`delete from public.friendships where least(requester_id, addressee_id) = least($1::uuid, $2::uuid) and greatest(requester_id, addressee_id) = greatest($1::uuid, $2::uuid)`, [userId, target]);
}

export async function unblockUser(client: PoolClient, userId: string, pseudonym: string) {
  const target = await findByPseudonym(client, pseudonym);
  if (!target) return;
  await client.query(`delete from public.blocks where blocker_id = $1 and blocked_id = $2`, [userId, target]);
}

/** Vue d'ensemble sociale d'un compte : demandes, amis (s'ils partagent leur profil), blocages. */
export async function socialOverview(client: PoolClient, userId: string) {
  const [incoming, outgoing, friends, blocks] = await Promise.all([
    client.query(
      `select f.id, p.pseudonym, f.created_at from public.friendships f join public.profiles p on p.id = f.requester_id where f.addressee_id = $1 and f.status = 'pending' order by f.created_at`,
      [userId],
    ),
    client.query(
      `select f.id, p.pseudonym, f.created_at from public.friendships f join public.profiles p on p.id = f.addressee_id where f.requester_id = $1 and f.status = 'pending' order by f.created_at`,
      [userId],
    ),
    client.query(
      `select f.id, p.pseudonym, p.visibility,
              case when p.visibility in ('friends', 'public') then coalesce((select sum(x.amount) from public.xp_ledger x where x.user_id = p.id and x.kind = 'xp'), 0) end::int as xp,
              case when p.visibility in ('friends', 'public') then (select count(distinct v.place_id) from public.visits v where v.user_id = p.id) end::int as places_visited,
              case when p.visibility in ('friends', 'public') then (select count(*) from public.parcels pa where pa.user_id = p.id) end::int as parcels
         from public.friendships f
         join public.profiles p on p.id = case when f.requester_id = $1 then f.addressee_id else f.requester_id end
        where f.status = 'accepted' and $1 in (f.requester_id, f.addressee_id)
        order by p.pseudonym`,
      [userId],
    ),
    client.query(`select p.pseudonym from public.blocks b join public.profiles p on p.id = b.blocked_id where b.blocker_id = $1 order by p.pseudonym`, [userId]),
  ]);
  return { incoming: incoming.rows, outgoing: outgoing.rows, friends: friends.rows, blocked: blocks.rows.map((r) => r.pseudonym as string) };
}

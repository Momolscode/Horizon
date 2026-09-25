import "server-only";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Catalog } from "@/modules/catalog/schema";
import {
  applyOutcome,
  planVisit,
  type LedgerEntry,
  type ProgressionSnapshot,
  type Visit,
  type VisitOutcome,
  type VisitRequest,
} from "@/modules/progression/engine";
import type { Parcel } from "@/modules/progression/parcels";

type Row = Record<string, unknown>;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const isoDate = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export function toVisit(r: Row): Visit {
  return {
    id: String(r.id),
    placeId: String(r.place_id),
    status: r.status as Visit["status"],
    visitedOn: isoDate(r.visited_on),
    createdAt: iso(r.created_at),
    idempotencyKey: String(r.idempotency_key),
    proximity: (r.proximity as Visit["proximity"]) ?? null,
    note: (r.note as string | null) ?? null,
  };
}

export function toParcel(r: Row): Parcel {
  return {
    cell: String(r.cell),
    resolution: Number(r.resolution),
    state: r.state as Parcel["state"],
    firstRevealedAt: iso(r.first_revealed_at),
    placeId: String(r.place_id),
  };
}

export function toLedger(r: Row): LedgerEntry {
  return {
    id: String(r.id),
    kind: r.kind as LedgerEntry["kind"],
    amount: Number(r.amount),
    reason: r.reason as LedgerEntry["reason"],
    refId: String(r.ref_id),
    uniqueKey: String(r.unique_key),
    createdAt: iso(r.created_at),
  };
}

export async function loadSnapshot(client: PoolClient, userId: string): Promise<ProgressionSnapshot> {
  const [visits, parcels, ledger, badges] = await Promise.all([
    client.query(`select * from public.visits where user_id = $1 order by created_at`, [userId]),
    client.query(`select * from public.parcels where user_id = $1`, [userId]),
    client.query(`select * from public.xp_ledger where user_id = $1 order by created_at`, [userId]),
    client.query(`select badge_id, awarded_at from public.badges_awarded where user_id = $1`, [userId]),
  ]);
  return {
    visits: visits.rows.map(toVisit),
    parcels: parcels.rows.map(toParcel),
    ledger: ledger.rows.map(toLedger),
    badges: badges.rows.map((r) => ({ id: String(r.badge_id), awardedAt: iso(r.awarded_at) })),
  };
}

export class ProgressionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Enregistre une visite pour `userId` — à appeler DANS une transaction.
 * 1. verrouille le profil (sérialise les opérations de progression d'un même compte) ;
 * 2. applique le moteur pur `planVisit` (mode connecté : simulations refusées) ;
 * 3. persiste avec des contraintes d'unicité (seconde barrière contre les doublons).
 */
export async function recordVisit(
  client: PoolClient,
  userId: string,
  request: VisitRequest,
  catalog: Catalog,
  now: Date = new Date(),
): Promise<{ outcome: VisitOutcome; snapshot: ProgressionSnapshot }> {
  const locked = await client.query(`select id from public.profiles where id = $1 for update`, [userId]);
  if (locked.rowCount === 0) throw new ProgressionError("Profil introuvable.", 404);

  const snapshot = await loadSnapshot(client, userId);
  const outcome = planVisit(request, snapshot, catalog, { now, newId: randomUUID, mode: "connected" });
  if (outcome.duplicate) return { outcome, snapshot };

  const v = outcome.visit;
  const inserted = await client.query(
    `insert into public.visits (id, user_id, place_id, status, visited_on, idempotency_key, proximity, note, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (user_id, idempotency_key) do nothing
     returning id`,
    [v.id, userId, v.placeId, v.status, v.visitedOn, v.idempotencyKey, v.proximity ? JSON.stringify(v.proximity) : null, v.note, v.createdAt],
  );
  if (inserted.rowCount === 0) {
    // Impossible sous verrou, conservé par prudence : on renvoie l'existant sans rien créditer.
    const again = await loadSnapshot(client, userId);
    const existing = again.visits.find((x) => x.idempotencyKey === v.idempotencyKey)!;
    return { outcome: { ...outcome, duplicate: true, visit: existing, ledger: [], parcel: null, badges: [], xpGained: 0, pointsGained: 0 }, snapshot: again };
  }

  for (const e of outcome.ledger) {
    await client.query(
      `insert into public.xp_ledger (id, user_id, kind, amount, reason, ref_id, unique_key, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (user_id, unique_key) do nothing`,
      [e.id, userId, e.kind, e.amount, e.reason, e.refId, e.uniqueKey, e.createdAt],
    );
  }
  if (outcome.parcel) {
    const p = outcome.parcel.parcel;
    await client.query(
      `insert into public.parcels (user_id, cell, resolution, state, place_id, first_revealed_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, cell) do update
         set state = case when excluded.state = 'checked' then 'checked' else public.parcels.state end`,
      [userId, p.cell, p.resolution, p.state, p.placeId, p.firstRevealedAt],
    );
  }
  for (const b of outcome.badges) {
    await client.query(`insert into public.badges_awarded (user_id, badge_id, awarded_at) values ($1, $2, $3) on conflict do nothing`, [userId, b.id, b.awardedAt]);
  }
  return { outcome, snapshot: applyOutcome(snapshot, outcome) };
}

/**
 * Correction administrative traçable (ajout ou retrait d'XP/points).
 * Le motif et l'auteur sont obligatoires (contrainte en base).
 */
export async function adminAdjust(
  client: PoolClient,
  adminId: string,
  userId: string,
  input: { kind: "xp" | "points"; amount: number; note: string; adjustmentId?: string },
): Promise<LedgerEntry> {
  if (!Number.isInteger(input.amount) || input.amount === 0 || Math.abs(input.amount) > 10_000) throw new ProgressionError("Montant invalide.", 400);
  if (input.note.trim().length < 5) throw new ProgressionError("Motif obligatoire (5 caractères minimum).", 400);
  const refId = input.adjustmentId ?? randomUUID();
  const res = await client.query(
    `insert into public.xp_ledger (id, user_id, kind, amount, reason, ref_id, unique_key, created_by, note)
     values ($1, $2, $3, $4, 'admin_adjustment', $5, $6, $7, $8)
     on conflict (user_id, unique_key) do nothing
     returning *`,
    [randomUUID(), userId, input.kind, input.amount, refId, `admin_adjustment:${refId}`, adminId, input.note.trim()],
  );
  if (res.rowCount === 0) throw new ProgressionError("Correction déjà appliquée.", 409);
  if (input.kind === "points") {
    const balance = await client.query(`select coalesce(sum(amount), 0)::int as total from public.xp_ledger where user_id = $1 and kind = 'points'`, [userId]);
    if (Number(balance.rows[0]?.total) < 0) throw new ProgressionError("Le solde de points ne peut pas devenir négatif.", 400);
  }
  return toLedger(res.rows[0]!);
}

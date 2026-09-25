import "server-only";
import { randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { ExcursionStep } from "@/modules/excursions/types";

type Queryable = Pick<Pool | PoolClient, "query">;

export type SharedExcursion = {
  token: string;
  title: string;
  destinationId: string;
  /** null si le propriétaire n'a pas choisi de montrer la date. */
  date: string | null;
  startTime: string;
  durationMinutes: number;
  steps: ExcursionStep[];
  preferences: Record<string, unknown>;
};

export class ShareError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Jeton aléatoire de 192 bits (32 caractères base64url), non devinable. */
export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createShare(client: PoolClient, userId: string, excursionId: string, includeDate: boolean): Promise<string> {
  const owned = await client.query(`select id from public.excursions where id = $1 and user_id = $2`, [excursionId, userId]);
  if (owned.rowCount === 0) throw new ShareError("Excursion introuvable.", 404);
  const active = await client.query(`select count(*)::int as n from public.excursion_shares where owner_id = $1 and revoked_at is null`, [userId]);
  if (Number(active.rows[0]?.n) >= 50) throw new ShareError("Trop de liens actifs : révoquez-en avant d'en créer.", 409);
  const token = newShareToken();
  await client.query(`insert into public.excursion_shares (token, excursion_id, owner_id, include_date) values ($1, $2, $3, $4)`, [token, excursionId, userId, includeDate]);
  return token;
}

export async function revokeShare(client: PoolClient, userId: string, token: string): Promise<void> {
  const res = await client.query(`update public.excursion_shares set revoked_at = now() where token = $1 and owner_id = $2 and revoked_at is null`, [token, userId]);
  if (res.rowCount === 0) throw new ShareError("Lien introuvable ou déjà révoqué.", 404);
}

export async function getSharedExcursion(db: Queryable, token: string): Promise<SharedExcursion | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null;
  const res = await db.query(
    `select s.token, s.include_date, e.title, e.destination_id, to_char(e.date, 'YYYY-MM-DD') as date, to_char(e.start_time, 'HH24:MI') as start_time,
            e.duration_minutes, e.steps, e.preferences
       from public.excursion_shares s join public.excursions e on e.id = s.excursion_id
      where s.token = $1 and s.revoked_at is null`,
    [token],
  );
  const r = res.rows[0];
  if (!r) return null;
  const prefs = (r.preferences ?? {}) as Record<string, unknown>;
  return {
    token: r.token,
    title: r.title,
    destinationId: r.destination_id,
    date: r.include_date ? r.date : null,
    startTime: r.start_time,
    durationMinutes: Number(r.duration_minutes),
    steps: ((r.steps ?? []) as ExcursionStep[]).map((s) => ({ id: s.id, placeId: s.placeId, visitMinutes: s.visitMinutes, note: null })),
    // Seules les préférences utiles au calcul sont transmises (pas de notes privées).
    preferences: { party: prefs.party, budget: prefs.budget, transport: prefs.transport, needs: prefs.needs },
  };
}

export async function copyShare(client: PoolClient, userId: string, token: string): Promise<string> {
  const shared = await getSharedExcursion(client, token);
  if (!shared) throw new ShareError("Lien révoqué ou inexistant.", 404);
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const res = await client.query(
    `insert into public.excursions (user_id, title, destination_id, date, start_time, duration_minutes, preferences, seed, origin, steps)
     values ($1, $2, $3, $4, $5, $6, $7, null, 'copy', $8) returning id`,
    [userId, `Copie — ${shared.title}`.slice(0, 120), shared.destinationId, shared.date ?? tomorrow, shared.startTime, shared.durationMinutes, JSON.stringify(shared.preferences), JSON.stringify(shared.steps)],
  );
  return String(res.rows[0].id);
}

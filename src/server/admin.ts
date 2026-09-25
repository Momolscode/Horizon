import "server-only";
import { NextResponse } from "next/server";
import type { Pool, PoolClient } from "pg";
import { computeMetrics, type Activity } from "@/modules/admin/metrics";
import { databaseConfigured, getPool } from "./db";
import { getSessionUser, type SessionUser } from "./auth";
import { rejectCrossSite } from "./request-guard";

type Queryable = Pick<Pool | PoolClient, "query">;

export async function isAdmin(db: Queryable, userId: string): Promise<boolean> {
  const res = await db.query(`select 1 from public.admins where user_id = $1`, [userId]);
  return (res.rowCount ?? 0) > 0;
}

/**
 * Enveloppe des routes d'administration : base configurée, session valide,
 * rôle administrateur vérifié EN BASE, protection CSRF pour les mutations.
 */
export function adminRoute<P>(
  handler: (ctx: { request: Request; admin: SessionUser; params: P }) => Promise<Response>,
  { mutation = false }: { mutation?: boolean } = {},
) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    if (mutation) {
      const blocked = rejectCrossSite(request);
      if (blocked) return blocked;
    }
    if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!(await isAdmin(getPool(), user.id))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    try {
      return await handler({ request, admin: user, params: await context.params });
    } catch (error) {
      console.error("administration : échec", error instanceof Error ? error.message : "erreur inconnue");
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  };
}

/** Journal des opérations sensibles (sans données personnelles superflues). */
export async function audit(client: Queryable, adminId: string, action: string, targetType: string, targetId: string | null, details: Record<string, unknown> = {}) {
  await client.query(`insert into public.admin_audit_log (admin_id, action, target_type, target_id, details) values ($1, $2, $3, $4, $5)`, [
    adminId,
    action,
    targetType,
    targetId,
    JSON.stringify(details),
  ]);
}

/** Comptes réels : hors comptes de test et administrateurs. */
const REAL_ACCOUNTS = `select p.id, p.created_at from public.profiles p where not p.is_test and not exists (select 1 from public.admins a where a.user_id = p.id)`;

export async function loadMetrics(db: Queryable, now = new Date()) {
  const accounts = await db.query(REAL_ACCOUNTS);
  const activities = await db.query(
    `with real as (${REAL_ACCOUNTS})
     select v.user_id, v.created_at as at, 'visit' as kind from public.visits v join real on real.id = v.user_id
     union all select e.user_id, e.created_at, 'excursion' from public.excursions e join real on real.id = e.user_id
     union all select c.user_id, i.added_at, 'favorite' from public.collection_items i join public.collections c on c.id = i.collection_id join real on real.id = c.user_id
     union all select ev.user_id, ev.occurred_at, 'app_open' from public.events ev join real on real.id = ev.user_id where ev.name = 'app_open' and not ev.is_test and not ev.is_admin`,
  );
  return computeMetrics(
    accounts.rows.map((r) => ({ id: String(r.id), createdAt: new Date(r.created_at).toISOString() })),
    activities.rows.map((r) => ({ userId: String(r.user_id), at: new Date(r.at).toISOString(), kind: r.kind as Activity["kind"] })),
    now,
  );
}

export async function adminOverview(db: Queryable) {
  const res = await db.query(
    `select
       (select count(*) from public.places)::int as places,
       (select count(*) from public.places where status = 'published')::int as places_published,
       (select count(*) from public.error_reports where status = 'open')::int as open_reports,
       (select count(*) from public.reviews where status = 'pending')::int as pending_reviews,
       (select count(*) from public.waitlist)::int as waitlist,
       (select count(*) from public.profiles where is_test)::int as test_accounts`,
  );
  return res.rows[0] as Record<string, number>;
}

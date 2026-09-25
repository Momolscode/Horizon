import { NextResponse } from "next/server";
import { z } from "zod";
import { rejectCrossSite } from "@/server/request-guard";
import { databaseConfigured, getPool } from "@/server/db";
import { getSessionUser } from "@/server/auth";
import { isAdmin } from "@/server/admin";
import { rateLimit } from "@/server/rate-limit";

const EventBody = z.object({
  name: z.enum(["app_open", "first_discovery", "favorite_added", "excursion_created", "visit_declared", "visit_checked", "share_created"]),
  // Propriétés minimales : jamais de position, jamais de texte libre.
  props: z
    .record(z.string().max(40), z.union([z.string().max(60), z.number(), z.boolean()]))
    .refine((v) => Object.keys(v).length <= 5, "5 propriétés au plus")
    .optional()
    .default({}),
});

/** Mesure d'usage : enregistrée uniquement si l'utilisateur y a consenti (désactivée par défaut). */
export async function POST(request: Request) {
  const blocked = rejectCrossSite(request);
  if (blocked) return blocked;
  if (!databaseConfigured()) return NextResponse.json({ error: "database_not_configured" }, { status: 503 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!rateLimit(`events:${user.id}`, 60, 10 * 60 * 1000).allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const parsed = EventBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const pool = getPool();
  const profile = await pool.query(`select analytics_consent, is_test from public.profiles where id = $1`, [user.id]);
  const row = profile.rows[0];
  if (!row?.analytics_consent) return NextResponse.json({ ok: true, recorded: false });
  await pool.query(`insert into public.events (user_id, name, props, is_test, is_admin) values ($1, $2, $3, $4, $5)`, [
    user.id,
    parsed.data.name,
    JSON.stringify(parsed.data.props),
    Boolean(row.is_test),
    await isAdmin(pool, user.id),
  ]);
  return NextResponse.json({ ok: true, recorded: true });
}

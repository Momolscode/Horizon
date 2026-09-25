import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool, withTransaction } from "@/server/db";
import { adminRoute, audit } from "@/server/admin";
import { loadActiveConfig } from "@/server/config";
import { PARCEL_RESOLUTION, ProgressionConfigSchema } from "@/modules/progression/config";

export const GET = adminRoute(async () => {
  const pool = getPool();
  const [active, history] = await Promise.all([
    loadActiveConfig(pool),
    pool.query(`select version, created_at from public.progression_settings order by version desc limit 20`),
  ]);
  return NextResponse.json({ active, history: history.rows });
});

/** Nouvelle version de barème : jamais rétroactive (les écritures passées restent). */
export const POST = adminRoute(
  async ({ request, admin }) => {
    const body = ProgressionConfigSchema.omit({ version: true }).safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: "invalid", issues: z.treeifyError(body.error) }, { status: 400 });
    const version = await withTransaction(async (c) => {
      await c.query(`lock table public.progression_settings in exclusive mode`);
      const next = await c.query(`select coalesce(max(version), 0) + 1 as v from public.progression_settings`);
      const v = Number(next.rows[0].v);
      await c.query(`insert into public.progression_settings (version, parcel_resolution, config) values ($1, $2, $3)`, [v, PARCEL_RESOLUTION, JSON.stringify(body.data)]);
      await audit(c, admin.id, "config.version", "progression_settings", String(v), body.data);
      return v;
    });
    return NextResponse.json({ ok: true, version });
  },
  { mutation: true },
);

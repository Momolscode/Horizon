import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute, audit } from "@/server/admin";

export const PATCH = adminRoute<{ id: string }>(
  async ({ request, admin, params }) => {
    const parsed = z.object({ active: z.boolean() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const updated = await withTransaction(async (c) => {
      const res = await c.query(`update public.missions set active = $2, updated_at = now() where id = $1 returning id`, [params.id, parsed.data.active]);
      if (res.rowCount) await audit(c, admin.id, "mission.active", "mission", params.id, { active: parsed.data.active });
      return res.rowCount;
    });
    return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  },
  { mutation: true },
);

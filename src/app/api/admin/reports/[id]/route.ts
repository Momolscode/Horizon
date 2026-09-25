import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute, audit } from "@/server/admin";

export const PATCH = adminRoute<{ id: string }>(
  async ({ request, admin, params }) => {
    const parsed = z.object({ status: z.enum(["resolved", "rejected", "open"]) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.uuid().safeParse(params.id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const updated = await withTransaction(async (c) => {
      const res = await c.query(
        `update public.error_reports set status = $2, resolved_by = case when $2 = 'open' then null else $3::uuid end, resolved_at = case when $2 = 'open' then null else now() end where id = $1 returning id`,
        [params.id, parsed.data.status, admin.id],
      );
      if (res.rowCount) await audit(c, admin.id, "report.status", "error_report", params.id, { status: parsed.data.status });
      return res.rowCount;
    });
    return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  },
  { mutation: true },
);

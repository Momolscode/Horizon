import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute, audit } from "@/server/admin";

/** Modération : publication ou refus motivé. Aucune récompense n'est liée à un avis. */
export const PATCH = adminRoute<{ id: string }>(
  async ({ request, admin, params }) => {
    const parsed = z
      .object({ decision: z.enum(["publish", "reject"]), reason: z.string().max(300).optional() })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.uuid().safeParse(params.id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const status = parsed.data.decision === "publish" ? "published" : "rejected";
    const updated = await withTransaction(async (c) => {
      const res = await c.query(
        `update public.reviews set status = $2, moderated_by = $3, moderated_at = now(), rejection_reason = $4 where id = $1 returning id`,
        [params.id, status, admin.id, status === "rejected" ? (parsed.data.reason ?? "Non conforme aux règles de publication") : null],
      );
      if (res.rowCount) await audit(c, admin.id, `review.${parsed.data.decision}`, "review", params.id, {});
      return res.rowCount;
    });
    return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
  },
  { mutation: true },
);

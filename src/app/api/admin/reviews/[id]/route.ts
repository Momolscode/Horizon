import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute } from "@/server/admin";
import { ModerationError, moderateReview } from "@/server/reviews";

/** Modération : publication ou refus motivé. Aucune récompense n'est liée à un avis. */
export const PATCH = adminRoute<{ id: string }>(
  async ({ request, admin, params }) => {
    const parsed = z
      .object({ decision: z.enum(["publish", "reject"]), reviewedVersion: z.string().min(10).max(64), reason: z.string().max(300).optional() })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.uuid().safeParse(params.id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    try {
      await withTransaction((c) => moderateReview(c, admin.id, params.id, parsed.data));
    } catch (error) {
      if (error instanceof ModerationError) return NextResponse.json({ error: error.status === 404 ? "not_found" : "conflict", message: error.message }, { status: error.status });
      throw error;
    }
    return NextResponse.json({ ok: true });
  },
  { mutation: true },
);

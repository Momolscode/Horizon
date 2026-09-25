import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute } from "@/server/admin";
import { moderateReply } from "@/server/contributions";
import { contributionErrorResponse } from "@/server/route-helpers";

/** Modération d'une réponse d'établissement, liée à la version relue. */
export const PATCH = adminRoute<{ reviewId: string }>(
  async ({ request, admin, params }) => {
    const parsed = z
      .object({ decision: z.enum(["publish", "reject"]), reviewedVersion: z.string().min(10).max(64), reason: z.string().max(300).optional() })
      .safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.uuid().safeParse(params.reviewId).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    try {
      await withTransaction((c) => moderateReply(c, admin.id, params.reviewId, parsed.data));
      return NextResponse.json({ ok: true });
    } catch (error) {
      return contributionErrorResponse(error, "modération de réponse");
    }
  },
  { mutation: true },
);

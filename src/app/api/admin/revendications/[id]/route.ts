import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute } from "@/server/admin";
import { approveClaim, rejectClaim } from "@/server/contributions";
import { contributionErrorResponse } from "@/server/route-helpers";

/** Validation manuelle d'une revendication (SIRET contrôlé et preuve examinée par l'administrateur). */
export const PATCH = adminRoute<{ id: string }>(
  async ({ request, admin, params }) => {
    const parsed = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().min(3).max(300).optional() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.uuid().safeParse(params.id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    try {
      await withTransaction((c) => (parsed.data.decision === "approve" ? approveClaim(c, admin.id, params.id) : rejectClaim(c, admin.id, params.id, parsed.data.reason ?? "Justificatif insuffisant")));
      return NextResponse.json({ ok: true });
    } catch (error) {
      return contributionErrorResponse(error, "modération de revendication");
    }
  },
  { mutation: true },
);

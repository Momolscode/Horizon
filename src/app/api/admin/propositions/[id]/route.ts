import { NextResponse } from "next/server";
import { z } from "zod";
import { withTransaction } from "@/server/db";
import { adminRoute } from "@/server/admin";
import { invalidateCatalogCache } from "@/server/catalog";
import { approveProposal, rejectProposal } from "@/server/contributions";
import { contributionErrorResponse } from "@/server/route-helpers";

/** Modération d'une proposition : publication (le lieu entre au catalogue) ou refus motivé. */
export const PATCH = adminRoute<{ id: string }>(
  async ({ request, admin, params }) => {
    const parsed = z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().min(3).max(300).optional() }).safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.uuid().safeParse(params.id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    try {
      if (parsed.data.decision === "approve") {
        const placeId = await withTransaction((c) => approveProposal(c, admin.id, params.id));
        invalidateCatalogCache();
        return NextResponse.json({ ok: true, placeId });
      }
      await withTransaction((c) => rejectProposal(c, admin.id, params.id, parsed.data.reason ?? "Proposition non retenue"));
      return NextResponse.json({ ok: true });
    } catch (error) {
      return contributionErrorResponse(error, "modération de proposition");
    }
  },
  { mutation: true },
);

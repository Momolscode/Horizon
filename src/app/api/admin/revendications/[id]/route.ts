import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getPool, withTransaction } from "@/server/db";
import { deliverPendingEmails } from "@/server/mail";
import { adminRoute } from "@/server/admin";
import { invalidateCatalogCache } from "@/server/catalog";
import { approveClaim, rejectClaim, revokeClaim } from "@/server/contributions";
import { contributionErrorResponse } from "@/server/route-helpers";

const Decision = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve") }),
  z.object({ decision: z.literal("reject"), reason: z.string().min(3).max(300).optional() }),
  // Retrait de la gestion d'une fiche validée : motif obligatoire, options explicites.
  z.object({ decision: z.literal("revoke"), reason: z.string().trim().min(3).max(300), removeReplies: z.boolean(), clearInfo: z.boolean() }),
]);

/** Validation manuelle d'une revendication (SIRET contrôlé et preuve examinée), ou retrait de la gestion. */
export const PATCH = adminRoute<{ id: string }>(
  async ({ request, admin, params }) => {
    const parsed = Decision.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.uuid().safeParse(params.id).success) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const input = parsed.data;
    try {
      await withTransaction((c) => {
        if (input.decision === "approve") return approveClaim(c, admin.id, params.id);
        if (input.decision === "reject") return rejectClaim(c, admin.id, params.id, input.reason ?? "Justificatif insuffisant");
        return revokeClaim(c, admin.id, params.id, input);
      });
      if (input.decision === "revoke" && input.clearInfo) invalidateCatalogCache();
      // Une validation peut avoir mis un e-mail en file (avis retiré) : envoi après la réponse.
      if (input.decision === "approve") {
        after(async () => {
          const report = await deliverPendingEmails(getPool()).catch((error: unknown) => ({ status: "error", message: error instanceof Error ? error.message : "erreur" }));
          if (report.status !== "done") console.warn("e-mails : envoi différé", report.status);
        });
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      return contributionErrorResponse(error, "modération de revendication");
    }
  },
  { mutation: true },
);

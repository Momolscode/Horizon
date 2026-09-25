import "server-only";
import type { PoolClient } from "pg";
import { audit } from "./admin";

export class ModerationError extends Error {
  constructor(
    readonly status: 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Publie ou refuse un avis. `reviewedVersion` est la version (updated_at) de l'avis tel
 * que l'administrateur l'a lu : si l'auteur l'a modifié entre-temps, la décision est
 * refusée (409) plutôt que de publier un texte jamais relu.
 */
export async function moderateReview(
  c: PoolClient,
  adminId: string,
  reviewId: string,
  input: { decision: "publish" | "reject"; reviewedVersion: string; reason?: string },
): Promise<void> {
  const status = input.decision === "publish" ? "published" : "rejected";
  if (status === "published") {
    // L'avis d'un établissement sur une fiche qu'il gère ou a gérée n'est jamais publié.
    const conflict = await c.query(
      `select 1 from public.reviews r join public.place_claims pc on pc.user_id = r.user_id and pc.place_id = r.place_id
        where r.id = $1 and pc.status in ('approved', 'revoked')`,
      [reviewId],
    );
    if (conflict.rowCount) throw new ModerationError(409, "Publication impossible : l'auteur gère ou a géré la fiche de ce lieu (conflit d'intérêts). Refusez cet avis.");
  }
  const res = await c.query(
    `update public.reviews set status = $2, moderated_by = $3, moderated_at = now(), rejection_reason = $4
      where id = $1 and updated_at::text = $5 returning id`,
    [reviewId, status, adminId, status === "rejected" ? (input.reason ?? "Non conforme aux règles de publication") : null, input.reviewedVersion],
  );
  if (!res.rowCount) {
    const exists = await c.query(`select 1 from public.reviews where id = $1`, [reviewId]);
    if (!exists.rowCount) throw new ModerationError(404, "Avis introuvable.");
    throw new ModerationError(409, "L'avis a été modifié depuis votre lecture : rechargez la liste et relisez-le.");
  }
  await audit(c, adminId, `review.${input.decision}`, "review", reviewId, {});
}

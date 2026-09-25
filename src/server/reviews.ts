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

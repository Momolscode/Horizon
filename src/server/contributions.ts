import "server-only";
import type { PoolClient } from "pg";
import {
  applyEstablishmentUpdate,
  buildCommunityPlace,
  ClaimSchema,
  clearEstablishmentData,
  destinationForPoint,
  EstablishmentUpdateSchema,
  findLikelyDuplicates,
  placeIdFor,
  ProposalSchema,
} from "@/modules/catalog/contributions";
import type { Place } from "@/modules/catalog/schema";
import { PARCEL_RESOLUTION } from "@/modules/progression/config";
import { parcelForLocation } from "@/modules/progression/parcels";
import { todayIn } from "@/modules/shared/time";
import { audit } from "./admin";
import { loadCatalogFromDb } from "./catalog";
import { enqueueEmail } from "./mail";

/**
 * Référencement élargi (docs/DECISIONS.md D-017). Fonctions appelées dans une transaction
 * serveur ; le navigateur n'a aucun droit direct sur ces tables.
 */
export class ContributionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const MAX_PENDING_PROPOSALS = 20;

function firstIssue(error: { issues: Array<{ message: string }> }): string {
  return error.issues[0]?.message ?? "Données invalides.";
}

async function currentCatalog(c: PoolClient) {
  return (await loadCatalogFromDb(c)).catalog;
}

/** Relit le catalogue dans la transaction : une écriture qui le rendrait incohérent est annulée. */
async function assertCatalogStillValid(c: PoolClient) {
  try {
    await loadCatalogFromDb(c);
  } catch (error) {
    throw new ContributionError(`Opération refusée : elle rendrait le catalogue incohérent (${error instanceof Error ? error.message : "catalogue invalide"}).`, 409);
  }
}

// ———————————————————————————————— Propositions ————————————————————————————————

export async function submitProposal(c: PoolClient, userId: string, input: unknown, confirmNotDuplicate: boolean): Promise<{ id: string; duplicateOf: string[] }> {
  const parsed = ProposalSchema.safeParse(input);
  if (!parsed.success) throw new ContributionError(firstIssue(parsed.error), 400);
  const proposal = parsed.data;
  const catalog = await currentCatalog(c);
  const destination = destinationForPoint(catalog, proposal.location);
  if (!destination || destination.id !== proposal.destinationId) {
    throw new ContributionError("Ce point n'est pas dans la destination choisie : seules les destinations couvertes acceptent des propositions.", 400);
  }
  // Sérialise les propositions d'un même compte (plafond de propositions en attente).
  await c.query(`select id from public.profiles where id = $1 for update`, [userId]);
  const pending = await c.query(`select count(*)::int as n from public.place_proposals where user_id = $1 and status = 'pending'`, [userId]);
  if (Number(pending.rows[0].n) >= MAX_PENDING_PROPOSALS) throw new ContributionError(`Vous avez déjà ${MAX_PENDING_PROPOSALS} propositions en attente de modération.`, 409);

  const others = await c.query(
    `select id::text as id, name, extensions.st_y(location::extensions.geometry) as lat, extensions.st_x(location::extensions.geometry) as lng
       from public.place_proposals where destination_id = $1 and status = 'pending'`,
    [destination.id],
  );
  const existing = [
    ...catalog.places.filter((p) => p.destinationId === destination.id).map((p) => ({ id: p.id, name: p.name, location: p.location })),
    ...others.rows.map((r) => ({ id: `proposition:${r.id}`, name: String(r.name), location: { lat: Number(r.lat), lng: Number(r.lng) } })),
  ];
  const duplicates = findLikelyDuplicates(proposal, existing);
  if (duplicates.length > 0 && !confirmNotDuplicate) {
    throw new ContributionError("Ce lieu existe peut-être déjà.", 409, {
      duplicates: duplicates.map((d) => ({ id: d.id.startsWith("proposition:") ? null : d.id, name: d.name, distanceM: d.distanceM, pending: d.id.startsWith("proposition:") })),
    });
  }
  const inserted = await c.query(
    `insert into public.place_proposals (user_id, destination_id, name, category, location, payload, duplicate_of)
     values ($1, $2, $3, $4, extensions.st_setsrid(extensions.st_makepoint($5, $6), 4326)::extensions.geography, $7, $8) returning id`,
    [userId, destination.id, proposal.name, proposal.category, proposal.location.lng, proposal.location.lat, JSON.stringify(proposal), duplicates.map((d) => d.id)],
  );
  return { id: String(inserted.rows[0].id), duplicateOf: duplicates.map((d) => d.id) };
}

async function insertPlace(c: PoolClient, place: Place, updatedBy: string) {
  await c.query(
    `insert into public.places (id, destination_id, name, category, themes, setting, location, location_precision, h3_cell, h3_res, summary, description, history,
                                lesser_known, practical, restaurant, art, source_ids, verification, fictional, sponsored, status, updated_by)
     values ($1, $2, $3, $4, $5, $6, extensions.st_setsrid(extensions.st_makepoint($7, $8), 4326)::extensions.geography, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, $22, 'published', $23)`,
    [
      place.id,
      place.destinationId,
      place.name,
      place.category,
      place.themes,
      place.setting,
      place.location.lng,
      place.location.lat,
      place.locationPrecision,
      parcelForLocation(place.location, PARCEL_RESOLUTION),
      PARCEL_RESOLUTION,
      place.summary,
      place.description,
      place.history,
      place.lesserKnown,
      JSON.stringify(place.practical),
      place.restaurant ? JSON.stringify(place.restaurant) : null,
      JSON.stringify(place.art),
      place.sourceIds,
      JSON.stringify(place.verification),
      place.fictional,
      place.sponsored ? JSON.stringify(place.sponsored) : null,
      updatedBy,
    ],
  );
}

export async function adminListProposals(c: PoolClient) {
  const res = await c.query(
    `select pp.id, pp.name, pp.category, pp.destination_id, pp.payload, pp.duplicate_of, pp.created_at,
            extensions.st_y(pp.location::extensions.geometry) as lat, extensions.st_x(pp.location::extensions.geometry) as lng,
            coalesce(p.pseudonym, 'compte supprimé') as pseudonym
       from public.place_proposals pp left join public.profiles p on p.id = pp.user_id
      where pp.status = 'pending' order by pp.created_at limit 200`,
  );
  return res.rows;
}

/** Publie une proposition : le lieu entre au catalogue, marqué « proposé par un membre, non vérifié ». */
export async function approveProposal(c: PoolClient, adminId: string, proposalId: string): Promise<string> {
  const res = await c.query(`select id, payload from public.place_proposals where id = $1 and status = 'pending' for update`, [proposalId]);
  if (!res.rowCount) throw new ContributionError("Proposition introuvable ou déjà traitée.", 404);
  const proposal = ProposalSchema.parse(res.rows[0].payload);
  const catalog = await currentCatalog(c);
  const destination = catalog.destinations.find((d) => d.id === proposal.destinationId);
  if (!destination) throw new ContributionError("Destination introuvable.", 409);
  const taken = new Set((await c.query(`select id from public.places`)).rows.map((r) => String(r.id)));
  const id = placeIdFor(destination.id, proposal.name, taken);
  const place = buildCommunityPlace(proposal, { id, destination, approvedOn: todayIn(destination.timezone) });
  await insertPlace(c, place, adminId);
  await assertCatalogStillValid(c);
  await c.query(`update public.place_proposals set status = 'approved', place_id = $2, reviewed_by = $3, reviewed_at = now() where id = $1`, [proposalId, id, adminId]);
  await audit(c, adminId, "proposal.approve", "place", id, { proposalId });
  return id;
}

export async function rejectProposal(c: PoolClient, adminId: string, proposalId: string, reason: string): Promise<void> {
  const res = await c.query(
    `update public.place_proposals set status = 'rejected', rejection_reason = $2, reviewed_by = $3, reviewed_at = now()
      where id = $1 and status = 'pending' returning id`,
    [proposalId, reason, adminId],
  );
  if (!res.rowCount) throw new ContributionError("Proposition introuvable ou déjà traitée.", 404);
  await audit(c, adminId, "proposal.reject", "proposal", proposalId, { reason });
}

// ———————————————————————————————— Revendication ————————————————————————————————

export async function submitClaim(c: PoolClient, userId: string, input: unknown): Promise<string> {
  const parsed = ClaimSchema.safeParse(input);
  if (!parsed.success) throw new ContributionError(firstIssue(parsed.error), 400);
  const claim = parsed.data;
  const place = await c.query(`select 1 from public.places where id = $1 and status = 'published'`, [claim.placeId]);
  if (!place.rowCount) throw new ContributionError("Lieu introuvable.", 404);
  const manager = await c.query(`select user_id from public.place_claims where place_id = $1 and status = 'approved'`, [claim.placeId]);
  if (manager.rowCount) {
    throw new ContributionError(manager.rows[0].user_id === userId ? "Vous gérez déjà cette fiche." : "Cette fiche est déjà gérée par un établissement vérifié.", 409);
  }
  const inserted = await c.query(
    `insert into public.place_claims (place_id, user_id, siret, proof_kind, proof_text) values ($1, $2, $3, $4, $5)
     on conflict do nothing returning id`,
    [claim.placeId, userId, claim.siret, claim.proofKind, claim.proofText],
  );
  if (!inserted.rowCount) throw new ContributionError("Une demande est déjà en attente pour cette fiche.", 409);
  return String(inserted.rows[0].id);
}

export async function adminListClaims(c: PoolClient) {
  const res = await c.query(
    `select pc.id, pc.place_id, pl.name as place_name, pc.siret, pc.proof_kind, pc.proof_text, pc.created_at, p.pseudonym,
            (select count(*) from public.reviews r where r.user_id = pc.user_id and r.place_id = pc.place_id and r.status <> 'rejected')::int as own_reviews
       from public.place_claims pc join public.places pl on pl.id = pc.place_id join public.profiles p on p.id = pc.user_id
      where pc.status = 'pending' order by pc.created_at limit 200`,
  );
  return res.rows;
}

export const CONFLICT_REVIEW_REASON = "Retiré : son auteur gère désormais la fiche de ce lieu (conflit d'intérêts)";

export async function approveClaim(c: PoolClient, adminId: string, claimId: string): Promise<void> {
  const res = await c.query(`select place_id, user_id from public.place_claims where id = $1 and status = 'pending' for update`, [claimId]);
  if (!res.rowCount) throw new ContributionError("Demande introuvable ou déjà traitée.", 404);
  const placeId = String(res.rows[0].place_id);
  const other = await c.query(`select 1 from public.place_claims where place_id = $1 and status = 'approved'`, [placeId]);
  if (other.rowCount) throw new ContributionError("Cette fiche a déjà un établissement gestionnaire.", 409);
  await c.query(`update public.place_claims set status = 'approved', reviewed_by = $2, reviewed_at = now() where id = $1`, [claimId, adminId]);
  // Un avis déposé avant la revendication (en attente ou publié) est retiré : l'établissement ne note pas sa fiche.
  const withdrawn = await c.query(
    `update public.reviews set status = 'rejected', rejection_reason = $3, moderated_by = $4, moderated_at = now()
      where user_id = $1 and place_id = $2 and status <> 'rejected' returning id`,
    [res.rows[0].user_id, placeId, CONFLICT_REVIEW_REASON, adminId],
  );
  if (withdrawn.rowCount) {
    // L'auteur est prévenu par e-mail (enregistré ici, envoyé après validation de la transaction).
    const place = await c.query(`select name from public.places where id = $1`, [placeId]);
    await enqueueEmail(c, { userId: String(res.rows[0].user_id), kind: "review_withdrawn", payload: { placeId, placeName: String(place.rows[0].name) }, dedupeKey: `review_withdrawn:${claimId}` });
  }
  await audit(c, adminId, "claim.approve", "place", placeId, { claimId, withdrawnReviews: withdrawn.rows.map((r) => String(r.id)) });
}

export async function rejectClaim(c: PoolClient, adminId: string, claimId: string, reason: string): Promise<void> {
  const res = await c.query(
    `update public.place_claims set status = 'rejected', rejection_reason = $2, reviewed_by = $3, reviewed_at = now()
      where id = $1 and status = 'pending' returning place_id`,
    [claimId, reason, adminId],
  );
  if (!res.rowCount) throw new ContributionError("Demande introuvable ou déjà traitée.", 404);
  await audit(c, adminId, "claim.reject", "place", String(res.rows[0].place_id), { claimId, reason });
}

// ———————————————————————————————— Retrait de la gestion ————————————————————————————————

export async function adminListManagers(c: PoolClient) {
  const res = await c.query(
    `select pc.id, pc.place_id, pl.name as place_name, pl.status as place_status, pc.siret, pc.reviewed_at, p.pseudonym,
            jsonb_path_exists(pl.practical, '$.* ? (@.by == "establishment")') or coalesce(pl.restaurant #>> '{diets,by}' = 'establishment', false) as has_info,
            (select count(*) from public.review_replies rr join public.reviews r on r.id = rr.review_id
              where r.place_id = pc.place_id and rr.user_id = pc.user_id and rr.status = 'published')::int as published_replies
       from public.place_claims pc join public.places pl on pl.id = pc.place_id join public.profiles p on p.id = pc.user_id
      where pc.status = 'approved' order by pl.name limit 500`,
  );
  return res.rows;
}

export type EndManagementOptions = { reason: string; removeReplies: boolean; clearInfo: boolean };

/**
 * Met fin à la gestion d'une fiche (retrait par un administrateur ou renoncement) : la revendication
 * passe à « revoked » et la fiche redevient revendicable. Les réponses en attente de l'ancien
 * gestionnaire sont refusées ; ses réponses publiées et les informations qu'il a fournies ne sont
 * retirées que sur demande. L'ancien gestionnaire ne peut toujours pas noter la fiche (déclencheur).
 */
async function endManagement(
  c: PoolClient,
  claim: { id: string; placeId: string; userId: string },
  actor: { id: string; admin: boolean },
  options: EndManagementOptions,
): Promise<{ rejectedPending: number; removedPublished: number; clearedFields: string[] }> {
  await c.query(`update public.place_claims set status = 'revoked', revoked_at = now(), revoked_by = $2, revoke_reason = $3 where id = $1`, [claim.id, actor.id, options.reason]);
  const moderator = actor.admin ? actor.id : null;
  const rejectReplies = (status: "pending" | "published", reason: string) =>
    c.query(
      `update public.review_replies rr set status = 'rejected', rejection_reason = $4, moderated_by = $5, moderated_at = now()
         from public.reviews r
        where r.id = rr.review_id and r.place_id = $1 and rr.user_id = $2 and rr.status = $3`,
      [claim.placeId, claim.userId, status, reason, moderator],
    );
  const pending = await rejectReplies("pending", "Gestion de la fiche terminée avant la modération");
  const published = options.removeReplies ? await rejectReplies("published", "Retirée avec la gestion de la fiche") : { rowCount: 0 };
  let clearedFields: string[] = [];
  if (options.clearInfo) {
    const row = await c.query(`select practical, restaurant from public.places where id = $1 for update`, [claim.placeId]);
    if (!row.rowCount) throw new ContributionError("Lieu introuvable.", 404);
    const { practical, restaurant, cleared } = clearEstablishmentData({ practical: row.rows[0].practical, restaurant: row.rows[0].restaurant ?? undefined });
    if (cleared.length) {
      await c.query(`update public.places set practical = $2, restaurant = $3, updated_by = $4 where id = $1`, [
        claim.placeId,
        JSON.stringify(practical),
        restaurant ? JSON.stringify(restaurant) : null,
        actor.id,
      ]);
      await assertCatalogStillValid(c);
    }
    clearedFields = cleared;
  }
  return { rejectedPending: pending.rowCount ?? 0, removedPublished: published.rowCount ?? 0, clearedFields };
}

function checkReason(reason: string): string {
  const text = reason.trim();
  const length = Array.from(text).length; // en caractères, comme char_length côté base
  if (length < 3 || length > 300) throw new ContributionError("Le motif doit compter de 3 à 300 caractères.", 400);
  return text;
}

/** Retrait par un administrateur, motivé et journalisé. */
export async function revokeClaim(c: PoolClient, adminId: string, claimId: string, options: EndManagementOptions): Promise<void> {
  const reason = checkReason(options.reason);
  const res = await c.query(`select place_id, user_id from public.place_claims where id = $1 and status = 'approved' for update`, [claimId]);
  if (!res.rowCount) throw new ContributionError("Gestion introuvable ou déjà retirée.", 404);
  const placeId = String(res.rows[0].place_id);
  const result = await endManagement(c, { id: claimId, placeId, userId: String(res.rows[0].user_id) }, { id: adminId, admin: true }, { ...options, reason });
  await audit(c, adminId, "claim.revoke", "place", placeId, { claimId, reason, removeReplies: options.removeReplies, clearInfo: options.clearInfo, ...result });
}

/** Renoncement par l'établissement lui-même. Ses réponses publiées restent visibles. */
export async function relinquishClaim(c: PoolClient, userId: string, placeId: string, options: { clearInfo: boolean }): Promise<void> {
  const res = await c.query(`select id from public.place_claims where place_id = $1 and user_id = $2 and status = 'approved' for update`, [placeId, userId]);
  if (!res.rowCount) throw new ContributionError("Fiche non gérée par votre compte.", 403);
  await endManagement(c, { id: String(res.rows[0].id), placeId, userId }, { id: userId, admin: false }, { reason: "Renoncement de l'établissement", removeReplies: false, clearInfo: options.clearInfo });
}

async function assertManager(c: PoolClient, userId: string, placeId: string) {
  // Verrou partagé : un retrait concurrent attend la fin de l'opération (pas de réponse orpheline).
  const res = await c.query(`select 1 from public.place_claims where place_id = $1 and user_id = $2 and status = 'approved' for share`, [placeId, userId]);
  if (!res.rowCount) throw new ContributionError("Fiche non gérée par votre compte : la revendication doit d'abord être validée.", 403);
}

/** L'établissement vérifié corrige ses informations pratiques (affichées « fournies par l'établissement »). */
export async function updateEstablishmentInfo(c: PoolClient, userId: string, placeId: string, input: unknown): Promise<void> {
  await assertManager(c, userId, placeId);
  const parsed = EstablishmentUpdateSchema.safeParse(input);
  if (!parsed.success) throw new ContributionError(firstIssue(parsed.error), 400);
  const catalog = await currentCatalog(c);
  const place = catalog.places.find((p) => p.id === placeId);
  const destination = place ? catalog.destinations.find((d) => d.id === place.destinationId) : undefined;
  if (!place || !destination) throw new ContributionError("Lieu introuvable.", 404);
  const updated = applyEstablishmentUpdate(place, parsed.data, todayIn(destination.timezone));
  await c.query(`update public.places set practical = $2, updated_by = $3 where id = $1`, [placeId, JSON.stringify(updated.practical), userId]);
  await assertCatalogStillValid(c);
}

// ———————————————————————————————— Réponses aux avis ————————————————————————————————

export async function managedReviews(c: PoolClient, userId: string, placeId: string) {
  await assertManager(c, userId, placeId);
  const res = await c.query(
    `select r.id, r.rating, r.body, r.created_at, p.pseudonym, rr.body as reply_body, rr.status as reply_status, rr.rejection_reason as reply_rejection
       from public.reviews r join public.profiles p on p.id = r.user_id
       left join public.review_replies rr on rr.review_id = r.id
      where r.place_id = $1 and r.status = 'published' order by r.created_at desc limit 100`,
    [placeId],
  );
  return res.rows;
}

/** Réponse publique (gratuite) de l'établissement vérifié, publiée après modération. */
export async function submitReply(c: PoolClient, userId: string, reviewId: string, body: string): Promise<void> {
  const text = body.trim();
  if (text.length < 2 || text.length > 1000) throw new ContributionError("La réponse doit compter de 2 à 1 000 caractères.", 400);
  const review = await c.query(`select place_id from public.reviews where id = $1 and status = 'published'`, [reviewId]);
  if (!review.rowCount) throw new ContributionError("Avis introuvable.", 404);
  const placeId = String(review.rows[0].place_id);
  await assertManager(c, userId, placeId);
  // Le gestionnaire actuel peut remplacer la réponse d'un ancien gestionnaire (gestion retirée).
  const res = await c.query(
    `insert into public.review_replies (review_id, user_id, body) values ($1, $2, $3)
     on conflict (review_id) do update set user_id = excluded.user_id, body = excluded.body, status = 'pending', rejection_reason = null, moderated_by = null, moderated_at = null
       where public.review_replies.user_id = excluded.user_id
          or not exists (select 1 from public.place_claims pc where pc.place_id = $4 and pc.user_id = public.review_replies.user_id and pc.status = 'approved')
     returning review_id`,
    [reviewId, userId, text, placeId],
  );
  if (!res.rowCount) throw new ContributionError("Une autre personne a déjà répondu à cet avis.", 409);
}

export async function adminListReplies(c: PoolClient) {
  const res = await c.query(
    `select rr.review_id, rr.body, rr.updated_at::text as version, r.body as review_body, r.rating, pl.name as place_name
       from public.review_replies rr join public.reviews r on r.id = rr.review_id join public.places pl on pl.id = r.place_id
      where rr.status = 'pending' order by rr.updated_at limit 200`,
  );
  return res.rows;
}

/** Même garde que pour les avis : la décision porte sur la version relue (409 sinon). */
export async function moderateReply(c: PoolClient, adminId: string, reviewId: string, input: { decision: "publish" | "reject"; reviewedVersion: string; reason?: string }): Promise<void> {
  const status = input.decision === "publish" ? "published" : "rejected";
  const res = await c.query(
    `update public.review_replies set status = $2, moderated_by = $3, moderated_at = now(), rejection_reason = $4
      where review_id = $1 and status = 'pending' and updated_at::text = $5 returning review_id`,
    [reviewId, status, adminId, status === "rejected" ? (input.reason ?? "Non conforme aux règles de publication") : null, input.reviewedVersion],
  );
  if (!res.rowCount) throw new ContributionError("Réponse introuvable, déjà traitée ou modifiée depuis votre lecture.", 409);
  await audit(c, adminId, `reply.${input.decision}`, "review", reviewId, {});
}

// ———————————————————————————————— Espace contributeur ————————————————————————————————

export async function myContributions(c: PoolClient, userId: string) {
  const [proposals, claims] = await Promise.all([
    c.query(
      `select id, name, category, destination_id, status, place_id, rejection_reason, created_at from public.place_proposals where user_id = $1 order by created_at desc limit 100`,
      [userId],
    ),
    c.query(
      `select pc.id, pc.place_id, pl.name as place_name, pc.status, pc.rejection_reason, pc.revoke_reason, pc.revoked_at, pc.revoked_by = pc.user_id as revoked_by_self, pc.created_at
         from public.place_claims pc join public.places pl on pl.id = pc.place_id where pc.user_id = $1 order by pc.created_at desc limit 100`,
      [userId],
    ),
  ]);
  return {
    proposals: proposals.rows,
    claims: claims.rows,
    managedPlaceIds: claims.rows.filter((r) => r.status === "approved").map((r) => String(r.place_id)),
  };
}

import { z } from "zod";

/**
 * E-mails transactionnels (docs/DECISIONS.md D-019) : texte brut, en français, sans suivi
 * d'ouverture ni lien de désinscription (aucun contenu commercial). Logique pure.
 */
export const EMAIL_KINDS = ["review_withdrawn", "claim_rejected", "management_revoked"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

export const ReviewWithdrawnPayload = z.object({ placeId: z.string().min(1), placeName: z.string().min(1).max(200) });
export type ReviewWithdrawnPayload = z.infer<typeof ReviewWithdrawnPayload>;

export const ClaimRejectedPayload = z.object({ placeId: z.string().min(1), placeName: z.string().min(1).max(200), reason: z.string().min(3).max(300) });
export type ClaimRejectedPayload = z.infer<typeof ClaimRejectedPayload>;

/** Ce qui a réellement été fait lors du retrait (et non les cases cochées). */
export const ManagementRevokedPayload = z.object({
  placeId: z.string().min(1),
  placeName: z.string().min(1).max(200),
  reason: z.string().min(3).max(300),
  /** Informations « fournies par l'établissement » : effacées, laissées affichées, ou il n'y en avait pas. */
  info: z.enum(["cleared", "kept", "none"]),
  removedReplies: z.number().int().nonnegative(),
  keptReplies: z.number().int().nonnegative(),
  rejectedPending: z.number().int().nonnegative(),
});
export type ManagementRevokedPayload = z.infer<typeof ManagementRevokedPayload>;

export type EmailContext = { siteUrl: string | null; supportEmail: string | null };
export type RenderedEmail = { subject: string; text: string };

/** Retire les caractères de contrôle (pas de retour à la ligne dans un en-tête). */
function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

function link(siteUrl: string | null, path: string): string | null {
  if (!siteUrl) return null;
  return `${siteUrl.replace(/\/+$/, "")}${path}`;
}

export function renderReviewWithdrawn(payload: ReviewWithdrawnPayload, context: EmailContext): RenderedEmail {
  const name = oneLine(payload.placeName);
  const placeLink = link(context.siteUrl, `/lieux/${encodeURIComponent(payload.placeId)}`);
  const spaceLink = link(context.siteUrl, "/contributions");
  const lines = [
    "Bonjour,",
    "",
    `Votre demande de gestion de la fiche « ${name} » sur HORIZON a été validée : vous pouvez désormais corriger ses informations pratiques et répondre aux avis des visiteurs.`,
    "",
    "Vous aviez laissé un avis sur ce lieu. Un établissement ne pouvant pas noter sa propre fiche (conflit d'intérêts), cet avis a été retiré : il n'est plus affiché, mais il n'est pas supprimé. Il ne sera pas republié, même si vous cessez de gérer la fiche.",
    "",
    ...(placeLink && spaceLink ? [`Voir la fiche : ${placeLink}`, `Votre espace établissement : ${spaceLink}`] : ["Retrouvez la fiche dans HORIZON, rubrique « Mes contributions »."]),
    ...(context.supportEmail ? ["", `Une question ? Écrivez à ${oneLine(context.supportEmail)}.`] : []),
    "",
    "Message automatique lié à votre compte HORIZON.",
  ];
  return { subject: `Votre avis sur « ${name} » a été retiré`, text: lines.join("\n") };
}

export function renderClaimRejected(payload: ClaimRejectedPayload, context: EmailContext): RenderedEmail {
  const name = oneLine(payload.placeName);
  const placeLink = link(context.siteUrl, `/lieux/${encodeURIComponent(payload.placeId)}`);
  const lines = [
    "Bonjour,",
    "",
    `Votre demande de gestion de la fiche « ${name} » sur HORIZON n'a pas été validée.`,
    "",
    `Motif indiqué par l'équipe : ${oneLine(payload.reason)}`,
    "",
    "Vous pouvez déposer une nouvelle demande avec un SIRET correspondant à l'établissement et une preuve vérifiable (adresse e-mail sur le domaine de l'établissement, ou justificatif décrit précisément), depuis la fiche du lieu, bouton « C'est votre établissement ? ».",
    ...(placeLink ? ["", `Voir la fiche : ${placeLink}`] : []),
    ...(context.supportEmail ? ["", `Une question ? Écrivez à ${oneLine(context.supportEmail)}.`] : []),
    "",
    "Message automatique lié à votre compte HORIZON.",
  ];
  return { subject: `Votre demande de gestion de « ${name} » n'a pas été validée`, text: lines.join("\n") };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

export function renderManagementRevoked(payload: ManagementRevokedPayload, context: EmailContext): RenderedEmail {
  const name = oneLine(payload.placeName);
  const placeLink = link(context.siteUrl, `/lieux/${encodeURIComponent(payload.placeId)}`);
  const consequences = [
    "- vous ne pouvez plus modifier les informations pratiques de la fiche ni répondre aux avis ;",
    ...(payload.info === "cleared" ? ["- les informations pratiques fournies par l'établissement ont été effacées de la fiche (elles sont affichées comme inconnues) ;"] : []),
    ...(payload.info === "kept" ? ["- les informations pratiques fournies par l'établissement restent affichées, datées et signalées comme telles ;"] : []),
    ...(payload.removedReplies > 0 ? [`- ${plural(payload.removedReplies, "réponse publiée a été retirée", "réponses publiées ont été retirées")} ;`] : []),
    ...(payload.keptReplies > 0 ? [`- ${plural(payload.keptReplies, "réponse déjà publiée reste visible", "réponses déjà publiées restent visibles")} ;`] : []),
    ...(payload.rejectedPending > 0 ? [`- ${plural(payload.rejectedPending, "réponse en attente de modération ne sera pas publiée", "réponses en attente de modération ne seront pas publiées")} ;`] : []),
    "- comme ancien gestionnaire, vous ne pouvez pas noter ce lieu.",
  ];
  const lines = [
    "Bonjour,",
    "",
    `Un administrateur de HORIZON vous a retiré la gestion de la fiche « ${name} ».`,
    "",
    `Motif : ${oneLine(payload.reason)}`,
    "",
    "Ce que cela change :",
    ...consequences,
    "",
    "La fiche peut de nouveau être revendiquée. Si vous représentez toujours l'établissement, vous pouvez déposer une nouvelle demande depuis la fiche (bouton « C'est votre établissement ? ») : elle sera vérifiée comme la première.",
    ...(placeLink ? ["", `Voir la fiche : ${placeLink}`] : []),
    ...(context.supportEmail ? ["", `Une question ? Écrivez à ${oneLine(context.supportEmail)}.`] : []),
    "",
    "Message automatique lié à votre compte HORIZON.",
  ];
  return { subject: `La gestion de la fiche « ${name} » vous a été retirée`, text: lines.join("\n") };
}

/** Rend un e-mail de la file ; `null` si le contenu enregistré est invalide (jamais envoyé tel quel). */
export function renderEmail(kind: string, payload: unknown, context: EmailContext): RenderedEmail | null {
  if (kind === "review_withdrawn") {
    const parsed = ReviewWithdrawnPayload.safeParse(payload);
    return parsed.success ? renderReviewWithdrawn(parsed.data, context) : null;
  }
  if (kind === "claim_rejected") {
    const parsed = ClaimRejectedPayload.safeParse(payload);
    return parsed.success ? renderClaimRejected(parsed.data, context) : null;
  }
  if (kind === "management_revoked") {
    const parsed = ManagementRevokedPayload.safeParse(payload);
    return parsed.success ? renderManagementRevoked(parsed.data, context) : null;
  }
  return null;
}

/** Délai avant la tentative suivante : 1, 5, 30 puis 120 minutes ; abandon après 5 tentatives. */
export const MAX_EMAIL_ATTEMPTS = 5;
export function retryDelayMinutes(attempts: number): number {
  return [1, 5, 30, 120][Math.min(Math.max(attempts, 1), 4) - 1]!;
}

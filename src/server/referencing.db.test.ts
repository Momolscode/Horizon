import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServer, asUser, createUser, deleteUsers, pgErrorCode, pool } from "@/test/db";
import { COMMUNITY_SOURCE_ID, type Proposal } from "@/modules/catalog/contributions";
import { loadCatalogFromDb } from "./catalog";
import { recordVisit } from "./progression";
import { moderateReview } from "./reviews";
import {
  adminListManagers,
  adminListProposals,
  approveClaim,
  approveProposal,
  adminListClaims,
  CONFLICT_REVIEW_REASON,
  ContributionError,
  managedReviews,
  moderateReply,
  myContributions,
  rejectClaim,
  rejectProposal,
  relinquishClaim,
  revokeClaim,
  submitClaim,
  submitProposal,
  submitReply,
  updateEstablishmentInfo,
  adminListReplies,
} from "./contributions";

/** Référencement élargi (D-017) : propositions, doublons, revendication, avis et réponses. */
let admin: string;
let member: string;
let pro: string;
let intruder: string;
let guest: string;
const users: string[] = [];
const createdPlaces: string[] = [];

const stamp = Date.now().toString(36);
const baseProposal = (overrides: Partial<Proposal> = {}): Proposal => ({
  destinationId: "lyon",
  name: `Atelier Vélo ${stamp}`,
  category: "shop",
  location: { lat: 45.7512, lng: 4.8431 },
  summary: "Atelier associatif de réparation de vélos, ouvert à tous.",
  website: null,
  price: "free",
  restaurantStyle: null,
  ...overrides,
});
const SIRET = "12345678900007"; // numéro fictif, clé de Luhn valide

beforeAll(async () => {
  admin = await createUser("ref-admin");
  member = await createUser("ref-member");
  pro = await createUser("ref-pro");
  intruder = await createUser("ref-intruder");
  guest = await createUser("ref-guest");
  users.push(admin, member, pro, intruder, guest);
  await pool.query(`insert into public.admins (user_id) values ($1)`, [admin]);
});
afterAll(async () => {
  // Les autres fichiers de test comptent les 40 lieux du seed : on retire tout ce qui a été créé.
  // D'abord les comptes (cascade : visites, parcelles, avis, réponses, revendications), puis les lieux.
  await deleteUsers(users);
  await pool.query(`delete from public.place_proposals where name like $1`, [`%${stamp}%`]);
  await pool.query(`delete from public.place_proposals where place_id = any($1::text[])`, [createdPlaces]);
  await pool.query(`delete from public.reviews where place_id = any($1::text[])`, [createdPlaces]);
  await pool.query(`delete from public.visits where place_id = any($1::text[])`, [createdPlaces]);
  await pool.query(`delete from public.places where id = any($1::text[])`, [createdPlaces]);
  await pool.end();
});

describe("propositions de lieux", () => {
  it("refuse un point hors destination et une catégorie réservée au catalogue éditorial", async () => {
    await expect(asServer((c) => submitProposal(c, member, baseProposal({ location: { lat: 48.8566, lng: 2.3522 } }), false))).rejects.toMatchObject({ status: 400 });
    await expect(asServer((c) => submitProposal(c, member, { ...baseProposal(), category: "monument" }, false))).rejects.toMatchObject({ status: 400 });
  });

  it("signale un doublon probable (lieu publié à moins de 100 m au nom proche) et ne l'enregistre qu'après confirmation", async () => {
    // Le Petit Canut (catalogue de démonstration) : même nom, à quelques mètres.
    const catalog = (await loadCatalogFromDb(pool)).catalog;
    const canut = catalog.places.find((p) => p.id === "lyon-petit-canut") ?? catalog.places.find((p) => p.name.startsWith("Le Petit Canut"))!;
    const near = { lat: canut.location.lat + 0.0002, lng: canut.location.lng };
    const attempt = asServer((c) => submitProposal(c, member, baseProposal({ name: `Au Petit Canut ${stamp}`, location: near, category: "restaurant", restaurantStyle: "bistrot" }), false));
    await expect(attempt).rejects.toBeInstanceOf(ContributionError);
    const error = (await attempt.catch((e: unknown) => e)) as ContributionError;
    expect(error.status).toBe(409);
    expect(JSON.stringify(error.details)).toContain(canut.id);
    const confirmed = await asServer((c) => submitProposal(c, member, baseProposal({ name: `Au Petit Canut ${stamp}`, location: near, category: "restaurant", restaurantStyle: "bistrot" }), true));
    expect(confirmed.duplicateOf).toContain(canut.id);
    await asServer((c) => rejectProposal(c, admin, confirmed.id, "Doublon du Petit Canut"));
  });

  it("une proposition n'apparaît qu'après modération, marquée « proposé par un membre, non vérifié »", async () => {
    const { id } = await asServer((c) => submitProposal(c, member, baseProposal(), false));
    let catalog = (await loadCatalogFromDb(pool)).catalog;
    expect(catalog.places.some((p) => p.name === baseProposal().name)).toBe(false);
    expect((await asServer((c) => adminListProposals(c))).some((r) => r.id === id)).toBe(true);
    // Le navigateur n'a aucun accès direct aux propositions.
    await asUser(member, async (c) => {
      expect(await pgErrorCode(c.query(`select * from public.place_proposals`))).toBe("42501");
    });
    const placeId = await asServer((c) => approveProposal(c, admin, id));
    createdPlaces.push(placeId);
    catalog = (await loadCatalogFromDb(pool)).catalog;
    const place = catalog.places.find((p) => p.id === placeId)!;
    expect(place).toMatchObject({ category: "shop", sourceIds: [COMMUNITY_SOURCE_ID], locationPrecision: "approximate" });
    expect(place.verification.status).toBe("unverified");
    expect(place.practical.price).toMatchObject({ status: "estimate", value: { kind: "free" } });
    await expect(asServer((c) => approveProposal(c, admin, id))).rejects.toMatchObject({ status: 404 });
    const mine = await asServer((c) => myContributions(c, member));
    expect(mine.proposals.find((p) => p.id === id)).toMatchObject({ status: "approved", place_id: placeId });
  });
});

describe("revendication par un professionnel", () => {
  let placeId: string;
  let claimId: string;

  beforeAll(async () => {
    const { id } = await asServer((c) => submitProposal(c, member, baseProposal({ name: `Kayak Saône ${stamp}`, category: "outdoor", location: { lat: 45.765, lng: 4.828 } }), true));
    placeId = await asServer((c) => approveProposal(c, admin, id));
    createdPlaces.push(placeId);
  });

  it("refuse un SIRET invalide ; une revendication en attente ne donne aucun droit", async () => {
    await expect(asServer((c) => submitClaim(c, pro, { placeId, siret: "12345678900008", proofKind: "email_domain", proofText: "gerant@kayak.example" }))).rejects.toMatchObject({ status: 400 });
    claimId = await asServer((c) => submitClaim(c, pro, { placeId, siret: SIRET, proofKind: "email_domain", proofText: "gerant@kayak.example" }));
    await expect(asServer((c) => submitClaim(c, pro, { placeId, siret: SIRET, proofKind: "document", proofText: "Extrait Kbis disponible" }))).rejects.toMatchObject({ status: 409 });
    const update = { website: "https://kayak.example", price: "lte30", openingHours: null, bookingMode: "recommended" };
    await expect(asServer((c) => updateEstablishmentInfo(c, pro, placeId, update))).rejects.toMatchObject({ status: 403 });
  });

  it("validée par un administrateur, elle permet de corriger les informations, affichées « fournies par l'établissement »", async () => {
    await asServer((c) => approveClaim(c, admin, claimId));
    // Le demandeur est prévenu par e-mail (aucun avis à retirer : « revendication validée »).
    expect((await pool.query(`select user_id, kind, payload from public.email_outbox where dedupe_key like $1`, [`%:${claimId}`])).rows).toEqual([
      { user_id: pro, kind: "claim_approved", payload: { placeId, placeName: `Kayak Saône ${stamp}` } },
    ]);
    await asServer((c) => updateEstablishmentInfo(c, pro, placeId, { website: "https://kayak.example", price: "lte30", openingHours: null, bookingMode: "recommended" }));
    const place = (await loadCatalogFromDb(pool)).catalog.places.find((p) => p.id === placeId)!;
    expect(place.practical.website).toMatchObject({ status: "estimate", by: "establishment", value: "https://kayak.example" });
    expect(place.practical.price).toMatchObject({ status: "estimate", by: "establishment" });
    // Un autre compte ne peut ni revendiquer une fiche déjà gérée, ni la modifier.
    await expect(asServer((c) => submitClaim(c, intruder, { placeId, siret: SIRET, proofKind: "document", proofText: "Je suis le vrai gérant" }))).rejects.toMatchObject({ status: 409 });
    await expect(asServer((c) => updateEstablishmentInfo(c, intruder, placeId, { website: null, price: "unknown", openingHours: null, bookingMode: "unknown" }))).rejects.toMatchObject({ status: 403 });
  });

  it("une revendication refusée ne donne aucun droit", async () => {
    const { id } = await asServer((c) => submitProposal(c, member, baseProposal({ name: `Escalade Croix-Rousse ${stamp}`, category: "outdoor", location: { lat: 45.776, lng: 4.83 } }), true));
    const other = await asServer((c) => approveProposal(c, admin, id));
    createdPlaces.push(other);
    const claim = await asServer((c) => submitClaim(c, intruder, { placeId: other, siret: SIRET, proofKind: "document", proofText: "Justificatif à venir" }));
    await expect(asServer((c) => rejectClaim(c, admin, claim, " x "))).rejects.toMatchObject({ status: 400 });
    await asServer((c) => rejectClaim(c, admin, claim, "Justificatif absent"));
    // Le demandeur est prévenu par e-mail, avec le motif ; un second refus est impossible (404), donc aucun doublon.
    const outbox = (await pool.query(`select user_id, kind, payload from public.email_outbox where dedupe_key = $1`, [`claim_rejected:${claim}`])).rows;
    expect(outbox).toEqual([{ user_id: intruder, kind: "claim_rejected", payload: { placeId: other, placeName: `Escalade Croix-Rousse ${stamp}`, reason: "Justificatif absent" } }]);
    await expect(asServer((c) => rejectClaim(c, admin, claim, "Justificatif absent"))).rejects.toMatchObject({ status: 404 });
    expect((await pool.query(`select count(*)::int as n from public.email_outbox where dedupe_key = $1`, [`claim_rejected:${claim}`])).rows[0].n).toBe(1);
    await expect(asServer((c) => updateEstablishmentInfo(c, intruder, other, { website: null, price: "unknown", openingHours: null, bookingMode: "unknown" }))).rejects.toMatchObject({ status: 403 });
  });

  it("avis : réservés après une visite déclarée ; l'établissement ne note pas sa fiche et ne touche pas aux avis", async () => {
    const catalog = (await loadCatalogFromDb(pool)).catalog;
    // Sans visite déclarée : refusé par la base.
    await asUser(member, async (c) => {
      expect(await pgErrorCode(c.query(`insert into public.reviews (place_id, rating, body) values ($1, 5, 'Super sortie sur la Saône.')`, [placeId]))).toBe("23514");
    });
    await asServer((c) =>
      recordVisit(c, member, { placeId, requestedStatus: "declared", visitedOn: new Date().toISOString().slice(0, 10), idempotencyKey: `ref-visit-${stamp}`, position: null, note: null }, catalog),
    );
    let reviewId = "";
    await asUser(member, async (c) => {
      const res = await c.query(`insert into public.reviews (place_id, rating, body) values ($1, 5, 'Super sortie sur la Saône.') returning id`, [placeId]);
      reviewId = String(res.rows[0].id);
      await c.query("commit");
    });
    // L'établissement a lui aussi déclaré une visite : il ne peut quand même pas noter sa fiche.
    await asServer((c) =>
      recordVisit(c, pro, { placeId, requestedStatus: "declared", visitedOn: new Date().toISOString().slice(0, 10), idempotencyKey: `ref-visit-pro-${stamp}`, position: null, note: null }, catalog),
    );
    await asUser(pro, async (c) => {
      expect(await pgErrorCode(c.query(`insert into public.reviews (place_id, rating, body) values ($1, 5, 'Nous sommes les meilleurs !')`, [placeId]))).toBe("23514");
    });
    await pool.query(`update public.reviews set status = 'published' where id = $1`, [reviewId]);
    await asUser(pro, async (c) => {
      expect((await c.query(`update public.reviews set body = 'Avis réécrit par le gérant.' where id = $1`, [reviewId])).rowCount).toBe(0);
      expect((await c.query(`delete from public.reviews where id = $1`, [reviewId])).rowCount).toBe(0);
    });

    // Réponse gratuite de l'établissement : invisible avant modération, liée à la version relue.
    await expect(asServer((c) => submitReply(c, intruder, reviewId, "Merci !"))).rejects.toMatchObject({ status: 403 });
    await asServer((c) => submitReply(c, pro, reviewId, "Merci pour votre visite, à bientôt sur l'eau !"));
    let published = await asUser(null, async (c) => (await c.query(`select * from public.published_reviews($1)`, [placeId])).rows);
    expect(published[0]).toMatchObject({ after_visit: true, reply_body: null });
    expect(Object.keys(published[0]!)).not.toContain("user_id");
    const pending = (await asServer((c) => adminListReplies(c))).find((r) => r.review_id === reviewId)!;
    await asServer((c) => submitReply(c, pro, reviewId, "Merci ! Réponse corrigée."));
    await expect(asServer((c) => moderateReply(c, admin, reviewId, { decision: "publish", reviewedVersion: pending.version }))).rejects.toMatchObject({ status: 409 });
    const fresh = (await asServer((c) => adminListReplies(c))).find((r) => r.review_id === reviewId)!;
    await asServer((c) => moderateReply(c, admin, reviewId, { decision: "publish", reviewedVersion: fresh.version }));
    published = await asUser(null, async (c) => (await c.query(`select * from public.published_reviews($1)`, [placeId])).rows);
    expect(published[0]).toMatchObject({ reply_body: "Merci ! Réponse corrigée." });
    expect((await asServer((c) => managedReviews(c, pro, placeId)))[0]).toMatchObject({ reply_status: "published" });
  });

  describe("retrait de la gestion", () => {
    const today = () => new Date().toISOString().slice(0, 10);
    let memberReview: string;
    let guestReview: string;
    const publishedReplies = async () =>
      new Map((await asUser(null, async (c) => (await c.query(`select id, reply_body from public.published_reviews($1)`, [placeId])).rows)).map((r) => [String(r.id), r.reply_body as string | null]));

    beforeAll(async () => {
      memberReview = String((await pool.query(`select id from public.reviews where place_id = $1 and user_id = $2`, [placeId, member])).rows[0].id);
      // Deuxième avis publié (autre visiteur), auquel l'établissement répond sans que la réponse soit encore modérée.
      const catalog = (await loadCatalogFromDb(pool)).catalog;
      await asServer((c) => recordVisit(c, guest, { placeId, requestedStatus: "declared", visitedOn: today(), idempotencyKey: `ref-visit-guest-${stamp}`, position: null, note: null }, catalog));
      guestReview = String((await pool.query(`insert into public.reviews (place_id, user_id, rating, body, status) values ($1, $2, 4, 'Belle balade, matériel en bon état.', 'published') returning id`, [placeId, guest])).rows[0].id);
      await asServer((c) => submitReply(c, pro, guestReview, "Merci, au plaisir de vous revoir !"));
    });

    it("par un administrateur : motif obligatoire, droits perdus, informations effacées sur demande, réponses en attente refusées", async () => {
      expect((await asServer((c) => adminListManagers(c))).find((m) => m.id === claimId)).toMatchObject({ place_id: placeId, has_info: true, published_replies: 1 });
      await expect(asServer((c) => revokeClaim(c, admin, claimId, { reason: " x ", removeReplies: false, clearInfo: true }))).rejects.toMatchObject({ status: 400 });
      await asServer((c) => revokeClaim(c, admin, claimId, { reason: "Changement de propriétaire", removeReplies: false, clearInfo: true }));
      await expect(asServer((c) => revokeClaim(c, admin, claimId, { reason: "Changement de propriétaire", removeReplies: false, clearInfo: true }))).rejects.toMatchObject({ status: 404 });

      // Plus aucun droit sur la fiche.
      await expect(asServer((c) => updateEstablishmentInfo(c, pro, placeId, { website: null, price: "unknown", openingHours: null, bookingMode: "unknown" }))).rejects.toMatchObject({ status: 403 });
      await expect(asServer((c) => managedReviews(c, pro, placeId))).rejects.toMatchObject({ status: 403 });
      await expect(asServer((c) => submitReply(c, pro, memberReview, "Encore moi."))).rejects.toMatchObject({ status: 403 });
      await expect(asServer((c) => relinquishClaim(c, pro, placeId, { clearInfo: false }))).rejects.toMatchObject({ status: 403 });

      // Informations de l'établissement redevenues inconnues ; réponse en attente refusée, réponse publiée conservée.
      const place = (await loadCatalogFromDb(pool)).catalog.places.find((p) => p.id === placeId)!;
      expect(place.practical.website).toEqual({ status: "unknown" });
      expect(place.practical.price).toEqual({ status: "unknown" });
      expect(place.practical.booking).toEqual({ status: "unknown" });
      const pendingReply = (await pool.query(`select status, rejection_reason from public.review_replies where review_id = $1`, [guestReview])).rows[0];
      expect(pendingReply).toMatchObject({ status: "rejected" });
      expect((await publishedReplies()).get(memberReview)).toBe("Merci ! Réponse corrigée.");

      // Historique conservé, visible par l'établissement ; retrait journalisé.
      const mine = await asServer((c) => myContributions(c, pro));
      expect(mine.claims.find((c) => c.id === claimId)).toMatchObject({ status: "revoked", revoke_reason: "Changement de propriétaire", revoked_by_self: false });
      expect(mine.managedPlaceIds).not.toContain(placeId);
      expect((await asServer((c) => adminListManagers(c))).some((m) => m.id === claimId)).toBe(false);
      // L'établissement est prévenu par e-mail de ce qui a réellement été fait.
      expect((await pool.query(`select user_id, payload from public.email_outbox where dedupe_key = $1`, [`management_revoked:${claimId}`])).rows).toEqual([
        { user_id: pro, payload: { placeId, placeName: `Kayak Saône ${stamp}`, reason: "Changement de propriétaire", info: "cleared", removedReplies: 0, keptReplies: 1, rejectedPending: 1 } },
      ]);
      const log = (await pool.query(`select admin_id, details from public.admin_audit_log where action = 'claim.revoke' and target_id = $1`, [placeId])).rows;
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ admin_id: admin, details: { claimId, reason: "Changement de propriétaire", clearInfo: true, rejectedPending: 1, removedPublished: 0 } });

      // Ancien gestionnaire : toujours pas d'avis sur la fiche (conflit d'intérêts).
      // (message vérifié : le code 23514 est aussi celui de la règle « visite requise »)
      await asUser(pro, async (c) => {
        await expect(c.query(`insert into public.reviews (place_id, rating, body) values ($1, 5, 'Depuis que je suis parti, c''est moins bien.')`, [placeId])).rejects.toMatchObject({
          code: "23514",
          message: expect.stringContaining("gère ou a gérée"),
        });
      });
    });

    it("la fiche redevient revendicable ; le nouveau gestionnaire peut remplacer une réponse de l'ancien ; retrait avec les réponses publiées", async () => {
      const newClaim = await asServer((c) => submitClaim(c, intruder, { placeId, siret: SIRET, proofKind: "document", proofText: "Acte de cession du fonds" }));
      await asServer((c) => approveClaim(c, admin, newClaim));
      await asServer((c) => updateEstablishmentInfo(c, intruder, placeId, { website: "https://kayak-nouveau.example", price: "lte15", openingHours: null, bookingMode: "none" }));
      // La réponse publiée de l'ancien gestionnaire est remplacée (repasse en modération) ; la réponse refusée aussi.
      await asServer((c) => submitReply(c, intruder, memberReview, "Nouvelle équipe : merci pour votre avis !"));
      await asServer((c) => submitReply(c, intruder, guestReview, "Merci et bienvenue à nouveau."));
      expect((await pool.query(`select user_id, status from public.review_replies where review_id = $1`, [memberReview])).rows[0]).toMatchObject({ user_id: intruder, status: "pending" });
      for (const reply of (await asServer((c) => adminListReplies(c))).filter((r) => r.review_id === memberReview || r.review_id === guestReview)) {
        await asServer((c) => moderateReply(c, admin, String(reply.review_id), { decision: "publish", reviewedVersion: String(reply.version) }));
      }
      expect((await publishedReplies()).get(guestReview)).toBe("Merci et bienvenue à nouveau.");

      await asServer((c) => revokeClaim(c, admin, newClaim, { reason: "Réponses contraires aux règles", removeReplies: true, clearInfo: false }));
      expect((await pool.query(`select payload from public.email_outbox where dedupe_key = $1`, [`management_revoked:${newClaim}`])).rows[0].payload).toMatchObject({
        info: "kept",
        removedReplies: 2,
        keptReplies: 0,
        rejectedPending: 0,
      });
      const replies = await publishedReplies();
      expect(replies.get(memberReview)).toBeNull();
      expect(replies.get(guestReview)).toBeNull();
      // Sans « effacer », les informations restent affichées, datées et « fournies par l'établissement ».
      const place = (await loadCatalogFromDb(pool)).catalog.places.find((p) => p.id === placeId)!;
      expect(place.practical.website).toMatchObject({ status: "estimate", by: "establishment", value: "https://kayak-nouveau.example" });
      await expect(asServer((c) => updateEstablishmentInfo(c, intruder, placeId, { website: null, price: "unknown", openingHours: null, bookingMode: "unknown" }))).rejects.toMatchObject({ status: 403 });
    });

    it("renoncement par l'établissement lui-même, avec effacement facultatif de ses informations", async () => {
      const { id } = await asServer((c) => submitProposal(c, member, baseProposal({ name: `Paddle Confluence ${stamp}`, category: "outdoor", location: { lat: 45.742, lng: 4.818 } }), true));
      const place = await asServer((c) => approveProposal(c, admin, id));
      createdPlaces.push(place);
      const claim = await asServer((c) => submitClaim(c, pro, { placeId: place, siret: SIRET, proofKind: "email_domain", proofText: "contact@paddle.example" }));
      await asServer((c) => approveClaim(c, admin, claim));
      // Aucun avis retiré : un seul e-mail, « revendication validée ».
      expect((await pool.query(`select kind from public.email_outbox where dedupe_key like $1`, [`%:${claim}`])).rows).toEqual([{ kind: "claim_approved" }]);
      await asServer((c) => updateEstablishmentInfo(c, pro, place, { website: "https://paddle.example", price: "lte30", openingHours: null, bookingMode: "required" }));
      await expect(asServer((c) => relinquishClaim(c, intruder, place, { clearInfo: true }))).rejects.toMatchObject({ status: 403 });

      await asServer((c) => relinquishClaim(c, pro, place, { clearInfo: true }));
      // Renoncement : décidé par l'établissement lui-même, aucun e-mail « gestion retirée ».
      expect((await pool.query(`select 1 from public.email_outbox where dedupe_key = $1`, [`management_revoked:${claim}`])).rowCount).toBe(0);
      const after = (await loadCatalogFromDb(pool)).catalog.places.find((p) => p.id === place)!;
      expect(after.practical.website).toEqual({ status: "unknown" });
      expect(after.practical.booking).toEqual({ status: "unknown" });
      expect(after.practical.price).toEqual({ status: "unknown" });
      const mine = await asServer((c) => myContributions(c, pro));
      expect(mine.claims.find((c) => c.id === claim)).toMatchObject({ status: "revoked", revoke_reason: "Renoncement de l'établissement", revoked_by_self: true });
      expect(mine.managedPlaceIds).not.toContain(place);
      await expect(asServer((c) => relinquishClaim(c, pro, place, { clearInfo: false }))).rejects.toMatchObject({ status: 403 });
      await expect(asServer((c) => updateEstablishmentInfo(c, pro, place, { website: null, price: "unknown", openingHours: null, bookingMode: "unknown" }))).rejects.toMatchObject({ status: 403 });
    });

    describe("fiche sans informations, concurrence et renoncement sans effacement", () => {
      let place: string;
      let review: string;
      let claim: string;

      beforeAll(async () => {
        const { id } = await asServer((c) => submitProposal(c, member, baseProposal({ name: `Canoë Gerland ${stamp}`, category: "outdoor", location: { lat: 45.73, lng: 4.835 } }), true));
        place = await asServer((c) => approveProposal(c, admin, id));
        createdPlaces.push(place);
        review = String((await pool.query(`insert into public.reviews (place_id, user_id, rating, body, status) values ($1, $2, 3, 'Correct, un peu d''attente au départ.', 'published') returning id`, [place, guest])).rows[0].id);
        claim = await asServer((c) => submitClaim(c, pro, { placeId: place, siret: SIRET, proofKind: "email_domain", proofText: "contact@canoe.example" }));
        await asServer((c) => approveClaim(c, admin, claim));
      });

      it("une réponse envoyée pendant un retrait attend sa validation, puis est refusée (403)", async () => {
        expect((await asServer((c) => adminListManagers(c))).find((m) => m.id === claim)).toMatchObject({ has_info: false, published_replies: 0 });
        const revoking = await pool.connect();
        try {
          await revoking.query("begin");
          await revokeClaim(revoking, admin, claim, { reason: "Retrait concurrent", removeReplies: false, clearInfo: false });
          // La réponse attend le verrou de la revendication (assertManager … for share).
          const reply = asServer((c) => submitReply(c, pro, review, "Réponse envoyée pendant le retrait."));
          const early = await Promise.race([reply.then(() => "fini", () => "fini"), new Promise((r) => setTimeout(() => r("en attente"), 300))]);
          expect(early).toBe("en attente");
          await revoking.query("commit");
          await expect(reply).rejects.toMatchObject({ status: 403 });
        } finally {
          await revoking.query("rollback").catch(() => undefined);
          revoking.release();
        }
        expect((await pool.query(`select 1 from public.review_replies where review_id = $1`, [review])).rowCount).toBe(0);
        // Fiche sans informations ni réponses : l'e-mail n'en parle pas.
        expect((await pool.query(`select payload from public.email_outbox where dedupe_key = $1`, [`management_revoked:${claim}`])).rows[0].payload).toMatchObject({
          info: "none",
          removedReplies: 0,
          keptReplies: 0,
          rejectedPending: 0,
        });
      });

      it("renoncement sans effacement : informations conservées, réponse en attente abandonnée", async () => {
        const again = await asServer((c) => submitClaim(c, pro, { placeId: place, siret: SIRET, proofKind: "email_domain", proofText: "contact@canoe.example" }));
        await asServer((c) => approveClaim(c, admin, again));
        await asServer((c) => updateEstablishmentInfo(c, pro, place, { website: "https://canoe.example", price: "lte15", openingHours: null, bookingMode: "none" }));
        await asServer((c) => submitReply(c, pro, review, "Merci, nous avons ajouté un second ponton."));
        await asServer((c) => relinquishClaim(c, pro, place, { clearInfo: false }));
        const after = (await loadCatalogFromDb(pool)).catalog.places.find((p) => p.id === place)!;
        expect(after.practical.website).toMatchObject({ status: "estimate", by: "establishment", value: "https://canoe.example" });
        expect((await pool.query(`select status, moderated_by from public.review_replies where review_id = $1`, [review])).rows[0]).toMatchObject({ status: "rejected", moderated_by: null });
        const mine = await asServer((c) => myContributions(c, pro));
        expect(mine.claims.find((c) => c.id === again)).toMatchObject({ status: "revoked", revoked_by_self: true });
      });
    });
  });
});

describe("avis déposé avant la revendication", () => {
  let owner: string;
  const today = () => new Date().toISOString().slice(0, 10);
  const newPlace = async (name: string, lat: number, lng: number) => {
    const { id } = await asServer((c) => submitProposal(c, member, baseProposal({ name: `${name} ${stamp}`, category: "outdoor", location: { lat, lng } }), true));
    const place = await asServer((c) => approveProposal(c, admin, id));
    createdPlaces.push(place);
    return place;
  };
  const reviewAsUser = async (userId: string, place: string, body: string) => {
    const catalog = (await loadCatalogFromDb(pool)).catalog;
    await asServer((c) => recordVisit(c, userId, { placeId: place, requestedStatus: "declared", visitedOn: today(), idempotencyKey: `ref-own-${place}-${userId}`, position: null, note: null }, catalog));
    return asUser(userId, async (c) => {
      const res = await c.query(`insert into public.reviews (place_id, rating, body) values ($1, 5, $2) returning id`, [place, body]);
      await c.query("commit");
      return String(res.rows[0].id);
    });
  };
  const version = async (reviewId: string) => String((await pool.query(`select updated_at::text as v from public.reviews where id = $1`, [reviewId])).rows[0].v);
  const publicIds = async (place: string) => (await asUser(null, async (c) => (await c.query(`select id from public.published_reviews($1)`, [place])).rows)).map((r) => String(r.id));

  beforeAll(async () => {
    owner = await createUser("ref-owner");
    users.push(owner);
  });

  it("la validation retire l'avis publié du demandeur ; il ne peut ni le modifier, ni être republié, ni s'afficher", async () => {
    const place = await newPlace("Tyrolienne Fourvière", 45.758, 4.815);
    const review = await reviewAsUser(owner, place, "Sensations garanties, je recommande vivement !");
    const reviewVersion = await version(review);
    await asServer((c) => moderateReview(c, admin, review, { decision: "publish", reviewedVersion: reviewVersion }));
    expect(await publicIds(place)).toContain(review);

    const claim = await asServer((c) => submitClaim(c, owner, { placeId: place, siret: SIRET, proofKind: "email_domain", proofText: "contact@tyrolienne.example" }));
    expect((await asServer((c) => adminListClaims(c))).find((r) => r.id === claim)).toMatchObject({ own_reviews: 1 });
    await asServer((c) => approveClaim(c, admin, claim));

    expect((await pool.query(`select status, rejection_reason, moderated_by from public.reviews where id = $1`, [review])).rows[0]).toMatchObject({
      status: "rejected",
      rejection_reason: CONFLICT_REVIEW_REASON,
      moderated_by: admin,
    });
    expect(await publicIds(place)).not.toContain(review);
    const log = (await pool.query(`select details from public.admin_audit_log where action = 'claim.approve' and target_id = $1`, [place])).rows;
    expect(log[0]!.details).toMatchObject({ claimId: claim, withdrawnReviews: [review] });
    // L'auteur est prévenu par e-mail : enregistré dans la même transaction que le retrait.
    // Un seul e-mail pour cette validation : « avis retiré », qui annonce aussi la validation.
    const outbox = (await pool.query(`select user_id, kind, payload from public.email_outbox where dedupe_key like $1`, [`%:${claim}`])).rows;
    expect(outbox).toEqual([{ user_id: owner, kind: "review_withdrawn", payload: { placeId: place, placeName: `Tyrolienne Fourvière ${stamp}` } }]);

    // Modifier son avis le renverrait en modération : refusé par la base.
    await asUser(owner, async (c) => {
      await expect(c.query(`update public.reviews set body = 'Avis corrigé, toujours excellent.', status = 'pending' where id = $1`, [review])).rejects.toMatchObject({
        code: "23514",
        message: expect.stringContaining("gère ou a gérée"),
      });
    });
    // Même remis en attente par une écriture directe, la modération refuse de le publier…
    await pool.query(`update public.reviews set status = 'pending' where id = $1`, [review]);
    await expect(asServer(async (c) => moderateReview(c, admin, review, { decision: "publish", reviewedVersion: await version(review) }))).rejects.toMatchObject({ status: 409 });
    // … et, publié malgré tout, il n'apparaît pas.
    await pool.query(`update public.reviews set status = 'published' where id = $1`, [review]);
    expect(await publicIds(place)).not.toContain(review);

    // Après un retrait de la gestion, toujours rien.
    await asServer((c) => revokeClaim(c, admin, claim, { reason: "Fin d'activité", removeReplies: false, clearInfo: false }));
    expect(await publicIds(place)).not.toContain(review);
    await asUser(owner, async (c) => {
      expect(await pgErrorCode(c.query(`update public.reviews set body = 'Maintenant que je ne gère plus…', status = 'pending' where id = $1`, [review]))).toBe("23514");
    });
  });

  it("un avis encore en attente est retiré aussi ; les avis des autres visiteurs ne sont pas touchés", async () => {
    const place = await newPlace("Accrobranche Parilly", 45.748, 4.852);
    const own = await reviewAsUser(owner, place, "Parcours très bien entretenus, bravo.");
    const other = await reviewAsUser(guest, place, "Bon moment en famille, personnel attentif.");
    // Le contrôle ne vise que l'établissement : un autre visiteur modifie toujours son avis en attente.
    await asUser(guest, async (c) => {
      expect((await c.query(`update public.reviews set body = 'Bon moment en famille, personnel très attentif.' where id = $1`, [other])).rowCount).toBe(1);
      await c.query("commit");
    });
    const otherVersion = await version(other);
    await asServer((c) => moderateReview(c, admin, other, { decision: "publish", reviewedVersion: otherVersion }));
    const claim = await asServer((c) => submitClaim(c, owner, { placeId: place, siret: SIRET, proofKind: "document", proofText: "Extrait Kbis au nom de la société" }));
    await asServer((c) => approveClaim(c, admin, claim));
    expect((await pool.query(`select status from public.reviews where id = $1`, [own])).rows[0]).toMatchObject({ status: "rejected" });
    expect((await pool.query(`select status from public.reviews where id = $1`, [other])).rows[0]).toMatchObject({ status: "published" });
    expect(await publicIds(place)).toEqual([other]);
  });
});

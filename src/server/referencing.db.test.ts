import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asServer, asUser, createUser, deleteUsers, pgErrorCode, pool } from "@/test/db";
import { COMMUNITY_SOURCE_ID, type Proposal } from "@/modules/catalog/contributions";
import { loadCatalogFromDb } from "./catalog";
import { recordVisit } from "./progression";
import {
  adminListProposals,
  approveClaim,
  approveProposal,
  ContributionError,
  managedReviews,
  moderateReply,
  myContributions,
  rejectClaim,
  rejectProposal,
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
  users.push(admin, member, pro, intruder);
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
    await asServer((c) => rejectClaim(c, admin, claim, "Justificatif absent"));
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
});

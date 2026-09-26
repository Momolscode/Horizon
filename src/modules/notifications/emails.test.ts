import { describe, expect, it } from "vitest";
import { MAX_EMAIL_ATTEMPTS, renderClaimRejected, renderEmail, renderReviewWithdrawn, retryDelayMinutes } from "./emails";

describe("e-mail « avis retiré »", () => {
  const payload = { placeId: "lyon-atelier-ceramique", placeName: "Atelier Céramique" };

  it("explique le retrait sans prétendre à une suppression, avec les liens si l'adresse du site est connue", () => {
    const mail = renderReviewWithdrawn(payload, { siteUrl: "https://horizon.example/", supportEmail: "aide@horizon.example" });
    expect(mail.subject).toBe("Votre avis sur « Atelier Céramique » a été retiré");
    expect(mail.text).toContain("demande de gestion de la fiche « Atelier Céramique »");
    expect(mail.text).toContain("il n'est plus affiché, mais il n'est pas supprimé");
    expect(mail.text).toContain("https://horizon.example/lieux/lyon-atelier-ceramique");
    expect(mail.text).toContain("https://horizon.example/contributions");
    expect(mail.text).toContain("aide@horizon.example");
  });

  it("sans adresse du site ni assistance : aucun lien inventé", () => {
    const mail = renderReviewWithdrawn(payload, { siteUrl: null, supportEmail: null });
    expect(mail.text).not.toMatch(/https?:\/\//);
    expect(mail.text).toContain("rubrique « Mes contributions »");
    expect(mail.text).not.toContain("Une question");
  });

  it("aucun retour à la ligne ne peut entrer dans l'objet (nom de lieu proposé par un membre)", () => {
    const mail = renderReviewWithdrawn({ placeId: "x", placeName: "Bar\r\nBcc: victime@example.test" }, { siteUrl: null, supportEmail: null });
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.subject).toBe("Votre avis sur « Bar Bcc: victime@example.test » a été retiré");
  });

  it("un contenu enregistré invalide ou un type inconnu n'est jamais rendu", () => {
    expect(renderEmail("review_withdrawn", { placeId: "x" }, { siteUrl: null, supportEmail: null })).toBeNull();
    expect(renderEmail("autre", payload, { siteUrl: null, supportEmail: null })).toBeNull();
    expect(renderEmail("review_withdrawn", payload, { siteUrl: null, supportEmail: null })?.subject).toContain("Atelier Céramique");
  });

  it("relances espacées puis abandon", () => {
    expect([1, 2, 3, 4, 5].map(retryDelayMinutes)).toEqual([1, 5, 30, 120, 120]);
    expect(MAX_EMAIL_ATTEMPTS).toBe(5);
  });
});

describe("e-mail « revendication refusée »", () => {
  const payload = { placeId: "lyon-atelier-ceramique", placeName: "Atelier Céramique", reason: "SIRET introuvable ou sans lien avec ce lieu" };

  it("donne le motif et la marche à suivre pour une nouvelle demande", () => {
    const mail = renderClaimRejected(payload, { siteUrl: "https://horizon.example", supportEmail: null });
    expect(mail.subject).toBe("Votre demande de gestion de « Atelier Céramique » n'a pas été validée");
    expect(mail.text).toContain("Motif indiqué par l'équipe : SIRET introuvable ou sans lien avec ce lieu");
    expect(mail.text).toContain("« C'est votre établissement ? »");
    expect(mail.text).toContain("https://horizon.example/lieux/lyon-atelier-ceramique");
    expect(mail.text).not.toContain("Une question");
  });

  it("motif sur une seule ligne ; sans adresse du site, aucun lien", () => {
    const mail = renderClaimRejected({ ...payload, reason: "Preuve\nimpossible à vérifier" }, { siteUrl: null, supportEmail: null });
    expect(mail.text).toContain("Motif indiqué par l'équipe : Preuve impossible à vérifier");
    expect(mail.text).not.toMatch(/https?:\/\//);
  });

  it("un motif absent ou trop court n'est jamais envoyé", () => {
    expect(renderEmail("claim_rejected", { placeId: "x", placeName: "Lieu" }, { siteUrl: null, supportEmail: null })).toBeNull();
    expect(renderEmail("claim_rejected", { ...payload, reason: "no" }, { siteUrl: null, supportEmail: null })).toBeNull();
    expect(renderEmail("claim_rejected", payload, { siteUrl: null, supportEmail: null })?.subject).toContain("n'a pas été validée");
  });
});


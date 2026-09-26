import { expect, test, type Browser, type Page } from "@playwright/test";
import { signIn, signUp, sql } from "./connected-helpers";

/**
 * Référencement élargi (D-017) contre Supabase local : proposition d'un lieu, modération,
 * revendication par l'établissement, informations « fournies par l'établissement »,
 * avis après visite déclarée, réponse de l'établissement, retrait de la gestion par un
 * administrateur et renoncement par l'établissement.
 */
const stamp = Date.now();
const member = `ref-member-${stamp}@example.test`;
const pro = `ref-pro-${stamp}@example.test`;
const admin = `ref-admin-${stamp}@example.test`;
const placeName = `Atelier Céramique ${stamp.toString(36)}`;
const SIRET = "12345678900007"; // numéro fictif, clé de Luhn valide
// Position propre à chaque exécution (dans l'emprise de Lyon) : la base locale n'est pas
// réinitialisée entre deux lancements, et une même position serait — à juste titre — un doublon.
const lat = (45.72 + (stamp % 70) * 0.001).toFixed(4);
const lng = (4.77 + (Math.floor(stamp / 70) % 120) * 0.001).toFixed(4);

const SHOTS = process.env.REF_SHOTS;
const MAILPIT = "http://127.0.0.1:54324"; // interface du serveur SMTP de test (pile Supabase locale)
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: "jpeg", quality: 78 });
}

/** Attend un e-mail reçu par Mailpit (destinataire et objet exacts) et renvoie son contenu. */
async function mailpitMessage(to: string, subject: string): Promise<{ Text: string }> {
  let messageId: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        messageId = ((await res.json()) as { messages: Array<{ ID: string; Subject: string }> }).messages.find((m) => m.Subject === subject)?.ID;
        return Boolean(messageId);
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  return (await (await fetch(`${MAILPIT}/api/v1/message/${messageId}`)).json()) as { Text: string };
}

async function adminPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const exists = await sql(`select 1 from auth.users where email = $1`, [admin]);
  if (exists.length) await signIn(page, admin);
  else await signUp(page, admin);
  await sql(`insert into public.admins (user_id) select id from auth.users where email = $1 on conflict do nothing`, [admin]);
  return page;
}

test.describe.serial("Référencement — mode connecté", () => {
  let placeId = "";

  test("un membre propose un lieu ; il n'apparaît qu'après modération", async ({ page, browser }) => {
    await signUp(page, member);
    await page.goto("/lieux/proposer");
    await page.getByLabel("Destination").selectOption({ label: "Lyon" });
    await page.getByLabel("Nom du lieu").fill(placeName);
    await page.getByRole("radio", { name: /Commerce & artisan/ }).click();
    await page.getByLabel("En quelques mots").fill("Atelier de céramique ouvert à la visite, cours d'initiation le samedi.");
    await page.getByLabel("Prix par personne").selectOption({ label: "15 à 30 €" });
    await page.getByLabel("Latitude").fill(lat);
    await page.getByLabel("Longitude").fill(lng);
    await shot(page, "ref-01-proposer");
    await page.getByRole("button", { name: "Envoyer la proposition" }).click();
    await expect(page.getByRole("heading", { name: "Merci pour votre proposition" })).toBeVisible();

    const moderator = await adminPage(browser);
    await moderator.goto("/admin");
    await moderator.getByRole("tab", { name: "Propositions" }).click();
    const item = moderator.getByRole("listitem").filter({ hasText: placeName });
    await expect(item).toBeVisible();
    await item.getByRole("button", { name: "Publier" }).click();
    await expect(moderator.getByText("Lieu publié.")).toBeVisible();
    const rows = await sql<{ place_id: string }>(`select place_id from public.place_proposals where name = $1`, [placeName]);
    placeId = rows[0]!.place_id;
    expect(placeId).toMatch(/^lyon-atelier-ceramique/);

    await page.goto(`/lieux/${placeId}`);
    await expect(page.getByRole("heading", { name: placeName, level: 1 })).toBeVisible();
    await expect(page.getByText("Proposé par un membre", { exact: true })).toBeVisible();
    await expect(page.getByText("Non vérifié").first()).toBeVisible();
    await moderator.context().close();
  });

  test("l'établissement revendique la fiche ; après validation, ses informations sont signalées comme fournies par lui", async ({ page, browser }) => {
    await signUp(page, pro);
    await page.goto(`/lieux/${placeId}`);
    await page.getByRole("button", { name: /C'est votre établissement/ }).click();
    const dialog = page.getByRole("dialog", { name: "Revendiquer la fiche" });
    await dialog.getByLabel(/SIRET/).fill(SIRET);
    await dialog.getByLabel("Adresse e-mail professionnelle").fill("contact@atelier-ceramique.example");
    await shot(page, "ref-02-revendiquer");
    await dialog.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(dialog.getByText("Demande envoyée.")).toBeVisible();

    // Avant validation : aucune fiche gérée.
    await page.goto("/contributions");
    await expect(page.getByText("Vérification en cours")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer les informations" })).toHaveCount(0);

    const moderator = await adminPage(browser);
    await moderator.goto("/admin");
    await moderator.getByRole("tab", { name: "Revendications" }).click();
    await moderator.getByRole("listitem").filter({ hasText: placeName }).getByRole("button", { name: "Valider" }).click();
    await expect(moderator.getByText("Revendication validée.")).toBeVisible();
    await moderator.context().close();

    await page.reload();
    await expect(page.getByText("Validée : vous gérez cette fiche")).toBeVisible();
    await page.getByLabel("Site web").fill("https://atelier-ceramique.example");
    await page.getByLabel("Réservation").selectOption({ label: "Conseillée" });
    await shot(page, "ref-03-espace-etablissement");
    await page.getByRole("button", { name: "Enregistrer les informations" }).click();
    await expect(page.getByText(/Informations enregistrées/)).toBeVisible();

    await page.goto(`/lieux/${placeId}`);
    await expect(page.getByText("Fourni par l'établissement").first()).toBeVisible();
    await expect(page.getByText("https://atelier-ceramique.example")).toBeVisible();
  });

  test("avis après visite déclarée, puis réponse gratuite de l'établissement publiée après modération", async ({ page, browser }) => {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    await signIn(memberPage, member);
    await memberPage.goto(`/lieux/${placeId}`);
    await expect(memberPage.getByText(/déclarez d'abord votre visite/)).toBeVisible();
    await expect(memberPage.getByLabel("Votre avis")).toHaveCount(0);
    await memberPage.getByRole("button", { name: /J'y suis allé/ }).click();
    await memberPage.getByRole("dialog", { name: "Ajouter une visite au carnet" }).getByRole("button", { name: "Enregistrer la visite" }).click();
    await memberPage.getByRole("dialog", { name: /Parcelle révélée|Visite ajoutée/ }).getByRole("button", { name: "Continuer" }).click();
    const reviewText = `Accueil chaleureux et cours très clair (${stamp}).`;
    await memberPage.getByLabel("Votre avis").fill(reviewText);
    await memberPage.getByRole("button", { name: "Envoyer" }).click();
    await expect(memberPage.getByText(/en attente de modération/)).toBeVisible();

    const moderator = await adminPage(browser);
    await moderator.goto("/admin");
    await moderator.getByRole("tab", { name: "Avis" }).click();
    await moderator.getByRole("listitem").filter({ hasText: reviewText }).getByRole("button", { name: "Publier" }).click();
    await expect(moderator.getByText("Avis publié.")).toBeVisible();

    // L'établissement répond (gratuitement) ; la réponse reste invisible jusqu'à modération.
    await signIn(page, pro);
    await page.goto("/contributions");
    const review = page.getByRole("listitem").filter({ hasText: reviewText });
    await review.getByLabel("Répondre publiquement").fill("Merci beaucoup, au plaisir de vous revoir à l'atelier !");
    await review.getByRole("button", { name: "Envoyer la réponse" }).click();
    await expect(page.getByText("Réponse envoyée : publiée après modération.")).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByText("Réponse de l'établissement")).toHaveCount(0);

    await moderator.reload();
    await moderator.getByRole("tab", { name: "Réponses" }).click();
    await moderator.getByRole("listitem").filter({ hasText: "au plaisir de vous revoir" }).getByRole("button", { name: "Publier" }).click();
    await expect(moderator.getByText("Réponse publiée.")).toBeVisible();
    await memberPage.reload();
    await expect(memberPage.getByText("Réponse de l'établissement")).toBeVisible();
    await expect(memberPage.getByText("Après visite déclarée")).toBeVisible();
    await memberPage.getByText("Réponse de l'établissement").scrollIntoViewIfNeeded();
    await shot(memberPage, "ref-04-avis-et-reponse");
    await moderator.context().close();
    await memberContext.close();
  });

  test("un administrateur retire la gestion de la fiche, avec effacement des informations fournies", async ({ page, browser }) => {
    const moderator = await adminPage(browser);
    await moderator.goto("/admin");
    await moderator.getByRole("tab", { name: "Revendications" }).click();
    const managed = moderator.getByRole("region", { name: "Fiches gérées" }).getByRole("listitem").filter({ hasText: placeName });
    await expect(managed).toContainText("informations « fournies par l'établissement » sur la fiche");
    await expect(managed).toContainText("1 réponse publiée");
    await managed.getByRole("button", { name: "Retirer la gestion…" }).click();
    const form = moderator.getByRole("form", { name: `Retirer la gestion de ${placeName}` });
    await expect(form.getByRole("button", { name: "Confirmer le retrait" })).toBeDisabled();
    await form.getByLabel(/Motif/).fill("Changement de propriétaire");
    await form.getByLabel(/Effacer les informations marquées/).check();
    if (SHOTS) await form.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(moderator, "ref-05-retrait-gestion");
    await form.getByRole("button", { name: "Confirmer le retrait" }).click();
    await expect(moderator.getByText(`Gestion retirée : ${placeName}.`)).toBeVisible();
    await expect(moderator.getByRole("region", { name: "Fiches gérées" }).getByText(placeName)).toHaveCount(0);
    await moderator.context().close();

    await signIn(page, pro);
    await page.goto("/contributions");
    await expect(page.getByText("Gestion retirée par un administrateur : Changement de propriétaire")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer les informations" })).toHaveCount(0);

    // Informations effacées : la fiche ne montre plus rien « fourni par l'établissement » ; la réponse publiée reste.
    await page.goto(`/lieux/${placeId}`);
    await expect(page.getByRole("heading", { name: placeName, level: 1 })).toBeVisible();
    await expect(page.getByText("Fourni par l'établissement")).toHaveCount(0);
    await expect(page.getByText("https://atelier-ceramique.example")).toHaveCount(0);
    await expect(page.getByText("Réponse de l'établissement")).toBeVisible();
    // La fiche est de nouveau revendicable : une nouvelle demande est acceptée (409 « déjà gérée » sinon).
    await page.getByRole("button", { name: /C'est votre établissement/ }).click();
    const dialog = page.getByRole("dialog", { name: "Revendiquer la fiche" });
    await dialog.getByLabel(/SIRET/).fill(SIRET);
    await dialog.getByLabel("Adresse e-mail professionnelle").fill("contact@atelier-ceramique.example");
    await dialog.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(dialog.getByText("Demande envoyée.")).toBeVisible();
  });

  test("demande concurrente refusée avec un motif envoyé par e-mail ; le membre qui a noté le lieu obtient la gestion, son avis est retiré et il est prévenu par e-mail", async ({ page, browser }) => {
    // Le membre a laissé un avis publié sur ce lieu (test 3), puis revendique la fiche.
    await signIn(page, member);
    await page.goto(`/lieux/${placeId}`);
    await page.getByRole("button", { name: /C'est votre établissement/ }).click();
    const dialog = page.getByRole("dialog", { name: "Revendiquer la fiche" });
    await expect(dialog).toContainText("Si vous avez déjà laissé un avis sur ce lieu, il sera retiré à la validation.");
    await dialog.getByLabel(/SIRET/).fill(SIRET);
    await dialog.getByLabel("Adresse e-mail professionnelle").fill("membre@atelier-ceramique.example");
    await dialog.getByRole("button", { name: "Envoyer la demande" }).click();
    await expect(dialog.getByText("Demande envoyée.")).toBeVisible();

    const moderator = await adminPage(browser);
    await moderator.goto("/admin");
    await moderator.getByRole("tab", { name: "Revendications" }).click();
    const pending = moderator.getByRole("region", { name: "Revendications de fiches" }).getByRole("listitem").filter({ hasText: placeName });
    await expect(pending).toHaveCount(2); // demande du membre et nouvelle demande de l'établissement (test 4)
    const flagged = pending.filter({ hasText: "Cette personne a déposé un avis sur ce lieu" });
    await expect(flagged).toHaveCount(1);
    await expect(flagged).toContainText("il sera retiré si vous validez la demande");
    // Refus de la demande de l'établissement, avec un motif saisi : il reçoit un e-mail.
    await pending.filter({ hasNotText: "Cette personne a déposé un avis" }).getByRole("button", { name: "Refuser…" }).click();
    const rejectForm = moderator.getByRole("form", { name: /Refuser la demande de/ });
    await rejectForm.getByLabel(/Motif du refus/).fill("SIRET sans lien avec ce lieu (contrôle e2e)");
    await rejectForm.getByRole("button", { name: "Confirmer le refus" }).click();
    await expect(moderator.getByText("Revendication refusée.")).toBeVisible();
    await expect(pending).toHaveCount(1);
    const rejection = await mailpitMessage(pro, `Votre demande de gestion de « ${placeName} » n'a pas été validée`);
    expect(rejection.Text).toContain("Motif indiqué par l'équipe : SIRET sans lien avec ce lieu (contrôle e2e)");
    expect(rejection.Text).toContain(`http://localhost:3200/lieux/${placeId}`);
    await flagged.getByRole("button", { name: "Valider" }).click();
    await expect(moderator.getByText("Revendication validée.")).toBeVisible();

    // E-mail reçu par le serveur SMTP de test local (Mailpit) : rien ne sort de la machine.
    const mail = await mailpitMessage(member, `Votre avis sur « ${placeName} » a été retiré`);
    expect(mail.Text).toContain(`http://localhost:3200/lieux/${placeId}`);
    expect(mail.Text).toContain("il n'est plus affiché, mais il n'est pas supprimé");

    // L'administration voit l'envoi ; la configuration SMTP est présente.
    await moderator.getByRole("tab", { name: "Vue d'ensemble" }).click();
    const mailCard = moderator.getByRole("region", { name: "E-mails de notification" });
    await expect(mailCard).not.toContainText("SMTP non configuré");
    await expect(mailCard).toContainText(/[1-9]\d* envoyés? sur 7 jours/);
    await moderator.context().close();

    // Sur la fiche : l'avis du membre n'est plus affiché, et il en voit le motif.
    await page.goto(`/lieux/${placeId}`);
    await expect(page.getByText(/refusé \(Retiré : son auteur gère désormais la fiche/)).toBeVisible();
    await expect(page.getByText("Réponse de l'établissement")).toHaveCount(0);
  });

  test("l'établissement renonce lui-même à gérer sa fiche", async ({ page }) => {
    // Le membre gère la fiche depuis le test précédent.
    await signIn(page, member);
    await page.goto("/contributions");
    await expect(page.getByText("Validée : vous gérez cette fiche")).toBeVisible();
    await page.getByRole("button", { name: "Ne plus gérer cette fiche…" }).click();
    const panel = page.getByRole("group", { name: `Ne plus gérer « ${placeName} » ?` });
    await expect(panel).toContainText("vos réponses publiées restent visibles");
    if (SHOTS) await panel.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await shot(page, "ref-06-renoncement");
    await panel.getByRole("button", { name: "Confirmer : ne plus gérer cette fiche" }).click();
    await expect(page.getByText("Vous ne gérez plus cette fiche.")).toBeVisible();
    await expect(page.getByText("Vous avez renoncé à gérer cette fiche")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enregistrer les informations" })).toHaveCount(0);
  });
});

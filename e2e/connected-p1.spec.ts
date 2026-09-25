import { expect, test } from "@playwright/test";
import { pseudonymOf, signIn, signUp, sql } from "./connected-helpers";

const stamp = Date.now();
const alice = `p1-alice-${stamp}@example.test`;
const bob = `p1-bob-${stamp}@example.test`;
const admin = `p1-admin-${stamp}@example.test`;

test.describe.serial("P1 — mode connecté", () => {
  test("partage en lecture seule, révocable", async ({ page, browser }) => {
    await signUp(page, alice);
    await page.goto("/excursions/nouvelle?destination=lyon");
    await page.getByRole("button", { name: /Composer ma sortie/ }).click();
    await page.getByLabel("Titre de l'excursion").fill("Balade partagée");
    await page.getByRole("button", { name: "Enregistrer l'excursion" }).click();
    await expect(page).toHaveURL(/\/excursions\/(?!nouvelle)[\w-]+$/);
    await page.getByRole("button", { name: "Partager" }).click();
    const dialog = page.getByRole("dialog", { name: "Partager l'excursion" });
    await dialog.getByRole("button", { name: "Créer un lien de partage" }).click();
    const link = dialog.locator("p.font-mono").first();
    await expect(link).toContainText("/partage/");
    const url = new URL((await link.innerText()).trim());

    const anonymous = await browser.newContext();
    const visitor = await anonymous.newPage();
    await visitor.goto(url.pathname);
    await expect(visitor.getByRole("heading", { name: "Balade partagée" })).toBeVisible();
    await expect(visitor.getByText("date non communiquée")).toBeVisible();
    await expect(visitor.getByRole("button", { name: /Copier dans mon compte/ })).toBeVisible();

    await dialog.getByRole("button", { name: "Révoquer" }).first().click();
    await expect(dialog.getByText("Révoqué").first()).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole("heading", { name: "Lien révoqué ou inexistant" })).toBeVisible();
    await anonymous.close();
  });

  test("mission accomplie : récompense attribuée par le serveur, une seule fois", async ({ page }) => {
    await signIn(page, alice);
    await page.goto("/lieux/lyon-tete-d-or");
    await page.getByRole("button", { name: /J'y suis allé/ }).click();
    await page.getByRole("dialog", { name: "Ajouter une visite au carnet" }).getByRole("button", { name: "Enregistrer la visite" }).click();
    await page.getByRole("dialog", { name: "Parcelle révélée !" }).getByRole("button", { name: "Continuer" }).click();
    await page.goto("/profil");
    const mission = page.getByRole("listitem").filter({ hasText: "Trésor gratuit" });
    await mission.getByRole("button", { name: "Récupérer +15 XP" }).click();
    await expect(mission.getByText("+15 XP obtenus")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: "Trésor gratuit" }).getByText("+15 XP obtenus")).toBeVisible();
    await expect(page.getByText("40 XP (non dépensable)")).toBeVisible();
  });

  test("amis : invitation par pseudonyme, acceptation par la personne invitée", async ({ page, browser }) => {
    await signUp(page, bob);
    const bobPseudo = await pseudonymOf(bob);
    const aliceContext = await browser.newContext();
    const alicePage = await aliceContext.newPage();
    await signIn(alicePage, alice);
    await alicePage.goto("/communaute");
    await alicePage.getByLabel("Pseudonyme").fill(bobPseudo);
    await alicePage.getByRole("button", { name: "Inviter" }).click();
    await expect(alicePage.getByText("Demande envoyée.")).toBeVisible();

    await page.goto("/communaute");
    const alicePseudo = await pseudonymOf(alice);
    const request = page.getByRole("listitem").filter({ hasText: alicePseudo });
    await request.getByRole("button", { name: "Accepter" }).click();
    await expect(page.getByText("Demande acceptée.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Amis" })).toBeVisible();
    await expect(page.getByText(alicePseudo).first()).toBeVisible();
    await alicePage.reload();
    await expect(alicePage.getByText(bobPseudo).first()).toBeVisible();
    await aliceContext.close();
  });

  test("avis modéré : invisible avant publication, publié par un administrateur, action journalisée", async ({ page, browser }) => {
    await signIn(page, bob);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Accès réservé" })).toBeVisible();

    // Texte unique par exécution : la base locale n'est pas réinitialisée entre deux lancements.
    const reviewText = `Des ruelles magnifiques, à parcourir tôt le matin (${stamp}).`;
    await page.goto("/lieux/lyon-vieux-lyon");
    // Avis réservés aux personnes ayant déclaré une visite du lieu (D-017).
    await expect(page.getByText(/déclarez d'abord votre visite/)).toBeVisible();
    await page.getByRole("button", { name: /J'y suis allé/ }).click();
    await page.getByRole("dialog", { name: "Ajouter une visite au carnet" }).getByRole("button", { name: "Enregistrer la visite" }).click();
    await page.getByRole("dialog", { name: /Parcelle révélée|Visite ajoutée/ }).getByRole("button", { name: "Continuer" }).click();
    await page.getByLabel("Votre avis").fill(reviewText);
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(page.getByText(/en attente de modération/)).toBeVisible();

    const visitorContext = await browser.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto("/lieux/lyon-vieux-lyon");
    await expect(visitor.getByRole("heading", { name: "Avis", exact: true })).toBeVisible();
    await expect(visitor.getByText("Chargement…")).toBeHidden();
    await expect(visitor.getByText(reviewText)).toHaveCount(0);

    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signUp(adminPage, admin);
    await sql(`insert into public.admins (user_id) select id from auth.users where email = $1`, [admin]);
    await adminPage.goto("/admin");
    await expect(adminPage.getByRole("heading", { name: "Administration" })).toBeVisible();
    await expect(adminPage.getByText(/Données insuffisantes/).first()).toBeVisible();
    await adminPage.getByRole("tab", { name: "Avis" }).click();
    const pending = adminPage.getByRole("listitem").filter({ hasText: reviewText });
    await pending.getByRole("button", { name: "Publier" }).click();
    await expect(adminPage.getByText("Avis publié.")).toBeVisible();
    await adminPage.getByRole("tab", { name: "Journal" }).click();
    await expect(adminPage.getByText("review.publish").first()).toBeVisible();

    await visitor.reload();
    await expect(visitor.getByText(reviewText)).toBeVisible();
    await visitorContext.close();
    await adminContext.close();
  });
});

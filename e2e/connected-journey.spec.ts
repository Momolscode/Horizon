import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./helpers";

/**
 * Mode connecté contre Supabase local : vrais comptes, données en base,
 * isolation entre utilisateurs, progression attribuée par le serveur.
 */
const password = "motdepasse-e2e-1234";
const stamp = Date.now();
const alice = `alice-${stamp}@example.test`;
const bob = `bob-${stamp}@example.test`;

async function signUp(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel(/Mot de passe/).fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/carte/);
  await expect(page.getByText("Vous consultez sans compte")).toBeHidden();
}

test.describe("parcours de recette — mode connecté (Supabase local)", () => {
  let excursionUrl = "";

  test("sans compte : consultation possible, aucune donnée enregistrée, API protégée", async ({ page, request }) => {
    await page.goto("/carte");
    await expect(page.getByText("Vous consultez sans compte")).toBeVisible();
    await expect(page.getByText("DÉMONSTRATION", { exact: true })).toBeHidden();
    await page.getByRole("combobox", { name: /Rechercher/ }).fill("vieux-port");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await page.getByRole("checkbox", { name: /Favoris/ }).click();
    await expect(page.getByText("Connectez-vous pour enregistrer vos données.")).toBeVisible();

    const anonymous = await request.post("/api/visits", {
      data: { placeId: "lyon-fourviere", requestedStatus: "declared", visitedOn: "2026-10-03", idempotencyKey: "cle-anonyme-01", position: null, note: null },
    });
    expect(anonymous.status()).toBe(401);
    const catalog = await request.get("/api/catalog");
    expect(catalog.status()).toBe(200);
    expect((await catalog.json()).places).toHaveLength(40);
  });

  test("avec compte : favori, excursion, visite, parcelle et passeport persistés en base", async ({ page }) => {
    await signUp(page, alice);

    await page.getByRole("combobox", { name: /Rechercher/ }).fill("fourviere");
    await page.getByRole("option", { name: /Basilique Notre-Dame de Fourvière/ }).click();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const saveDialog = page.getByRole("dialog", { name: "Enregistrer dans une collection" });
    await saveDialog.getByRole("checkbox", { name: /Favoris/ }).click();
    await expect(saveDialog.getByRole("checkbox", { name: /Favoris/ })).toHaveAttribute("aria-checked", "true");
    await saveDialog.getByRole("button", { name: "Fermer" }).click();

    await page.goto("/excursions/nouvelle?destination=lyon");
    await page.getByRole("button", { name: /Composer ma sortie/ }).click();
    await page.getByLabel("Titre de l'excursion").fill("Lyon en vrai");
    await page.getByRole("button", { name: "Enregistrer l'excursion" }).click();
    await expect(page).toHaveURL(/\/excursions\/(?!nouvelle)[\w-]+$/);
    excursionUrl = new URL(page.url()).pathname;

    await page.reload();
    await expect(page.getByLabel("Titre de l'excursion")).toHaveValue("Lyon en vrai");

    await page.goto("/lieux/lyon-fourviere");
    await expect(page.getByRole("button", { name: "Enregistré" })).toBeVisible();
    await page.getByRole("button", { name: /J'y suis allé/ }).click();
    const visitDialog = page.getByRole("dialog", { name: "Ajouter une visite au carnet" });
    await expect(visitDialog.getByText("Simuler une visite")).toBeHidden();
    await visitDialog.getByRole("button", { name: "Enregistrer la visite" }).dblclick();
    const reveal = page.getByRole("dialog", { name: "Parcelle révélée !" });
    await expect(reveal).toBeVisible();
    await expect(reveal.getByText("+25")).toBeVisible();
    await reveal.getByRole("button", { name: "Continuer" }).click();

    await page.goto("/profil");
    await expect(page.getByText("25 XP (non dépensable)")).toBeVisible();
    await page.reload();
    await expect(page.getByText("25 XP (non dépensable)")).toBeVisible();
    await expect(page.getByRole("link", { name: "Basilique Notre-Dame de Fourvière" })).toHaveCount(2); // carnet + collection
    await expectNoHorizontalOverflow(page);
  });

  test("revenir sur l'onglet ne réaffiche pas un état périmé", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Adresse e-mail").fill(alice);
    await page.getByLabel(/Mot de passe/).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/carte/);
    // Modification faite APRÈS le démarrage de l'application.
    await page.getByRole("combobox", { name: /Rechercher/ }).fill("vieux lyon");
    await page.getByRole("option", { name: /Vieux Lyon/ }).click();
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const saveDialog = page.getByRole("dialog", { name: "Enregistrer dans une collection" });
    await saveDialog.getByRole("checkbox", { name: /Favoris/ }).click();
    await expect(saveDialog.getByRole("checkbox", { name: /Favoris/ })).toHaveAttribute("aria-checked", "true");
    await saveDialog.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByRole("button", { name: "Enregistré", exact: true })).toBeVisible();
    // L'onglet passe en arrière-plan puis revient : Supabase Auth réémet SIGNED_IN.
    // Le compte n'a pas changé : l'application ne doit ni redémarrer ni recharger son état.
    let reboots = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/catalog")) reboots++;
    });
    await page.evaluate(async () => {
      const setVisibility = (value: "hidden" | "visible") => {
        Object.defineProperty(document, "visibilityState", { value, configurable: true });
        document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      };
      setVisibility("hidden");
      await new Promise((r) => setTimeout(r, 200));
      setVisibility("visible");
    });
    await page.waitForTimeout(2500);
    expect(reboots).toBe(0);
    await expect(page.getByRole("button", { name: "Enregistré", exact: true })).toBeVisible();
  });

  test("un autre compte ne voit rien des données du premier", async ({ page }) => {
    await signUp(page, bob);
    await page.goto("/profil");
    await expect(page.getByText("0 XP (non dépensable)")).toBeVisible();
    await expect(page.getByText("Votre carnet est vide")).toBeVisible();
    expect(excursionUrl).not.toBe("");
    await page.goto(excursionUrl);
    await expect(page.getByRole("heading", { name: "Excursion introuvable" })).toBeVisible();
  });

  test("le serveur refuse une visite simulée même si le client la demande", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Adresse e-mail").fill(alice);
    await page.getByLabel(/Mot de passe/).fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/carte/);
    const res = await page.request.post("/api/visits", {
      data: { placeId: "lyon-fourviere", requestedStatus: "simulated", visitedOn: new Date().toISOString().slice(0, 10), idempotencyKey: "cle-simulee-e2e", position: null, note: null },
    });
    expect(res.status()).toBe(422);
    const tooBig = await page.request.post("/api/visits", { data: { placeId: "x".repeat(500) } });
    expect(tooBig.status()).toBe(400);
    const future = await page.request.post("/api/visits", {
      data: { placeId: "lyon-fourviere", requestedStatus: "declared", visitedOn: "2099-01-01", idempotencyKey: "cle-future-e2e", position: null, note: null },
    });
    expect(future.status()).toBe(400);
  });
});

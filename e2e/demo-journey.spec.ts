import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, openApp } from "./helpers";

test.describe("parcours de recette — mode démo", () => {
  test("consulter sans compte ni GPS → rechercher → filtrer → ouvrir → enregistrer → excursion → recharger → visite → parcelle → passeport", async ({ page }) => {
    // 1. Consultation sans compte ni géolocalisation (permission non accordée).
    await openApp(page);
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole("heading", { name: "Où partez-vous ?" })).toBeVisible();

    // 2. Rechercher une ville puis filtrer (gratuit uniquement, coûts inconnus exclus).
    await page.getByRole("combobox", { name: /Rechercher/ }).fill("lyon");
    await page.getByRole("option", { name: /Lyon.*Destination/ }).click();
    await expect(page.getByRole("heading", { name: "Lyon", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: /^Filtres/ }).click();
    const filters = page.getByRole("dialog", { name: "Filtres" });
    await filters.getByRole("radio", { name: "Gratuit" }).click();
    await filters.getByLabel(/Inclure les lieux au coût inconnu/).uncheck();
    await expect(filters.getByText(/masqué\(s\) car leur coût est inconnu/)).toBeVisible();
    await filters.getByRole("button", { name: /^Voir \d+ lieu/ }).click();
    await page.getByRole("button", { name: "Afficher la liste" }).click();
    const list = page.getByRole("region", { name: "Liste des lieux" });
    await expect(list.getByText(/lieux? · Lyon/)).toBeVisible();
    const cards = list.getByRole("button");
    expect(await cards.count()).toBeGreaterThan(0);
    for (const text of await cards.allInnerTexts()) expect(text).toContain("Gratuit");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: /^Filtres/ }).click();
    await page.getByRole("dialog", { name: "Filtres" }).getByRole("button", { name: "Réinitialiser" }).click();
    await page.getByRole("dialog", { name: "Filtres" }).getByRole("button", { name: /^Voir/ }).click();
    await page.getByRole("button", { name: "Afficher la carte" }).click();

    // 3. Ouvrir un lieu et l'enregistrer dans les favoris.
    await page.getByRole("combobox", { name: /Rechercher/ }).fill("fourviere");
    await page.getByRole("option", { name: /Basilique Notre-Dame de Fourvière/ }).click();
    const sheet = page.getByRole("region", { name: /Fiche : Basilique Notre-Dame de Fourvière/ });
    await expect(sheet.getByRole("heading", { name: "Basilique Notre-Dame de Fourvière" })).toBeVisible();
    await expect(sheet.getByText("Non vérifié").first()).toBeVisible();
    await expect(sheet.getByText("Coût inconnu").first()).toBeVisible();
    await sheet.getByRole("button", { name: "Enregistrer", exact: true }).click();
    const saveDialog = page.getByRole("dialog", { name: "Enregistrer dans une collection" });
    await saveDialog.getByRole("checkbox", { name: /Favoris/ }).click();
    await expect(saveDialog.getByRole("checkbox", { name: /Favoris/ })).toHaveAttribute("aria-checked", "true");
    await saveDialog.getByRole("button", { name: "Fermer" }).click();
    await expect(sheet.getByRole("button", { name: "Enregistré" })).toBeVisible();

    // 4. Créer une excursion avec « Surprends-nous », la modifier et l'enregistrer.
    await page.getByRole("link", { name: "Excursions" }).click();
    await page.getByRole("link", { name: /Surprends-nous/ }).click();
    await page.getByRole("radio", { name: "Lyon" }).click();
    await page.getByRole("button", { name: /Composer ma sortie/ }).click();
    await expect(page.getByText("Pourquoi cette proposition")).toBeVisible();
    const steps = page.getByRole("list", { name: "Étapes de l'excursion" }).locator(":scope > li");
    const stepCount = await steps.count();
    expect(stepCount).toBeGreaterThanOrEqual(3);
    expect(stepCount).toBeLessThanOrEqual(5);
    const secondTitle = await steps.nth(1).getByRole("heading").innerText();
    await page.getByRole("button", { name: "Monter l'étape 2" }).click();
    await expect(steps.nth(0).getByRole("heading")).toHaveText(secondTitle);
    await steps.nth(0).getByRole("button", { name: "Remplacer" }).click();
    const replaceDialog = page.getByRole("dialog", { name: "Remplacer l'étape" });
    const alternative = replaceDialog.getByRole("listitem").first().getByRole("button");
    const alternativeName = (await alternative.locator("span.font-bold").last().innerText()).trim();
    await alternative.click();
    await expect(steps.nth(0).getByRole("heading")).toHaveText(alternativeName);
    await page.getByLabel("Titre de l'excursion").fill("Samedi lyonnais");
    await page.getByRole("button", { name: "Enregistrer l'excursion" }).click();
    await expect(page).toHaveURL(/\/excursions\/(?!nouvelle)[\w-]+$/);
    await expectNoHorizontalOverflow(page);

    // 5. Recharger : l'excursion et le favori sont retrouvés.
    await page.reload();
    await expect(page.getByLabel("Titre de l'excursion")).toHaveValue("Samedi lyonnais");
    await expect(steps).toHaveCount(stepCount);
    await expect(steps.nth(0).getByRole("heading")).toHaveText(alternativeName);

    // 6. Déclarer une visite → révélation de la parcelle.
    await page.goto("/lieux/lyon-fourviere");
    await expect(page.getByRole("button", { name: "Enregistré" })).toBeVisible();
    await page.getByRole("button", { name: /J'y suis allé/ }).click();
    const visitDialog = page.getByRole("dialog", { name: "Ajouter une visite au carnet" });
    await visitDialog.getByRole("radio", { name: /Je déclare ma visite/ }).check();
    await visitDialog.getByLabel("Souvenir privé (facultatif)").fill("Vue superbe");
    await visitDialog.getByRole("button", { name: "Enregistrer la visite" }).dblclick();
    const reveal = page.getByRole("dialog", { name: "Parcelle révélée !" });
    await expect(reveal).toBeVisible();
    await expect(reveal.getByText("+25")).toBeVisible();
    await expect(reveal.getByText("Visite déclarée")).toBeVisible();
    await reveal.getByRole("button", { name: "Voir sur ma carte" }).click();
    await expect(page).toHaveURL(/\/carte\?lieu=lyon-fourviere&revele=1/);

    // 7. Passeport mis à jour, un seul crédit malgré le double clic.
    await page.getByRole("link", { name: "Profil" }).click();
    await expect(page.getByText("25 XP (non dépensable)")).toBeVisible();
    await expect(page.getByText(/1 \/ 154 parcelles/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Basilique Notre-Dame de Fourvière" }).first()).toBeVisible();
    await expect(page.getByText("« Vue superbe »")).toBeVisible();
    const badge = page.getByRole("listitem").filter({ hasText: "Premier pas" });
    await expect(badge.getByText("Obtenu")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 8. Rechargement : la progression locale persiste.
    await page.reload();
    await expect(page.getByText("25 XP (non dépensable)")).toBeVisible();

    // 9. Réinitialisation de la démo.
    await page.getByRole("button", { name: "Réinitialiser" }).click();
    await page.getByRole("dialog", { name: "Réinitialiser la démonstration ?" }).getByRole("button", { name: "Tout effacer" }).click();
    await expect(page.getByText("0 XP (non dépensable)")).toBeVisible();
  });

  test("le refus de géolocalisation ne bloque pas la découverte", async ({ page }) => {
    await openApp(page, "/decouvrir");
    await expect(page.getByRole("heading", { name: "Autour de vous" })).toBeVisible();
    await page.getByRole("button", { name: /Me localiser une fois/ }).click();
    await expect(page.getByText(/Localisation refusée|Position indisponible|ne permet pas/)).toBeVisible();
    await page.getByRole("radio", { name: "Marseille" }).click();
    await expect(page.getByRole("heading", { name: "Envies à Marseille" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gratuit" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("écrans principaux sans débordement ni erreur", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const path of ["/", "/carte", "/decouvrir", "/excursions", "/excursions/nouvelle", "/communaute", "/profil", "/profil/parametres", "/bienvenue", "/lieux/marseille-sugiton"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page);
    }
    expect(errors).toEqual([]);
  });

  test("une excursion inconnue affiche un état vide explicite", async ({ page }) => {
    await openApp(page, "/excursions/inexistante");
    await expect(page.getByRole("heading", { name: "Excursion introuvable" })).toBeVisible();
    // Page rendue en streaming sous une frontière Suspense : Next ne peut plus changer le
    // statut (200) mais sert la page 404 avec « noindex » (limite documentée).
    await page.goto("/lieux/inexistant");
    await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
    expect(await page.locator('meta[name="robots"][content*="noindex"]').count()).toBeGreaterThan(0);
    expect((await page.goto("/adresse-inventee"))?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Ouvrir la carte" })).toBeVisible();
  });

  test("paramètres d'URL invalides : pas de plantage, retour à un état valide", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openApp(page, "/excursions/nouvelle?mode=manuel&destination=zzz");
    await expect(page.getByLabel("Titre de l'excursion")).toBeVisible();
    await page.goto("/decouvrir?destination=zzz");
    await expect(page.getByRole("radio", { name: "Toutes" })).toHaveAttribute("aria-checked", "true");
    await page.goto("/carte?lieu=inexistant");
    await expect(page.getByRole("status").filter({ hasText: "n'existe pas" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("« Surprends-nous » avec les réglages par défaut, puis « Modifier les critères » conserve les choix", async ({ page }) => {
    await openApp(page, "/excursions/nouvelle");
    await page.getByRole("radio", { name: "Marseille" }).click();
    await page.getByRole("button", { name: /Composer ma sortie/ }).click();
    await expect(page.locator("ol[aria-label] > li").first()).toBeVisible();
    await expect(page.getByText("Proposition incomplète")).toBeHidden();
    await page.getByRole("button", { name: "Modifier les critères" }).click();
    await expect(page.getByRole("radio", { name: "Marseille" })).toHaveAttribute("aria-checked", "true");
  });

  test("sur mobile, le panneau d'exploration reste au-dessus de la barre de navigation", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Barre de navigation inférieure : mobile uniquement");
    await openApp(page, "/carte");
    await page.getByRole("button", { name: "Lyon", exact: true }).click();
    const panel = page.getByRole("region", { name: "Exploration" });
    await expect(panel).toBeVisible();
    const navTop = (await page.getByRole("navigation", { name: "Navigation principale" }).boundingBox())!.y;
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.y + panelBox.height).toBeLessThanOrEqual(navTop + 1);
  });
});

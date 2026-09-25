#!/usr/bin/env node
/**
 * Captures d'écran RÉELLES de l'application (mode démo), produites en pilotant
 * l'interface comme un utilisateur (aucun état injecté).
 * Prérequis : `npm run build:demo && npx next start -p 3100`.
 * Usage : node scripts/screenshots.mjs [baseUrl] [dossier]
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3100";
const OUT = process.argv[3] ?? "docs/screenshots";
const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];

async function shoot(page, name) {
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 78 });
  console.log(`✓ ${name}`);
}

async function declareVisit(page, placeId, mode = /Je déclare ma visite/) {
  await page.goto(`${BASE}/lieux/${placeId}`);
  await page.getByRole("button", { name: /J'y suis allé/ }).click();
  const dialog = page.getByRole("dialog", { name: "Ajouter une visite au carnet" });
  await dialog.getByRole("radio", { name: mode }).check();
  await dialog.getByRole("button", { name: /Enregistrer la visite/ }).click();
  return page.getByRole("dialog", { name: /Parcelle|Visite ajoutée/ });
}

async function run(viewportName, viewport, deviceScaleFactor) {
  const browser = await chromium.launch({ args: ARGS });
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: "fr-FR", timezoneId: "Europe/Paris" });
  const page = await context.newPage();
  const p = (name) => `${viewportName}-${name}`;

  await page.goto(`${BASE}/`);
  await shoot(page, p("01-accueil"));
  await page.goto(`${BASE}/carte`);
  await page.waitForTimeout(2500);
  await shoot(page, p("02-carte-france"));
  await page.getByRole("button", { name: "Lyon", exact: true }).click();
  await page.waitForTimeout(4000);
  await shoot(page, p("03-carte-lyon-voile"));
  await page.getByRole("combobox", { name: /Rechercher/ }).fill("fourv");
  await shoot(page, p("04-recherche"));
  await page.getByRole("option", { name: /Basilique Notre-Dame de Fourvière/ }).click();
  await page.waitForTimeout(2500);
  await shoot(page, p("05-fiche-lieu"));
  await page.goto(`${BASE}/carte`);
  await page.getByRole("button", { name: /^Filtres/ }).click();
  await shoot(page, p("06-filtres"));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Afficher la liste" }).click();
  await shoot(page, p("07-liste"));

  await page.goto(`${BASE}/excursions`);
  await shoot(page, p("08-excursions-vide"));
  await page.goto(`${BASE}/excursions/nouvelle?destination=lyon`);
  await shoot(page, p("09-surprends-nous-formulaire"));
  await page.getByRole("button", { name: /Composer ma sortie/ }).click();
  await page.waitForTimeout(800);
  await shoot(page, p("10-surprends-nous-proposition"));
  await page.getByRole("button", { name: "Carte", exact: true }).click();
  await page.waitForTimeout(2500);
  await shoot(page, p("11-excursion-carte"));
  await page.getByRole("button", { name: "Liste", exact: true }).click();
  await page.getByRole("button", { name: "Enregistrer l'excursion" }).click();
  await page.waitForURL(/\/excursions\/(?!nouvelle)/);

  await page.goto(`${BASE}/profil`);
  await shoot(page, p("12-passeport-vide"));
  const reveal = await declareVisit(page, "lyon-fourviere");
  await page.waitForTimeout(1600);
  await shoot(page, p("13-revelation-parcelle"));
  await reveal.getByRole("button", { name: "Voir sur ma carte" }).click();
  await page.waitForTimeout(5000);
  await shoot(page, p("14-carte-parcelle-revelee"));
  for (const id of ["lyon-vieux-lyon", "lyon-tete-d-or", "lyon-theatres-romains"]) {
    const d = await declareVisit(page, id);
    await d.getByRole("button", { name: "Continuer" }).click();
  }
  await page.goto(`${BASE}/profil`);
  await shoot(page, p("15-passeport"));
  await page.goto(`${BASE}/decouvrir?destination=lyon`);
  await shoot(page, p("16-decouvrir"));
  await page.goto(`${BASE}/communaute`);
  await shoot(page, p("17-communaute-demo"));
  await page.goto(`${BASE}/profil/parametres`);
  await shoot(page, p("18-parametres"));
  await page.goto(`${BASE}/bienvenue`);
  await shoot(page, p("19-onboarding"));

  // Thème nuit.
  await page.goto(`${BASE}/profil/parametres`);
  await page.getByRole("radio", { name: "Nuit", exact: true }).click();
  await page.goto(`${BASE}/carte?lieu=lyon-fourviere`);
  // Rendu logiciel (SwiftShader) : le vol vers le lieu peut durer plusieurs secondes.
  await page.waitForTimeout(6000);
  await shoot(page, p("20-nuit-carte"));
  await page.goto(`${BASE}/profil`);
  await shoot(page, p("21-nuit-passeport"));

  // États d'erreur et vides.
  await page.goto(`${BASE}/excursions/inexistante`);
  await shoot(page, p("22-erreur-excursion-introuvable"));
  await page.goto(`${BASE}/hors-ligne`);
  await shoot(page, p("23-hors-ligne"));
  await browser.close();
}

await mkdir(OUT, { recursive: true });
await run("mobile", { width: 390, height: 844 }, 2);
await run("desktop", { width: 1440, height: 900 }, 1);

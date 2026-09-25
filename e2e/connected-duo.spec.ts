import { expect, test, type Page } from "@playwright/test";
import { pseudonymOf, signUp, sql } from "./connected-helpers";

/**
 * Mode Duo (D-016) contre Supabase local : invitation d'un ami, co-édition,
 * conflit d'enregistrement sans écrasement, visite pour deux confirmée par l'autre.
 */
const stamp = Date.now();
const alice = `duo-alice-${stamp}@example.test`;
const bob = `duo-bob-${stamp}@example.test`;

/** Captures réelles facultatives du mode connecté : DUO_SHOTS=dossier npm run test:e2e:connected. */
const SHOTS = process.env.DUO_SHOTS;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: "jpeg", quality: 78 });
}

async function titleField(page: Page) {
  return page.getByLabel("Titre de l'excursion");
}

test("Mode Duo : inviter, co-éditer, conflit, visite pour deux", async ({ page, browser }) => {
  test.setTimeout(180_000);
  // Deux comptes réels ; l'amitié est posée directement en base (fonction déjà couverte ailleurs).
  await signUp(page, alice);
  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  await signUp(bobPage, bob);
  const alicePseudo = await pseudonymOf(alice);
  const bobPseudo = await pseudonymOf(bob);
  await sql(
    `insert into public.friendships (requester_id, addressee_id, status, responded_at)
     select a.id, b.id, 'accepted', now() from auth.users a, auth.users b where a.email = $1 and b.email = $2`,
    [alice, bob],
  );

  // Alice compose et enregistre une excursion, puis invite Bob.
  await page.goto("/excursions/nouvelle?destination=lyon");
  await page.getByRole("button", { name: /Composer ma sortie/ }).click();
  await (await titleField(page)).fill("Lyon à deux");
  await page.getByRole("button", { name: "Enregistrer l'excursion" }).click();
  await expect(page).toHaveURL(/\/excursions\/(?!nouvelle)[\w-]+$/);
  const excursionPath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Inviter un ami" }).click();
  await page.getByLabel("Ami à inviter").selectOption({ label: bobPseudo });
  await page.getByRole("button", { name: "Inviter", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Invitation envoyée à ${bobPseudo}` })).toBeVisible();
  await shot(page, "duo-01-invitation-envoyee");

  // Bob accepte depuis ses excursions ; il peut modifier mais pas supprimer.
  await bobPage.goto("/excursions");
  const invitation = bobPage.getByRole("article").filter({ hasText: `${alicePseudo} vous invite` });
  await expect(invitation).toBeVisible();
  await shot(bobPage, "duo-02-invitation-recue");
  await invitation.getByRole("button", { name: "Accepter" }).click();
  await expect(bobPage.getByText(`Duo · excursion de ${alicePseudo}`)).toBeVisible();
  await bobPage.goto(excursionPath);
  await expect(await titleField(bobPage)).toHaveValue("Lyon à deux");
  await expect(bobPage.getByRole("button", { name: "Supprimer l'excursion" })).toHaveCount(0);
  await (await titleField(bobPage)).fill("Lyon à deux, version Bob");
  await bobPage.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(bobPage.getByText("Modifications enregistrées.")).toBeVisible();

  // Alice voit la modification de Bob et qui l'a faite.
  await page.reload();
  await expect(await titleField(page)).toHaveValue("Lyon à deux, version Bob");
  await expect(page.getByText(`Dernière modification par ${bobPseudo}`)).toBeVisible();

  // Conflit : Alice édite sans enregistrer, Bob enregistre, puis Alice enregistre.
  await (await titleField(page)).fill("Titre d'Alice");
  await (await titleField(bobPage)).fill("Titre de Bob");
  await bobPage.getByRole("button", { name: "Enregistrer les modifications" }).click();
  const excursionId = excursionPath.split("/").pop();
  await expect.poll(async () => (await sql<{ title: string }>(`select title from public.excursions where id = $1`, [excursionId]))[0]!.title).toBe("Titre de Bob");
  await page.getByRole("button", { name: "Enregistrer les modifications" }).click();
  await expect(page.getByText(/modifiée entre-temps par l'autre personne/)).toBeVisible();
  await shot(page, "duo-03-conflit");
  await expect(await titleField(page)).toHaveValue("Titre de Bob");
  const stored = await sql<{ title: string }>(`select title from public.excursions where id = $1`, [excursionId]);
  expect(stored[0]!.title).toBe("Titre de Bob");

  // Visite pour deux : Bob déclare la première étape ; Alice confirme depuis ses excursions.
  await bobPage.reload();
  await bobPage.getByRole("button", { name: /^Nous y étions, avec/ }).first().click();
  await bobPage.getByRole("dialog", { name: /Parcelle révélée|Visite ajoutée/ }).getByRole("button", { name: "Continuer" }).click();
  await expect(bobPage.getByText(`Visite déclarée · en attente de ${alicePseudo}`).first()).toBeVisible();
  await bobPage.getByText(`Visite déclarée · en attente de ${alicePseudo}`).first().scrollIntoViewIfNeeded();
  await shot(bobPage, "duo-04-nous-y-etions");
  const aliceXpBefore = await sql<{ t: number }>(`select coalesce(sum(l.amount), 0)::int as t from public.xp_ledger l join auth.users u on u.id = l.user_id where u.email = $1 and l.kind = 'xp'`, [alice]);
  expect(aliceXpBefore[0]!.t).toBe(0);

  await page.goto("/excursions");
  const request = page.getByRole("article").filter({ hasText: `${bobPseudo} dit que vous étiez ensemble` });
  await expect(request).toBeVisible();
  await request.scrollIntoViewIfNeeded();
  await shot(page, "duo-05-visite-a-confirmer");
  await request.getByRole("button", { name: "J'y étais" }).click();
  await expect(page.getByRole("dialog", { name: /Parcelle révélée|Visite ajoutée/ })).toBeVisible();
  const aliceXpAfter = await sql<{ t: number }>(`select coalesce(sum(l.amount), 0)::int as t from public.xp_ledger l join auth.users u on u.id = l.user_id where u.email = $1 and l.kind = 'xp'`, [alice]);
  expect(aliceXpAfter[0]!.t).toBeGreaterThan(0);

  await bobPage.reload();
  await expect(bobPage.getByText(`Visite confirmée par ${alicePseudo}`).first()).toBeVisible();
  await bobContext.close();
});

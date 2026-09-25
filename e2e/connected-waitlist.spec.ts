import { expect, test } from "@playwright/test";
import { Client } from "pg";

/** Liste d'attente réellement stockée (mode connecté, DATABASE_URL configurée). */
test("la liste d'attente enregistre l'adresse une seule fois et rejette les robots", async ({ page, request }) => {
  const email = `attente-${Date.now()}@example.test`;
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel(/J'accepte que mon adresse/).check();
  await page.getByRole("button", { name: "Rejoindre la liste" }).click();
  await expect(page.getByText("Merci ! Votre demande est enregistrée.")).toBeVisible();

  // Même réponse pour une adresse déjà inscrite (pas d'énumération), une seule ligne en base.
  const again = await request.post("/api/waitlist", { data: { email: email.toUpperCase(), consent: true } });
  expect(again.status()).toBe(200);
  const bot = await request.post("/api/waitlist", { data: { email: `robot-${Date.now()}@example.test`, consent: true, website: "http://spam.example" } });
  expect(bot.status()).toBe(400);
  const noConsent = await request.post("/api/waitlist", { data: { email: `sans-${Date.now()}@example.test`, consent: false } });
  expect(noConsent.status()).toBe(400);

  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const rows = await db.query(`select email, consent_at is not null as consent from public.waitlist where email = $1`, [email.toLowerCase()]);
    expect(rows.rows).toEqual([{ email: email.toLowerCase(), consent: true }]);
  } finally {
    await db.end();
  }
});

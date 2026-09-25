import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

export const PASSWORD = "motdepasse-e2e-1234";

export async function signUp(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel(/Mot de passe/).fill(PASSWORD);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/carte/);
  await expect(page.getByText("Vous consultez sans compte")).toBeHidden();
}

export async function signIn(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel(/Mot de passe/).fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/carte/);
}

export async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    return (await db.query(query, params)).rows as T[];
  } finally {
    await db.end();
  }
}

export async function pseudonymOf(email: string): Promise<string> {
  const rows = await sql<{ pseudonym: string }>(`select p.pseudonym from public.profiles p join auth.users u on u.id = p.id where u.email = $1`, [email]);
  return rows[0]!.pseudonym;
}

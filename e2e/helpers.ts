import { expect, type Page } from '@playwright/test';

/** Connexion via les comptes de démonstration (mode `demo`). */
export async function loginAs(page: Page, label: RegExp) {
  await page.goto('/auth/login');
  await page.getByRole('button', { name: label }).first().click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/(dashboard|admin|onboarding)/);
}

export async function registerNew(page: Page, name: string, email: string) {
  await page.goto('/auth/register');
  await page.getByLabel(/Nom complet/).fill(name);
  await page.getByLabel(/Adresse e-mail/).fill(email);
  await page.getByLabel(/^Mot de passe/).fill('MotDePasse123');
  await page.getByLabel(/J’accepte/).check();
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

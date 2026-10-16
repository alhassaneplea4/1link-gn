import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, signIn, test } from './fixtures';

/** Audit axe-core (WCAG 2.1 A/AA) des écrans principaux, rendus avec des données réelles. Les violations « serious » et « critical » font échouer le test. */
async function audit(page: Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => `${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${name} : violations bloquantes`).toEqual([]);
}

test.describe('accessibilité (axe)', () => {
  for (const path of ['/', '/pricing', '/faq', '/legal/privacy', '/legal/terms', '/legal/delete-account', '/auth/login', '/auth/register']) {
    test(`public ${path}`, async ({ page }) => {
      await page.goto(path);
      await audit(page, path);
    });
  }

  test('page publique d’un utilisateur', async ({ page, seed }) => {
    const mariama = await seed.creator();
    await page.goto(`/${mariama.username}`);
    await audit(page, 'page publique');
  });

  for (const path of ['/auth/login', '/auth/register']) {
    test(`public ${path} (onglet téléphone, étape du code)`, async ({ page }) => {
      await page.goto(path);
      await page.getByRole('radio', { name: 'Téléphone' }).click();
      await audit(page, `${path} téléphone`);
      await page.getByLabel(/Numéro de téléphone/).fill('622000000');
      if (path.endsWith('register')) {
        await page.getByLabel(/Nom complet/).fill('Awa Test');
        await page.getByLabel(/J’accepte/).check();
      }
      await page.getByRole('button', { name: 'Recevoir le code' }).click();
      await expect(page.getByText(/Aucun message n’est réellement envoyé/)).toBeVisible();
      await audit(page, `${path} code`);
    });
  }

  for (const path of ['/auth/login', '/auth/register']) {
    test(`public ${path} (code par e-mail, puis saisie du code)`, async ({ page }) => {
      await page.goto(path);
      await audit(page, `${path} e-mail`);
      await page.getByLabel(/Adresse e-mail/).fill('contraste@exemple.test');
      if (path.endsWith('register')) await page.getByLabel(/J’accepte/).check();
      await page.getByRole('button', { name: 'Recevoir le code par e-mail' }).click();
      await expect(page.getByRole('button', { name: 'Remplir' })).toBeVisible();
      await audit(page, `${path} code e-mail`);
    });
  }

  test('public /auth/confirm-deletion (lien invalide)', async ({ page }) => {
    await page.goto('/auth/confirm-deletion?token=invalide-invalide-invalide');
    await expect(page.getByRole('heading', { name: 'Lien invalide ou expiré' })).toBeVisible();
    await audit(page, 'confirmation de suppression');
  });

  test('public /auth/forgot-password (onglet téléphone)', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.getByRole('radio', { name: 'Téléphone' }).click();
    await audit(page, 'mot de passe oublié par SMS');
  });

  for (const path of ['/dashboard', '/dashboard/security', '/dashboard/page', '/dashboard/appearance', '/dashboard/analytics', '/dashboard/subscription', '/dashboard/settings', '/dashboard/print']) {
    test(`dashboard ${path}`, async ({ page, seed }) => {
      const mariama = await seed.creator();
      await seed.views(mariama, 20, 6);
      await signIn(page, mariama);
      await page.goto(path);
      await audit(page, path);
    });
  }

  for (const path of ['/admin', '/admin/users', '/admin/moderation', '/admin/security', '/admin/profiles']) {
    test(`admin ${path}`, async ({ page, seed }) => {
      const owner = await seed.creator();
      await seed.report(owner, 'scam');
      await signIn(page, await seed.admin('super_admin'));
      await page.goto(path);
      await audit(page, path);
    });
  }
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

/** Audit axe-core (WCAG 2.1 A/AA) des écrans principaux. Les violations « serious » et « critical » font échouer le test. */
async function audit(page: import('@playwright/test').Page, name: string) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const summary = blocking.map((v) => `${v.id} (${v.impact}) × ${v.nodes.length} — ${v.nodes[0]?.target.join(' ')}`);
  expect(summary, `${name} : violations bloquantes`).toEqual([]);
}

test.describe('accessibilité (axe)', () => {
  for (const path of ['/', '/pricing', '/faq', '/auth/login', '/auth/register', '/mariama']) {
    test(`public ${path}`, async ({ page }) => {
      await page.goto(path);
      await audit(page, path);
    });
  }
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
  for (const path of ['/dashboard', '/dashboard/page', '/dashboard/appearance', '/dashboard/analytics', '/dashboard/content', '/dashboard/settings', '/dashboard/print']) {
    test(`dashboard ${path}`, async ({ page }) => {
      await loginAs(page, /Créatrice/);
      await page.goto(path);
      await audit(page, path);
    });
  }
  for (const path of ['/admin', '/admin/users', '/admin/moderation', '/admin/security', '/admin/profiles']) {
    test(`admin ${path}`, async ({ page }) => {
      await loginAs(page, /Super Admin/);
      await page.goto(path);
      await audit(page, path);
    });
  }
});

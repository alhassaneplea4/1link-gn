import { expect, test } from '@playwright/test';

test.describe('navigation publique', () => {
  test('la landing présente le produit et les sections clés', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1#hero-title')).toContainText('Un lien, pour toute votre présence.');
    await expect(page.getByRole('link', { name: 'Créer mon 1Link' }).first()).toBeVisible();
    for (const id of ['demo', 'audiences', 'customize', 'features', 'pricing', 'faq']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
  });

  test('aucun débordement horizontal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('le menu (compact sur mobile) mène aux offres', async ({ page, isMobile }) => {
    await page.goto('/');
    if (isMobile) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await page.getByRole('link', { name: 'Offres' }).first().click();
    await expect(page).toHaveURL(/#pricing/);
    await expect(page.getByRole('heading', { name: /Commencez gratuitement/ })).toBeInViewport();
  });

  test('la démo de blocs est interactive', async ({ page }) => {
    await page.goto('/#demo');
    const first = page.locator('.demo__row').nth(1);
    await first.getByRole('button', { name: 'Masquer' }).click();
    await expect(first).toHaveClass(/is-off/);
  });

  test('catégories, personnalisation et FAQ', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Organisation' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Mission');
    await page.getByRole('button', { name: 'Dark' }).click();
    await expect(page.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    const q = page.getByRole('button', { name: /Est-ce vraiment gratuit/ });
    await q.click();
    await expect(q).toHaveAttribute('aria-expanded', 'true');
  });

  test('pages /pricing et /faq', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Commencez gratuitement');
    await expect(page.getByText('Tarifs indicatifs').first()).toBeVisible();
    await page.goto('/faq');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Questions fréquentes');
  });
});

test.describe('page publique d’un utilisateur', () => {
  test('affiche une page publiée avec son rendu', async ({ page }) => {
    await page.goto('/mariama');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mariama Bah');
    await expect(page.getByRole('link', { name: /Dernière vidéo/ })).toHaveAttribute('rel', /noopener/);
  });

  test('mode économe : bascule, mémorisation après rechargement et lien « version légère »', async ({ page }) => {
    await page.goto('/mariama');
    await expect(page.locator('.pg')).not.toHaveClass(/pg--lite/);
    await page.getByRole('button', { name: 'Activer le mode économe' }).click();
    await expect(page.locator('.pg')).toHaveClass(/pg--lite/);
    await page.reload();
    await expect(page.locator('.pg')).toHaveClass(/pg--lite/);
    await expect(page.getByRole('button', { name: 'Mode économe activé' })).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/mariama?lite=0');
    await expect(page.locator('.pg')).not.toHaveClass(/pg--lite/);
  });

  test('distingue brouillon, suspendue, indisponible et introuvable', async ({ page }) => {
    await page.goto('/brouillon-demo');
    await expect(page.getByRole('heading', { name: /pas encore publiée/ })).toBeVisible();
    await page.goto('/compte-suspendu');
    await expect(page.getByRole('heading', { name: /suspendue/ })).toBeVisible();
    await page.goto('/indisponible-demo');
    await expect(page.getByRole('heading', { name: /temporairement indisponible/ })).toBeVisible();
    await page.goto('/introuvable-xyz');
    await expect(page.getByRole('heading', { name: /n’existe pas/ })).toBeVisible();
  });

  test('page introuvable et accès non autorisé', async ({ page }) => {
    await page.goto('/auth/inconnue/profondeur');
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    await page.goto('/403');
    await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible();
  });
});

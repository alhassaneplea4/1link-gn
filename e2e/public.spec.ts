import { eq } from 'drizzle-orm';
import { pageEvents } from '../server/db/schema.js';
import { expect, test } from './fixtures';

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
    await expect(page.getByText('Tarifs en francs guinéens').first()).toBeVisible();
    await page.goto('/faq');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Questions fréquentes');
  });
});

test.describe('langues : français et anglais', () => {
  test('bascule en anglais et mémorise le choix, sur le site, la connexion et la page publique', async ({ page, seed }) => {
    const mariama = await seed.creator();
    await page.goto('/auth/login');
    await page.getByLabel('Langue').selectOption('en');
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto('/');
    await expect(page.locator('h1#hero-title')).toContainText('One link, for your whole presence.');
    await page.goto(`/${mariama.username}`);
    await expect(page.getByRole('button', { name: 'Report this page' })).toBeVisible();
    await page.evaluate(() => localStorage.setItem('onelink.locale', 'fr'));
    await page.reload();
    await expect(page.getByRole('button', { name: 'Signaler cette page' })).toBeVisible();
  });
});

test.describe('page publique d’un utilisateur', () => {
  test('affiche la page publiée lue en base, avec ses liens sécurisés', async ({ page, seed }) => {
    const mariama = await seed.creator();
    await page.goto(`/${mariama.username}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mariama Bah');
    await expect(page.getByRole('link', { name: /Mon site/ })).toHaveAttribute('rel', /noopener/);
    await expect(page.getByText('Créé avec 1Link')).toHaveCount(0); // offre Pro : sans marque
  });

  test('compte les visites (vue + clic, avec le canal) dans la base', async ({ page, context, seed }) => {
    const mariama = await seed.creator();
    await context.route('https://exemple.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
    const rows = () => seed.db.select().from(pageEvents).where(eq(pageEvents.pageId, mariama.pageId!));
    await page.goto(`/${mariama.username}?src=WhatsApp`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mariama Bah');
    await expect.poll(async () => (await rows()).filter((e) => e.kind === 'view').length).toBe(1);
    const popup = page.waitForEvent('popup');
    await page.getByRole('link', { name: /Mon site/ }).click();
    await (await popup).close();
    await expect.poll(async () => (await rows()).filter((e) => e.kind === 'click').length).toBe(1);
    const all = await rows();
    expect(all.every((e) => e.source === 'whatsapp')).toBe(true);
    expect(all.find((e) => e.kind === 'click')!.blockId).toBe('blk_link');
    expect(JSON.stringify(all)).not.toMatch(/127\.0\.0\.1|::1/); // aucune adresse IP conservée
  });

  test('mode économe : bascule, mémorisation après rechargement et lien « version légère »', async ({ page, seed }) => {
    const mariama = await seed.creator();
    await page.goto(`/${mariama.username}`);
    await expect(page.locator('.pg')).not.toHaveClass(/pg--lite/);
    await page.getByRole('button', { name: 'Activer le mode économe' }).click();
    await expect(page.locator('.pg')).toHaveClass(/pg--lite/);
    await page.reload();
    await expect(page.locator('.pg')).toHaveClass(/pg--lite/);
    await expect(page.getByRole('button', { name: 'Mode économe activé' })).toHaveAttribute('aria-pressed', 'true');
    await page.goto(`/${mariama.username}?lite=0`);
    await expect(page.locator('.pg')).not.toHaveClass(/pg--lite/);
  });

  test('distingue brouillon, suspendue, indisponible et introuvable', async ({ page, seed }) => {
    const draft = await seed.creator({ page: { username: `br${Date.now().toString(36)}`, published: false } });
    const suspended = await seed.creator({ suspended: true });
    await page.goto(`/${draft.username}`);
    await expect(page.getByRole('heading', { name: /pas encore publiée/ })).toBeVisible();
    await page.goto(`/${suspended.username}`);
    await expect(page.getByRole('heading', { name: /suspendue/ })).toBeVisible();
    await page.route('**/api/pages/panne-serveur', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"unavailable"}' }));
    await page.goto('/panne-serveur');
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

test.describe('sécurité du déploiement', () => {
  test('la politique de sécurité du contenu (CSP) est appliquée et aucune violation n’est signalée', async ({ page, seed }) => {
    const mariama = await seed.creator();
    const violations: string[] = [];
    page.on('console', (m) => { if (/Content Security Policy|violat/i.test(m.text())) violations.push(m.text()); });
    const res = await page.goto(`/${mariama.username}`);
    expect(res!.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(res!.headers()['x-content-type-options']).toBe('nosniff');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Mariama Bah');
    await page.goto('/');
    await page.goto('/auth/login');
    expect(violations).toEqual([]);
  });

  test('les routes privées de l’API refusent un visiteur anonyme', async ({ request }) => {
    for (const path of ['/api/me/page', '/api/me/analytics?from=2026-01-01&to=2026-01-02', '/api/admin/users']) {
      expect((await request.get(path)).status()).toBe(401);
    }
    expect((await request.get('/api/health')).ok()).toBe(true);
  });
});

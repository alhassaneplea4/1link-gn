import { eq } from 'drizzle-orm';
import { pages, subscriptions } from '../server/db/schema.js';
import { fixtureContent } from '../server/testing/fixtures.js';
import { expect, signIn, test } from './fixtures';

const unique = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5);
const DAY = 86_400_000;

test.describe('offres, essais et droits (appliqués par le serveur, reflétés par l’interface)', () => {
  test('Free : blocs réservés grisés, thèmes et onglets verrouillés, statistiques réservées', async ({ page, seed }) => {
    const free = await seed.creator({ plan: 'free', name: 'Fatou Free' });
    await signIn(page, free);

    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    const picker = page.getByRole('dialog');
    await expect(picker.getByRole('button', { name: /^Vidéo/ }).first()).toBeDisabled();
    await expect(picker.getByRole('button', { name: /^Texte/ }).first()).toBeDisabled();
    await expect(picker.getByText('Disponible avec l’offre Basique').first()).toBeVisible();
    await expect(picker.getByRole('button', { name: /^Lien/ }).first()).toBeEnabled(); // 1 lien sur 4
    await page.keyboard.press('Escape');

    await page.goto('/dashboard/appearance');
    await expect(page.getByRole('button', { name: /Professional/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Dark/ })).toBeEnabled();
    await page.getByRole('tab', { name: 'Boutons & cartes' }).click();
    await expect(page.getByText('Réservé à l’offre Basique')).toBeVisible();
    await page.getByRole('tab', { name: 'Mise en page' }).click();
    await expect(page.getByText('Réservé à l’offre Pro')).toBeVisible();
    await page.getByRole('tab', { name: 'Couleurs' }).click();
    await expect(page.getByLabel('Couleur principale', { exact: true })).toBeVisible(); // l'onglet Couleurs est ouvert à toutes les offres

    await page.goto('/dashboard/analytics');
    await expect(page.getByText('Réservé à l’offre Basique')).toBeVisible();
  });

  test('l’API refuse ce que l’offre n’inclut pas, même si l’interface est contournée', async ({ page, seed }) => {
    const free = await seed.creator({ plan: 'free', name: 'Awa Contournement' });
    await signIn(page, free);
    const res = await page.evaluate(async () => {
      const cur = await (await fetch('/api/me/page')).json();
      const blocks = [cur.blocks.find((b: { type: string }) => b.type === 'profile'), { id: 'blk_txt', type: 'text', visible: true, data: { title: 'Intrus', body: 'x' } }];
      const r = await fetch('/api/me/page/draft', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...cur, blocks }) });
      return { status: r.status, body: await r.json() };
    });
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ message: 'plan_required', fields: { feature: 'block:text' } });
  });

  test('souscrire ouvre un essai de 15 jours, sans paiement', async ({ page, seed }) => {
    const free = await seed.creator({ plan: 'free', name: 'Salif Essai' });
    await signIn(page, free);
    await page.goto('/dashboard/subscription');
    await expect(page.getByText(/Essai gratuit : \d+ jour/).first()).toBeVisible();
    await page.getByRole('button', { name: /Essayer 15 jours : Basique/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Continuer' }).click();
    await expect(page.locator('.toasts').getByText('Votre essai de 15 jours a démarré')).toBeVisible();
    await expect(page.getByText(/Essai de l’offre : 15 jour/)).toBeVisible();
    const [sub] = await seed.db.select().from(subscriptions).where(eq(subscriptions.userId, free.id));
    expect(sub).toMatchObject({ planId: 'basic', status: 'trialing' });
    // l'essai donne les droits de l'offre : le bloc Texte devient disponible
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: /^Texte/ }).first()).toBeEnabled();
  });

  test('essai terminé : le compte est verrouillé et mène à l’abonnement', async ({ page, seed }) => {
    const late = await seed.creator({ plan: 'free', name: 'Oumar Verrouillé', freeTrialEndsAt: new Date(Date.now() - 2 * DAY) });
    await signIn(page, late);
    await expect(page).toHaveURL(/\/dashboard\/subscription/);
    await expect(page.getByText('Votre essai est terminé').first()).toBeVisible();
    await page.goto('/dashboard/page');
    await expect(page).toHaveURL(/\/dashboard\/subscription/);
    await page.goto(`/${late.username}`);
    await expect(page.getByRole('heading', { name: /indisponible|n’existe pas|pas encore/i })).toBeVisible();
  });
});

test.describe('lien de la page, publication et galerie', () => {
  test('modifier le lien depuis la vue d’ensemble, avec confirmation', async ({ page, seed }) => {
    const mariama = await seed.creator();
    await signIn(page, mariama);
    const next = `mariama${unique()}`;
    await page.getByRole('button', { name: 'Modifier le lien' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Adresse de votre page/).fill(next);
    await dialog.getByRole('button', { name: 'Continuer' }).click();
    await expect(dialog.getByText(/L’ancien lien cessera immédiatement/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Oui, changer mon lien' }).click();
    await expect(page.locator('.toasts').getByText('Lien modifié')).toBeVisible();
    await expect(page.locator('.ov-status__url')).toContainText(next);
    const old = await page.request.get(`/api/pages/${mariama.username}`);
    expect((await old.json()).state).toBe('not_found');
    expect((await (await page.request.get(`/api/pages/${next}`)).json()).state).toBe('published');
  });

  test('galerie : carrousel de 5 images au plus, image en taille réelle avec description, croix pour fermer', async ({ page, browser, seed }) => {
    const content = fixtureContent('Mariama Bah');
    content.blocks.push({ id: 'blk_gal', type: 'gallery', visible: true, data: { title: 'Mes photos', images: Array.from({ length: 5 }, (_, i) => ({ url: `https://exemple.com/photo-${i + 1}.jpg`, alt: `Description ${i + 1}` })) } } as never);
    const owner = await seed.creator({ page: { username: `gal${unique()}`, published: true, content } });
    void page;
    const ctx = await browser.newContext();
    const vp = await ctx.newPage();
    await vp.goto(`/${owner.username}`);
    const carousel = vp.getByRole('region', { name: 'Mes photos' });
    await expect(carousel.getByRole('group')).toHaveCount(5);
    await carousel.getByRole('button', { name: 'Voir l’image 3 en taille réelle' }).click();
    const viewer = vp.getByRole('dialog', { name: 'Visionneuse d’images' });
    await expect(viewer.getByText('Description 3').first()).toBeVisible();
    await expect(viewer.getByText('3 / 5')).toBeVisible();
    await viewer.getByRole('button', { name: 'Image suivante' }).click();
    await expect(viewer.getByText('4 / 5')).toBeVisible();
    await viewer.getByRole('button', { name: 'Fermer l’image' }).click();
    await expect(viewer).toHaveCount(0);
    await ctx.close();
  });

  test('publication : une simple confirmation, puis l’alerte « Publication effectuée » avec le lien « Voir »', async ({ page, seed }) => {
    const mariama = await seed.creator();
    await signIn(page, mariama);
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Séparateur/ }).first().click();
    await page.getByRole('button', { name: 'Mettre à jour' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Publier les modifications ?');
    await expect(confirm.getByRole('textbox')).toHaveCount(0); // plus aucun champ ni long texte dans la confirmation
    await confirm.getByRole('button', { name: 'Publier', exact: true }).click();
    const toast = page.locator('.toasts');
    await expect(toast.getByText('Publication effectuée')).toBeVisible();
    await expect(toast.getByRole('link', { name: 'Voir' })).toHaveAttribute('href', `/${mariama.username}`);
    const [row] = await seed.db.select().from(pages).where(eq(pages.id, mariama.pageId!));
    expect(row!.published!.blocks.some((b) => b.type === 'divider')).toBe(true);
  });

  test('la rubrique « Contenu » n’existe plus', async ({ page, seed }) => {
    await signIn(page, await seed.creator());
    await expect(page.getByRole('link', { name: 'Contenu', exact: true })).toHaveCount(0);
    await page.goto('/dashboard/content');
    await expect(page.getByRole('heading', { name: /Page introuvable|introuvable/i })).toBeVisible();
  });
});

test.describe('sécurité du compte', () => {
  test('vérification en deux étapes par e-mail : désactivée par défaut, puis exigée à la connexion', async ({ page, seed }) => {
    const mariama = await seed.creator();
    await signIn(page, mariama);
    await page.goto('/dashboard/security');
    const email = page.locator('[data-method="email"]');
    await expect(email.getByText('Désactivée')).toBeVisible();
    await expect(page.locator('[data-method="totp"]').getByText('Désactivée')).toBeVisible();
    await email.getByRole('button', { name: 'Activer' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel(/Mot de passe actuel/).fill(mariama.password);
    await dialog.getByRole('button', { name: 'Activer' }).click();
    await expect(email.getByText('Activée')).toBeVisible();

    await page.goto('/auth/sign-out');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/signed-out/);
    await page.goto('/auth/login');
    await page.getByRole('button', { name: 'Se connecter avec un mot de passe' }).click();
    await page.getByLabel(/Adresse e-mail/).fill(mariama.email);
    await page.getByLabel(/^Mot de passe/).fill(mariama.password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(/Saisissez le code à 6 chiffres envoyé à/)).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/login/); // la première étape seule n'ouvre aucune session
    await page.getByRole('button', { name: 'Remplir' }).click();
    await page.getByRole('button', { name: 'Confirmer la connexion' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('application d’authentification : le QR code et la clé s’affichent après confirmation', async ({ page, seed }) => {
    const mariama = await seed.creator();
    await signIn(page, mariama);
    await page.goto('/dashboard/security');
    const totp = page.locator('[data-method="totp"]');
    await totp.getByRole('button', { name: 'Activer' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel(/Mot de passe actuel/).fill(mariama.password);
    await dialog.getByRole('button', { name: 'Activer' }).click();
    const setup = page.getByRole('group', { name: 'Associer votre application' });
    await expect(setup.getByRole('img')).toBeVisible();
    await expect(setup.locator('code')).toHaveText(/^[A-Z2-7]{32}$/);
    await setup.getByLabel(/Code à 6 chiffres/).fill('000000');
    await setup.getByRole('button', { name: 'Vérifier et activer' }).click();
    await expect(setup.getByText(/Code incorrect/)).toBeVisible();
  });

  test('suppression du compte : demande, déconnexion, rien n’est effacé avant la confirmation finale', async ({ page, seed }) => {
    const mariama = await seed.creator({ name: 'Partante E2E' });
    await signIn(page, mariama);
    await page.goto('/dashboard/settings');
    await page.getByTestId('delete-account-row').getByRole('button', { name: 'Demander la suppression' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel(/Mot de passe actuel/).fill(mariama.password);
    await dialog.getByRole('button', { name: 'Demander la suppression' }).click();
    await expect(page).toHaveURL(/signed-out/);
    const res = await page.request.get(`/api/pages/${mariama.username}`);
    expect((await res.json()).state).toBe('published'); // la page reste en ligne pendant le délai
    // se reconnecter annule la demande
    await signIn(page, mariama);
    await page.goto('/dashboard/settings');
    await expect(page.getByText('Suppression demandée')).toHaveCount(0);
  });
});

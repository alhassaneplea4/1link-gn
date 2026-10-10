import { and, eq } from 'drizzle-orm';
import { pages, users } from '../server/db/schema.js';
import { uniqueEmail } from '../server/testing/fixtures.js';
import { expect, latestMail, registerNew, signIn, test as base, tokenFrom, type Account } from './fixtures';

const test = base.extend<{ mariama: Account }>({
  // Créatrice (offre Pro, page publiée) déjà connectée par le formulaire de connexion.
  mariama: async ({ seed, page }, use) => {
    const account = await seed.creator();
    await signIn(page, account);
    await use(account);
  },
});

const unique = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 5);

test.describe('inscription et onboarding (compte réel en base)', () => {
  test('parcours complet par catégorie jusqu’au brouillon', async ({ page, seed }) => {
    const email = uniqueEmail('awa');
    await registerNew(page, 'Awa Test', email);
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByRole('alert')).toBeVisible(); // catégorie obligatoire
    await page.getByLabel(/Créateur/).check();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByLabel(/Nom affiché/)).toHaveValue('Awa Test');
    await page.getByLabel(/Adresse de votre page/).fill(`awa${unique()}`); // unique : la base est partagée entre les projets desktop et mobile
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByLabel(/Type de contenu ou niche/).fill('Cuisine');
    await page.getByRole('button', { name: /Continuer/ }).click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Passer cette étape/ }).click();
    await expect(page.getByRole('heading', { name: 'Vérifiez votre page' })).toBeVisible();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByRole('button', { name: 'Publier ma page' })).toBeDisabled(); // e-mail non vérifié
    await page.getByRole('button', { name: 'Enregistrer en brouillon' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: /Bonjour, Awa/ })).toBeVisible();
    // le brouillon est bien en base, pas dans le navigateur
    const [user] = await seed.db.select().from(users).where(eq(users.email, email));
    const [row] = await seed.db.select().from(pages).where(eq(pages.userId, user!.id));
    expect(row).toMatchObject({ status: 'draft', version: 1 });
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toMatch(/onboarding|blocks|draft/);
  });

  test('reprise de l’assistant sur un autre appareil (brouillon conservé côté serveur)', async ({ page, browser, seed }) => {
    const email = uniqueEmail('reprise');
    await registerNew(page, 'Reprise Test', email);
    await page.getByLabel(/Professionnel/).check();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByLabel(/Adresse de votre page/).fill(`reprise${unique()}`);
    await expect.poll(async () => { const [u] = await seed.db.select().from(users).where(eq(users.email, email)); return u?.onboardingState; }).toMatchObject({ category: 'professional' });
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await signIn(p2, { email, password: 'MotDePasse-Solide-123' });
    await expect(p2).toHaveURL(/\/onboarding/);
    await expect(p2.getByRole('heading', { name: 'Votre identité' })).toBeVisible();
    await expect(p2.getByLabel(/Adresse de votre page/)).toHaveValue(/^reprise/);
    await other.close();
  });

  test('vérification de l’e-mail par le lien reçu, puis publication réelle', async ({ page, request }) => {
    const email = uniqueEmail('fanta');
    await registerNew(page, 'Fanta Pub', email);
    const mail = await latestMail(request, email);
    expect(mail.subject).toMatch(/Confirmez/);
    await page.goto(`/auth/verify-email?token=${encodeURIComponent(tokenFrom(mail))}`);
    await expect(page.getByRole('heading', { name: /Adresse e-mail vérifiée/ })).toBeVisible();
    await page.goto('/onboarding');
    await page.getByLabel(/Particulier/).check();
    await page.getByRole('button', { name: /Continuer/ }).click();
    const username = `fanta${unique()}`;
    await page.getByLabel(/Adresse de votre page/).fill(username);
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: /Continuer/ }).click();
      await page.waitForTimeout(150);
    }
    await expect(page.getByRole('heading', { name: 'Prêt à publier ?' })).toBeVisible();
    await page.getByRole('button', { name: 'Publier ma page' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Votre page est publiée')).toBeVisible();
    // la page est visible par n'importe qui, depuis la base
    const visitor = await page.context().browser()!.newContext();
    const vp = await visitor.newPage();
    await vp.goto(`/${username}`);
    await expect(vp.getByRole('heading', { level: 1 })).toContainText('Fanta Pub');
    await visitor.close();
  });

  test('lien de vérification périmé ou falsifié : message d’erreur clair', async ({ page }) => {
    await page.goto(`/auth/verify-email?token=${'x'.repeat(40)}`);
    await expect(page.getByRole('heading', { name: /Vérification impossible/ })).toBeVisible();
  });

  test('inscription par téléphone (code à usage unique) puis publication sans e-mail', async ({ page }) => {
    await page.goto('/auth/register');
    await page.getByRole('radio', { name: 'Téléphone' }).click();
    await page.getByLabel(/Nom complet/).fill('Kadiatou Tel');
    await page.getByLabel(/Numéro de téléphone/).fill(`62${Date.now().toString().slice(-7)}`);
    await page.getByLabel(/J’accepte/).check();
    await page.getByRole('button', { name: 'Recevoir le code' }).click();
    await expect(page.getByText(/Aucun message n’est réellement envoyé/)).toBeVisible();
    await page.getByRole('button', { name: 'Remplir' }).click();
    await page.getByRole('button', { name: 'Valider' }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel(/Particulier/).check();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByLabel(/Adresse de votre page/).fill(`kadi${unique()}`);
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: /Continuer/ }).click();
      await page.waitForTimeout(150);
    }
    await expect(page.getByRole('heading', { name: 'Prêt à publier ?' })).toBeVisible();
    await page.getByRole('button', { name: 'Publier ma page' }).click(); // numéro vérifié par le code : pas d'e-mail requis
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Votre page est publiée')).toBeVisible();
  });
});

test.describe('dashboard, éditeur, apparence, analytics', () => {

  test('vue d’ensemble adaptée à la catégorie, avec des chiffres réels (vides pour un compte neuf)', async ({ page, mariama }) => {
    void mariama;
    await expect(page.getByRole('heading', { name: /Bonjour, Mariama/ })).toBeVisible();
    await expect(page.getByText('Votre univers de créateur')).toBeVisible();
    await expect(page.getByText(/Démonstration|fictif/i)).toHaveCount(0);
  });

  test('ajoute un bloc, modifie, annule puis supprime avec confirmation', async ({ page, mariama }) => {
    void mariama;
    await page.goto('/dashboard/page');
    const cards = page.locator('.bcard');
    await expect(cards).toHaveCount(3); // la page publiée lue en base
    const before = 3;
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Texte/ }).first().click();
    await expect(cards).toHaveCount(before + 1);
    await expect(page.getByText('Modifications non enregistrées').first()).toBeVisible();
    await page.getByRole('textbox', { name: /^Texte/ }).first().fill('Bonjour à tous');
    await page.getByRole('button', { name: 'Annuler', exact: true }).first().click();
    await page.getByRole('button', { name: 'Supprimer' }).last().click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer' }).click();
    await expect(cards).toHaveCount(before);
  });

  test('enregistre un brouillon en base, le retrouve après rechargement et signale les modifications non publiées', async ({ page, mariama }) => {
    void mariama;
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Séparateur/ }).click();
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();
    await expect(page.getByText('Modifications non publiées')).toBeVisible();
    await page.reload();
    await expect(page.locator('.bcard')).toHaveCount(4); // le brouillon vient du serveur
  });

  test('deux appareils : le second reçoit un conflit de version au lieu d’écraser le premier', async ({ page, browser, mariama }) => {
    await page.goto('/dashboard/page');
    await expect(page.locator('.bcard')).toHaveCount(3);
    // l'autre appareil enregistre d'abord
    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await signIn(p2, mariama);
    await p2.goto('/dashboard/page');
    await p2.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await p2.getByRole('button', { name: /^Séparateur/ }).click();
    await p2.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await expect(p2.getByText(/Brouillon enregistré/)).toBeVisible();
    // le premier appareil modifie une version périmée
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Texte/ }).first().click();
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await expect(page.getByText(/modifiée sur un autre appareil/)).toBeVisible();
    await page.getByRole('button', { name: /Recharger la version enregistrée/ }).click();
    await expect(page.locator('.bcard')).toHaveCount(4); // version du second appareil
    await ctx.close();
  });

  test('boutique : produit, commande WhatsApp et aucun paiement sur la plateforme', async ({ page, mariama }) => {
    void mariama;
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Boutique/ }).first().click();
    await page.getByLabel('Numéro WhatsApp de commande').fill('+224 622 00 00 00');
    await page.getByLabel('Nom du produit').fill('Sac en cuir');
    await page.getByLabel(/^Prix/).fill('250000');
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Sac en cuir')).toBeVisible();
    await expect(dialog.getByText(/1Link ne traite aucun paiement/)).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Commander sur WhatsApp/ })).toBeVisible();
  });

  test('rendez-vous : publication puis demande d’un visiteur envoyée sur WhatsApp', async ({ page, context, mariama }) => {
    const { username } = mariama;
    await context.route('**://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Rendez-vous/ }).first().click();
    await page.getByLabel(/Numéro WhatsApp qui reçoit les demandes/).fill('+224 622 00 00 00');
    await page.getByRole('button', { name: /Mettre à jour/ }).first().click();
    await page.getByRole('button', { name: 'Publier les modifications' }).click();
    await expect(page.getByRole('heading', { name: 'Publication effectuée' })).toBeVisible();
    await page.goto(`/${username}`);
    await page.getByRole('button', { name: /Demander un rendez-vous/ }).click();
    await page.getByLabel(/Votre nom/).fill('Awa Test');
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Envoyer sur WhatsApp/ }).click();
    const opened = await popup;
    await expect.poll(() => opened.url(), { timeout: 15_000 }).toContain('wa.me/224622000000');
    expect(decodeURIComponent(opened.url())).toContain('Awa Test');
  });

  test('affiche et cartes : QR de suivi, impression et PDF tenant sur une page A4', async ({ page, mariama }) => {
    const { username } = mariama;
    await page.goto('/dashboard/print');
    await expect(page.getByRole('heading', { level: 2, name: 'Mariama Bah' })).toBeVisible();
    await expect(page.locator('.poster__qr svg')).toBeVisible();
    await expect(page.locator('.poster__url')).toContainText(username ?? '');
    const pageCount = async () => ((await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true })).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(await pageCount()).toBe(1);
    await page.getByRole('radio', { name: '10 cartes de visite' }).click();
    await expect(page.locator('.bizcard')).toHaveCount(10);
    expect(await pageCount()).toBe(1);
  });

  test('programmation : un bloc futur est signalé en aperçu et refuse une période inversée', async ({ page, mariama }) => {
    void mariama;
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Texte/ }).first().click();
    await page.getByRole('textbox', { name: /^Texte/ }).first().fill('Offre de la Tabaski');
    await page.getByLabel('Afficher à partir du').fill('2030-01-01T10:00');
    await page.getByLabel('Masquer à partir du').fill('2029-01-01T10:00');
    await expect(page.getByText('La fin doit être postérieure au début.').first()).toBeVisible();
    await page.getByLabel('Masquer à partir du').fill('2030-02-01T10:00');
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Offre de la Tabaski')).toBeVisible();
    await expect(dialog.getByText(/pas encore visible/)).toBeVisible();
  });

  test('prévisualise la page', async ({ page, mariama }) => {
    void mariama;
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: /Mariama/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('personnalise l’apparence avec contrôle du contraste, puis réinitialise sans toucher au contenu', async ({ page, mariama }) => {
    void mariama;
    await page.goto('/dashboard/appearance');
    await page.getByRole('button', { name: 'Dark' }).click();
    await page.getByRole('tab', { name: 'Couleurs' }).click();
    const hex = page.getByLabel('Couleur principale', { exact: true });
    await hex.fill('#ffffff');
    await expect(page.getByText('Contrastes (WCAG)')).toBeVisible();
    await expect(page.getByText(/Insuffisant|Grand texte seulement|AA/).first()).toBeVisible();
    await page.getByRole('textbox', { name: 'Texte', exact: true }).fill('zzz');
    await expect(page.getByText(/Code couleur invalide/)).toBeVisible();
    await page.getByRole('button', { name: 'Réinitialiser l’apparence' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('Votre contenu');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Réinitialiser l’apparence' }).click();
    await page.goto('/dashboard/page');
    await expect(page.locator('.bcard__summary', { hasText: 'Mariama Bah' })).toBeVisible();
  });

  test('statistiques : chiffres réels issus des événements en base, période, période invalide', async ({ page, seed, mariama }) => {
    await seed.views(mariama, 12, 5);
    await page.goto('/dashboard/analytics');
    await expect(page.getByText(/Démonstration|fictives/i)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Évolution dans le temps' })).toBeVisible();
    await expect(page.locator('.stat', { hasText: 'Vues' }).first()).toContainText('12');
    await page.getByRole('radio', { name: '30 jours' }).click();
    await expect(page.getByRole('radio', { name: '30 jours' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: 'Personnalisée' }).click();
    await page.getByRole('textbox', { name: 'Du' }).fill('2026-10-09');
    await page.getByRole('textbox', { name: 'Au' }).fill('2026-10-01');
    await expect(page.getByText(/date de début doit précéder/)).toBeVisible();
  });

  test('abonnement : un changement de plan n’est jamais présenté comme réussi sans paiement', async ({ page, mariama }) => {
    void mariama;
    await page.goto('/dashboard/subscription');
    await page.getByRole('button', { name: /Passer à Business/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText('Paiements non connectés')).toBeVisible();
  });

  test('déconnexion avec confirmation : la session est détruite côté serveur', async ({ page, request, mariama }) => {
    void mariama;
    await page.goto('/auth/sign-out');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/signed-out/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);
    expect((await request.get('/api/me/page')).status()).toBe(401);
  });
});

test.describe('Admin Center', () => {
  test('Super Admin : navigation, tableaux alimentés par la base et fiche utilisateur', async ({ page, seed }) => {
    const target = await seed.creator({ name: 'Mamadou Diallo' });
    await seed.views(target, 7);
    const root = await seed.admin('super_admin', { name: 'Sékou Condé' });
    await signIn(page, root);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Vue globale' })).toBeVisible();
    await expect(page.getByText(/Données de démonstration|fictifs/i)).toHaveCount(0);
    await page.goto('/admin/users');
    await page.getByPlaceholder(/Nom, e-mail/).fill('diallo');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await page.locator('tbody tr').first().click();
    await expect(page).toHaveURL(/\/admin\/users\/usr_/);
    await expect(page.getByRole('button', { name: /Suspendre le compte|Réactiver le compte/ })).toBeVisible();
    for (const [path, name] of [['/admin/realtime', 'Temps réel'], ['/admin/moderation', 'Modération'], ['/admin/security', 'Sécurité'], ['/admin/system', 'Système']] as const) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    }
  });

  test('suspendre un compte depuis l’Admin Center coupe sa page publique et sa session', async ({ page, browser, seed }) => {
    const victim = await seed.creator({ name: 'Compte A Suspendre' });
    const root = await seed.admin('super_admin');
    const vctx = await browser.newContext();
    const vp = await vctx.newPage();
    await signIn(vp, victim);
    await signIn(page, root);
    await page.goto(`/admin/users/${victim.id}`);
    await page.getByRole('button', { name: 'Suspendre le compte' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /Suspendre/ }).last().click();
    await expect(page.getByText(/suspendu|Compte suspendu/i).first()).toBeVisible();
    const visitor = await browser.newContext();
    const pub = await visitor.newPage();
    await pub.goto(`/${victim.username}`);
    await expect(pub.getByRole('heading', { name: /suspendue/ })).toBeVisible();
    await vp.goto('/dashboard');
    await expect(vp).toHaveURL(/\/auth\/(login|session-expired)/);
    await vctx.close();
    await visitor.close();
  });

  test('temps réel : flux SSE branché sur la base — une inscription apparaît dans le fil', async ({ page, seed, playwright }) => {
    const root = await seed.admin('super_admin');
    await signIn(page, root);
    await page.goto('/admin/realtime');
    await expect(page.getByText('Aucun événement')).toBeVisible();
    await page.getByRole('button', { name: /Connecter|Se connecter|Démarrer/ }).click();
    await expect(page.getByText(/Connecté|En direct/).first()).toBeVisible({ timeout: 10_000 });
    const anon = await playwright.request.newContext({ baseURL: 'http://localhost:4173' });
    const res = await anon.post('/api/auth/sign-up', { data: { name: 'Nouvel Inscrit', email: uniqueEmail('rt'), password: 'MotDePasse-Solide-123', acceptTerms: true }, headers: { origin: 'http://localhost:4173' } });
    expect(res.status()).toBe(200);
    await expect(page.locator('.adm-feed li').first()).toContainText('Nouvel Inscrit', { timeout: 12_000 });
    await anon.dispose();
  });

  test('modération : file alimentée par les signalements réels, suspension soumise à confirmation renforcée', async ({ page, seed }) => {
    const owner = await seed.creator();
    await seed.report(owner, 'impersonation');
    const mod = await seed.admin('moderator');
    await signIn(page, mod);
    await page.goto('/admin/moderation');
    await page.getByLabel('Action à entreprendre').selectOption('suspend');
    await page.getByLabel(/Note interne/).fill('Usurpation constatée');
    await page.getByRole('button', { name: 'Préparer la décision' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('button', { name: 'Confirmer la décision' })).toBeDisabled();
    await dialog.getByRole('textbox').fill((await dialog.locator('.field__label').innerText()).match(/« (.+) »/)![1]!);
    await expect(dialog.getByRole('button', { name: 'Confirmer la décision' })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Confirmer la décision' }).click();
    await expect.poll(async () => (await seed.db.select().from(pages).where(and(eq(pages.id, owner.pageId!))))[0]?.status).toBe('suspended');
  });

  test('un signalement de visiteur arrive dans la file des modérateurs', async ({ page, browser, seed }) => {
    const owner = await seed.creator();
    const visitor = await browser.newContext();
    const vp = await visitor.newPage();
    await vp.goto(`/${owner.username}`);
    await vp.getByRole('button', { name: 'Signaler cette page' }).click();
    await vp.getByLabel('Motif').selectOption('scam');
    await vp.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(vp.getByRole('heading', { name: 'Merci pour votre signalement' })).toBeVisible();
    await visitor.close();
    const mod = await seed.admin('moderator');
    await signIn(page, mod);
    await page.goto(`/admin/reports?q=${owner.username}`);
    const row = page.locator('tbody tr').filter({ has: page.getByText(`@${owner.username}`, { exact: true }) }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Arnaque');
  });

  test('rôle Support : rubrique Paiements absente et accès direct refusé', async ({ page, seed }) => {
    await signIn(page, await seed.admin('support'));
    await expect(page.getByRole('heading', { name: 'Vue globale' })).toBeVisible();
    await page.goto('/admin/payments');
    await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible();
  });
});

test.describe('vérification de profil', () => {
  test('demande par l’utilisateur, décision de l’administrateur, badge sur la page publique', async ({ page, seed }) => {
    const mariama = await seed.creator();
    const admin = await seed.admin('admin');
    await signIn(page, mariama);
    await page.goto('/dashboard/settings');
    await expect(page.getByText('Non vérifié').first()).toBeVisible();
    await page.getByRole('button', { name: 'Demander la vérification' }).click();
    await page.getByLabel(/Nom légal/).fill('Mariama Bah');
    await page.getByLabel(/Lien de preuve/).fill('https://exemple.com/mariama');
    await page.getByLabel(/J’atteste sur l’honneur/).check();
    await page.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByText('Demande en cours d’examen')).toBeVisible();
    await page.goto(`/${mariama.username}`);
    await expect(page.getByRole('heading', { level: 1, name: /Mariama/ })).toBeVisible();
    await expect(page.getByTitle('Profil vérifié')).toHaveCount(0);

    await page.goto('/auth/sign-out');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/signed-out/);
    await signIn(page, admin);
    await page.goto('/admin/profiles');
    await page.getByRole('tab', { name: 'Vérifications' }).click();
    await page.getByPlaceholder(/Pseudonyme, nom/).fill(mariama.username!);
    const row = page.locator('tbody tr').filter({ has: page.getByText(`@${mariama.username}`, { exact: true }) }).first();
    await row.click();
    await page.getByRole('button', { name: 'Accepter', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Accepter', exact: true }).click();
    await expect(page.locator('.toasts').getByText('Profil vérifié')).toBeVisible();

    await page.goto(`/${mariama.username}`);
    await expect(page.getByTitle('Profil vérifié')).toBeVisible();
  });
});

test.describe('états d’erreur et formulaires', () => {
  test('connexion : validation et identifiants refusés', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await page.getByLabel(/Adresse e-mail/).fill('inconnu@exemple.com');
    await page.getByLabel(/^Mot de passe/).fill('abc');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(/incorrect/)).toBeVisible();
  });

  test('mot de passe oublié : le lien reçu par e-mail permet de choisir un nouveau mot de passe', async ({ page, request, seed }) => {
    const mariama = await seed.creator();
    await page.goto('/auth/forgot-password');
    await page.getByLabel(/Adresse e-mail/).fill(mariama.email);
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeVisible();
    const mail = await latestMail(request, mariama.email);
    await page.goto(`/auth/reset-password?token=${encodeURIComponent(tokenFrom(mail))}`);
    await page.getByLabel(/Nouveau mot de passe/).fill('Nouveau-Mot-de-passe-2026');
    await page.getByLabel(/Confirmer/).fill('Nouveau-Mot-de-passe-2026');
    await page.getByRole('button', { name: 'Mettre à jour le mot de passe' }).click();
    await expect(page.getByRole('heading', { name: 'Mot de passe mis à jour' })).toBeVisible();
    await signIn(page, { email: mariama.email, password: 'Nouveau-Mot-de-passe-2026' });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('lien de réinitialisation absent ou invalide', async ({ page }) => {
    await page.goto('/auth/reset-password');
    await expect(page.getByRole('heading', { name: /Lien invalide/ })).toBeVisible();
  });

  test('session expirée', async ({ page }) => {
    await page.goto('/auth/session-expired?next=%2Fdashboard');
    await expect(page.getByRole('heading', { name: 'Session expirée' })).toBeVisible();
  });
});

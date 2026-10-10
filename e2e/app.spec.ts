import { expect, test } from '@playwright/test';
import { loginAs, registerNew } from './helpers';

test.describe('inscription et onboarding (démonstration)', () => {
  test('parcours complet par catégorie jusqu’au brouillon', async ({ page }) => {
    await registerNew(page, 'Awa Test', `awa${Date.now()}@exemple.com`);
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByRole('alert')).toBeVisible(); // catégorie obligatoire
    await page.getByLabel(/Créateur/).check();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await expect(page.getByLabel(/Nom affiché/)).toHaveValue('Awa Test');
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
  });

  test('vérification de l’e-mail (démo) puis publication réelle côté démo', async ({ page }) => {
    await registerNew(page, 'Fanta Pub', `fanta${Date.now()}@exemple.com`);
    await page.goto('/auth/verify-email');
    await page.getByRole('button', { name: /Simuler le clic/ }).click();
    await expect(page.getByRole('heading', { name: /Adresse e-mail vérifiée/ })).toBeVisible();
    await page.goto('/onboarding');
    await page.getByLabel(/Particulier/).check();
    await page.getByRole('button', { name: /Continuer/ }).click();
    await page.getByLabel(/Adresse de votre page/).fill(`fanta${Date.now().toString().slice(-6)}`);
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: /Continuer/ }).click();
      await page.waitForTimeout(150);
    }
    await expect(page.getByRole('heading', { name: 'Prêt à publier ?' })).toBeVisible();
    await page.getByRole('button', { name: 'Publier ma page' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Votre page est publiée')).toBeVisible();
  });
});

test.describe('dashboard, éditeur, apparence, analytics', () => {
  test.beforeEach(async ({ page }) => loginAs(page, /Créatrice/));

  test('vue d’ensemble adaptée à la catégorie, avec données signalées comme démo', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Bonjour, Mariama/ })).toBeVisible();
    await expect(page.getByText('Votre univers de créateur')).toBeVisible();
    await expect(page.getByText('Démonstration').first()).toBeVisible();
  });

  test('ajoute un bloc, modifie, annule puis supprime avec confirmation', async ({ page }) => {
    await page.goto('/dashboard/page');
    const cards = page.locator('.bcard');
    await expect(cards).toHaveCount(5); // page exemple de Mariama
    const before = 5;
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

  test('enregistre un brouillon et signale les modifications non publiées', async ({ page }) => {
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Séparateur/ }).click();
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await expect(page.getByText(/Brouillon enregistré/)).toBeVisible();
    await expect(page.getByText('Modifications non publiées')).toBeVisible();
  });

  test('boutique : produit, commande WhatsApp et aucun paiement sur la plateforme', async ({ page }) => {
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

  test('rendez-vous : publication puis demande d’un visiteur envoyée sur WhatsApp', async ({ page, context }) => {
    await context.route('**://wa.me/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Ajouter un bloc' }).click();
    await page.getByRole('button', { name: /^Rendez-vous/ }).first().click();
    await page.getByLabel(/Numéro WhatsApp qui reçoit les demandes/).fill('+224 622 00 00 00');
    await page.getByRole('button', { name: /Mettre à jour/ }).first().click();
    await page.getByRole('button', { name: 'Publier les modifications' }).click();
    await expect(page.getByRole('heading', { name: 'Publication effectuée' })).toBeVisible();
    await page.goto('/mariama');
    await page.getByRole('button', { name: /Demander un rendez-vous/ }).click();
    await page.getByLabel(/Votre nom/).fill('Awa Test');
    const popup = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Envoyer sur WhatsApp/ }).click();
    const opened = await popup;
    await opened.waitForLoadState();
    expect(opened.url()).toContain('wa.me/224622000000');
    expect(decodeURIComponent(opened.url())).toContain('Awa Test');
  });

  test('programmation : un bloc futur est signalé en aperçu et refuse une période inversée', async ({ page }) => {
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

  test('prévisualise la page', async ({ page }) => {
    await page.goto('/dashboard/page');
    await page.getByRole('button', { name: 'Prévisualiser' }).click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: /Mariama/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('personnalise l’apparence avec contrôle du contraste, puis réinitialise sans toucher au contenu', async ({ page }) => {
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

  test('consulte les analytics, change de période et filtre sur une période personnalisée invalide', async ({ page }) => {
    await page.goto('/dashboard/analytics');
    await expect(page.getByText('Données de démonstration').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Évolution dans le temps' })).toBeVisible();
    await page.getByRole('radio', { name: '30 jours' }).click();
    await expect(page.getByRole('radio', { name: '30 jours' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('radio', { name: 'Personnalisée' }).click();
    await page.getByRole('textbox', { name: 'Du' }).fill('2026-10-09');
    await page.getByRole('textbox', { name: 'Au' }).fill('2026-10-01');
    await expect(page.getByText(/date de début doit précéder/)).toBeVisible();
  });

  test('abonnement : un changement de plan n’est jamais présenté comme réussi sans paiement', async ({ page }) => {
    await page.goto('/dashboard/subscription');
    await page.getByRole('button', { name: /Passer à Business/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Continuer' }).click();
    await expect(page.getByText('Paiements non connectés')).toBeVisible();
  });

  test('déconnexion avec confirmation', async ({ page }) => {
    await page.goto('/auth/sign-out');
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page).toHaveURL(/signed-out/);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});

test.describe('Admin Center', () => {
  test('Super Admin : navigation, tableaux et fiche utilisateur', async ({ page }) => {
    await loginAs(page, /Super Admin/);
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: 'Vue globale' })).toBeVisible();
    await expect(page.getByText('Données de démonstration').first()).toBeVisible();
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

  test('temps réel : aucune simulation tant que le flux de démonstration n’est pas lancé', async ({ page }) => {
    await loginAs(page, /Super Admin/);
    await page.goto('/admin/realtime');
    await expect(page.getByText('Non connecté').first()).toBeVisible();
    await expect(page.getByText('Aucun événement')).toBeVisible();
    await page.getByRole('button', { name: /Lancer un flux de démonstration/ }).click();
    await expect(page.locator('.adm-feed li').first()).toBeVisible({ timeout: 6000 });
  });

  test('modération : suspension soumise à confirmation renforcée', async ({ page }) => {
    await loginAs(page, /Moderator/);
    await page.goto('/admin/moderation');
    await page.getByLabel('Action à entreprendre').selectOption('suspend');
    await page.getByLabel(/Note interne/).fill('Usurpation constatée');
    await page.getByRole('button', { name: 'Préparer la décision' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('button', { name: 'Confirmer la décision' })).toBeDisabled();
    await dialog.getByRole('textbox').fill((await dialog.locator('.field__label').innerText()).match(/« (.+) »/)![1]!);
    await expect(dialog.getByRole('button', { name: 'Confirmer la décision' })).toBeEnabled();
  });

  test('un signalement de visiteur arrive dans la file de l’Admin Center', async ({ page, browser }) => {
    const visitor = await browser.newContext();
    const vp = await visitor.newPage();
    await vp.goto('/mariama');
    await vp.getByRole('button', { name: 'Signaler cette page' }).click();
    await vp.getByLabel('Motif').selectOption('impersonation');
    await vp.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(vp.getByRole('heading', { name: 'Merci pour votre signalement' })).toBeVisible();
    // Démonstration : le signalement est local au navigateur du visiteur ; le modérateur du MÊME navigateur le voit.
    await vp.close();
    await visitor.close();
    await page.goto('/mariama');
    await page.getByRole('button', { name: 'Signaler cette page' }).click();
    await page.getByLabel('Motif').selectOption('scam');
    await page.getByRole('button', { name: 'Envoyer le signalement' }).click();
    await expect(page.getByRole('heading', { name: 'Merci pour votre signalement' })).toBeVisible();
    await loginAs(page, /Moderator/);
    await page.goto('/admin/reports?q=mariama');
    const row = page.locator('tbody tr').filter({ has: page.getByText('@mariama', { exact: true }) }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('Arnaque');
  });

  test('rôle Support : rubrique Paiements absente et accès direct refusé', async ({ page }) => {
    await loginAs(page, /^Support/);
    await expect(page.getByRole('heading', { name: 'Vue globale' })).toBeVisible();
    await page.goto('/admin/payments');
    await expect(page.getByRole('heading', { name: 'Accès non autorisé' })).toBeVisible();
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

  test('mot de passe oublié et lien de réinitialisation invalide', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await page.getByLabel(/Adresse e-mail/).fill('quelquun@exemple.com');
    await page.getByRole('button', { name: 'Envoyer le lien' }).click();
    await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeVisible();
    await page.goto('/auth/reset-password');
    await expect(page.getByRole('heading', { name: /Lien invalide/ })).toBeVisible();
  });

  test('session expirée', async ({ page }) => {
    await page.goto('/auth/session-expired?next=%2Fdashboard');
    await expect(page.getByRole('heading', { name: 'Session expirée' })).toBeVisible();
  });
});

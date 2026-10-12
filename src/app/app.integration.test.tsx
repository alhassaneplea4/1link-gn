import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { useSession } from '@/state/session';
import { loginThroughForm, useBackend } from '@/test/backend';
import { createUser, FIXTURE_PASSWORD } from '../../server/testing/fixtures';

const backend = useBackend();

function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const creator = () => createUser(backend.app.db, { name: 'Mariama Bah', plan: 'pro', page: { username: 'mariama', published: true } });

describe('navigation publique', () => {
  it('affiche la landing avec le titre officiel et les CTA', async () => {
    mount('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Un lien, pour toute votre présence/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Créer mon 1Link' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Découvrir 1Link' })).toBeInTheDocument();
  });

  it('rend la page publique lue en base et chaque état (suspendue, brouillon, introuvable, indisponible)', async () => {
    const { db } = backend.app;
    await creator();
    await createUser(db, { name: 'Compte Suspendu', suspended: true, page: { username: 'compte-suspendu', published: true } });
    await createUser(db, { name: 'Brouillon', page: { username: 'brouillon-demo', published: false } });
    const real = backend.browser.asFetch();
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes('/api/pages/panne-serveur') ? Promise.resolve(Response.json({ message: 'unavailable' }, { status: 503 })) : real(input, init));

    const r = mount('/mariama');
    expect(await screen.findByRole('heading', { level: 1, name: /Mariama Bah/ })).toBeInTheDocument();
    await r.navigate('/compte-suspendu');
    expect(await screen.findByRole('heading', { name: /suspendue/i })).toBeInTheDocument();
    await r.navigate('/brouillon-demo');
    expect(await screen.findByRole('heading', { name: /pas encore publiée/i })).toBeInTheDocument();
    await r.navigate('/panne-serveur');
    expect(await screen.findByRole('heading', { name: /temporairement indisponible/i })).toBeInTheDocument();
    await r.navigate('/introuvable-xyz');
    expect(await screen.findByRole('heading', { name: /n’existe pas/i })).toBeInTheDocument();
  });

  it('traite un nom réservé comme introuvable (pas de collision avec les routes)', async () => {
    mount('/settings');
    expect(await screen.findByRole('heading', { name: /Page introuvable/ })).toBeInTheDocument();
  });
});

describe('guards d’accès (expérience uniquement)', () => {
  it('redirige un visiteur anonyme du dashboard vers la connexion', async () => {
    const r = mount('/dashboard');
    await waitFor(() => expect(r.state.location.pathname).toBe('/auth/login'));
    expect(r.state.location.search).toContain('next=%2Fdashboard');
  });

  it('refuse l’Admin Center à un utilisateur sans permission (le serveur aussi)', async () => {
    const { email, password } = await creator();
    const r = mount('/auth/login');
    await loginThroughForm(email!, password);
    await screen.findByRole('heading', { name: /Bonjour, Mariama/ });
    await r.navigate('/admin');
    await waitFor(() => expect(r.state.location.pathname).toBe('/403'));
    expect((await backend.browser.get('/api/admin/users')).status).toBe(403);
  });
});

describe('authentification', () => {
  it('affiche les erreurs de validation et de connexion', async () => {
    mount('/auth/login');
    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    await userEvent.type(screen.getByLabelText(/Adresse e-mail/), 'inconnu@exemple.com');
    await userEvent.type(screen.getByLabelText(/^Mot de passe/), 'quelquechose');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText(/incorrect/i)).toBeInTheDocument();
  });

  it('connecte un compte réel (mot de passe vérifié) et ne montre aucun bandeau de démonstration', async () => {
    const { email, password } = await creator();
    mount('/auth/login');
    expect(screen.queryByText(/comptes? d’essai|Démonstration/)).not.toBeInTheDocument();
    await loginThroughForm(email!, password);
    expect(await screen.findByRole('heading', { name: /Bonjour, Mariama/ })).toBeInTheDocument();
    expect(screen.queryByText(/Démonstration/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ma page' })[0]!).toBeInTheDocument();
  });

  it('refuse un mauvais mot de passe pour un compte existant', async () => {
    const { email } = await creator();
    mount('/auth/login');
    await loginThroughForm(email!, 'Mauvais-mot-de-passe-1');
    expect(await screen.findByText(/incorrect/i)).toBeInTheDocument();
    expect(useSession.getState().status).not.toBe('authenticated');
  });

  it('affiche l’état de session expirée', async () => {
    mount('/auth/session-expired?next=%2Fdashboard');
    expect(await screen.findByRole('heading', { name: 'Session expirée' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se reconnecter' })).toHaveAttribute('href', expect.stringContaining('next=%2Fdashboard'));
  });

  it('bascule sur « session expirée » quand le serveur révoque la session', async () => {
    const { email, password, user } = await creator();
    const r = mount('/auth/login');
    await loginThroughForm(email!, password);
    await screen.findByRole('heading', { name: /Bonjour, Mariama/ });
    const { sessions } = await import('../../server/db/schema');
    const { eq } = await import('drizzle-orm');
    await backend.app.db.delete(sessions).where(eq(sessions.userId, user.id));
    // La prochaine requête de l'interface reçoit un 401 : elle bascule d'elle-même sur l'écran « session expirée ».
    await api.page.getMyPage().catch(() => undefined);
    await waitFor(() => expect(r.state.location.pathname).toBe('/auth/session-expired'));
  });
});

describe('Admin Center et rôles', () => {
  it('donne un accès complet au Super Admin, avec des chiffres lus en base', async () => {
    const admin = await createUser(backend.app.db, { name: 'Sékou Condé', adminRole: 'super_admin', onboardingDone: true });
    await createUser(backend.app.db, { name: 'Un inscrit' });
    mount('/auth/login');
    await loginThroughForm(admin.email!, admin.password);
    expect(await screen.findByRole('heading', { name: /Vue globale/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Paiements' }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/fictifs|démonstration/i)).not.toBeInTheDocument();
  });

  it('masque Paiements au rôle Support et affiche l’accès restreint si on force l’URL', async () => {
    const support = await createUser(backend.app.db, { name: 'Kadiatou Sylla', adminRole: 'support', onboardingDone: true });
    const r = mount('/auth/login');
    await loginThroughForm(support.email!, support.password);
    await screen.findByRole('heading', { name: /Vue globale/ });
    expect(screen.queryByRole('link', { name: 'Paiements' })).not.toBeInTheDocument();
    await r.navigate('/admin/payments');
    expect(await screen.findByRole('heading', { name: /Accès non autorisé/ })).toBeInTheDocument();
    expect((await backend.browser.get('/api/admin/payments')).status).toBe(403);
  });
});

describe('inscription et onboarding', () => {
  it('crée un compte réel, parcourt l’assistant puis publie directement, sans confirmation d’e-mail', async () => {
    const r = mount('/auth/register');
    await userEvent.type(await screen.findByLabelText(/Nom complet/), 'Awa Test');
    await userEvent.type(screen.getByLabelText(/Adresse e-mail/), 'awa.test@exemple.com');
    await userEvent.type(screen.getByLabelText(/^Mot de passe/), 'MotDePasse-Solide-123');
    await userEvent.click(screen.getByLabelText(/J’accepte/));
    await userEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    await waitFor(() => expect(r.state.location.pathname).toBe('/onboarding'));

    // 1. catégorie (bloquée tant qu’aucune n’est choisie)
    await userEvent.click(await screen.findByRole('button', { name: /Continuer/ }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Professionnel/));
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // 2. identité préremplie depuis le compte
    expect(await screen.findByRole('heading', { name: 'Votre identité' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nom affiché/)).toHaveValue('Awa Test');
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // 3. activité : champ « Métier ou titre » obligatoire pour un professionnel
    await screen.findByRole('heading', { name: 'Votre activité' });
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText(/Métier ou titre/), 'Designer');
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // retour en arrière : les saisies sont conservées
    await screen.findByRole('heading', { name: 'Vos liens et réseaux' });
    await userEvent.click(screen.getByRole('button', { name: /Retour/ }));
    expect(await screen.findByLabelText(/Métier ou titre/)).toHaveValue('Designer');
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // étapes facultatives
    for (const heading of ['Vos liens et réseaux', 'Services ou contenus', 'Choisissez un style']) {
      await screen.findByRole('heading', { name: heading });
      await userEvent.click(screen.getByRole('button', { name: /Passer cette étape/ }));
    }
    await screen.findByRole('heading', { name: 'Vérifiez votre page' });
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // publication : possible tout de suite (aucune confirmation d’e-mail exigée), page lue depuis la base
    await screen.findByRole('heading', { name: 'Prêt à publier ?' });
    expect(screen.getByRole('button', { name: 'Publier ma page' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Publier ma page' }));
    await waitFor(() => expect(r.state.location.pathname).toBe('/dashboard'));
    expect(await screen.findByRole('heading', { name: /Bonjour, Awa/ })).toBeInTheDocument();
    expect(screen.queryByText(/Vérifiez votre adresse e-mail/)).not.toBeInTheDocument();
    const page = (await backend.browser.get('/api/me/page')).body;
    expect(page).toMatchObject({ status: 'published', category: 'professional' });
    expect(useSession.getState().session?.user.emailVerified).toBe(false);
  }, 90000);
});

describe('éditeur de page', () => {
  it('ajoute puis supprime un bloc, avec confirmation, sur une page lue en base', async () => {
    const { email, password } = await creator();
    mount('/auth/login');
    await loginThroughForm(email!, password);
    await screen.findByRole('heading', { name: /Bonjour, Mariama/ });
    await userEvent.click(screen.getAllByRole('link', { name: 'Ma page' })[0]!);
    await screen.findByRole('heading', { level: 1, name: 'Ma page' });
    const countBlocks = () => document.querySelectorAll('.bcard').length;
    await waitFor(() => expect(countBlocks()).toBe(3));
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un bloc' }));
    await userEvent.click((await screen.findAllByRole('button', { name: /^Vidéo/ }))[0]!);
    await waitFor(() => expect(countBlocks()).toBe(4));
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]!);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(countBlocks()).toBe(3));
  }, 60000);
});

void FIXTURE_PASSWORD;

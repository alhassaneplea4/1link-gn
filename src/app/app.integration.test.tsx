import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { resetDemoDb } from '@/services/api/demo/db';
import { useSession } from '@/state/session';
import { useEditor } from '@/state/editor';
import { useOnboarding } from '@/features/onboarding/store';

function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  resetDemoDb();
  useSession.setState({ status: 'loading', session: null });
  useEditor.getState().reset();
  useOnboarding.getState().reset();
});

const signIn = async (label: RegExp) => {
  await userEvent.click(await screen.findByRole('button', { name: label }));
  await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
};

describe('navigation publique', () => {
  it('affiche la landing avec le titre officiel et les CTA', async () => {
    mount('/');
    expect(await screen.findByRole('heading', { level: 1, name: /Un lien, pour toute votre présence/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Créer mon 1Link' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Découvrir 1Link' })).toBeInTheDocument();
  });

  it('rend la page publique d’un utilisateur et les états spéciaux', async () => {
    const r = mount('/mariama');
    expect(await screen.findByRole('heading', { level: 1, name: /Mariama Bah/ })).toBeInTheDocument();
    await r.navigate('/compte-suspendu');
    expect(await screen.findByRole('heading', { name: /suspendue/i })).toBeInTheDocument();
    await r.navigate('/brouillon-demo');
    expect(await screen.findByRole('heading', { name: /pas encore publiée/i })).toBeInTheDocument();
    await r.navigate('/indisponible-demo');
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

  it('refuse l’Admin Center à un utilisateur sans permission', async () => {
    const r = mount('/auth/login');
    await signIn(/Créatrice/);
    await screen.findByRole('heading', { name: /Bonjour, Mariama/ });
    await r.navigate('/admin');
    await waitFor(() => expect(r.state.location.pathname).toBe('/403'));
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

  it('connecte un compte de démonstration et ouvre le dashboard avec le bandeau Démonstration', async () => {
    mount('/auth/login');
    await signIn(/Créatrice/);
    expect(await screen.findByRole('heading', { name: /Bonjour, Mariama/ })).toBeInTheDocument();
    expect(screen.getAllByText(/Démonstration/).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Ma page' })[0]!).toBeInTheDocument();
  });

  it('affiche l’état de session expirée', async () => {
    mount('/auth/session-expired?next=%2Fdashboard');
    expect(await screen.findByRole('heading', { name: 'Session expirée' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Se reconnecter' })).toHaveAttribute('href', expect.stringContaining('next=%2Fdashboard'));
  });
});

describe('Admin Center et rôles', () => {
  it('donne un accès complet au Super Admin et limite le Support', async () => {
    mount('/auth/login');
    await signIn(/Super Admin/);
    expect(await screen.findByRole('heading', { name: /Vue globale/ })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Paiements' }).length).toBeGreaterThan(0);
  });

  it('masque Paiements au rôle Support et affiche l’accès restreint si on force l’URL', async () => {
    const r = mount('/auth/login');
    await signIn(/^Support/);
    await screen.findByRole('heading', { name: /Vue globale/ });
    expect(screen.queryByRole('link', { name: 'Paiements' })).not.toBeInTheDocument();
    await r.navigate('/admin/payments');
    expect(await screen.findByRole('heading', { name: /Accès non autorisé/ })).toBeInTheDocument();
  });
});

describe('inscription et onboarding (démonstration)', () => {
  it('crée un compte, parcourt l’assistant par catégorie et enregistre un brouillon', async () => {
    const r = mount('/auth/register');
    await userEvent.type(await screen.findByLabelText(/Nom complet/), 'Awa Test');
    await userEvent.type(screen.getByLabelText(/Adresse e-mail/), 'awa.test@exemple.com');
    await userEvent.type(screen.getByLabelText(/^Mot de passe/), 'MotDePasse123');
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

    // publication : bloquée tant que l’e-mail n’est pas vérifié, brouillon possible
    await screen.findByRole('heading', { name: 'Prêt à publier ?' });
    expect(screen.getByRole('button', { name: 'Publier ma page' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer en brouillon' }));
    await waitFor(() => expect(r.state.location.pathname).toBe('/dashboard'));
    expect(await screen.findByRole('heading', { name: /Bonjour, Awa/ })).toBeInTheDocument();
    expect(screen.queryByText('Votre page est publiée')).not.toBeInTheDocument();
    expect(screen.getAllByText(/Vérifiez votre adresse e-mail/).length).toBeGreaterThan(0);
  }, 60000);
});

describe('éditeur de page', () => {
  it('ajoute puis supprime un bloc, avec confirmation', async () => {
    mount('/auth/login');
    await signIn(/Créatrice/);
    await screen.findByRole('heading', { name: /Bonjour, Mariama/ });
    await userEvent.click(screen.getAllByRole('link', { name: 'Ma page' })[0]!);
    await screen.findByRole('heading', { level: 1, name: 'Ma page' });
    const countBlocks = () => document.querySelectorAll('.bcard').length;
    const before = countBlocks();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un bloc' }));
    await userEvent.click((await screen.findAllByRole('button', { name: /^Vidéo/ }))[0]!);
    await waitFor(() => expect(countBlocks()).toBe(before + 1));
    expect(screen.getByText('Modifications non enregistrées')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Supprimer' })[0]!);
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(countBlocks()).toBe(before));
  }, 60000);
});

import { within } from '@testing-library/react';

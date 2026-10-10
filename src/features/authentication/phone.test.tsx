import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { useSession } from '@/state/session';
import { useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';

/**
 * Parcours d'interface de la connexion par téléphone, contre le vrai serveur (codes à usage unique stockés en base,
 * fournisseur d'envoi de test : le code est renvoyé à l'écran de développement). Les règles (expiration, essais,
 * plafonds) sont testées côté serveur dans server/tests/auth.test.ts.
 */
const backend = useBackend();

describe('inscription par téléphone — interface', () => {
  it('parcourt le formulaire, le code de développement et arrive à l’onboarding', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/auth/register'] });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Téléphone' }));
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);

    await userEvent.type(screen.getByLabelText(/Nom complet/), 'Awa Test');
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '12');
    await userEvent.click(screen.getByLabelText(/J’accepte/));
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect(await screen.findByText(/Numéro invalide/)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Numéro de téléphone/));
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '622 00 00 00');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    expect(await screen.findByText(/Aucun message n’est réellement envoyé/)).toBeInTheDocument();
    expect(screen.getByText(/\+224.*•/)).toBeInTheDocument(); // le numéro est masqué
    const code = screen.getByLabelText('Code de développement').textContent!;
    expect(code).toBe(backend.app.otp.sent.at(-1)!.code); // c'est bien le code émis par le serveur
    const wrong = code === '000000' ? '111111' : '000000';

    await userEvent.type(screen.getByLabelText(/Code à 6 chiffres/), wrong);
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText(/Code incorrect. Il vous reste 4 essais/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Renvoyer dans/ })).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/Code à 6 chiffres/));
    await userEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/onboarding'));
    expect(useSession.getState().session?.user).toMatchObject({ phone: '+224622000000', email: null, phoneVerified: true });
  }, 40000);

  it('reconnecte un compte existant par son numéro', async () => {
    await createUser(backend.app.db, { email: null, phone: '+224622445566', phoneVerified: true, name: 'Awa Existante', onboardingDone: true });
    const router = createMemoryRouter(routes, { initialEntries: ['/auth/login'] });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Téléphone' }));
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '622 44 55 66');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await screen.findByText(/Aucun message n’est réellement envoyé/);
    await userEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(useSession.getState().session?.user.name).toBe('Awa Existante');
  }, 40000);

  it('propose de créer un compte quand le numéro n’en a pas, après un code correct', async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/auth/login'] })} />);
    await userEvent.click(await screen.findByRole('radio', { name: 'Téléphone' }));
    await userEvent.type(screen.getByLabelText(/Numéro de téléphone/), '622 11 22 33');
    await userEvent.click(screen.getByRole('button', { name: 'Recevoir le code' }));
    await screen.findByText(/Aucun message n’est réellement envoyé/);
    await userEvent.click(screen.getByRole('button', { name: 'Remplir' }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    expect(await screen.findByText(/Aucun compte n’est associé à ce numéro/)).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /Créer mon 1Link/ });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((l) => expect(l).toHaveAttribute('href', '/auth/register'));
  }, 40000);
});

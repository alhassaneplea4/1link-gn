import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { useSession } from '@/state/session';
import { useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';
import { VirtualAuthenticator } from '../../../server/testing/webauthn';

/**
 * Clés d'accès, de bout en bout : l'interface parle au VRAI serveur, qui vérifie de vraies signatures. Seule l'API du NAVIGATEUR
 * (`navigator.credentials`) est remplacée par un authentificateur virtuel — jsdom n'en a pas.
 */
const hoisted = vi.hoisted(() => ({ key: null as null | { register(o: unknown): unknown; authenticate(o: unknown): unknown }, cancel: false }));
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => true,
  startRegistration: async ({ optionsJSON }: { optionsJSON: unknown }) => {
    if (hoisted.cancel) throw Object.assign(new Error('annulé'), { name: 'NotAllowedError' });
    return hoisted.key!.register(optionsJSON);
  },
  startAuthentication: async ({ optionsJSON }: { optionsJSON: unknown }) => {
    if (hoisted.cancel) throw Object.assign(new Error('annulé'), { name: 'NotAllowedError' });
    return hoisted.key!.authenticate(optionsJSON);
  },
}));

const backend = useBackend();
const newKey = () => new VirtualAuthenticator({ origin: 'http://localhost:5173', rpId: 'localhost' });

async function openSecurity(email: string, password: string) {
  await api.auth.signIn(email, password);
  useSession.getState().setSession((await api.auth.getSession())!);
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/dashboard/security'] })} />);
  return screen.findByTestId('passkeys-card');
}

describe('clés d’accès — interface', () => {
  it('ajoute une clé depuis Sécurité (preuve d’identité demandée), puis se connecte avec elle sans mot de passe', async () => {
    hoisted.key = newKey();
    hoisted.cancel = false;
    const u = await createUser(backend.app.db, { onboardingDone: true });
    const card = await openSecurity(u.email!, u.password);
    expect(await within(card).findByText('Aucune clé d’accès pour le moment.')).toBeInTheDocument();

    await userEvent.click(within(card).getByRole('button', { name: 'Ajouter une clé d’accès' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Ajouter' });
    expect(confirm).toBeDisabled(); // sans mot de passe, impossible de continuer
    await userEvent.type(within(dialog).getByLabelText('Nom de la clé'), 'Mon téléphone');
    await userEvent.type(within(dialog).getByLabelText(/Mot de passe actuel/), u.password);
    await userEvent.click(confirm);
    expect(await within(card).findByText('Mon téléphone')).toBeInTheDocument();
    expect(within(card).getAllByTestId('passkey')).toHaveLength(1);

    // Déconnexion, puis connexion par le bouton « clé d'accès » de la page de connexion.
    await api.auth.signOut();
    useSession.setState({ status: 'anonymous', session: null });
    cleanup();
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/auth/login'] })} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter avec une clé d’accès' }));
    await waitFor(() => expect(useSession.getState().session?.user.email).toBe(u.email));
    expect((await api.auth.getSession())?.user.email).toBe(u.email); // la session serveur est réellement ouverte
  }, 90000);

  it('retire une clé (preuve d’identité), qui ne permet plus de se connecter', async () => {
    hoisted.key = newKey();
    hoisted.cancel = false;
    const u = await createUser(backend.app.db, { onboardingDone: true });
    const card = await openSecurity(u.email!, u.password);
    await userEvent.click(within(card).getByRole('button', { name: 'Ajouter une clé d’accès' }));
    let dialog = await screen.findByRole('alertdialog');
    await userEvent.type(within(dialog).getByLabelText(/Mot de passe actuel/), u.password);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    await within(card).findByTestId('passkey');

    await userEvent.click(within(card).getByRole('button', { name: 'Retirer' }));
    dialog = await screen.findByRole('alertdialog');
    await userEvent.type(within(dialog).getByLabelText(/Mot de passe actuel/), u.password);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Retirer' }));
    expect(await within(card).findByText('Aucune clé d’accès pour le moment.')).toBeInTheDocument();
    expect(await api.auth.listPasskeys()).toEqual([]);
  }, 90000);

  it('dit calmement que l’ajout est annulé quand l’utilisateur refuse sur son appareil', async () => {
    hoisted.key = newKey();
    hoisted.cancel = true;
    const u = await createUser(backend.app.db, { onboardingDone: true });
    const card = await openSecurity(u.email!, u.password);
    await userEvent.click(within(card).getByRole('button', { name: 'Ajouter une clé d’accès' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.type(within(dialog).getByLabelText(/Mot de passe actuel/), u.password);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ajouter' }));
    expect(await within(dialog).findByText('Ajout annulé.')).toBeInTheDocument();
    expect(await api.auth.listPasskeys()).toEqual([]);
  }, 90000);

  it('une clé inconnue du serveur est refusée à la connexion, avec un message clair', async () => {
    hoisted.key = newKey(); // jamais enregistrée
    hoisted.cancel = false;
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/auth/login'] })} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Se connecter avec une clé d’accès' }));
    expect(await screen.findByText(/n’est pas reconnue/)).toBeInTheDocument();
    expect(useSession.getState().session).toBeNull();
  }, 90000);
});

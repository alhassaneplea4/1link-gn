import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { useSession } from '@/state/session';
import { useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';
import { totpAt } from '../../../server/lib/totp';

/**
 * L'Admin Center exige une session à deux facteurs : ici le serveur de test applique réellement la règle (aucun état fabriqué).
 * Les règles elles-mêmes sont dans server/tests/admin-mfa.test.ts.
 */
const backend = useBackend({ overrides: { adminRequireMfa: true } });

async function signInAdmin() {
  const admin = await createUser(backend.app.db, { adminRole: 'super_admin', onboardingDone: true });
  await api.auth.signIn(admin.email!, admin.password);
  useSession.getState().setSession((await api.auth.getSession())!);
  return admin;
}

describe('Admin Center : session à un seul facteur', () => {
  it('affiche l’écran d’explication (le serveur refuse les routes d’administration) et mène à la page Sécurité', async () => {
    await signInAdmin();
    expect(useSession.getState().session?.adminMfaRequired).toBe(true);
    const router = createMemoryRouter(routes, { initialEntries: ['/admin'] });
    render(<RouterProvider router={router} />);
    const gate = await screen.findByTestId('admin-mfa-gate');
    expect(within(gate).getByText(/second facteur est requis/)).toBeInTheDocument();
    await userEvent.click(within(gate).getByRole('link', { name: 'Ouvrir la page Sécurité' }));
    expect(await screen.findByTestId('devices-card')).toBeInTheDocument();
  }, 60000);

  it('s’ouvre dès que l’application d’authentification est activée dans la session', async () => {
    const admin = await signInAdmin();
    const setup = await api.auth.setupTotp({ password: admin.password });
    const { session } = await api.auth.enableTotp(totpAt(setup.secret, Date.now()));
    useSession.getState().setSession(session);
    expect(session.adminMfaRequired).toBe(false);
    const router = createMemoryRouter(routes, { initialEntries: ['/admin'] });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(document.querySelector('.shell--admin')).not.toBeNull());
    expect(screen.queryByTestId('admin-mfa-gate')).not.toBeInTheDocument();
  }, 60000);
});

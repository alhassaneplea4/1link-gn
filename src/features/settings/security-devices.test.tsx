import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { useSession } from '@/state/session';
import { useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';

/** Appareils connectés et écran de blocage de l'Admin Center, contre le vrai serveur. Les règles sont dans server/tests/. */
const backend = useBackend();

async function openAs(email: string, password: string, entry: string) {
  await api.auth.signIn(email, password);
  useSession.getState().setSession((await api.auth.getSession())!);
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(<RouterProvider router={router} />);
}

describe('appareils connectés', () => {
  it('liste les sessions réellement ouvertes, repère la courante et ferme l’autre à la demande', async () => {
    const u = await createUser(backend.app.db, { onboardingDone: true });
    const other = backend.app.client({ 'x-real-ip': '10.200.200.9', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1', 'x-vercel-ip-country': 'SN' });
    expect((await other.post('/api/auth/sign-in', { email: u.email, password: u.password })).status).toBe(200);
    await openAs(u.email!, u.password, '/dashboard/security');

    const card = await screen.findByTestId('devices-card');
    await waitFor(() => expect(within(card).getAllByTestId('device')).toHaveLength(2));
    expect(within(card).getByText('Cet appareil')).toBeInTheDocument();
    expect(within(card).getByText(/Safari sur iOS/)).toBeInTheDocument();
    expect(within(card).getByText(/Sénégal/)).toBeInTheDocument();
    expect(card.textContent).not.toMatch(/Mozilla/); // jamais le User-Agent brut

    await userEvent.click(within(card).getByRole('button', { name: 'Fermer la session' }));
    await waitFor(() => expect(within(card).getAllByTestId('device')).toHaveLength(1));
    expect((await other.get('/api/auth/session')).body).toBeNull(); // l'autre navigateur est réellement déconnecté
    expect((await api.auth.getSession())?.user.email).toBe(u.email);
  }, 60000);

  it('« Fermer toutes les autres sessions » les ferme toutes et garde la courante', async () => {
    const u = await createUser(backend.app.db, { onboardingDone: true });
    const others = [1, 2].map((i) => backend.app.client({ 'x-real-ip': `10.200.201.${i}` }));
    for (const c of others) await c.post('/api/auth/sign-in', { email: u.email, password: u.password });
    await openAs(u.email!, u.password, '/dashboard/security');
    const card = await screen.findByTestId('devices-card');
    await waitFor(() => expect(within(card).getAllByTestId('device')).toHaveLength(3));
    await userEvent.click(within(card).getByRole('button', { name: 'Fermer toutes les autres sessions' }));
    await waitFor(() => expect(within(card).getAllByTestId('device')).toHaveLength(1));
    for (const c of others) expect((await c.get('/api/auth/session')).body).toBeNull();
    expect(await within(card).findByText('Aucune autre session n’est ouverte.')).toBeInTheDocument();
  }, 60000);
});

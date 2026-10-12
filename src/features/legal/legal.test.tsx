import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { eq } from 'drizzle-orm';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { useSession } from '@/state/session';
import { useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';
import { users } from '../../../server/db/schema';
import { LEGAL } from './content';

const backend = useBackend();

describe('pages juridiques', () => {
  it('publient la politique de confidentialité, les conditions et la suppression du compte, avec le contact et la date', async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/legal/privacy'] })} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Politique de confidentialité' })).toBeInTheDocument();
    expect(screen.getByText(/Dernière mise à jour/)).toBeInTheDocument();
    expect(screen.getAllByText(/astronetgn@gmail\.com/).length).toBeGreaterThan(0);
    for (const l of screen.getAllByRole('link', { name: 'Conditions d’utilisation' })) expect(l).toHaveAttribute('href', '/legal/terms');
    for (const l of screen.getAllByRole('link', { name: 'Supprimer mon compte' })) expect(l).toHaveAttribute('href', '/legal/delete-account');
  });

  it('couvrent les mêmes sections en français et en anglais, et citent les vrais prestataires', () => {
    for (const kind of ['privacy', 'terms', 'deleteAccount'] as const) {
      expect(LEGAL.en[kind].sections.length).toBe(LEGAL.fr[kind].sections.length);
    }
    const privacy = JSON.stringify(LEGAL.fr.privacy);
    for (const provider of ['Vercel', 'Neon', 'Google', 'smsmobileapi.com']) expect(privacy).toContain(provider);
  });

  it('l’inscription renvoie vers les conditions et la confidentialité', async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/auth/register'] })} />);
    expect(await screen.findByRole('link', { name: 'Conditions d’utilisation' })).toHaveAttribute('href', '/legal/terms');
    expect(screen.getByRole('link', { name: 'Politique de confidentialité' })).toHaveAttribute('href', '/legal/privacy');
  });
});

describe('suppression du compte — interface', () => {
  it('supprime réellement le compte après confirmation par mot de passe', async () => {
    const u = await createUser(backend.app.db, { name: 'Partante', onboardingDone: true, page: { username: 'partante-ui', published: true } });
    await api.auth.signIn(u.email!, u.password);
    useSession.getState().setSession((await api.auth.getSession())!);

    const router = createMemoryRouter(routes, { initialEntries: ['/dashboard/settings'] });
    render(<RouterProvider router={router} />);
    const row = await screen.findByTestId('delete-account-row');
    await userEvent.click(within(row).getByRole('button', { name: 'Supprimer définitivement mon compte' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Oui, tout supprimer' });
    expect(confirm).toBeDisabled(); // pas sans mot de passe
    await userEvent.type(within(dialog).getByLabelText(/Mot de passe actuel/), 'Mauvais-mot-de-passe');
    await userEvent.click(confirm);
    expect(await within(dialog).findByText('Mot de passe incorrect.')).toBeInTheDocument();
    expect((await backend.app.db.select().from(users).where(eq(users.id, u.user.id))).length).toBe(1);

    await userEvent.clear(within(dialog).getByLabelText(/Mot de passe actuel/));
    await userEvent.type(within(dialog).getByLabelText(/Mot de passe actuel/), u.password);
    await userEvent.click(confirm);
    await waitFor(() => expect(router.state.location.pathname).toBe('/auth/signed-out'));
    expect(useSession.getState().session).toBeNull();
    expect((await backend.app.db.select().from(users).where(eq(users.id, u.user.id))).length).toBe(0);
    expect((await api.page.getPublicPage('partante-ui')).state).toBe('not_found');
  }, 60000);
});

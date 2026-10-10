import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { ApiError } from '@/models/api';
import { resetDemoDb } from '@/services/api/demo/db';
import { useSession } from '@/state/session';

beforeEach(() => {
  resetDemoDb();
  useSession.setState({ status: 'loading', session: null });
});

describe('signalement par un visiteur', () => {
  it('ouvre le formulaire, envoie le signalement et confirme', async () => {
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/mariama'] })} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Signaler cette page' }));
    const dialog = await screen.findByRole('dialog', { name: 'Signaler cette page' });
    expect(dialog).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Motif'), 'scam');
    await userEvent.type(screen.getByLabelText(/Précisions/), 'Propose un faux investissement');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));
    expect(await screen.findByRole('heading', { name: 'Merci pour votre signalement' })).toBeInTheDocument();
    expect(screen.getByText(/enregistré uniquement dans ce navigateur/)).toBeInTheDocument();
    // le visiteur n'a fourni aucune donnée personnelle
    expect(screen.queryByLabelText(/e-mail|nom|téléphone/i)).not.toBeInTheDocument();
  });

  it('apparaît dans la liste de modération avec la bonne priorité, et est limité à 3 envois par page', async () => {
    await api.page.reportPage('mariama', { reason: 'scam', details: 'Faux investissement' });
    await api.auth.signIn('moderator@demo.1link', 'x');
    const list = await api.admin.listReports({ page: 1, pageSize: 100 });
    const first = list.items.find((r) => r.id.startsWith('rep_v'))!;
    expect(first).toBeDefined();
    expect(first).toMatchObject({ username: 'mariama', reason: 'scam', priority: 'high', status: 'open', reporter: 'Visiteur anonyme' });
    expect((await api.admin.getReport(first.id)).details).toBe('Faux investissement');
    await api.page.reportPage('mariama', { reason: 'spam', details: '' });
    await api.page.reportPage('mariama', { reason: 'spam', details: '' });
    await expect(api.page.reportPage('mariama', { reason: 'spam', details: '' })).rejects.toMatchObject({ code: 'rate_limited' });
    await expect(api.page.reportPage('autre', { reason: 'other', details: 'x'.repeat(501) })).rejects.toBeInstanceOf(ApiError);
  });

  it('affiche une erreur claire si l’envoi est limité', async () => {
    for (let i = 0; i < 3; i++) await api.page.reportPage('mariama', { reason: 'spam', details: '' });
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/mariama'] })} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Signaler cette page' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Envoyer le signalement' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/déjà signalé/));
  });
});

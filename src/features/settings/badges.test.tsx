import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { useSession } from '@/state/session';
import { useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';
import { PageRenderer } from '@/features/page-engine/renderer/PageRenderer';
import { getSampleDocument } from '@/features/page-engine/samples';
import type { PageDocument } from '@/models/page';

const backend = useBackend();

describe('badges', () => {
  it('la page Paramètres montre les badges obtenus et ceux à obtenir', async () => {
    const u = await createUser(backend.app.db, { plan: 'pro', onboardingDone: true, page: { username: 'badge-ui', published: true } });
    await api.auth.signIn(u.email!, u.password);
    useSession.getState().setSession((await api.auth.getSession())!);
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/dashboard/settings'] })} />);
    const card = await screen.findByTestId('badges-card');
    const rows = within(card).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(within(rows[4]!).getByText('Obtenu')).toBeInTheDocument(); // Pro
    expect(within(rows[3]!).getByText('Non obtenu')).toBeInTheDocument(); // Business
    expect(within(rows[0]!).getByText('Non obtenu')).toBeInTheDocument(); // Certifié 1Link : réservé
    expect(within(card).getAllByRole('link', { name: 'Voir les offres' }).length).toBeGreaterThan(0);
  }, 60000);

  it('la page publique affiche les badges à côté du nom', () => {
    const base = getSampleDocument('creator');
    const page: PageDocument = { ...base, blocks: base.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified: true, badges: ['official', 'verified', 'pro'] as ('official' | 'verified' | 'pro')[] } } : b)) };
    const { container } = render(<PageRenderer page={page} pageUrl="https://1link.test/x" layout="profile" />);
    const marks = [...container.querySelectorAll('.pgp-id .bmark')].map((m) => m.getAttribute('title'));
    expect(marks).toEqual(['Certifié 1Link', 'Profil vérifié', 'Pro']);
  });
});

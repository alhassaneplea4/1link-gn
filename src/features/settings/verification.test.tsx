import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { resetDemoDb } from '@/services/api/demo/db';
import { useSession } from '@/state/session';
import { useEditor } from '@/state/editor';
import type { VerificationInput } from '@/models/verification';

const input = (over: Partial<VerificationInput> = {}): VerificationInput => ({ kind: 'person', legalName: 'Mariama Bah', registryNumber: '', proofUrl: 'https://exemple.com/mariama', note: '', attest: true, ...over });
const profileVerified = async () => {
  const res = await api.page.getPublicPage('mariama');
  if (res.state !== 'published') throw new Error('not published');
  const p = res.page.blocks.find((b) => b.type === 'profile');
  return p?.type === 'profile' && p.data.verified;
};

beforeEach(() => {
  resetDemoDb();
  useSession.setState({ status: 'loading', session: null });
  useEditor.getState().reset();
});

describe('vérification de profil — API de démonstration', () => {
  it('refuse une demande invalide ou en double', async () => {
    await api.auth.signIn('mariama@demo.1link', 'x');
    expect((await api.page.getVerification()).status).toBe('none');
    await expect(api.page.requestVerification(input({ attest: false }))).rejects.toMatchObject({ code: 'validation' });
    await expect(api.page.requestVerification(input({ proofUrl: 'javascript:alert(1)' }))).rejects.toMatchObject({ code: 'validation' });
    await expect(api.page.requestVerification(input({ legalName: ' ' }))).rejects.toMatchObject({ code: 'validation' });
    expect((await api.page.requestVerification(input())).status).toBe('pending');
    await expect(api.page.requestVerification(input())).rejects.toMatchObject({ code: 'conflict' });
  });

  it('seule la modération accorde le badge, et il survit à un enregistrement qui tente de le forcer', async () => {
    await api.auth.signIn('mariama@demo.1link', 'x');
    expect(await profileVerified()).toBe(false);
    // tentative de triche : le client envoie verified: true
    const mine = (await api.page.getMyPage())!;
    const forged = { ...mine, blocks: mine.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified: true } } : b)) };
    await api.page.publish(forged);
    expect(await profileVerified()).toBe(false);

    await api.page.requestVerification(input());
    const admin = await api.auth.signIn('admin@demo.1link', 'x');
    expect(admin.permissions).toContain('profiles:write');
    const list = await api.admin.listVerifications({ page: 1, pageSize: 100, filters: { status: 'pending' } });
    const mineReq = list.items.find((v) => v.username === 'mariama')!;
    expect(mineReq).toBeDefined();
    await api.admin.decideVerification(mineReq.id, 'approve', '');
    await api.auth.signIn('mariama@demo.1link', 'x');
    expect((await api.page.getVerification()).status).toBe('approved');
    expect(await profileVerified()).toBe(true);
    // un nouvel enregistrement ne retire ni n'ajoute le badge de lui-même
    const again = (await api.page.getMyPage())!;
    await api.page.publish({ ...again, blocks: again.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified: false } } : b)) });
    expect(await profileVerified()).toBe(true);
  });

  it('le refus exige un motif, est communiqué au demandeur et permet de refaire une demande', async () => {
    await api.auth.signIn('mariama@demo.1link', 'x');
    await api.page.requestVerification(input());
    await api.auth.signIn('admin@demo.1link', 'x');
    const req = (await api.admin.listVerifications({ page: 1, pageSize: 100, filters: { status: 'pending' } })).items.find((v) => v.username === 'mariama')!;
    await expect(api.admin.decideVerification(req.id, 'reject', 'ok')).rejects.toMatchObject({ code: 'validation' });
    await api.admin.decideVerification(req.id, 'reject', 'Lien de preuve inaccessible');
    await expect(api.admin.decideVerification(req.id, 'approve', '')).rejects.toMatchObject({ code: 'conflict' });
    await api.auth.signIn('mariama@demo.1link', 'x');
    const state = await api.page.getVerification();
    expect(state.status).toBe('rejected');
    expect(state.request?.decisionNote).toBe('Lien de preuve inaccessible');
    expect(await profileVerified()).toBe(false);
  });
});

describe('vérification de profil — interface', () => {
  it('permet de demander la vérification depuis les paramètres puis affiche l’état en cours', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/auth/login'] });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole('button', { name: /Créatrice/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: /Bonjour, Mariama/ });
    await router.navigate('/dashboard/settings');
    await userEvent.click(await screen.findByRole('button', { name: 'Demander la vérification' }));
    const dialog = await screen.findByRole('dialog', { name: 'Demande de vérification' });
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText(/Nom légal/), 'Mariama Bah');
    await userEvent.type(screen.getByLabelText(/Lien de preuve/), 'https://exemple.com/mariama');
    await userEvent.click(screen.getByLabelText(/J’atteste sur l’honneur/));
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer la demande' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(await screen.findByText('Demande en cours d’examen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demander la vérification' })).not.toBeInTheDocument();
  });
});

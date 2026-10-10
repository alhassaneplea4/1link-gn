import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { loginThroughForm, useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';
import type { VerificationInput } from '@/models/verification';

const backend = useBackend();

const input = (over: Partial<VerificationInput> = {}): VerificationInput => ({ kind: 'person', legalName: 'Mariama Bah', registryNumber: '', proofUrl: 'https://exemple.com/mariama', note: '', attest: true, ...over });
const owner = () => createUser(backend.app.db, { name: 'Mariama Bah', plan: 'pro', page: { username: 'mariama', published: true } });
const admin = () => createUser(backend.app.db, { name: 'Nènè Traoré', adminRole: 'admin', onboardingDone: true });

const profileVerified = async () => {
  const res = await api.page.getPublicPage('mariama');
  if (res.state !== 'published') throw new Error('not published');
  const p = res.page.blocks.find((b) => b.type === 'profile');
  return p?.type === 'profile' && p.data.verified;
};

describe('vérification de profil — API', () => {
  it('refuse une demande invalide ou en double', async () => {
    const u = await owner();
    await api.auth.signIn(u.email!, u.password);
    expect((await api.page.getVerification()).status).toBe('none');
    await expect(api.page.requestVerification(input({ attest: false }))).rejects.toMatchObject({ code: 'validation' });
    await expect(api.page.requestVerification(input({ proofUrl: 'javascript:alert(1)' }))).rejects.toMatchObject({ code: 'validation' });
    await expect(api.page.requestVerification(input({ legalName: ' ' }))).rejects.toMatchObject({ code: 'validation' });
    expect((await api.page.requestVerification(input())).status).toBe('pending');
    await expect(api.page.requestVerification(input())).rejects.toMatchObject({ code: 'conflict' });
  });

  it('seule la modération accorde le badge, et il survit à un enregistrement qui tente de le forcer', async () => {
    const u = await owner();
    const a = await admin();
    await api.auth.signIn(u.email!, u.password);
    expect(await profileVerified()).toBe(false);
    // tentative de triche : le client envoie verified: true
    const mine = (await api.page.getMyPage())!;
    const forged = { ...mine, blocks: mine.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified: true } } : b)) };
    const saved = await api.page.publish(forged);
    expect(await profileVerified()).toBe(false);

    await api.page.requestVerification(input());
    await api.auth.signOut();
    const session = await api.auth.signIn(a.email!, a.password);
    expect(session.permissions).toContain('profiles:write');
    const list = await api.admin.listVerifications({ page: 1, pageSize: 100, filters: { status: 'pending' } });
    const mineReq = list.items.find((v) => v.username === 'mariama')!;
    expect(mineReq).toBeDefined();
    await api.admin.decideVerification(mineReq.id, 'approve', '');
    await api.auth.signOut();
    await api.auth.signIn(u.email!, u.password);
    expect((await api.page.getVerification()).status).toBe('approved');
    expect(await profileVerified()).toBe(true);
    // un nouvel enregistrement ne retire ni n'ajoute le badge de lui-même
    const again = (await api.page.getMyPage())!;
    expect(again.version).toBeGreaterThan(saved.version - 1);
    await api.page.publish({ ...again, blocks: again.blocks.map((b) => (b.type === 'profile' ? { ...b, data: { ...b.data, verified: false } } : b)) });
    expect(await profileVerified()).toBe(true);
  });

  it('le refus exige un motif, est communiqué au demandeur et permet de refaire une demande', async () => {
    const u = await owner();
    const a = await admin();
    await api.auth.signIn(u.email!, u.password);
    await api.page.requestVerification(input());
    await api.auth.signOut();
    await api.auth.signIn(a.email!, a.password);
    const req = (await api.admin.listVerifications({ page: 1, pageSize: 100, filters: { status: 'pending' } })).items.find((v) => v.username === 'mariama')!;
    await expect(api.admin.decideVerification(req.id, 'reject', 'ok')).rejects.toMatchObject({ code: 'validation' });
    await api.admin.decideVerification(req.id, 'reject', 'Lien de preuve inaccessible');
    await expect(api.admin.decideVerification(req.id, 'approve', '')).rejects.toMatchObject({ code: 'conflict' });
    await api.auth.signOut();
    await api.auth.signIn(u.email!, u.password);
    const state = await api.page.getVerification();
    expect(state.status).toBe('rejected');
    expect(state.request?.decisionNote).toBe('Lien de preuve inaccessible');
    expect(await profileVerified()).toBe(false);
    expect((await api.page.requestVerification(input())).status).toBe('pending'); // une nouvelle demande est possible
  });
});

describe('vérification de profil — interface', () => {
  it('permet de demander la vérification depuis les paramètres puis affiche l’état en cours', async () => {
    const u = await owner();
    const router = createMemoryRouter(routes, { initialEntries: ['/auth/login'] });
    render(<RouterProvider router={router} />);
    await loginThroughForm(u.email!, u.password);
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

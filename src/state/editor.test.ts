import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from './editor';
import { useSession } from './session';
import { getSampleDocument } from '@/features/page-engine/samples';
import { ApiError } from '@/models/api';
import { api } from '@/services/api';
import { vi } from 'vitest';

const load = () => {
  const doc = structuredClone(getSampleDocument('professional'));
  useEditor.setState({ status: 'ready', doc, saved: structuredClone(doc), past: [], future: [], dirty: false, selectedId: null });
};
const types = () => useEditor.getState().doc!.blocks.map((b) => b.type);

const setPlan = (plan: 'free' | 'basic' | 'pro' | 'business') =>
  useSession.setState({ status: 'authenticated', session: { user: {} as never, permissions: [], entitlements: { maxBlocks: 500, removeBranding: false, analyticsDays: 0, teamSeats: 1 }, access: { phase: 'subscribed', plan, trialEndsAt: null, daysLeft: null, locked: false, paidTrialAvailable: false }, expiresAt: '' } });

beforeEach(() => {
  useEditor.getState().reset();
  setPlan('pro');
  load();
});

describe('store de l’éditeur', () => {
  it('ajoute, sélectionne et supprime un bloc', () => {
    const n = types().length;
    const res = useEditor.getState().addBlock('video');
    expect(res.ok).toBe(true);
    expect(types()).toHaveLength(n + 1);
    expect(useEditor.getState().selectedId).toBe(res.ok ? res.id : null);
    expect(useEditor.getState().dirty).toBe(true);
    if (res.ok) useEditor.getState().removeBlock(res.id);
    expect(types()).toHaveLength(n);
  });

  it('ne signale « modifications non enregistrées » que si le contenu a réellement changé', () => {
    const profile = useEditor.getState().doc!.blocks.find((b) => b.type === 'profile')!;
    const original = (profile.data as { headline: string }).headline;
    // Réécrire la même valeur : rien n'a changé, pas de confirmation à la sortie.
    useEditor.getState().updateBlock(profile.id, 'profile', { headline: original });
    expect(useEditor.getState().dirty).toBe(false);
    // Modifier : c'est signalé.
    useEditor.getState().updateBlock(profile.id, 'profile', { headline: `${original} (modifié)` });
    expect(useEditor.getState().dirty).toBe(true);
    // Remettre la valeur d'origine : plus rien à enregistrer.
    useEditor.getState().updateBlock(profile.id, 'profile', { headline: original });
    expect(useEditor.getState().dirty).toBe(false);
  });

  it('refuse un second bloc unique (QR) et la suppression du profil', () => {
    expect(useEditor.getState().addBlock('qr').ok).toBe(true);
    const again = useEditor.getState().addBlock('qr');
    expect(again).toEqual({ ok: false, reason: 'singleton' });
    const profile = useEditor.getState().doc!.blocks.find((b) => b.type === 'profile')!;
    useEditor.getState().removeBlock(profile.id);
    expect(types()).toContain('profile');
  });

  it('applique les droits de l’offre : type de bloc réservé, liens limités, bloc déjà présent', () => {
    setPlan('free');
    expect(useEditor.getState().addBlock('video')).toEqual({ ok: false, reason: 'plan_block' });
    expect(useEditor.getState().addBlock('text')).toEqual({ ok: false, reason: 'plan_block' });
    expect(useEditor.getState().addBlock('service')).toEqual({ ok: false, reason: 'singleton' });
    let guard = 0;
    while (useEditor.getState().addBlock('link').ok && guard++ < 20);
    expect(types().filter((t) => t === 'link')).toHaveLength(4);
    expect(useEditor.getState().addBlock('link')).toEqual({ ok: false, reason: 'plan_links' });
    setPlan('basic');
    expect(useEditor.getState().addBlock('text')).toMatchObject({ ok: true });
    expect(useEditor.getState().addBlock('text')).toEqual({ ok: false, reason: 'singleton' });
  });

  it('duplique, déplace et masque', () => {
    const doc = useEditor.getState().doc!;
    const svc = doc.blocks.find((b) => b.type === 'link')!; // seuls les liens se dupliquent (les autres blocs sont uniques)
    const copyId = useEditor.getState().duplicateBlock(svc.id)!;
    expect(copyId).not.toBe(svc.id);
    const idx = types().indexOf('link');
    expect(types()[idx + 1]).toBe('link');
    useEditor.getState().moveBlock(idx + 1, 0);
    expect(useEditor.getState().doc!.blocks[0]!.id).toBe(copyId);
    useEditor.getState().toggleVisible(copyId);
    expect(useEditor.getState().doc!.blocks[0]!.visible).toBe(false);
  });

  it('annule et rétablit', () => {
    const before = types().length;
    useEditor.getState().addBlock('divider');
    useEditor.getState().undo();
    expect(types()).toHaveLength(before);
    expect(useEditor.getState().dirty).toBe(false);
    useEditor.getState().redo();
    expect(types()).toHaveLength(before + 1);
  });

  it('fusionne les saisies rapides d’un même champ dans une seule étape d’historique', () => {
    const link = useEditor.getState().doc!.blocks.find((b) => b.type === 'link')!;
    const past0 = useEditor.getState().past.length;
    for (const title of ['A', 'Ab', 'Abc']) useEditor.getState().updateBlock(link.id, 'link', { title });
    expect(useEditor.getState().past.length).toBe(past0 + 1);
    useEditor.getState().undo();
    const restored = useEditor.getState().doc!.blocks.find((b) => b.id === link.id)!;
    expect(restored.type === 'link' && restored.data.title).toBe('Voir mes réalisations');
  });

  it('réinitialiser l’apparence ne supprime jamais le contenu', () => {
    const before = JSON.stringify(useEditor.getState().doc!.blocks);
    useEditor.getState().applyTheme('creator');
    useEditor.getState().patchAppearance({ colors: { primary: '#ff0000' } });
    expect(useEditor.getState().doc!.appearance.themeId).toBe('custom');
    useEditor.getState().resetAppearance();
    expect(useEditor.getState().doc!.appearance.themeId).toBe('minimal');
    expect(JSON.stringify(useEditor.getState().doc!.blocks)).toBe(before);
  });

  it('signale un conflit de version (page modifiée sur un autre appareil) sans rien écraser', async () => {
    useEditor.getState().addBlock('text');
    const spy = vi.spyOn(api.page, 'saveDraft').mockRejectedValueOnce(new ApiError('conflict', 'version_conflict', { status: 409, fields: { version: '7' } }));
    expect(await useEditor.getState().saveDraft()).toBe(false);
    spy.mockRestore();
    expect(useEditor.getState().save).toMatchObject({ state: 'error', fieldError: 'version_conflict' });
    expect(useEditor.getState().dirty).toBe(true);
    expect(types()).toContain('text');
  });

  it('conserve la copie de travail et expose l’erreur quand l’enregistrement échoue', async () => {
    useEditor.getState().addBlock('text');
    const spy = vi.spyOn(api.page, 'saveDraft').mockRejectedValueOnce(new ApiError('network', 'network'));
    const ok = await useEditor.getState().saveDraft();
    spy.mockRestore();
    expect(ok).toBe(false);
    expect(useEditor.getState().save.state).toBe('error');
    expect(useEditor.getState().dirty).toBe(true);
    expect(types()).toContain('text');
  });
});

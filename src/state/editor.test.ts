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

beforeEach(() => {
  useEditor.getState().reset();
  useSession.setState({ status: 'anonymous', session: null });
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

  it('refuse un second bloc unique (QR) et la suppression du profil', () => {
    expect(useEditor.getState().addBlock('qr').ok).toBe(true);
    const again = useEditor.getState().addBlock('qr');
    expect(again).toEqual({ ok: false, reason: 'singleton' });
    const profile = useEditor.getState().doc!.blocks.find((b) => b.type === 'profile')!;
    useEditor.getState().removeBlock(profile.id);
    expect(types()).toContain('profile');
  });

  it('respecte la limite de blocs fournie par la session (autorité serveur)', () => {
    useSession.setState({ status: 'authenticated', session: { user: {} as never, permissions: [], entitlements: { maxBlocks: types().length, removeBranding: false, analyticsDays: 7, teamSeats: 1 }, expiresAt: '' } });
    expect(useEditor.getState().addBlock('text')).toEqual({ ok: false, reason: 'plan_limit' });
  });

  it('duplique, déplace et masque', () => {
    const doc = useEditor.getState().doc!;
    const svc = doc.blocks.find((b) => b.type === 'service')!;
    const copyId = useEditor.getState().duplicateBlock(svc.id)!;
    expect(copyId).not.toBe(svc.id);
    const idx = types().indexOf('service');
    expect(types()[idx + 1]).toBe('service');
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

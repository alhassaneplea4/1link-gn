/**
 * Store de l'éditeur de page (contenu + apparence), partagé par « Ma page », « Contenu » et « Apparence ».
 *
 * Stratégie de brouillon :
 *  - `doc` = copie de travail ; `saved` = dernière version confirmée par l'API ;
 *  - toute modification pousse un instantané dans `past` (les saisies rapides d'un même champ sont fusionnées) ;
 *  - `dirty` indique des changements non enregistrés (garde de navigation + beforeunload) ;
 *  - un échec d'enregistrement conserve la copie de travail et expose l'erreur ; rien n'est « marqué comme enregistré » sans confirmation.
 */
import { create } from 'zustand';
import { api } from '@/services/api';
import { isApiError } from '@/models/api';
import type { AnyBlock, BlockDataMap, BlockType } from '@/models/blocks';
import type { PageDocument } from '@/models/page';
import type { AppearanceConfig, ThemeId } from '@/models/appearance';
import { createBlock, getBlockDefinition } from '@/features/page-engine/blocks/registry';
import { getThemePreset, mergeAppearance } from '@/features/page-engine/appearance/themes';
import { createInitialDocument } from '@/features/page-engine/document';
import { move as moveItem, uid } from '@/utilities/misc';
import { registerReset } from './lifecycle';
import { useSession } from './session';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export type AddBlockResult = { ok: true; id: string } | { ok: false; reason: 'singleton' | 'plan_limit' | 'not_ready' };
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const MAX_HISTORY = 60;
const COALESCE_MS = 900;

interface EditorState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadError: string | null;
  doc: PageDocument | null;
  saved: PageDocument | null;
  past: PageDocument[];
  future: PageDocument[];
  dirty: boolean;
  editSeq: number;
  lastKey: string | null;
  lastAt: number;
  selectedId: string | null;
  save: { state: SaveState; error: string | null; fieldError: string | null; at: number | null };

  load(opts?: { force?: boolean }): Promise<void>;
  bootstrap(init: { username: string; category: PageDocument['category']; displayName: string }): void;
  addBlock(type: BlockType, index?: number): AddBlockResult;
  updateBlock<K extends BlockType>(id: string, type: K, data: Partial<BlockDataMap[K]>): void;
  replaceBlockData(id: string, data: unknown): void;
  removeBlock(id: string): void;
  duplicateBlock(id: string): string | null;
  moveBlock(from: number, to: number): void;
  toggleVisible(id: string): void;
  select(id: string | null): void;
  setMeta(patch: Partial<Pick<PageDocument, 'username' | 'share'>>): void;
  patchAppearance(patch: DeepPartial<AppearanceConfig>, key?: string): void;
  applyTheme(id: ThemeId): void;
  resetAppearance(): void;
  undo(): void;
  redo(): void;
  saveDraft(): Promise<boolean>;
  publish(): Promise<{ ok: boolean; mode?: 'demo' | 'live'; error?: string }>;
  unpublish(): Promise<boolean>;
  reset(): void;
}

const initial = {
  status: 'idle' as const, loadError: null, doc: null, saved: null, past: [], future: [], dirty: false, editSeq: 0,
  lastKey: null, lastAt: 0, selectedId: null, save: { state: 'idle' as SaveState, error: null, fieldError: null, at: null },
};

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const useEditor = create<EditorState>((set, get) => {
  /** Applique une modification en alimentant l'historique. */
  const commit = (next: PageDocument, key?: string) => {
    const s = get();
    if (!s.doc) return;
    const now = Date.now();
    const coalesce = key && key === s.lastKey && now - s.lastAt < COALESCE_MS && s.past.length > 0;
    set({
      doc: next,
      past: coalesce ? s.past : [...s.past, s.doc].slice(-MAX_HISTORY),
      future: [],
      dirty: true,
      editSeq: s.editSeq + 1,
      lastKey: key ?? null,
      lastAt: now,
      save: s.save.state === 'saved' ? { ...s.save, state: 'idle' } : s.save,
    });
  };

  const withBlocks = (blocks: AnyBlock[], key?: string) => {
    const d = get().doc;
    if (d) commit({ ...d, blocks }, key);
  };

  return {
    ...initial,

    async load({ force } = {}) {
      if (!force && (get().status === 'ready' || get().status === 'loading')) return;
      set({ status: 'loading', loadError: null });
      try {
        const doc = await api.page.getMyPage();
        set({ status: 'ready', doc, saved: doc, past: [], future: [], dirty: false, selectedId: null });
      } catch (e) {
        set({ status: 'error', loadError: isApiError(e) ? e.code : 'unknown' });
      }
    },

    bootstrap(init) {
      const doc = createInitialDocument(init);
      set({ ...initial, status: 'ready', doc, saved: null, dirty: true });
    },

    addBlock(type, index) {
      const { doc } = get();
      if (!doc) return { ok: false, reason: 'not_ready' };
      const def = getBlockDefinition(type);
      if (def.singleton && doc.blocks.some((b) => b.type === type)) return { ok: false, reason: 'singleton' };
      const limit = useSession.getState().session?.entitlements.maxBlocks;
      if (limit !== undefined && doc.blocks.length >= limit) return { ok: false, reason: 'plan_limit' };
      const block = createBlock(type, { category: doc.category }) as AnyBlock;
      const blocks = [...doc.blocks];
      blocks.splice(index ?? blocks.length, 0, block);
      withBlocks(blocks);
      set({ selectedId: block.id });
      return { ok: true, id: block.id };
    },

    updateBlock(id, _type, data) {
      const { doc } = get();
      if (!doc) return;
      withBlocks(doc.blocks.map((b) => (b.id === id ? ({ ...b, data: { ...b.data, ...data }, updatedAt: new Date().toISOString() } as AnyBlock) : b)), `block:${id}:${Object.keys(data).join(',')}`);
    },

    replaceBlockData(id, data) {
      const { doc } = get();
      if (!doc) return;
      withBlocks(doc.blocks.map((b) => (b.id === id ? ({ ...b, data, updatedAt: new Date().toISOString() } as AnyBlock) : b)), `block:${id}`);
    },

    removeBlock(id) {
      const { doc } = get();
      const target = doc?.blocks.find((b) => b.id === id);
      if (!doc || !target || getBlockDefinition(target.type).required) return;
      withBlocks(doc.blocks.filter((b) => b.id !== id));
      if (get().selectedId === id) set({ selectedId: null });
    },

    duplicateBlock(id) {
      const { doc } = get();
      const idx = doc?.blocks.findIndex((b) => b.id === id) ?? -1;
      if (!doc || idx < 0) return null;
      const src = doc.blocks[idx]!;
      if (getBlockDefinition(src.type).singleton) return null;
      const limit = useSession.getState().session?.entitlements.maxBlocks;
      if (limit !== undefined && doc.blocks.length >= limit) return null;
      const copy = { ...structuredClone(src), id: uid('blk'), updatedAt: new Date().toISOString() } as AnyBlock;
      const blocks = [...doc.blocks];
      blocks.splice(idx + 1, 0, copy);
      withBlocks(blocks);
      set({ selectedId: copy.id });
      return copy.id;
    },

    moveBlock(from, to) {
      const { doc } = get();
      if (!doc) return;
      withBlocks(moveItem(doc.blocks, from, to));
    },

    toggleVisible(id) {
      const { doc } = get();
      if (doc) withBlocks(doc.blocks.map((b) => (b.id === id ? { ...b, visible: !b.visible, updatedAt: new Date().toISOString() } : b)));
    },

    select: (id) => set({ selectedId: id }),

    setMeta(patch) {
      const { doc } = get();
      if (doc) commit({ ...doc, ...patch }, `meta:${Object.keys(patch).join(',')}`);
    },

    patchAppearance(patch, key) {
      const { doc } = get();
      if (!doc) return;
      // Toute personnalisation manuelle bascule le thème sur « custom » (sauf changement de thème explicite).
      const themeId = (patch as { themeId?: ThemeId }).themeId ?? 'custom';
      commit({ ...doc, appearance: mergeAppearance(doc.appearance, { ...patch, themeId }) }, key ?? `appearance:${JSON.stringify(Object.keys(patch))}`);
    },

    applyTheme(id) {
      const { doc } = get();
      if (doc) commit({ ...doc, appearance: id === 'custom' ? { ...doc.appearance, themeId: 'custom' } : getThemePreset(id) });
    },

    /** Réinitialise l'apparence UNIQUEMENT : le contenu (blocs, profil, adresse) n'est jamais touché. */
    resetAppearance() {
      const { doc } = get();
      if (doc) commit({ ...doc, appearance: getThemePreset('minimal') });
    },

    undo() {
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev || !s.doc) return;
      set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirty: !sameJson(prev, s.saved), lastKey: null, editSeq: s.editSeq + 1 });
    },

    redo() {
      const s = get();
      const next = s.future[0];
      if (!next || !s.doc) return;
      set({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), dirty: !sameJson(next, s.saved), lastKey: null, editSeq: s.editSeq + 1 });
    },

    async saveDraft() {
      const { doc, editSeq } = get();
      if (!doc) return false;
      set({ save: { state: 'saving', error: null, fieldError: null, at: null } });
      try {
        const result = await api.page.saveDraft(doc);
        const s = get();
        const unchanged = s.editSeq === editSeq;
        set({
          saved: result,
          doc: s.doc ? { ...s.doc, id: result.id, version: result.version, updatedAt: result.updatedAt, status: result.status } : result,
          dirty: !unchanged,
          save: { state: 'saved', error: null, fieldError: null, at: Date.now() },
        });
        return true;
      } catch (e) {
        const err = isApiError(e) ? e : null;
        set({ save: { state: 'error', error: err?.code ?? 'unknown', fieldError: err?.message ?? null, at: null } });
        return false;
      }
    },

    async publish() {
      const { doc } = get();
      if (!doc) return { ok: false, error: 'not_ready' };
      set({ save: { state: 'saving', error: null, fieldError: null, at: null } });
      try {
        const res = await api.page.publish(doc);
        set({ doc: res.page, saved: res.page, dirty: false, save: { state: 'saved', error: null, fieldError: null, at: Date.now() } });
        const { session, setSession } = useSession.getState();
        if (session) setSession({ ...session, user: { ...session.user, onboardingDone: true, username: res.page.username, category: res.page.category } });
        return { ok: true, mode: res.mode };
      } catch (e) {
        const err = isApiError(e) ? e : null;
        set({ save: { state: 'error', error: err?.message ?? err?.code ?? 'unknown', fieldError: null, at: null } });
        return { ok: false, error: err?.message ?? err?.code ?? 'unknown' };
      }
    },

    async unpublish() {
      try {
        const page = await api.page.unpublish();
        set((s) => ({ doc: s.doc ? { ...s.doc, status: page.status, publishedAt: null } : page, saved: page }));
        return true;
      } catch {
        return false;
      }
    },

    reset: () => set({ ...initial }),
  };
});

registerReset(() => useEditor.getState().reset());

const NO_BLOCKS: AnyBlock[] = [];
/** Blocs du brouillon courant (référence stable quand il n'y a pas de document : indispensable avec zustand v5). */
export const useEditorBlocks = () => useEditor((s) => s.doc?.blocks ?? NO_BLOCKS);

export const useIsDirty = () => useEditor((s) => s.dirty);

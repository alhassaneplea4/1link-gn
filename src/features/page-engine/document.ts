import type { AnyBlock } from '@/models/blocks';
import type { CategoryId } from '@/models/category';
import type { PageDocument, SetupState } from '@/models/page';
import { CATEGORY_CONFIG } from '@/features/categories/config';
import { getThemePreset } from './appearance/themes';
import { createBlock, validateBlock } from './blocks/registry';

/** Crée un document neuf pour une catégorie : profil + blocs suggérés + thème de la catégorie. */
export function createInitialDocument(opts: { username: string; category: CategoryId; displayName: string }): PageDocument {
  const cfg = CATEGORY_CONFIG[opts.category];
  const profile = createBlock('profile', { category: opts.category }, 'blk_profile');
  profile.data.displayName = opts.displayName;
  const blocks: AnyBlock[] = [profile, ...cfg.starterBlocks.map((t) => createBlock(t, { category: opts.category }) as AnyBlock)];
  const now = new Date().toISOString();
  return {
    id: '', username: opts.username, category: opts.category, status: 'draft', blocks,
    appearance: getThemePreset(cfg.themeId), share: { title: '', description: '' }, version: 0, updatedAt: now, publishedAt: null,
  };
}

export interface Readiness {
  /** Blocs visibles dont des champs obligatoires manquent. */
  incomplete: { blockId: string; type: AnyBlock['type']; errors: string[] }[];
  ready: boolean;
}

export function pageReadiness(doc: PageDocument): Readiness {
  const incomplete = doc.blocks
    .filter((b) => b.visible)
    .map((b) => ({ blockId: b.id, type: b.type, errors: Object.keys(validateBlock(b)) }))
    .filter((x) => x.errors.length > 0);
  const hasName = doc.blocks.some((b) => b.type === 'profile' && b.data.displayName.trim().length > 0);
  return { incomplete, ready: incomplete.length === 0 && hasName && Boolean(doc.username) };
}

export function setupState(doc: PageDocument | null): SetupState {
  if (!doc) return 'not_started';
  if (doc.status === 'published') return 'published';
  const { ready, incomplete } = pageReadiness(doc);
  if (ready) return 'ready';
  return incomplete.length > 0 ? 'to_complete' : 'in_progress';
}

export type ChecklistId = 'identity' | 'bio' | 'avatar' | 'links' | 'contact' | 'theme' | 'publish';
export interface ChecklistItem { id: ChecklistId; done: boolean }

/** Étapes de configuration calculées à partir du contenu réel (jamais de pourcentage inventé). */
export function setupChecklist(doc: PageDocument): ChecklistItem[] {
  const profile = doc.blocks.find((b) => b.type === 'profile');
  const p = profile?.type === 'profile' ? profile.data : null;
  const count = (types: AnyBlock['type'][]) => doc.blocks.filter((b) => b.visible && types.includes(b.type)).length;
  return [
    { id: 'identity', done: Boolean(p?.displayName.trim()) },
    { id: 'bio', done: Boolean(p?.bio.trim()) },
    { id: 'avatar', done: Boolean(p?.avatarUrl) },
    { id: 'links', done: count(['link', 'social', 'cta']) >= 2 },
    { id: 'contact', done: count(['contact', 'email', 'phone', 'whatsapp', 'location']) >= 1 },
    { id: 'theme', done: doc.appearance.themeId !== 'minimal' },
    { id: 'publish', done: doc.status === 'published' },
  ];
}

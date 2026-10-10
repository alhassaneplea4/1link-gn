import type { AnyBlock } from './blocks';
import type { AppearanceConfig } from './appearance';
import type { CategoryId } from './category';

export type PageStatus = 'draft' | 'published' | 'suspended' | 'unavailable';

export interface PageShare {
  title: string;
  description: string;
}

export interface PageDocument {
  id: string;
  username: string;
  category: CategoryId;
  status: PageStatus;
  blocks: AnyBlock[];
  appearance: AppearanceConfig;
  share: PageShare;
  version: number;
  updatedAt: string;
  publishedAt: string | null;
}

/** Résultat de la résolution d'une page publique : le backend décide de ce qui est exposé. */
export type PublicPageResult =
  | { state: 'published'; page: PageDocument; /** Affiche « Créé avec 1Link » (droit déterminé par le backend). */ branding: boolean }
  | { state: 'draft' | 'suspended' | 'unavailable' | 'not_found' };

export type SetupState = 'not_started' | 'in_progress' | 'to_complete' | 'ready' | 'published';

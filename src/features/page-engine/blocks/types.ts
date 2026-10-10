import type { ComponentType } from 'react';
import type { IconName } from '@/components/ui/Icon';
import type { Block, BlockDataMap, BlockType } from '@/models/blocks';
import type { CategoryId } from '@/models/category';
import type { FieldDef } from './schema';

export interface RenderContext {
  username: string;
  /** URL publique complète de la page (utilisée par le QR code). */
  pageUrl: string;
  /** Aperçu dans l'éditeur : les clics ne suivent pas les liens et ne sont pas comptabilisés. */
  preview: boolean;
  /** Mode économe en données : images différées (affichées au clic), effets visuels coûteux désactivés. */
  lite?: boolean;
  onTrack?: (blockId: string) => void;
}

export interface BlockRenderProps<K extends BlockType = BlockType> {
  block: Block<K>;
  ctx: RenderContext;
}

export type BlockGroup = 'identity' | 'links' | 'content' | 'contact' | 'layout';

export interface CreateContext {
  category: CategoryId;
}

export interface BlockDefinition<K extends BlockType = BlockType> {
  type: K;
  group: BlockGroup;
  icon: IconName;
  /** Un seul exemplaire par page (profil). */
  singleton?: boolean;
  /** Le bloc ne peut pas être supprimé (profil). */
  required?: boolean;
  fields: readonly FieldDef[];
  create(ctx: CreateContext): BlockDataMap[K];
  /** Texte court affiché dans la liste de l'éditeur. */
  summary(data: BlockDataMap[K]): string;
  Render: ComponentType<BlockRenderProps<K>>;
}

export type BlockRegistry = { [K in BlockType]: BlockDefinition<K> };

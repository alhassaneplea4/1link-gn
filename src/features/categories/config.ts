/**
 * Configuration des cinq catégories d'utilisateurs.
 * Une catégorie pilote : les blocs suggérés, le thème initial, les champs d'« Activité » de
 * l'onboarding, les raccourcis du dashboard et les recommandations. Ajouter une catégorie =
 * ajouter son id dans models/category.ts + une entrée ici + ses libellés.
 */
import type { IconName } from '@/components/ui/Icon';
import type { BlockType } from '@/models/blocks';
import type { CategoryId } from '@/models/category';
import type { ThemeId } from '@/models/appearance';
import type { FieldDef } from '@/features/page-engine/blocks/schema';
import { paths } from '@/app/configuration/paths';

export type FocusId =
  | 'presentation' | 'links' | 'socials' | 'contacts' | 'appearance' | 'share'
  | 'contents' | 'portfolio' | 'distribution' | 'collabs' | 'audience'
  | 'skills' | 'services' | 'experience' | 'certifications' | 'appointments'
  | 'brand' | 'team' | 'location' | 'multiuser'
  | 'mission' | 'projects' | 'activities' | 'events';

export type FocusAction =
  | { type: 'add-block'; block: BlockType }
  | { type: 'goto'; to: string }
  | { type: 'share' }
  /** Fonctionnalité annoncée mais non disponible. */
  | { type: 'soon' };

export interface FocusItem {
  id: FocusId;
  icon: IconName;
  action: FocusAction;
}

export type ActivityFieldName = 'headline' | 'bio' | 'location' | 'phone' | 'email' | 'sector';

export interface CategoryConfig {
  id: CategoryId;
  icon: IconName;
  /** Thème initial proposé. */
  themeId: ThemeId;
  /** Blocs ajoutés par défaut à la création de la page (hors profil). */
  starterBlocks: BlockType[];
  /** Type de bloc proposé à l'étape « Services ou contenus ». */
  contentBlock: BlockType;
  /** Champs de l'étape « Activité ». Les libellés sont lus dans onboarding.activity.<category>.<name>. */
  activityFields: readonly (FieldDef & { name: ActivityFieldName })[];
  /** Raccourcis mis en avant dans le dashboard. */
  focus: readonly FocusItem[];
  /** Clés de recommandations (dashboard.recommendations.*). */
  recommendations: readonly ('addBio' | 'addLinks' | 'addServices' | 'addPortfolio' | 'addLocation' | 'shareQr' | 'tryTheme' | 'addContact' | 'addVideo' | 'addEvents')[];
  /** Les statistiques d'audience d'autres plateformes ne sont PAS disponibles sans intégration. */
  externalAudienceStats: boolean;
}

const t = (name: ActivityFieldName, max?: number, required = false): FieldDef & { name: ActivityFieldName } => ({ kind: 'text', name, max, required });
const a = (name: ActivityFieldName, max?: number): FieldDef & { name: ActivityFieldName } => ({ kind: 'textarea', name, max });

export const CATEGORY_CONFIG: Record<CategoryId, CategoryConfig> = {
  individual: {
    id: 'individual', icon: 'user', themeId: 'minimal',
    starterBlocks: ['social', 'link'], contentBlock: 'link',
    activityFields: [t('headline', 90), a('bio', 320), t('location', 60)],
    focus: [
      { id: 'presentation', icon: 'user', action: { type: 'goto', to: paths.dashboard.page } },
      { id: 'links', icon: 'link', action: { type: 'add-block', block: 'link' } },
      { id: 'socials', icon: 'share', action: { type: 'add-block', block: 'social' } },
      { id: 'contacts', icon: 'phone', action: { type: 'add-block', block: 'contact' } },
      { id: 'appearance', icon: 'palette', action: { type: 'goto', to: paths.dashboard.appearance } },
      { id: 'share', icon: 'send', action: { type: 'share' } },
    ],
    recommendations: ['addBio', 'addLinks', 'tryTheme', 'shareQr'],
    externalAudienceStats: false,
  },
  creator: {
    id: 'creator', icon: 'camera', themeId: 'creator',
    starterBlocks: ['social', 'link', 'video', 'cta'], contentBlock: 'portfolio',
    activityFields: [t('headline', 90, true), a('bio', 320), t('location', 60), { kind: 'email', name: 'email' }],
    focus: [
      { id: 'socials', icon: 'share', action: { type: 'add-block', block: 'social' } },
      { id: 'contents', icon: 'video', action: { type: 'add-block', block: 'video' } },
      { id: 'portfolio', icon: 'image', action: { type: 'add-block', block: 'portfolio' } },
      { id: 'distribution', icon: 'megaphone', action: { type: 'add-block', block: 'link' } },
      { id: 'collabs', icon: 'mail', action: { type: 'add-block', block: 'email' } },
      { id: 'audience', icon: 'chart', action: { type: 'goto', to: paths.dashboard.analytics } },
    ],
    recommendations: ['addVideo', 'addPortfolio', 'addContact', 'tryTheme'],
    externalAudienceStats: false,
  },
  professional: {
    id: 'professional', icon: 'briefcase', themeId: 'professional',
    starterBlocks: ['service', 'social', 'contact'], contentBlock: 'service',
    activityFields: [t('headline', 90, true), a('bio', 320), t('location', 60), { kind: 'email', name: 'email' }, { kind: 'tel', name: 'phone' }],
    focus: [
      { id: 'presentation', icon: 'user', action: { type: 'goto', to: paths.dashboard.page } },
      { id: 'skills', icon: 'zap', action: { type: 'add-block', block: 'text' } },
      { id: 'services', icon: 'briefcase', action: { type: 'add-block', block: 'service' } },
      { id: 'portfolio', icon: 'layers', action: { type: 'add-block', block: 'portfolio' } },
      { id: 'experience', icon: 'history', action: { type: 'add-block', block: 'text' } },
      { id: 'certifications', icon: 'award', action: { type: 'add-block', block: 'text' } },
      { id: 'contacts', icon: 'phone', action: { type: 'add-block', block: 'contact' } },
      { id: 'appointments', icon: 'calendar', action: { type: 'soon' } },
    ],
    recommendations: ['addServices', 'addPortfolio', 'addContact', 'addBio'],
    externalAudienceStats: false,
  },
  business: {
    id: 'business', icon: 'building', themeId: 'business',
    starterBlocks: ['service', 'location', 'contact', 'social'], contentBlock: 'service',
    activityFields: [t('headline', 90, true), a('bio', 320), t('sector', 60), t('location', 60), { kind: 'tel', name: 'phone' }, { kind: 'email', name: 'email' }],
    focus: [
      { id: 'brand', icon: 'palette', action: { type: 'goto', to: paths.dashboard.appearance } },
      { id: 'presentation', icon: 'building', action: { type: 'goto', to: paths.dashboard.page } },
      { id: 'services', icon: 'briefcase', action: { type: 'add-block', block: 'service' } },
      { id: 'team', icon: 'users', action: { type: 'add-block', block: 'portfolio' } },
      { id: 'contacts', icon: 'phone', action: { type: 'add-block', block: 'contact' } },
      { id: 'location', icon: 'pin', action: { type: 'add-block', block: 'location' } },
      { id: 'audience', icon: 'chart', action: { type: 'goto', to: paths.dashboard.analytics } },
      { id: 'multiuser', icon: 'user-cog', action: { type: 'soon' } },
    ],
    recommendations: ['addLocation', 'addServices', 'addContact', 'shareQr'],
    externalAudienceStats: false,
  },
  organization: {
    id: 'organization', icon: 'hand-heart', themeId: 'soft',
    starterBlocks: ['text', 'portfolio', 'contact', 'social'], contentBlock: 'portfolio',
    activityFields: [t('headline', 90, true), a('bio', 320), t('location', 60), { kind: 'email', name: 'email' }],
    focus: [
      { id: 'mission', icon: 'target', action: { type: 'add-block', block: 'text' } },
      { id: 'presentation', icon: 'building', action: { type: 'goto', to: paths.dashboard.page } },
      { id: 'projects', icon: 'layers', action: { type: 'add-block', block: 'portfolio' } },
      { id: 'activities', icon: 'activity', action: { type: 'add-block', block: 'service' } },
      { id: 'events', icon: 'calendar', action: { type: 'add-block', block: 'text' } },
      { id: 'team', icon: 'users', action: { type: 'add-block', block: 'portfolio' } },
      { id: 'contacts', icon: 'mail', action: { type: 'add-block', block: 'contact' } },
    ],
    recommendations: ['addEvents', 'addPortfolio', 'addContact', 'addLocation'],
    externalAudienceStats: false,
  },
};

export const getCategory = (id: CategoryId | null | undefined): CategoryConfig => CATEGORY_CONFIG[id ?? 'individual'];

import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '@/models/category';
import { composeDocument } from './compose';
import { validateStep } from './validate';
import { isBlockComplete } from '@/features/page-engine/blocks/registry';
import { CATEGORY_CONFIG } from '@/features/categories/config';
import type { OnboardingData } from './store';

const base = (over: Partial<OnboardingData> = {}): OnboardingData => ({
  category: 'professional',
  identity: { displayName: 'Mamadou Keita', username: 'mamadou-k', avatarUrl: '' },
  activity: { headline: 'Développeur', bio: 'Bio', location: 'Conakry', email: 'a@b.co', phone: '+224 600 00 00 00' },
  socials: [{ platform: 'instagram', url: 'https://instagram.com/x' }, { platform: 'tiktok', url: '' }],
  links: [{ title: 'Portfolio', url: 'https://exemple.com' }, { title: '', url: '' }],
  items: [{ name: 'Site vitrine', description: 'Rapide', price: 'Sur devis', imageUrl: '' }, { name: '', description: '', price: '', imageUrl: '' }],
  about: '',
  themeId: null,
  primaryColor: null,
  ...over,
});

describe('validation des étapes d’onboarding', () => {
  it('exige une catégorie', () => {
    expect(validateStep('category', base({ category: null })).category).toBeDefined();
    expect(validateStep('category', base())).toEqual({});
  });
  it('contrôle identité et pseudonyme (formats et réservés)', () => {
    expect(validateStep('identity', base({ identity: { displayName: '', username: 'ab', avatarUrl: '' } }))).toMatchObject({ displayName: expect.any(String), username: expect.any(String) });
    expect(validateStep('identity', base({ identity: { displayName: 'X', username: 'admin', avatarUrl: '' } })).username).toBe('common.validation.usernameReserved');
    expect(validateStep('identity', base())).toEqual({});
  });
  it('ne demande que les champs pertinents à la catégorie', () => {
    const none = { headline: '', bio: '', location: '' };
    expect(validateStep('activity', base({ category: 'individual', activity: none }))).toEqual({});
    expect(validateStep('activity', base({ category: 'creator', activity: none })).headline).toBe('common.validation.required');
  });
  it('valide les liens ligne par ligne et ignore les lignes vides', () => {
    expect(validateStep('links', base())).toEqual({});
    const errs = validateStep('links', base({ links: [{ title: 'X', url: 'pas-une-url' }, { title: '', url: 'https://ok.com' }] }));
    expect(errs['links.0.url']).toBe('common.validation.url');
    expect(errs['links.1.title']).toBe('common.validation.required');
  });
});

describe('composition du document', () => {
  it('produit des blocs complets, sans lignes vides, avec le thème de la catégorie', () => {
    const doc = composeDocument(base(), 'Fallback');
    expect(doc.blocks[0]!.type).toBe('profile');
    expect(doc.blocks.every((b) => isBlockComplete(b))).toBe(true);
    expect(doc.blocks.filter((b) => b.type === 'link')).toHaveLength(1);
    expect(doc.blocks.find((b) => b.type === 'service')).toBeDefined();
    expect(doc.blocks.find((b) => b.type === 'contact')).toBeDefined();
    expect(doc.appearance.themeId).toBe(CATEGORY_CONFIG.professional.themeId);
    expect(doc.status).toBe('draft');
  });
  it.each(CATEGORY_IDS)('compose une page valide pour « %s »', (category) => {
    const doc = composeDocument(base({ category }), 'Nom');
    expect(doc.category).toBe(category);
    expect(doc.blocks.every((b) => isBlockComplete(b))).toBe(true);
  });
  it('applique la couleur principale choisie en thème personnalisé', () => {
    const doc = composeDocument(base({ primaryColor: '#db2777' }), 'Nom');
    expect(doc.appearance.colors.primary).toBe('#db2777');
    expect(doc.appearance.themeId).toBe('custom');
  });
});

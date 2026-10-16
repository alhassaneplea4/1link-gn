import { describe, expect, it } from 'vitest';
import { composeDocument, usernameCandidates } from './compose';
import { validateStep } from './validate';
import { restoreOnboarding, snapshotOnboarding, STEPS, useOnboarding, type OnboardingData } from './store';
import { isBlockComplete } from '@/features/page-engine/blocks/registry';

const base = (over: Partial<OnboardingData> = {}): OnboardingData => ({
  category: 'professional',
  identity: { displayName: 'Mamadou Keita', avatarUrl: 'https://exemple.com/a.png', coverUrl: 'https://exemple.com/c.png' },
  activity: { headline: 'Développeur', sector: 'Informatique' },
  ...over,
});

describe('assistant en deux étapes', () => {
  it('ne comporte que le type de compte puis le profil', () => {
    expect([...STEPS]).toEqual(['category', 'profile']);
  });

  it('exige un type de compte, puis un nom complet', () => {
    expect(validateStep('category', base({ category: null }))).toEqual({ category: 'common.validation.required' });
    expect(validateStep('category', base())).toEqual({});
    expect(validateStep('profile', base({ identity: { displayName: '  ', avatarUrl: '' } }))).toEqual({ displayName: 'common.validation.required' });
    expect(validateStep('profile', base())).toEqual({});
    expect(validateStep('profile', base({ activity: { headline: 'x'.repeat(91), sector: 'y'.repeat(61) } }))).toEqual({ headline: 'common.validation.tooLong', sector: 'common.validation.tooLong' });
  });
});

describe('composition du document', () => {
  it('produit une page avec son seul profil : photo, couverture, nom, titre et secteur', () => {
    const doc = composeDocument(base(), 'Fallback', 'mamadou-keita');
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toMatchObject({ type: 'profile', data: { displayName: 'Mamadou Keita', headline: 'Développeur', sector: 'Informatique', avatarUrl: 'https://exemple.com/a.png', coverUrl: 'https://exemple.com/c.png' } });
    expect(doc.blocks.every((b) => isBlockComplete(b))).toBe(true);
    expect(doc).toMatchObject({ username: 'mamadou-keita', category: 'professional', status: 'draft' });
    expect(doc.appearance.themeId).toBe('minimal'); // thème de base : autorisé par toutes les offres
  });

  it('reprend le nom du compte si le nom saisi est vide', () => {
    expect(composeDocument(base({ identity: { displayName: '', avatarUrl: '' } }), 'Awa Diallo').blocks[0]).toMatchObject({ data: { displayName: 'Awa Diallo' } });
  });

  it('propose des adresses dérivées du nom, toujours valides', () => {
    const c = usernameCandidates('Aïssatou  Diallo !', () => 0.5);
    expect(c[0]).toBe('aissatou-diallo');
    expect(c[1]).toBe('aissatou-diallo-2');
    expect(c.every((x) => /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/.test(x))).toBe(true);
    expect(usernameCandidates('é')[0]!.length).toBeGreaterThanOrEqual(3);
  });
});

describe('reprise du brouillon de l’assistant', () => {
  it('réinjecte un brouillon valide et ignore un ancien format ou des données corrompues', () => {
    useOnboarding.getState().reset();
    restoreOnboarding({ category: 'creator', identity: { displayName: 'Awa', avatarUrl: '', coverUrl: '', username: 'ancien' }, activity: { headline: 'Chef', bio: 'ancien champ' }, links: [{ title: 'x' }], step: 1, visited: 1 });
    expect(snapshotOnboarding(useOnboarding.getState())).toEqual({ category: 'creator', identity: { displayName: 'Awa', avatarUrl: '', coverUrl: '' }, activity: { headline: 'Chef' }, step: 1, visited: 1 });
    useOnboarding.getState().reset();
    restoreOnboarding({ category: 'inconnue', identity: 42, activity: null, step: 99, visited: -3 });
    expect(useOnboarding.getState()).toMatchObject({ category: null, step: 1, visited: 0 });
    useOnboarding.getState().reset();
  });
});

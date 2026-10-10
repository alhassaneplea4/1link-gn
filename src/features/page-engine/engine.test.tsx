import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BLOCK_TYPES } from '@/models/blocks';
import { hasMessage } from '@/i18n/core';
import { blockRegistry, createBlock, isBlockComplete, validateBlock } from './blocks/registry';
import { safeHref, parseVideo, mapsHref, whatsappHref } from './blocks/urls';
import { appearanceToStyle } from './appearance/css';
import { THEME_PRESETS, getThemePreset, themeOrder } from './appearance/themes';
import { contrastRatio } from '@/utilities/color';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import { CATEGORY_IDS } from '@/models/category';
import { pageReadiness, setupChecklist, setupState } from './document';

describe('registre de blocs', () => {
  it('enregistre chaque type de bloc avec rendu et schéma', () => {
    for (const type of BLOCK_TYPES) {
      const def = blockRegistry[type];
      expect(def.type).toBe(type);
      expect(def.Render).toBeTypeOf('function');
      expect(Array.isArray(def.fields)).toBe(true);
    }
  });

  it('traduit chaque bloc, chaque champ et chaque option de sélection (fr)', () => {
    const missing: string[] = [];
    const checkFields = (type: string, fields: readonly { kind: string; name: string; options?: readonly string[]; itemFields?: readonly never[] }[]) => {
      for (const f of fields) {
        if (!hasMessage(`editor.blocks.${type}.fields.${f.name}`)) missing.push(`${type}.fields.${f.name}`);
        if (f.kind === 'select') f.options?.forEach((o) => { if (!hasMessage(`editor.options.${f.name}.${o}`)) missing.push(`options.${f.name}.${o}`); });
        if (f.kind === 'list' && 'itemFields' in f) checkFields(type, f.itemFields as never);
      }
    };
    for (const type of BLOCK_TYPES) {
      if (!hasMessage(`editor.blocks.${type}.label`)) missing.push(`${type}.label`);
      if (!hasMessage(`editor.blocks.${type}.description`)) missing.push(`${type}.description`);
      checkFields(type, blockRegistry[type].fields as never);
    }
    expect(missing).toEqual([]);
  });

  it('crée des blocs vides signalés « à compléter » quand des champs sont obligatoires', () => {
    const link = createBlock('link', { category: 'individual' });
    expect(isBlockComplete(link)).toBe(false);
    expect(validateBlock(link).title).toBe('common.validation.required');
    link.data.title = 'Mon site';
    link.data.url = 'https://exemple.com';
    expect(isBlockComplete(link)).toBe(true);
    link.data.url = 'javascript:alert(1)';
    expect(validateBlock(link).url).toBe('common.validation.url');
  });

  it('valide les éléments de liste par chemin', () => {
    const social = createBlock('social', { category: 'creator' });
    expect(validateBlock(social)['items.0.url']).toBe('common.validation.required');
  });
});

describe('sécurité des liens', () => {
  it('refuse les protocoles dangereux', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html;base64,AAA')).toBeUndefined();
    expect(safeHref('https://exemple.com')).toBe('https://exemple.com/');
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co');
  });
  it('construit des liens de contact', () => {
    expect(whatsappHref('+224 600 00 00 00', 'Bonjour')).toBe('https://wa.me/224600000000?text=Bonjour');
    expect(mapsHref('Kaloum, Conakry')).toContain('Kaloum%2C%20Conakry');
    expect(parseVideo('https://youtu.be/abc123')).toEqual({ provider: 'youtube', id: 'abc123' });
    expect(parseVideo('https://exemple.com/video')).toBeNull();
  });
});

describe('apparence', () => {
  it('produit les variables CSS de la page', () => {
    const style = appearanceToStyle(getThemePreset('modern')) as Record<string, string>;
    expect(style['--pg-primary']).toBe('#2563eb');
    expect(style['--pg-on-primary']).toMatch(/^#/);
    expect(style['--pg-btn-radius']).toBe('20px');
  });
  it('garantit un contraste de texte suffisant dans chaque thème prédéfini', () => {
    for (const id of themeOrder) {
      const a = THEME_PRESETS[id];
      if (a.background.type === 'solid' || a.background.type === 'pattern') {
        expect(contrastRatio(a.colors.text, a.colors.background), `${id} texte/fond`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('gère le rayon libre', () => {
    const a = getThemePreset('creative');
    expect((appearanceToStyle(a) as Record<string, string>)['--pg-radius']).toBe('22px');
  });
});

describe('PageRenderer', () => {
  it.each(CATEGORY_IDS)('rend la page exemple « %s » avec son nom', (category) => {
    const doc = getSampleDocument(category);
    render(<PageRenderer page={doc} pageUrl="https://1link.gn/x" />);
    const profile = doc.blocks.find((b) => b.type === 'profile');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(profile?.type === 'profile' ? profile.data.displayName : '');
  });

  it('masque les blocs cachés et incomplets sur la page publique, mais matérialise les incomplets en aperçu', () => {
    const doc = getSampleDocument('individual');
    const incomplete = createBlock('link', { category: 'individual' });
    const hidden = { ...createBlock('text', { category: 'individual' }), visible: false };
    const page = { ...doc, blocks: [...doc.blocks, incomplete, hidden] };
    const { rerender, container } = render(<PageRenderer page={page} pageUrl="https://1link.gn/x" />);
    expect(container.querySelectorAll('.pg-placeholder')).toHaveLength(0);
    rerender(<PageRenderer page={page} pageUrl="https://1link.gn/x" preview />);
    expect(container.querySelectorAll('.pg-placeholder')).toHaveLength(1);
  });

  it('ouvre les liens externes en toute sécurité et neutralise les liens en aperçu', () => {
    const doc = getSampleDocument('professional');
    const { rerender } = render(<PageRenderer page={doc} pageUrl="https://1link.gn/x" />);
    const link = screen.getByRole('link', { name: /Voir mes réalisations/ });
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAttribute('target', '_blank');
    rerender(<PageRenderer page={doc} pageUrl="https://1link.gn/x" preview />);
    expect(screen.getByRole('link', { name: /Voir mes réalisations/ })).not.toHaveAttribute('href');
  });
});

describe('état de configuration', () => {
  it('calcule l’état et la progression à partir du contenu réel', () => {
    const doc = getSampleDocument('creator');
    expect(setupState({ ...doc, status: 'published' })).toBe('published');
    expect(setupState(null)).toBe('not_started');
    const draft = { ...doc, status: 'draft' as const };
    expect(['ready', 'to_complete', 'in_progress']).toContain(setupState(draft));
    expect(setupChecklist(draft).find((c) => c.id === 'publish')?.done).toBe(false);
    expect(pageReadiness({ ...draft, username: '' }).ready).toBe(false);
  });
});

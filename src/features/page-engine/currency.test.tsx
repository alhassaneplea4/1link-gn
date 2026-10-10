import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatAltPrice, parseRate } from './blocks/money';
import { createBlock, isBlockComplete, validateBlock } from './blocks/registry';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import type { ShopData } from '@/models/blocks';

const shop = (over: Partial<ShopData> = {}) => {
  const b = createBlock('shop', { category: 'business' });
  b.data = { title: '', phone: '+224 600 00 00 00', currency: 'GNF', altCurrency: 'EUR', altRate: '10000', note: '', items: [{ name: 'Sac', description: '', price: '250000', imageUrl: '' }, { name: 'Sur demande', description: '', price: '', imageUrl: '' }], ...over };
  return b;
};

describe('prix multi-devises (taux du vendeur)', () => {
  it('lit le taux et calcule l’équivalent', () => {
    expect(parseRate('10 000')).toBe(10000);
    expect(parseRate('0')).toBeNull();
    expect(parseRate('abc')).toBeNull();
    expect(formatAltPrice('250000', '10000', 'EUR')).toMatch(/25/);
    expect(formatAltPrice('250000', '10000', 'EUR')).toContain('€');
    expect(formatAltPrice('', '10000', 'EUR')).toBeNull();
    expect(formatAltPrice('250000', '', 'EUR')).toBeNull();
  });

  it('exige un taux valide et une devise différente quand l’équivalent est activé', () => {
    expect(isBlockComplete(shop())).toBe(true);
    expect(isBlockComplete(shop({ altCurrency: 'none', altRate: '' }))).toBe(true);
    expect(validateBlock(shop({ altRate: '' })).altRate).toBe('common.validation.rate');
    expect(validateBlock(shop({ altRate: '-3' })).altRate).toBe('common.validation.rate');
    expect(validateBlock(shop({ altCurrency: 'GNF' })).altCurrency).toBe('common.validation.sameCurrency');
    // blocs enregistrés avant l'ajout du champ : aucune erreur
    const legacy = shop();
    delete (legacy.data as Partial<ShopData>).altCurrency;
    delete (legacy.data as Partial<ShopData>).altRate;
    expect(isBlockComplete(legacy)).toBe(true);
  });

  it('affiche l’équivalent seulement pour les produits avec prix, et précise que le taux est celui du vendeur', () => {
    const doc = getSampleDocument('business');
    render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, shop()] }} pageUrl="https://1link.gn/x" />);
    expect(screen.getAllByText(/^≈/)).toHaveLength(1);
    expect(screen.getByText(/au taux fixé par le vendeur/)).toBeInTheDocument();
    expect(screen.getByText(/1 EUR = /)).toBeInTheDocument();
  });

  it('n’affiche rien sans devise d’équivalence', () => {
    const doc = getSampleDocument('business');
    render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, shop({ altCurrency: 'none' })] }} pageUrl="https://1link.gn/x" />);
    expect(screen.queryByText(/^≈/)).not.toBeInTheDocument();
    expect(screen.queryByText(/au taux fixé/)).not.toBeInTheDocument();
  });
});

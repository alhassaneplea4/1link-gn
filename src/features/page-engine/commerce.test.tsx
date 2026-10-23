import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatPrice, parsePrice } from './blocks/money';
import { createBlock, isBlockComplete, validateBlock } from './blocks/registry';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import type { PaymentData, ShopData } from '@/models/blocks';

describe('prix', () => {
  it('lit les saisies usuelles et refuse le reste', () => {
    expect(parsePrice('150000')).toBe(150000);
    expect(parsePrice('150 000')).toBe(150000);
    expect(parsePrice('150 000')).toBe(150000);
    expect(parsePrice('12,5')).toBe(12.5);
    expect(parsePrice('1,500,000')).toBe(1500000);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('gratuit')).toBeNull();
    expect(parsePrice('-5')).toBeNull();
  });
  it('formate dans la devise du vendeur ou signale « sur demande »', () => {
    expect(formatPrice('150000', 'GNF')).toContain('150');
    expect(formatPrice('150000', 'GNF')).toContain('GNF');
    expect(formatPrice('', 'GNF')).toBeNull();
  });
});

const shop = (over: Partial<ShopData> = {}) => ({
  ...createBlock('shop', { category: 'business' }),
  data: { title: 'Nos produits', phone: '+224 600 00 00 00', currency: 'GNF', note: 'Livraison à Conakry', items: [{ name: 'Sac en cuir', description: 'Fait main', price: '250000', imageUrl: '' }, { name: 'Sur mesure', description: '', price: '', imageUrl: '' }], ...over } as ShopData,
}) as ReturnType<typeof createBlock<'shop'>>;

describe('boutique (commande WhatsApp)', () => {
  it('valide : numéro et nom de produit obligatoires, prix numérique', () => {
    const b = createBlock('shop', { category: 'business' });
    expect(isBlockComplete(b)).toBe(false);
    const errors = validateBlock(b);
    expect(errors.phone).toBe('common.validation.required');
    expect(errors['items.0.name']).toBe('common.validation.required');
    expect(validateBlock(shop({ items: [{ name: 'X', description: '', price: 'abc', imageUrl: '' }] }))['items.0.price']).toBe('common.validation.number');
    expect(isBlockComplete(shop())).toBe(true);
  });

  it('crée un lien WhatsApp pré-rempli avec le produit et le prix, et ne traite aucun paiement', () => {
    const doc = getSampleDocument('business');
    render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, shop()] }} pageUrl="https://1link.gn/x" />);
    const buttons = screen.getAllByRole('link', { name: /Commander sur WhatsApp/ });
    expect(buttons).toHaveLength(2);
    const href = new URL(buttons[0]!.getAttribute('href')!);
    expect(href.origin + href.pathname).toBe('https://wa.me/224600000000');
    const text = href.searchParams.get('text')!;
    expect(text).toContain('Sac en cuir');
    expect(text).toMatch(/250.000\sGNF/);
    expect(screen.getByText('Prix sur demande')).toBeInTheDocument();
    expect(screen.getByText(/1Link ne traite aucun paiement/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /payer|acheter/i })).not.toBeInTheDocument();
  });

  it('suit les clics de commande et neutralise les liens en aperçu', async () => {
    const doc = getSampleDocument('business');
    const onTrack = vi.fn();
    const block = shop();
    const { rerender } = render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, block] }} pageUrl="https://1link.gn/x" onTrack={onTrack} />);
    const link = screen.getAllByRole('link', { name: /Commander/ })[0]!;
    link.addEventListener('click', (e) => e.preventDefault());
    await userEvent.click(link);
    expect(onTrack).toHaveBeenCalledWith(block.id);
    rerender(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, block] }} pageUrl="https://1link.gn/x" preview />);
    expect(screen.getAllByRole('link', { name: /Commander/ })[0]).not.toHaveAttribute('href');
  });

  it('gère le panier multi-produits avec calcul du total et bon de commande WhatsApp', async () => {
    const doc = getSampleDocument('business');
    render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, shop()] }} pageUrl="https://1link.gn/x" />);
    
    // Au départ, aucun panier flottant
    expect(screen.queryByRole('button', { name: /^Mon panier\s*:/i })).not.toBeInTheDocument();

    // Ajouter le premier produit
    const addButtons = screen.getAllByRole('button', { name: /Ajouter au panier/i });
    await userEvent.click(addButtons[0]!);

    // Le panier flottant apparaît avec 1 article
    const cartButton = await screen.findByRole('button', { name: /^Mon panier\s*:/i });
    expect(cartButton).toBeInTheDocument();
    expect(cartButton).toHaveTextContent('1');

    // Augmenter la quantité avec le stepper
    const plusBtn = screen.getAllByRole('button', { name: /Plus/i })[0]!;
    await userEvent.click(plusBtn);
    expect(cartButton).toHaveTextContent('2');

    // Ouvrir la modale de commande
    await userEvent.click(cartButton);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Votre commande/i)).toBeInTheDocument();

    // Renseigner un lieu de livraison
    const deliveryInput = within(dialog).getByPlaceholderText(/Kipé/i);
    await userEvent.type(deliveryInput, 'Kipé Centre Émetteur');

    // Vérifier le lien de commande groupée WhatsApp
    const checkoutLink = within(dialog).getByRole('link', { name: /Commander sur WhatsApp/i });
    const href = new URL(checkoutLink.getAttribute('href')!);
    const text = decodeURIComponent(href.searchParams.get('text')!);
    expect(text).toContain('2x Sac en cuir');
    expect(text).toContain('Total : 500');
    expect(text).toContain('Lieu de livraison : Kipé Centre Émetteur');
  });
});

const pay = (): ReturnType<typeof createBlock<'payment'>> => ({
  ...createBlock('payment', { category: 'business' }),
  data: { title: 'Payer', note: 'Envoyez la preuve sur WhatsApp', methods: [{ provider: 'orange_money', number: '622 00 00 00', holder: 'Kalou Studio' }, { provider: 'cash', number: 'À la livraison', holder: '' }] } as PaymentData,
});

describe('moyens de paiement (affichage)', () => {
  it('affiche numéro, bénéficiaire et avertissement, sans aucune action de paiement', () => {
    const doc = getSampleDocument('business');
    render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, pay()] }} pageUrl="https://1link.gn/x" />);
    expect(screen.getByText('Orange Money')).toBeInTheDocument();
    expect(screen.getByText('622 00 00 00')).toBeInTheDocument();
    expect(screen.getByText(/Bénéficiaire : Kalou Studio/)).toBeInTheDocument();
    expect(screen.getByText(/vérifiez le nom du bénéficiaire/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Copier le numéro/ })).toHaveLength(1); // pas pour « espèces »
  });

  it('copie le numéro dans le presse-papiers', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const doc = getSampleDocument('business');
    render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks, pay()] }} pageUrl="https://1link.gn/x" />);
    await userEvent.click(screen.getByRole('button', { name: /Copier le numéro/ }));
    expect(writeText).toHaveBeenCalledWith('622 00 00 00');
    expect(await screen.findByText('Numéro copié')).toBeInTheDocument();
  });

  it('exige un numéro', () => {
    expect(validateBlock(createBlock('payment', { category: 'business' }))['methods.0.number']).toBe('common.validation.required');
    expect(isBlockComplete(pay())).toBe(true);
  });
});

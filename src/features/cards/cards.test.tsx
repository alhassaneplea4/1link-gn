import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { CARD_BLEED, CARD_TRIM, defaultDesign, type CardDesign } from '@/models/cards';
import { loginThroughForm, useBackend } from '@/test/backend';
import { createUser } from '../../../server/testing/fixtures';
import { cardSvg, fitText, luminance, qrPath } from './render';
import { printFileName, printPixels, qrMatrix } from './print';

const backend = useBackend();

function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('rendu de la carte', () => {
  const design: CardDesign = { ...defaultDesign('gradient', { name: 'Awa <script>alert(1)</script> Diallo', title: 'Directrice', organization: 'Kalou & Fils', contact: '+224 622 00 11 22' }) };

  it('échappe tout texte saisi et n’accepte que des images sûres', () => {
    const svg = cardSvg({ ...design, imageUrl: 'javascript:alert(1)' }, 'front', { mode: 'preview' });
    expect(svg).not.toContain('<script');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('Kalou &amp; Fils');
    expect(svg).not.toContain('<image'); // une adresse dangereuse est ignorée : initiales à la place
    expect(cardSvg({ ...design, imageUrl: '/api/media/med_0123456789abcdef0123' }, 'front', { mode: 'preview' })).toContain('<image href="/api/media/med_0123456789abcdef0123"');
  });

  it('distingue l’aperçu (85,6 × 54 mm, coins arrondis) du fichier d’impression (fond perdu 3 mm, dimensions en mm, angles droits)', () => {
    const preview = cardSvg(design, 'front', { mode: 'preview' });
    expect(preview).toContain('viewBox="0 0 85.6 54"');
    expect(preview).toContain('clip-path');
    const print = cardSvg(design, 'front', { mode: 'print' });
    expect(print).toContain(`width="${CARD_TRIM.w + 2 * CARD_BLEED}mm"`);
    expect(print).toContain(`height="${CARD_TRIM.h + 2 * CARD_BLEED}mm"`);
    expect(print).toContain(`viewBox="-${CARD_BLEED} -${CARD_BLEED} ${CARD_TRIM.w + 2 * CARD_BLEED} ${CARD_TRIM.h + 2 * CARD_BLEED}"`);
    expect(print).not.toContain('clip-path'); // pas de rognage ni de reflet : ce qui déborde est du fond perdu
    expect(print).not.toContain('gloss');
    expect(printPixels(600)).toEqual({ w: 2164, h: 1417 });
  });

  it('place le QR code au verso, avec une marge blanche, et la mention NFC seulement pour une carte NFC', async () => {
    const url = 'https://1link.gn/c/k3m9x2pq7a';
    const qr = await qrMatrix(url);
    expect(qr.length).toBeGreaterThanOrEqual(21);
    expect(qr.every((row) => row.length === qr.length)).toBe(true);
    // Les trois repères d'angle d'un QR code : bloc 7×7 sombre en haut à gauche, en haut à droite et en bas à gauche.
    for (const [r, c] of [[0, 0], [0, qr.length - 7], [qr.length - 7, 0]] as const) expect(qr[r]![c]! && qr[r + 6]![c + 6]! && qr[r + 3]![c + 3]!).toBe(true);
    const nfc = cardSvg(design, 'back', { mode: 'print', qr, url, nfc: true });
    const plain = cardSvg(design, 'back', { mode: 'print', qr, url, nfc: false });
    expect(nfc).toContain('NFC');
    expect(plain).not.toContain('>NFC<');
    expect(nfc).toContain('1link.gn/c/k3m9x2pq7a');
    expect(nfc).toContain(`<path d="${qrPath(qr, 5 + 3 * (34 / (qr.length + 6)), (54 - 34) / 2 + 3 * (34 / (qr.length + 6)), 34 / (qr.length + 6))}"`);
  });

  it('réduit puis tronque un texte trop long, et choisit une couleur de texte lisible', () => {
    expect(fitText('Court', 5, 40)).toEqual({ text: 'Court', size: 5 });
    const long = fitText('Un nom extraordinairement long pour une carte de visite', 5.4, 40);
    expect(long.size).toBeLessThan(5.4);
    expect(long.text.length).toBeLessThan(55);
    expect(luminance('#ffffff')).toBeGreaterThan(0.9);
    expect(luminance('#0b0f19')).toBeLessThan(0.02);
  });

  it('nomme les fichiers d’impression sans caractère risqué', () => {
    expect(printFileName('CRT-7K2M9Q', 'back', 'png', 'k3m9x2pq7a')).toBe('CRT-7K2M9Q_verso_k3m9x2pq7a_85.6x54mm-fp3.png');
    expect(printFileName('CRT-7K2M9Q', 'front', 'svg')).toBe('CRT-7K2M9Q_recto_85.6x54mm-fp3.svg');
    expect(printFileName('../../x y', 'front', 'svg')).not.toContain('/');
  });
});

describe('Cartes de visite : parcours client', () => {
  const client = () => createUser(backend.app.db, { name: 'Awa Diallo', plan: 'pro', page: { username: 'awa-cartes', published: true } });

  it('commande une carte NFC, retrouve la commande avec sa référence, puis désactive la carte perdue', async () => {
    const { email, password } = await client();
    const r = mount('/auth/login?next=%2Fdashboard%2Fcards');
    await loginThroughForm(email!, password);
    expect(await screen.findByRole('heading', { name: 'Choisissez votre carte' })).toBeInTheDocument();

    // 1. type et modèle
    await userEvent.click(screen.getByLabelText(/Carte QR \+ NFC/));
    await userEvent.click(screen.getByLabelText('Premium Black'));
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // 2. personnalisation : les informations du profil sont reprises automatiquement
    expect(await screen.findByRole('heading', { name: 'Personnalisez votre carte' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nom/)).toHaveValue('Awa Diallo');
    await userEvent.type(screen.getByLabelText(/Entreprise ou organisation/), 'Kalou Studio');
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // 3. quantité : prix lu en base (jamais codé en dur dans l'interface)
    expect(await screen.findByRole('heading', { name: 'Quantité et prix' })).toBeInTheDocument();
    expect(screen.getAllByText(/75[\s  ]000/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // 4. livraison : champs obligatoires
    await userEvent.click(await screen.findByRole('button', { name: /Continuer/ }));
    expect((await screen.findAllByText('Ce champ est obligatoire.')).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText(/Téléphone du destinataire/), '+224 622 00 11 22');
    await userEvent.type(screen.getByLabelText(/^Ville/), 'Conakry');
    await userEvent.type(screen.getByLabelText(/Adresse de livraison/), 'Kaloum, près du marché');
    await userEvent.click(screen.getByRole('button', { name: /Continuer/ }));

    // 5. récapitulatif et commande
    expect(await screen.findByRole('heading', { name: 'Vérifiez et commandez' })).toBeInTheDocument();
    expect(screen.getByText(/Aucun paiement n’est pris en ligne/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Passer la commande' }));

    expect((await screen.findAllByText(/^CRT-[A-Z2-9]{6}$/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('En attente de paiement').length).toBeGreaterThan(0);
    expect(screen.getByText(/Référence à indiquer/)).toBeInTheDocument();
    // la commande en attente de paiement est signalée dès le menu
    await waitFor(() => expect(screen.getByRole('link', { name: /Cartes de visite.*1 élément à traiter/ })).toBeInTheDocument());

    // la base contient la commande, ses cartes et rien de plus
    const rows = await backend.app.db.execute<{ status: string; total: number; cards: number }>(
      (await import('drizzle-orm')).sql`select o.status, o.total, (select count(*)::int from cards c where c.order_id = o.id) as cards from card_orders o`);
    expect(rows.rows).toEqual([{ status: 'awaiting_payment', total: 75000, cards: 1 }]);

    // désactivation d'une carte perdue
    await userEvent.click(screen.getByText(/Votre carte et son adresse/));
    await userEvent.click(await screen.findByRole('button', { name: 'Désactiver' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(screen.getByText('Désactivée')).toBeInTheDocument());
    expect(r.state.location.pathname).toBe('/dashboard/cards');
  }, 90000);

  it('demande de publier la page avant de commander', async () => {
    const { email, password } = await createUser(backend.app.db, { name: 'Brouillon', plan: 'pro', page: { username: 'brouillon-cartes', published: false } });
    mount('/auth/login?next=%2Fdashboard%2Fcards');
    await loginThroughForm(email!, password);
    expect(await screen.findByText('Publiez d’abord votre page')).toBeInTheDocument();
  });
});

describe('page publique d’une carte (/c/<code>)', () => {
  it('affiche un message clair sans donnée personnelle pour une carte inconnue, et mène au profil pour une carte active', async () => {
    mount('/c/aaaaaaaaaa');
    expect(await screen.findByRole('heading', { name: 'Carte introuvable' })).toBeInTheDocument();
  });

  it('une carte active ouvre le profil de son propriétaire', async () => {
    const { user } = await createUser(backend.app.db, { name: 'Mariama Bah', plan: 'pro', page: { username: 'mariama-carte', published: true } });
    const signed = backend.app.client({ 'x-real-ip': '198.51.100.250' });
    expect((await signed.post('/api/auth/sign-in', { email: user.email, password: 'Test-Passw0rd-2026' })).status).toBe(200);
    const order = (await signed.post('/api/me/cards/orders', {
      productId: 'qr_basic', units: 1, design: defaultDesign('classic_white', { name: 'Mariama Bah' }),
      delivery: { fullName: 'Mariama Bah', phone: '+224 622 00 11 22', city: 'Conakry', address: 'Kaloum', notes: '' },
    })).body;
    mount(`/c/${order.cards[0].code}`);
    expect(await screen.findByRole('heading', { level: 1, name: /Mariama Bah/ })).toBeInTheDocument();
  });
});

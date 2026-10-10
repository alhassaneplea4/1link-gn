import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { routes } from '@/app/routes/router';
import { api } from '@/services/api';
import { resetDemoDb } from '@/services/api/demo/db';
import { useSession } from '@/state/session';
import { useEditor } from '@/state/editor';
import { ToastProvider } from '@/components/ui';
import { sanitizeSource, trackedUrl, TRACKING_SOURCES } from '@/utilities/tracking';
import { ShareDialog } from './ShareDialog';
import { printAccent } from './PrintPage';

beforeEach(() => {
  resetDemoDb();
  useSession.setState({ status: 'loading', session: null });
  useEditor.getState().reset();
});

describe('liens de suivi — utilitaires', () => {
  it('assainit le paramètre src reçu de l’URL', () => {
    expect(sanitizeSource('WhatsApp')).toBe('whatsapp');
    expect(sanitizeSource('affiche-2026')).toBe('affiche-2026');
    expect(sanitizeSource('<script>')).toBeNull();
    expect(sanitizeSource('a'.repeat(25))).toBeNull();
    expect(sanitizeSource('')).toBeNull();
    expect(sanitizeSource(null)).toBeNull();
  });
  it('ajoute src sans perdre les autres paramètres', () => {
    expect(trackedUrl('https://1link.gn/mariama', 'poster')).toBe('https://1link.gn/mariama?src=poster');
    expect(trackedUrl('https://1link.gn/mariama?lite=1', 'card')).toBe('https://1link.gn/mariama?lite=1&src=card');
    expect(trackedUrl('https://1link.gn/m?src=old', 'new')).toBe('https://1link.gn/m?src=new');
  });
});

describe('couleur d’accent imprimable', () => {
  it('évite les couleurs illisibles sur papier blanc', () => {
    expect(printAccent({ primary: '#ffffff', accent: '#f0abfc' })).toBe('#2563eb');
    expect(printAccent({ primary: '#ffffff', accent: '#7c3aed' })).toBe('#7c3aed');
    expect(printAccent({ primary: '#0b3b8c', accent: '#0e7490' })).toBe('#0b3b8c');
  });
});

describe('boîte de partage', () => {
  it('propose un lien de suivi par canal et copie le bon lien', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MemoryRouter><ToastProvider><ShareDialog open onClose={() => undefined} username="mariama" published /></ToastProvider></MemoryRouter>);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThanOrEqual(TRACKING_SOURCES.length);
    await userEvent.click(within(dialog).getByRole('button', { name: /Copier le lien — TikTok/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/mariama\?src=tiktok$/));
    expect(within(dialog).getByRole('link', { name: /Imprimer une affiche/ })).toHaveAttribute('href', '/dashboard/print');
    expect(within(dialog).getByRole('link', { name: /Partager sur WhatsApp/ })).toHaveAttribute('href', expect.stringContaining(encodeURIComponent('?src=whatsapp')));
  });
});

describe('attribution des visites par canal', () => {
  it('transmet le canal assaini avec la vue et les clics', async () => {
    const track = vi.spyOn(api.page, 'trackEvent');
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/mariama?src=TikTok'] })} />);
    await screen.findByRole('heading', { level: 1, name: /Mariama/ });
    await waitFor(() => expect(track).toHaveBeenCalledWith('mariama', { type: 'view', source: 'tiktok' }));
    track.mockClear();
    render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/mariama?src=%3Cx%3E'] })} />);
    await waitFor(() => expect(track).toHaveBeenCalledWith('mariama', { type: 'view', source: undefined }));
    track.mockRestore();
  });
});

describe('affiche et cartes de visite', () => {
  const open = async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/auth/login'] });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole('button', { name: /Créatrice/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await screen.findByRole('heading', { name: /Bonjour, Mariama/ });
    await router.navigate('/dashboard/print');
    return router;
  };

  it('génère une affiche A4 avec QR code de suivi, puis une planche de 10 cartes', async () => {
    await open();
    expect(await screen.findByRole('heading', { name: 'Affiche et cartes de visite' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Mariama Bah' })).toBeInTheDocument();
    expect(screen.getByText('Scannez pour retrouver toute ma présence')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: '10 cartes de visite' }));
    expect(document.querySelectorAll('.bizcard')).toHaveLength(10);
    expect(screen.queryByText(/Scannez pour retrouver/)).not.toBeInTheDocument();
  });

  it('lance l’impression du navigateur', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    await open();
    await userEvent.click(await screen.findByRole('button', { name: /Imprimer \/ Enregistrer en PDF/ }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { render, renderHook, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { createBlock } from './blocks/registry';
import { PageRenderer } from './renderer/PageRenderer';
import { getSampleDocument } from './samples';
import { connectionWantsLite, useLiteMode } from '@/features/public-profile/useLiteMode';

const withGallery = (url: string) => {
  const doc = getSampleDocument('individual');
  const g = createBlock('gallery', { category: 'individual' });
  g.data.images = [{ url, alt: 'Atelier' }];
  return { ...doc, blocks: [...doc.blocks, g] };
};

describe('mode économe — rendu', () => {
  it('ne télécharge pas les images distantes avant le clic du visiteur', async () => {
    const { container } = render(<PageRenderer page={withGallery('https://exemple.com/a.jpg')} pageUrl="https://1link.gn/x" lite />);
    expect(container.querySelector('.pg--lite')).not.toBeNull();
    expect(container.querySelector('img[src="https://exemple.com/a.jpg"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Afficher l’image : Atelier/ }));
    expect(container.querySelector('img[src="https://exemple.com/a.jpg"]')).not.toBeNull();
  });

  it('affiche directement les images déjà en mémoire (URL de données) et tout hors mode économe', () => {
    const lite = render(<PageRenderer page={withGallery('data:image/svg+xml;utf8,<svg/>')} pageUrl="https://1link.gn/x" lite />);
    expect(lite.container.querySelector('img[src^="data:image"]')).not.toBeNull();
    lite.unmount();
    const normal = render(<PageRenderer page={withGallery('https://exemple.com/a.jpg')} pageUrl="https://1link.gn/x" />);
    expect(normal.container.querySelector('img[src="https://exemple.com/a.jpg"]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Afficher l’image/ })).not.toBeInTheDocument();
  });

  it('n’interfère pas avec l’aperçu de l’éditeur', () => {
    const { container } = render(<PageRenderer page={withGallery('https://exemple.com/a.jpg')} pageUrl="https://1link.gn/x" lite preview />);
    expect(container.querySelector('img[src="https://exemple.com/a.jpg"]')).not.toBeNull();
  });

  it('rend le pied de page fourni (bascule, signalement)', () => {
    render(<PageRenderer page={getSampleDocument('individual')} pageUrl="https://1link.gn/x" footer={<button>Action de pied</button>} />);
    expect(screen.getByRole('button', { name: 'Action de pied' })).toBeInTheDocument();
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
});

const wrapper = (search = '') => ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[`/x${search}`]}>{children}</MemoryRouter>;

describe('mode économe — détection et mémorisation', () => {
  it('se déclenche automatiquement sur économiseur de données ou réseau 2G', () => {
    expect(connectionWantsLite()).toBe(false);
    Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
    expect(connectionWantsLite()).toBe(true);
    Object.defineProperty(navigator, 'connection', { value: { effectiveType: '2g' }, configurable: true });
    expect(connectionWantsLite()).toBe(true);
    Object.defineProperty(navigator, 'connection', { value: { effectiveType: '4g' }, configurable: true });
    expect(connectionWantsLite()).toBe(false);
  });

  it('le paramètre ?lite= prime, puis le choix mémorisé, puis la détection', () => {
    expect(renderHook(() => useLiteMode(), { wrapper: wrapper('?lite=1') }).result.current[0]).toBe(true);
    localStorage.setItem('onelink.lite', '1');
    expect(renderHook(() => useLiteMode(), { wrapper: wrapper('?lite=0') }).result.current[0]).toBe(false);
    expect(renderHook(() => useLiteMode(), { wrapper: wrapper() }).result.current[0]).toBe(true);
  });

  it('mémorise le choix du visiteur', () => {
    const { result } = renderHook(() => useLiteMode(), { wrapper: wrapper() });
    expect(result.current[0]).toBe(false);
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('onelink.lite')).toBe('1');
    act(() => result.current[1]());
    expect(localStorage.getItem('onelink.lite')).toBe('0');
  });
});

import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageRenderer } from './renderer/PageRenderer';
import { groupSections } from './renderer/ProfileLayout';
import { getSampleDocument } from './samples';
import type { PageDocument } from '@/models/page';

const doc = (category: Parameters<typeof getSampleDocument>[0]): PageDocument => ({ ...getSampleDocument(category), publishedAt: '2026-09-28T10:00:00.000Z' });
const show = (page: PageDocument, props: Partial<Parameters<typeof PageRenderer>[0]> = {}) =>
  render(<PageRenderer page={page} pageUrl={`https://1link.test/${page.username}`} layout="profile" {...props} />);

describe('mise en page « profil » de la page publique', () => {
  it('présente couverture, identité, actions rapides, puis des sections nommées', () => {
    const page = doc('professional');
    const { container } = show(page);
    expect(screen.getByRole('heading', { level: 1, name: /Mamadou Keita/ })).toBeInTheDocument();
    expect(container.querySelector('.pgp-cover__art')).toBeInTheDocument(); // pas de photo : couverture générée aux couleurs du thème
    expect(screen.getByText('Professionnel')).toBeInTheDocument(); // type de profil
    expect(screen.getByText(/Sur 1Link depuis/)).toBeInTheDocument(); // date réelle de publication
    const sections = [...container.querySelectorAll('section.pgp-section')].map((s) => s.id);
    expect(sections).toEqual(['pgp-sec-offers', 'pgp-sec-links', 'pgp-sec-contact']); // ordre d'apparition des blocs
    expect(screen.getByRole('navigation', { name: 'Sections de la page' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Services & offres' })).toBeInTheDocument();
  });

  it('déduit les actions rapides des blocs réels (WhatsApp, appel, e-mail) et les suit', async () => {
    const onTrack = vi.fn();
    const page = doc('individual');
    const { container } = show(page, { onTrack });
    const actions = within(container.querySelector('.pgp-actions') as HTMLElement);
    const wa = actions.getByRole('link', { name: 'WhatsApp' });
    expect(wa).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\/224600000000/));
    expect(actions.queryByRole('link', { name: 'Appeler' })).not.toBeInTheDocument(); // aucun bloc téléphone : aucune action inventée
    expect(actions.queryByRole('link', { name: 'E-mail' })).not.toBeInTheDocument();
    await userEvent.click(wa);
    expect(onTrack).toHaveBeenCalledWith('s5');
  });

  it('affiche les icônes de réseaux dans l’en-tête sans les répéter dans les sections', () => {
    const page = doc('creator');
    const { container } = show(page);
    expect(container.querySelectorAll('.pgp-socials .pg-social')).toHaveLength(4);
    expect(container.querySelectorAll('.pgp-section .pg-socials')).toHaveLength(0);
  });

  it('ne rend rien d’actif en aperçu (liens inertes, pas de navigation) et conserve les repères de l’éditeur', () => {
    const page = doc('professional');
    const { container } = show(page, { preview: true, highlightBlockId: 'p2' });
    expect(screen.getByRole('heading', { level: 3, name: /Mamadou Keita/ })).toBeInTheDocument(); // un seul h1 : celui de la vraie page
    expect(container.querySelector('.pgp-act[href]')).toBeNull();
    expect(container.querySelector('[data-block-id="p1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-block-id="p2"].is-highlighted')).toBeInTheDocument();
  });

  it('invite les visiteurs à créer leur 1Link en bas de la page publique, pas dans l’aperçu', () => {
    const { container, unmount } = show(doc('creator'));
    const cta = container.querySelector('.pgp-cta a') as HTMLAnchorElement;
    expect(cta).toHaveAttribute('href', '/auth/register');
    expect(cta).toHaveTextContent('Créer mon 1Link');
    unmount();
    const preview = show(doc('creator'), { preview: true });
    expect(preview.container.querySelector('.pgp-cta')).toBeNull();
  });

  it('retombe sur la liste classique sans bloc profil, et groupe les blocs par thème', () => {
    const page = doc('business');
    const noProfile = { ...page, blocks: page.blocks.filter((b) => b.type !== 'profile') };
    const { container } = show(noProfile);
    expect(container.querySelector('.pg--profile')).toBeNull();
    const kinds = groupSections(page.blocks).map((s) => s.id);
    expect(kinds).toEqual(['offers', 'contact']);
  });
});

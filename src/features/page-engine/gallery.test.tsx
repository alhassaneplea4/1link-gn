import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageRenderer } from './renderer/PageRenderer';
import { createBlock } from './blocks/registry';
import { getSampleDocument } from './samples';

function pageWithGallery(n: number, preview = false) {
  const doc = getSampleDocument('individual');
  const gallery = createBlock('gallery', { category: 'individual' });
  gallery.data.title = 'Mes photos';
  gallery.data.images = Array.from({ length: n }, (_, i) => ({ url: `https://exemple.com/${i + 1}.jpg`, alt: `Description ${i + 1}` }));
  render(<PageRenderer page={{ ...doc, blocks: [...doc.blocks.filter((b) => b.type !== 'gallery'), gallery] }} pageUrl="https://1link.gn/x" preview={preview} />);
}

describe('galerie en carrousel', () => {
  it('affiche cinq images au plus, chacune avec sa brève description', () => {
    pageWithGallery(7);
    const carousel = screen.getByRole('region', { name: 'Mes photos' });
    expect(within(carousel).getAllByRole('group')).toHaveLength(5);
    expect(within(carousel).getByText('Description 5')).toBeInTheDocument();
    expect(within(carousel).queryByText('Description 6')).not.toBeInTheDocument();
  });

  it('ouvre l’image en taille réelle avec sa description, se ferme par la croix ou Échap, et navigue entre les images', async () => {
    pageWithGallery(3);
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’image 2 en taille réelle' }));
    const viewer = await screen.findByRole('dialog', { name: 'Visionneuse d’images' });
    expect(within(viewer).getByRole('img', { name: 'Description 2' })).toBeInTheDocument();
    expect(within(viewer).getByText('2 / 3')).toBeInTheDocument();

    await userEvent.click(within(viewer).getByRole('button', { name: 'Image suivante' }));
    expect(within(viewer).getByRole('img', { name: 'Description 3' })).toBeInTheDocument();
    expect(within(viewer).getByRole('button', { name: 'Image suivante' })).toBeDisabled();

    await userEvent.click(within(viewer).getByRole('button', { name: 'Fermer l’image' }));
    expect(screen.queryByRole('dialog', { name: 'Visionneuse d’images' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Voir l’image 1 en taille réelle' }));
    await screen.findByRole('dialog', { name: 'Visionneuse d’images' });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Visionneuse d’images' })).not.toBeInTheDocument();
  });

  it('n’ouvre pas la visionneuse dans un aperçu (éditeur)', async () => {
    pageWithGallery(2, true);
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’image 1 en taille réelle' }));
    expect(screen.queryByRole('dialog', { name: 'Visionneuse d’images' })).not.toBeInTheDocument();
  });
});

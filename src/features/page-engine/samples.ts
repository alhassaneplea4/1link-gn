/**
 * Pages d'exemple FICTIVES (noms, textes et liens inventés) — utilisées par la page d'accueil et les données de démonstration.
 */
import type { AnyBlock } from '@/models/blocks';
import type { CategoryId } from '@/models/category';
import type { PageDocument } from '@/models/page';
import { getThemePreset } from './appearance/themes';
import { placeholderImage } from './blocks/urls';

const b = <T extends AnyBlock>(block: T): T => block;

export function makeDoc(partial: Pick<PageDocument, 'username' | 'category' | 'blocks' | 'appearance'> & Partial<PageDocument>): PageDocument {
  return {
    id: `page_${partial.username}`,
    status: 'published',
    share: { title: '', description: '' },
    version: 1,
    updatedAt: '2026-09-28T10:00:00.000Z',
    publishedAt: '2026-09-28T10:00:00.000Z',
    ...partial,
  };
}

const SAMPLE: Record<CategoryId, () => PageDocument> = {
  individual: () =>
    makeDoc({
      username: 'fatoumata', category: 'individual', appearance: getThemePreset('soft'),
      blocks: [
        b({ id: 's1', type: 'profile', visible: true, data: { displayName: 'Fatoumata Soumah', headline: 'Étudiante en design · Conakry', bio: 'Je dessine, je cuisine, je voyage. Voici mes liens favoris.', avatarUrl: '', coverUrl: '', location: 'Conakry, Guinée', verified: false } }),
        b({ id: 's2', type: 'social', visible: true, data: { display: 'icons', items: [{ platform: 'instagram', url: 'https://instagram.com/exemple' }, { platform: 'tiktok', url: 'https://tiktok.com/@exemple' }, { platform: 'whatsapp', url: 'https://wa.me/224600000000' }] } }),
        b({ id: 's3', type: 'link', visible: true, data: { title: 'Mon portfolio', url: 'https://exemple.com/portfolio', description: 'Travaux et projets récents', platform: 'link', highlight: true } }),
        b({ id: 's4', type: 'link', visible: true, data: { title: 'Ma playlist du moment', url: 'https://exemple.com/playlist', description: '', platform: 'link', highlight: false } }),
        b({ id: 's5', type: 'whatsapp', visible: true, data: { label: 'Écrivez-moi sur WhatsApp', phone: '+224 600 00 00 00', message: 'Bonjour !' } }),
      ],
    }),
  creator: () =>
    makeDoc({
      username: 'mariama', category: 'creator', appearance: getThemePreset('creator'),
      blocks: [
        b({ id: 'c1', type: 'profile', visible: true, data: { displayName: 'Mariama Bah', headline: 'Créatrice de contenu · Lifestyle & cuisine', bio: 'Recettes guinéennes revisitées, vlogs et collaborations.', avatarUrl: '', coverUrl: '', location: 'Conakry', verified: false } }),
        b({ id: 'c2', type: 'social', visible: true, data: { display: 'icons', items: [{ platform: 'youtube', url: 'https://youtube.com/@exemple' }, { platform: 'tiktok', url: 'https://tiktok.com/@exemple' }, { platform: 'instagram', url: 'https://instagram.com/exemple' }, { platform: 'facebook', url: 'https://facebook.com/exemple' }] } }),
        b({ id: 'c3', type: 'link', visible: true, data: { title: 'Dernière vidéo', url: 'https://youtube.com/watch?v=exemple', description: 'Le riz gras en 20 minutes', platform: 'youtube', highlight: true } }),
        b({ id: 'c4', type: 'portfolio', visible: true, data: { title: 'Collaborations', items: [{ title: 'Campagne été', description: 'Partenariat boissons', imageUrl: placeholderImage('campagne'), url: '' }, { title: 'Série cuisine', description: '12 épisodes', imageUrl: placeholderImage('cuisine'), url: '' }] } }),
        b({ id: 'c5', type: 'cta', visible: true, data: { label: 'Proposer une collaboration', url: 'mailto:exemple@exemple.com', description: 'Kit média sur demande' } }),
      ],
    }),
  professional: () =>
    makeDoc({
      username: 'mamadou', category: 'professional', appearance: getThemePreset('professional'),
      blocks: [
        b({ id: 'p1', type: 'profile', visible: true, data: { displayName: 'Mamadou Keita', headline: 'Développeur web freelance', bio: 'Sites, applications et automatisations pour PME. Disponible pour de nouvelles missions.', avatarUrl: '', coverUrl: '', location: 'Conakry · À distance', verified: false } }),
        b({ id: 'p2', type: 'service', visible: true, data: { title: 'Services', items: [{ name: 'Site vitrine', description: 'Design sur mesure, rapide et optimisé mobile.', price: 'Sur devis', url: '' }, { name: 'Application web', description: 'Outils métiers et tableaux de bord.', price: 'Sur devis', url: '' }] } }),
        b({ id: 'p3', type: 'link', visible: true, data: { title: 'Voir mes réalisations', url: 'https://exemple.com/work', description: '', platform: 'link', highlight: false } }),
        b({ id: 'p4', type: 'contact', visible: true, data: { title: 'Me contacter', items: [{ kind: 'email', label: 'E-mail', value: 'contact@exemple.com' }, { kind: 'whatsapp', label: 'WhatsApp', value: '+224 600 00 00 01' }] } }),
      ],
    }),
  business: () =>
    makeDoc({
      username: 'kalou', category: 'business', appearance: getThemePreset('business'),
      blocks: [
        b({ id: 'b1', type: 'profile', visible: true, data: { displayName: 'Kalou Studio', headline: 'Agence de communication visuelle', bio: 'Identité de marque, supports imprimés et contenus numériques pour entreprises ambitieuses.', avatarUrl: '', coverUrl: '', location: 'Kaloum, Conakry', verified: false } }),
        b({ id: 'b2', type: 'service', visible: true, data: { title: 'Nos expertises', items: [{ name: 'Identité visuelle', description: 'Logo, charte, déclinaisons.', price: '', url: '' }, { name: 'Contenus réseaux sociaux', description: 'Plans éditoriaux et création.', price: '', url: '' }] } }),
        b({ id: 'b3', type: 'location', visible: true, data: { label: 'Notre atelier', address: 'Kaloum, Conakry, Guinée', mapUrl: '', hours: 'Lun–Ven · 9h–17h' } }),
        b({ id: 'b4', type: 'phone', visible: true, data: { label: 'Appeler l’agence', phone: '+224 600 00 00 02' } }),
      ],
    }),
  organization: () =>
    makeDoc({
      username: 'fouta-solidaire', category: 'organization', appearance: getThemePreset('elegant'),
      blocks: [
        b({ id: 'o1', type: 'profile', visible: true, data: { displayName: 'Association Fouta Solidaire', headline: 'Éducation et entraide communautaire', bio: 'Nous soutenons la scolarité des enfants et les initiatives locales.', avatarUrl: '', coverUrl: '', location: 'Labé, Guinée', verified: false } }),
        b({ id: 'o2', type: 'text', visible: true, data: { title: 'Notre mission', body: 'Faciliter l’accès à l’éducation et renforcer les liens entre les communautés.' } }),
        b({ id: 'o3', type: 'portfolio', visible: true, data: { title: 'Projets en cours', items: [{ title: 'Fournitures scolaires', description: 'Rentrée 2026', imageUrl: placeholderImage('fournitures'), url: '' }, { title: 'Bibliothèque de quartier', description: 'En construction', imageUrl: placeholderImage('biblio'), url: '' }] } }),
        b({ id: 'o4', type: 'cta', visible: true, data: { label: 'Rejoindre l’association', url: 'https://exemple.com/rejoindre', description: 'Bénévoles bienvenus' } }),
      ],
    }),
};

export const getSampleDocument = (category: CategoryId): PageDocument => SAMPLE[category]();

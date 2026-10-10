import type { Dict } from '../types';

/** Textes de la page publique (visiteurs) et de ses états. */
export default {
  verified: 'Profil vérifié',
  learnMore: 'En savoir plus',
  playVideo: 'Lire la vidéo',
  video: 'Vidéo',
  whatsapp: 'WhatsApp',
  location: 'Localisation',
  directions: 'Itinéraire',
  scanQr: 'Scannez pour ouvrir cette page',
  qrAlt: 'QR code de la page',
  madeWith: 'Créé avec',
  incomplete: 'Bloc à compléter',
  states: {
    notFound: {
      title: 'Cette page n’existe pas',
      text: 'Le lien est peut-être erroné, ou la page n’a pas encore été créée.',
      cta: 'Créer mon 1Link',
    },
    draft: {
      title: 'Cette page n’est pas encore publiée',
      text: 'Son propriétaire prépare encore son contenu. Revenez bientôt.',
    },
    suspended: {
      title: 'Cette page est suspendue',
      text: 'Elle n’est plus accessible suite à une décision de modération.',
    },
    unavailable: {
      title: 'Page temporairement indisponible',
      text: 'Nous rencontrons un problème pour afficher cette page. Réessayez dans quelques instants.',
      retry: 'Réessayer',
    },
    loading: 'Chargement de la page…',
    home: 'Découvrir 1Link',
  },
} satisfies Dict;

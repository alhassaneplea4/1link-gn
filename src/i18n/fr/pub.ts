import type { Dict } from '../types';

/** Textes de la page publique (visiteurs) et de ses états. */
export default {
  verified: 'Profil vérifié',
  order: {
    button: 'Commander sur WhatsApp',
    message: 'Bonjour, je souhaite commander : {product}{price}. Pouvez-vous me confirmer la disponibilité ?',
    onRequest: 'Prix sur demande',
    disclaimer: 'Commande par WhatsApp : le prix et le paiement se règlent directement avec le vendeur. 1Link ne traite aucun paiement.',
  },
  payment: {
    copy: 'Copier le numéro',
    copied: 'Numéro copié',
    holder: 'Bénéficiaire',
    disclaimer: 'Paiement hors 1Link : vérifiez le nom du bénéficiaire avant d’envoyer de l’argent. 1Link ne traite aucun paiement.',
    providers: { orange_money: 'Orange Money', mtn_momo: 'MTN MoMo', moov_money: 'Moov Money', wave: 'Wave', bank_transfer: 'Virement bancaire', cash: 'Espèces', other: 'Autre' },
  },
  lite: {
    on: 'Mode économe activé',
    off: 'Activer le mode économe',
    hint: 'Moins de données : les images s’affichent à la demande.',
    showImage: 'Afficher l’image',
  },
  saveContact: 'Enregistrer mon contact',
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

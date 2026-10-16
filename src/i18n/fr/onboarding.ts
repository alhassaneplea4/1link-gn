import type { Dict } from '../types';

export default {
  title: 'Configurer mon compte',
  stepsLabel: 'Étapes de configuration',
  stepOf: 'Étape {n} sur {total}',
  livePreview: 'Aperçu en direct de votre page',
  validate: 'Valider mon compte',
  steps: {
    category: 'Type de compte',
    profile: 'Profil',
  },
  category: { title: 'Quel type de compte ?', lead: 'Votre type de compte adapte les suggestions et votre tableau de bord. Vous pourrez le changer plus tard.', legend: 'Type de compte' },
  profile: {
    title: 'Votre profil',
    lead: 'Photo, couverture, nom, secteur et titre : ce que vos visiteurs voient en premier. Tout est modifiable ensuite.',
    name: 'Nom complet',
    nameOrg: 'Nom de la marque ou de l’organisation',
    nameHint: 'Tel qu’il s’affichera sur votre page.',
    sector: 'Secteur d’activité',
    sectorHint: 'Ex. « Restauration », « Éducation », « Musique ».',
    titleField: 'Titre',
    titleHint: 'Votre métier, votre rôle ou une accroche. Ex. « Architecte d’intérieur ».',
  },
  sections: {
    photos: { title: 'Photos', hint: 'Une couverture et une photo de profil donnent tout de suite confiance. Vous pourrez les changer à tout moment.' },
    identity: { title: 'Nom, secteur et titre', hint: 'Ce que vos visiteurs liront en premier.' },
  },
  identity: {
    coverTitle: 'Photo de couverture',
    coverAdd: 'Ajouter une couverture',
    coverHint: 'Image large (format paysage). Facultative : sans couverture, un dégradé à vos couleurs est utilisé.',
    photoTitle: 'Photo de profil',
    photo: 'Ajouter une photo ou un logo',
    photoHint: 'Facultatif. Une image carrée donne le meilleur rendu.',
  },
} satisfies Dict;

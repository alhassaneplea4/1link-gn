# Limites connues et fonctionnalités en démonstration

Ce document est volontairement sans fard : il distingue ce qui **fonctionne réellement dans le front-end** de ce qui dépend d'un backend.

## Fonctionne réellement (côté interface)
- Site public complet, responsive, interactif (démo de blocs, catégories, personnalisation, offres, FAQ).
- Éditeur de blocs : 19 types (dont boutique WhatsApp, moyens de paiement, carte de contact vCard), ajout / modification / suppression / duplication / réordonnancement / masquage, annuler-rétablir, brouillon, garde « modifications non enregistrées », limite de blocs.
- Apparence : 10 thèmes, couleurs HEX validées + contrastes WCAG, 6 styles de boutons, arrondis, polices, mise en page, arrière-plans (uni, dégradé, image, motif), 5 styles de blocs, aperçu en direct, réinitialisation sans toucher au contenu.
- **Commandes sans transaction** : le catalogue ouvre une discussion WhatsApp pré-remplie ; le bloc « moyens de paiement » affiche des numéros Mobile Money / bancaires (copie en un clic) avec avertissement. **1Link ne traite, n'encaisse ni ne transfère aucun argent** (choix produit : transactions directes « plus tard »).
- **Enregistrer mon contact** : fichier vCard généré dans le navigateur du visiteur.
- **Mode économe en données** : images différées, effets coûteux coupés ; détection de l'économiseur de données / réseau 2G, choix mémorisé, lien `?lite=1`.
- **Signalement par un visiteur** (anonyme, limité) → file de modération de l'Admin Center.
- Page publique : même moteur de rendu, états publié / brouillon / suspendue / indisponible / introuvable, liens sécurisés, QR code réel, vidéos au clic.
- Onboarding en 8 étapes adapté aux 5 catégories, validation par étape, conservation des saisies, aperçu en direct.
- Dashboard (5 variantes de raccourcis et recommandations), analytics avec filtres de période (dont période personnalisée), export CSV des séries affichées.
- Admin Center : 14 rubriques, rôles et permissions reflétés dans la navigation et les routes, tableaux (recherche, filtres, tri, pagination).
- Accessibilité : navigation clavier, focus visible, dialogues avec piège de focus, `aria-*`, tables équivalentes aux graphiques, `prefers-reduced-motion`. Audit axe-core WCAG 2 A/AA : 0 violation « serious/critical » sur 16 écrans testés.

- **Programmation des blocs** (affichage entre deux dates, vérifié à l'ouverture et à chaque échéance), **prise de rendez-vous** (demande envoyée par WhatsApp, aucune réservation confirmée par la plateforme), **prix multi-devises** pour la diaspora (taux fixé par le vendeur, indicatif), **liens de suivi par canal** (`?src=`) et **affiche / cartes de visite imprimables** (QR code réel, PDF A4 via l'impression du navigateur).
- **Connexion par téléphone** (WhatsApp / SMS) : formulaire, choix du pays, saisie du code, minuteur de renvoi, messages d'erreur. Un compte vérifié par téléphone peut publier sans e-mail.

## En mode démonstration uniquement (`VITE_API_MODE=demo`, défaut)
Tout est **local à ce navigateur** (`localStorage`) et signalé (bandeau, badges « Démonstration »).
- **Authentification** : aucun mot de passe n'est vérifié ni stocké ; comptes d'essai sur l'écran de connexion. Aucun e-mail n'est envoyé (la vérification se simule par un bouton explicite).
- **Code à usage unique (OTP)** : aucun message WhatsApp / SMS n'est envoyé ; le code est généré localement, affiché dans un encadré « Démonstration » et jamais stocké dans `localStorage`. Les garde-fous (6 chiffres, validité 5 min, 5 essais, renvoi après 30 s, 5 demandes / heure) sont simulés pour valider l'interface ; en production ils doivent être appliqués **par le serveur**.
- **Badge « Profil vérifié »** : la demande et la décision se jouent dans ce navigateur ; en production le badge appartient au serveur (l'interface ne peut pas se l'attribuer).
- **Publication** : « publier » enregistre dans ce navigateur ; la page n'est visible que là.
- **Analytics et chiffres admin** : générés (PRNG déterministe), `source: 'demo'`.
- **Modération / suspension** : modifient l'état local ; l'interface le dit (« non transmis à un serveur »).
- **Temps réel** : aucun événement tant que l'opérateur ne lance pas explicitement le flux de démonstration.
- **Signalements de visiteurs** : en démonstration, enregistrés dans le navigateur du visiteur (le modérateur du même navigateur les voit) ; en production, `POST /pages/:username/reports` est attendu.
- **Images** : réduites puis conservées en URL de données ; en mode `http`, `POST /me/media` est attendu.

## Jamais simulé comme réussi
- Paiements et changements de plan (`unavailable / payments_not_connected`), remboursements, suppression de compte, changement de mot de passe, 2FA, domaine personnalisé, gestion d'équipe : désactivés ou marqués « bientôt ».

## Limites techniques
- **Aperçus de liens (Open Graph) sur WhatsApp / réseaux** : les robots n'exécutent pas JavaScript. Les balises sont mises à jour côté client, mais un vrai aperçu requiert un rendu serveur / edge (ou pré-rendu) de `/:username` — hors périmètre front pur.
- **Contrat HTTP** : les chemins d'API de `services/api/http` sont des hypothèses à valider avec le backend.
- **Langues : français et anglais uniquement** (choix produit). L'anglais couvre toute l'interface utilisateur ; l'Admin Center (outil interne) reste en français. Un test vérifie que chaque clé française des espaces de noms publics a son équivalent anglais avec les mêmes variables.
- **Glisser-déposer tactile** : HTML5 DnD n'existe pas sur mobile ; le réordonnancement s'y fait avec les boutons Monter / Descendre.
- **Logo** : provisoire (voir `AUDIT.md`).
- **Tarifs** : indicatifs.
- **Dépendance** : `lucide-react` fournit les icônes ; les logos de marques sont des glyphes simplifiés internes (à remplacer par les assets officiels si besoin).
- **Tests E2E** : utilisent Microsoft Edge installé localement (`channel: 'msedge'`) ; sur CI Linux, installer Chromium (`npx playwright install chromium`) et adapter `playwright.config.ts`.
- Les performances ont été mesurées via la taille des bundles (voir README), pas via Lighthouse sur appareil réel.

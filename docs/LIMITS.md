# Limites connues

Ce document est volontairement sans fard : il distingue ce qui **fonctionne réellement** de ce qui dépend d'un compte fournisseur ou d'un choix produit à venir.

## Fonctionne réellement (interface + serveur + base)
- Comptes : inscription / connexion par **e-mail + mot de passe** et par **téléphone (code WhatsApp/SMS)**, vérification de l'e-mail, mot de passe oublié, sessions révocables.
- Pages : brouillon et publication enregistrés en base, concurrence optimiste, pseudonymes uniques et réservés, limites d'offre, images stockées en base, page publique `/:username` lue en base.
- Audience : vues et clics enregistrés par le serveur (sans cookie ni IP), canaux (`?src=`), appareils, pays (en-tête du CDN), comparaison à la période précédente.
- Modération : signalements de visiteurs, décisions (classer, avertir par e-mail, suspendre/réactiver une page), suspension de compte (sessions révoquées), badge « Profil vérifié », journal d'audit.
- Admin Center : 14 rubriques lues en base, rôles et permissions appliqués par le serveur ; flux temps réel (SSE) alimenté par la base.
- Sécurité, intégrité et rétention : voir [SECURITY.md](SECURITY.md). Tests : serveur sur PostgreSQL réel, interface contre le vrai serveur, e2e, axe-core.

## Nécessite vos comptes fournisseurs (le code est prêt, rien n'est simulé)
- **E-mails** (accueil, vérification, réinitialisation, notifications) : SMTP (Gmail : ~500 e-mails/jour, expéditeur = adresse du compte) ou Resend. Sans fournisseur l'API répond `mail_unavailable`.
- **Codes par SMS** : SMS8.io (téléphone Android appairé, crédits SMS8, téléphone à garder en ligne ; pas de WhatsApp) ou Twilio (WhatsApp + SMS, modèle « Authentication » approuvé). Sans fournisseur : `otp_unavailable` et l'interface masque la connexion par téléphone.

## Choix produit : volontairement non fournis
- **Aucune transaction financière sur la plateforme.** Paiements d'abonnement : `unavailable / payments_not_connected` ; les offres payantes s'attribuent manuellement (`npm run admin -- set-plan`).
  La boutique ouvre une conversation WhatsApp ; les moyens de paiement sont seulement affichés. Les tables `payments` / `subscriptions` sont prêtes pour un futur prestataire (Mobile Money, carte).
- **Pas encore implémentés côté compte** : changement de mot de passe connecté, authentification à deux facteurs, suppression de compte, domaine personnalisé, équipe — affichés « bientôt ».
  Les tickets d'assistance (table + lecture admin) n'ont pas encore de formulaire de création côté utilisateur.
- Paramètres de l'Admin Center (rubrique *Paramètres*) : en lecture seule.

## Limites techniques
- **Aperçus de liens (Open Graph) sur WhatsApp / réseaux** : les robots n'exécutent pas JavaScript. Un vrai aperçu de `/:username` requiert un rendu serveur / edge (route dédiée générant les balises) — chantier distinct.
- **Mise en cache** : la page publique est mise en cache par le CDN 10 s (+30 s de revalidation) : une suspension, un badge ou une dépublication peuvent mettre jusqu'à ~40 s à se refléter pour les visiteurs.
- **Renommer son pseudonyme** libère immédiatement l'ancienne adresse (pas de redirection, pas de réservation temporaire).
- **Temps réel** : flux SSE reconnecté toutes les ~50 s (limite d'une fonction serverless) ; latence ~3 s.
- **Images** dans PostgreSQL (1,5 Mo, 40 Mo/compte) : suffisant au démarrage ; prévoir un stockage objet au-delà.
- **Statistiques** calculées à la lecture sur `page_events` : prévoir une table de cumul quotidien à grande échelle.
- **Données de présentation du site public** : la landing montre des maquettes illustratives (profil d'exemple, graphique « Illustration ») clairement étiquetées ; ce ne sont pas des données de la plateforme.
- **Langues : français et anglais uniquement.** L'Admin Center (outil interne) reste en français.
- **Tests E2E** : Edge en local (`channel: 'msedge'`), Chromium en CI (`PW_CHANNEL=chromium`).
- **Logo** provisoire ; **tarifs** indicatifs.

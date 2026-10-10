# Architecture front-end de 1Link

> Périmètre : **front-end uniquement**. Aucune ligne de backend. Les données de démonstration sont isolées et signalées dans l'interface.

## Stack et choix

| Besoin | Choix | Pourquoi |
|---|---|---|
| UI | React 19 + TypeScript strict | Écosystème, typage de bout en bout (blocs, thèmes, API) |
| Build | Vite | Découpage de code natif, builds rapides |
| Routage | React Router (data router, routes `lazy`) | Code splitting par route, `useBlocker` pour les modifications non enregistrées |
| État partagé | Zustand (3 stores : `session`, `editor`, `ui`) | 1 Ko, sélecteurs fins, historique d'édition simple. Pas de store global « fourre-tout » |
| Styles | CSS pur + tokens (variables CSS) | Zéro dépendance runtime, thème sombre et page publique pilotés par variables |
| Graphiques | SVG maison (`components/charts`) | Aucune lib lourde ; ~6 Ko ; accessibles (table équivalente, clavier) |
| Icônes | `lucide-react` (imports nommés) + glyphes de marques internes | Tree-shaking ; lucide ne fournit plus les logos de marques |
| QR code | `qrcode-generator`, chargé à la demande | Vrai QR scannable, hors bundle initial |
| i18n | Module maison typé (`src/i18n`) | Clés vérifiées à la compilation, dictionnaires par espace de noms chargés à la demande |
| Tests | Vitest + Testing Library, Playwright (Edge) + axe-core | Voir README |

Polices : Plus Jakarta Sans (globale), Manrope et Fraunces (chargées uniquement quand une page les utilise).

## Organisation du code

```
src/
├── app/
│   ├── configuration/   env, chemins (paths), offres (plans) — sources uniques
│   ├── layouts/         Marketing, Auth, AppShell (dashboard/admin), en-têtes
│   └── routes/          router (lazy), guards, pages d'erreur
├── components/
│   ├── ui/              design system : Button, forms, overlays, DataTable, Tabs, Toast…
│   ├── charts/          TimeChart, DonutChart, HBarList, Sparkline
│   └── forms/           SchemaForm (formulaires générés depuis un schéma)
├── design-system/styles tokens.css (couleurs, typo, espacements, ombres, z-index, mouvement…), base, composants
├── features/
│   ├── page-engine/     ★ cœur : registre de blocs, rendu, apparence/thèmes, documents, exemples
│   ├── categories/      configuration des 5 catégories
│   ├── marketing/ authentication/ onboarding/ dashboard/ profile-editor/
│   ├── appearance/ public-profile/ analytics/ subscriptions/ settings/ sharing/ admin/
├── hooks/  i18n/  models/  state/  utilities/
└── services/
    ├── api/types.ts     CONTRAT de la couche de données (interfaces)
    ├── api/http/        implémentation de production (fetch, SSE)
    ├── api/demo/        adaptateurs de démonstration (localStorage, données fictives)
    └── media.ts         envoi d'images
```

Règle de dépendance : `features/*` → `components`, `services/api` (interfaces), `state`, `models`. Jamais l'inverse. Les composants d'interface n'appellent jamais `fetch` : ils passent par `api.*` et le hook `useResource` (états chargement / erreur / succès).

## Décisions importantes

### 1. Couche de données remplaçable (`services/api`)
`Api` regroupe `auth`, `page`, `analytics`, `billing`, `admin`, `realtime`. Deux implémentations :
- `http/` — REST + cookies de session httpOnly (`credentials: 'include'`) + SSE. **Les chemins d'endpoints sont des hypothèses** à valider avec le backend ; seuls ces fichiers changent.
- `demo/` — base `localStorage` isolée, jeux de données déterministes (PRNG), latence simulée.

Le choix se fait **au build** (`VITE_API_MODE`) via `import.meta.env` directement dans `services/api/index.ts` : un build `http` n'embarque aucun code de démonstration (vérifié par `npm run verify:http-build`).

Honnêteté des opérations : le démo ne simule jamais un paiement réussi (`changePlan` → `unavailable`), ne présente pas une publication comme réelle (`PublishResult.mode = 'demo'`, message explicite), et signale toute décision de modération comme locale. Les statistiques portent `source: 'demo' | 'live'` et affichent un badge « Démonstration ».

### 2. Autorité du serveur
Le front reflète les permissions envoyées par l'API (`Session.permissions`, `Session.entitlements`). Les guards (`RequireAuth`, `RequireAdminAccess`, `RequireSection`) ne servent qu'à l'expérience. La limite de blocs, la vérification de l'e-mail, l'unicité du pseudonyme sont **aussi** appliquées par l'adaptateur démo pour reproduire le comportement attendu du backend, et l'UI gère leurs erreurs.

### 3. Moteur de pages (`features/page-engine`)
- **Blocs** : `models/blocks.ts` (types) + `blocks/registry.ts` (définition = schéma de champs + création + résumé + composant de rendu). Le formulaire d'édition et la validation sont **générés** depuis le schéma (`SchemaForm`, `validateFields`) : ajouter un bloc ne demande ni nouveau formulaire ni logique de validation.
- **Apparence** : `AppearanceConfig` typé → `appearanceToStyle()` produit des variables `--pg-*`. Thèmes = données (`themes.ts`). Le contraste WCAG est calculé (`utilities/color.ts`).
- **Rendu unique** : `PageRenderer` sert la page publique, l'aperçu de l'éditeur, l'apparence, l'onboarding, la landing et l'authentification. Mise en page par *container queries* (le rendu s'adapte à la largeur du cadre, pas de l'écran).
- Sécurité : `safeHref` refuse tout protocole hors http(s)/mailto/tel ; vidéos « clic pour charger » (aucune iframe tierce avant action).

### 4. Éditeur
`state/editor.ts` : copie de travail `doc`, dernier état confirmé `saved`, historique (annuler/rétablir, fusion des saisies rapides), `dirty`, `save.state`. Un échec d'enregistrement garde la copie de travail. `useBlocker` + `beforeunload` protègent les modifications non enregistrées. Réordonnancement : boutons (clavier/mobile) + glisser-déposer HTML5 (desktop), animation FLIP (`transform` uniquement).

### 5. Catégories
`features/categories/config.ts` : thème initial, blocs suggérés, champs d'activité (réutilisent le schéma de champs), raccourcis du dashboard, recommandations. Ajouter une catégorie = id + entrée + libellés.

### 6. Admin Center
Layout séparé (`AdminLayout`, barre latérale sombre), navigation pilotée par les permissions de lecture, une route par rubrique via `RequireSection`. Les tableaux partagent `useAdminList` + `DataTable` (tri, filtres, pagination serveur simulée). Temps réel via `RealtimeAdapter` (SSE prêt ; démo explicite sur action manuelle).

### 7. Performance
Routes et dictionnaires chargés à la demande, polices à la demande, QR à la demande, aucune bibliothèque de graphiques. Animations : `transform`/`opacity`, respect de `prefers-reduced-motion`.

### 8. i18n
`t('ns.chemin.clé')` typé sur le français ; l'anglais couvre toute l'interface utilisateur (l'Admin Center reste en français, repli automatique). `src/i18n/i18n.test.ts` impose la parité des clés et des variables. Dates/nombres/devises via `Intl` (`utilities/format.ts`), fuseau d'affichage par défaut `Africa/Conakry`, devise et tarifs dans `app/configuration/plans.ts`.

### 9. Systèmes ajoutés après la première version
- **Programmation** : `page-engine/schedule.ts` (`scheduleState`, `isBlockLive`, `nextScheduleChange`). `PageRenderer` filtre les blocs et se réveille à la prochaine échéance ; l'éditeur marque les blocs « programmé / expiré ».
- **Rendez-vous** : bloc `booking` (créneaux hebdomadaires) → message WhatsApp pré-rempli. Aucune réservation n'est confirmée par 1Link.
- **Multi-devises** : `blocks/money.ts` ; le taux est saisi par le vendeur et affiché comme indicatif. Aucune conversion ni transaction.
- **Suivi par canal / affiche** : `utilities/tracking.ts` (`?src=`, liste blanche de sources), `sharing/ShareDialog` et `sharing/PrintPage` (CSS d'impression, A4).
- **Vérification de profil** : `models/verification.ts`, côté utilisateur (`VerificationCard`) et côté admin (`VerificationsPanel`). Le badge est une donnée du serveur ; `withServerVerified` empêche l'interface de se l'attribuer.
- **Authentification par téléphone** : `utilities/phone.ts` (E.164, pays d'Afrique de l'Ouest et diaspora), `AuthApi.requestOtp / verifyOtp`, composant `PhoneAuth`. `isContactVerified(user)` (e-mail **ou** téléphone) remplace `emailVerified` pour autoriser la publication. L'adaptateur démo (`demo/otp.ts`) simule les garde-fous (TTL, essais, renvoi, plafond horaire) en mémoire uniquement ; le serveur réel doit les appliquer et ne jamais révéler l'existence d'un compte avant la preuve de possession.

## Ajouter…
- **un type de bloc** : `models/blocks.ts` → définition dans `registry.ts` → libellés `editor.blocks.<type>.*` (un test vérifie la traduction de chaque champ).
- **un thème** : entrée dans `appearance/themes.ts` + libellé `common.themes.<id>`.
- **une catégorie / un rôle / un plan** : voir `categories/config.ts`, `models/auth.ts` (+ `AdminLayout`), `app/configuration/plans.ts`.
- **une rubrique admin** : entrée `NAV` dans `AdminLayout`, section dans `models/auth.ts`, route dans `router.tsx`, page dans `features/admin/pages`.
- **une langue** : dictionnaires `src/i18n/<lang>/*` + entrée dans `LOCALES`.
- **une route de premier niveau** : l'ajouter à `RESERVED_USERNAMES` (collision avec `/:username`).

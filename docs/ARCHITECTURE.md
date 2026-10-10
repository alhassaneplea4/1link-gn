# Architecture de 1Link

> Application complète : interface React, **API Hono** (`server/`, fonction Vercel) et **PostgreSQL** (schéma Drizzle, migrations SQL versionnées).
> Toutes les données viennent de la base ; le navigateur ne garde que des préférences d'affichage (langue, thème, mode économe).
> Déploiement : [DEPLOYMENT.md](DEPLOYMENT.md) · sécurité : [SECURITY.md](SECURITY.md) · routes : [API.md](API.md).

## Vue d'ensemble

```
src/  (React 19, Vite)                      server/  (Hono, TypeScript, ESM)                      PostgreSQL
 features/* → services/api (contrat)  ──►   routes/ → services/ → db/schema.ts (Drizzle)   ──►   tables, contraintes, index
 state (zustand) : session, éditeur           validation/ (zod)   lib/ (crypto, débit, e-mail, OTP, droits)   drizzle/*.sql
api/index.ts  ← point d'entrée Vercel : createRuntimeApp() (pool PostgreSQL réutilisé entre les requêtes)
```

Une seule fonction `createApp(deps)` assemble l'API ; `deps` (base, horloge, e-mail, SMS) est **injecté** : la production, `npm run dev`, les tests serveur,
les tests d'interface et les tests e2e exécutent exactement le même code, sur un vrai PostgreSQL.

### Modèle de données (voir `server/db/schema.ts`)
`users` (e-mail ou téléphone, rôle admin, statut, badge vérifié) · `sessions` (hash du jeton) · `auth_tokens` · `otp_codes` · `rate_limits` ·
`pages` (brouillon JSONB + instantané publié JSONB + `version`) · `media` · `page_events` (vues/clics) · `reports` · `verifications` ·
`subscriptions` · `payments` · `support_tickets` · `audit_logs` · `security_events` · `activity_events` · `app_errors`.

## Stack et choix

| Besoin | Choix | Pourquoi |
|---|---|---|
| UI | React 19 + TypeScript strict | Écosystème, typage de bout en bout (blocs, thèmes, API) |
| Build | Vite | Découpage de code natif, builds rapides |
| Routage | React Router (data router, routes `lazy`) | Code splitting par route, `useBlocker` pour les modifications non enregistrées |
| État partagé | Zustand (`session`, `editor`, `ui`) | 1 Ko, sélecteurs fins, historique d'édition simple |
| Styles | CSS pur + tokens (variables CSS) | Zéro dépendance runtime, thème sombre et page publique pilotés par variables |
| Graphiques | SVG maison (`components/charts`) | Aucune lib lourde ; accessibles (table équivalente, clavier) |
| Icônes | `lucide-react` (imports nommés) + glyphes de marques internes | Tree-shaking |
| QR code | `qrcode-generator`, chargé à la demande | Vrai QR scannable, hors bundle initial |
| i18n | Module maison typé (`src/i18n`) | Clés vérifiées à la compilation, dictionnaires par espace de noms chargés à la demande |
| API | Hono 4 sur une fonction Vercel (Node 24, Fluid compute) | Standards Web, démarrage rapide, testable sans serveur HTTP |
| Base de données | PostgreSQL 17 (Neon en production, binaire embarqué en local et en test) + Drizzle ORM + `pg` | Intégrité relationnelle (clés, CHECK, index uniques), JSONB pour le contenu des pages, portable (Neon, Supabase, RDS) |
| Validation | zod 4 | Contrat d'entrée strict côté serveur |
| Tests | Vitest (serveur : SQL réel ; interface : `fetch` redirigé vers le vrai serveur), Playwright + axe-core | Voir README |

Polices : Plus Jakarta Sans (globale), Manrope et Fraunces (chargées uniquement quand une page les utilise).

## Organisation du code

```
src/                     interface (voir ci-dessous)
server/
├── app.ts               createApp(deps) : middlewares, routes, gestion d'erreurs
├── config.ts            lecture et validation de l'environnement (échec rapide en production)
├── context.ts           types partagés (Deps, AuthContext, HonoEnv)
├── middleware.ts        contexte de requête, en-têtes de sécurité, garde CSRF, authentification, permissions
├── routes/              auth · me · public · admin · system (HTTP fin : lire, valider, appeler un service)
├── services/            accounts · sessions · pages · engagement · analytics · verification · admin · media (règles métier, SQL)
├── validation/          schémas zod (auth, pages et blocs)
├── lib/                 crypto (scrypt, HMAC), ratelimit (SQL atomique), access (rôles, offres), mailer, otp-sender, lists (admin), audit…
├── db/                  schema.ts (Drizzle) · client.ts (pool pg) · migrate.ts
├── runtime.ts           dépendances réelles (Vercel / local)
├── testing/             PostgreSQL embarqué, harnais, fixtures — JAMAIS importés par le code de production
└── tests/               tests serveur (SQL réel)
api/index.ts         entrée Vercel
drizzle/                 migrations SQL versionnées
scripts/                 dev, migrate, admin (CLI), verify-vercel
```

Règle côté serveur : **imports relatifs avec extension `.js`**, jamais l'alias `@/` (Vercel exécute l'ESM natif ; `server/tests/imports.test.ts` le vérifie).
Seuls des modules « feuilles » de `src/` (modèles, validateurs, plans, téléphone) sont partagés avec le serveur : une seule définition des types, des énumérations et des règles.

```
src/
├── app/                 configuration (env, chemins, offres), layouts, routes (lazy, guards)
├── components/          ui (design system), charts, forms
├── design-system/       tokens.css et styles de base
├── features/            page-engine ★ · categories · marketing · authentication · onboarding · dashboard · profile-editor ·
│                        appearance · public-profile · analytics · subscriptions · settings · sharing · admin
├── hooks/ i18n/ models/ state/ utilities/
└── services/api/        types.ts (CONTRAT) · http/ (client fetch, SSE) · media.ts
```

Règle de dépendance : `features/*` → `components`, `services/api` (interfaces), `state`, `models`. Jamais l'inverse. Les composants n'appellent jamais `fetch` : ils passent par `api.*` et le hook `useResource` (états chargement / erreur / succès).

## Décisions importantes

### 1. Couche de données (`services/api`) et serveur
`Api` regroupe `auth`, `page`, `analytics`, `billing`, `admin`, `realtime`. L'interface ne dépend que de ces interfaces (`types.ts`) ; l'implémentation `http/` appelle l'API du serveur.
**Il n'existe plus d'adaptateur local ni de données d'exemple.** Honnêteté des opérations : aucun paiement n'est simulé (`changePlan` → `unavailable / payments_not_connected`),
aucun e-mail ni code n'est « envoyé » sans fournisseur (`mail_unavailable`, `otp_unavailable`), les chiffres de l'Admin Center sont ceux de la base (vides tant qu'il n'y a pas d'activité).

### 2. Autorité du serveur
Permissions, droits d'offre, limite de blocs, vérification de l'e-mail, unicité du pseudonyme, badge vérifié et modération sont **décidés et appliqués par le serveur**
(`server/lib/access.ts`, services) ; les guards de l'interface ne servent qu'à l'expérience. Les écritures de page sont protégées par une **version** (concurrence optimiste) :
deux onglets ou appareils ne s'écrasent jamais (`409 version_conflict` → l'éditeur propose de recharger la version enregistrée).

### 3. Moteur de pages (`features/page-engine`)
- **Blocs** : `models/blocks.ts` (types) + `blocks/registry.ts` (définition = schéma de champs + création + résumé + composant de rendu). Le formulaire d'édition et la validation côté interface sont **générés** depuis le schéma (`SchemaForm`, `validateFields`) ; le serveur revalide avec `server/validation/page.ts` (même énumérations, mêmes limites — le typage force à tenir les deux à jour).
- **Apparence** : `AppearanceConfig` typé → `appearanceToStyle()` produit des variables `--pg-*`. Thèmes = données (`themes.ts`). Le contraste WCAG est calculé (`utilities/color.ts`).
- **Rendu unique** : `PageRenderer` sert la page publique, l'aperçu de l'éditeur, l'apparence, l'onboarding, la landing et l'authentification. Mise en page par *container queries*.
- Sécurité : `safeHref` refuse tout protocole hors http(s)/mailto/tel ; vidéos « clic pour charger » (aucune iframe tierce avant action).

### 4. Éditeur
`state/editor.ts` : copie de travail `doc`, dernier état confirmé `saved`, historique (annuler/rétablir, fusion des saisies rapides), `dirty`, `save.state`. Un échec d'enregistrement garde la copie de travail ;
un conflit de version est signalé sans rien écraser. `useBlocker` + `beforeunload` protègent les modifications non enregistrées.

### 5. Assistant de configuration (onboarding)
La saisie vit en mémoire et est synchronisée (anti-rebond 800 ms) avec `users.onboarding_state` : reprise sur n'importe quel appareil, rien dans `localStorage`. Les données revenant du serveur sont revalidées (`restoreOnboarding`).

### 6. Admin Center
Layout séparé, navigation pilotée par les permissions, une route par rubrique via `RequireSection`. Les listes (`DataTable`) délèguent recherche, filtres, tri et pagination au serveur
(`server/lib/lists.ts` : listes blanches de colonnes, valeurs liées). Le flux temps réel est un SSE lu depuis la base.

### 7. Performance
Routes et dictionnaires chargés à la demande, polices et QR à la demande, aucune bibliothèque de graphiques. Côté serveur : pool de 3 connexions par instance sur le pooler Neon, index sur toutes les requêtes de liste/audience, pages publiques mises en cache 10 s par le CDN.

### 8. i18n
`t('ns.chemin.clé')` typé sur le français ; l'anglais couvre toute l'interface utilisateur (l'Admin Center reste en français). `src/i18n/i18n.test.ts` impose la parité des clés. La langue de l'interface est envoyée au serveur (`Accept-Language`) pour les e-mails.

### 9. Systèmes fonctionnels
- **Programmation** : `page-engine/schedule.ts`. **Rendez-vous** : bloc `booking` → message WhatsApp. **Multi-devises** : `blocks/money.ts` (taux saisi par le vendeur). **Suivi par canal / affiche** : `utilities/tracking.ts`, `sharing/`.
- **Vérification de profil** : demande (`/me/verification`), décision admin, badge porté par `users.verified` et appliqué par le serveur à la lecture.
- **Authentification par téléphone** : `utilities/phone.ts`, `PhoneAuth`, `server/services/accounts.ts` (codes en HMAC, essais, plafonds). `isContactVerified(user)` (e-mail **ou** téléphone) autorise la publication.

## Ajouter…
- **une route d'API** : schéma zod dans `server/validation/`, logique dans `server/services/`, route dans `server/routes/`, test dans `server/tests/` ; contrat dans `services/api/types.ts` + `http/index.ts`.
- **une table ou colonne** : `server/db/schema.ts` → `npm run db:generate` → relire le SQL de `drizzle/` → test (voir DEPLOYMENT §5 pour la compatibilité).
- **un type de bloc** : `models/blocks.ts` → définition dans `registry.ts` → schéma dans `server/validation/page.ts` (le typage l'exige) → libellés `editor.blocks.<type>.*`.
- **un thème** : entrée dans `appearance/themes.ts` + libellé `common.themes.<id>`.
- **une catégorie / un rôle / un plan** : `categories/config.ts` ; `models/auth.ts` + `server/lib/access.ts` ; `app/configuration/plans.ts` (partagé avec le serveur).
- **une rubrique admin** : entrée `NAV` dans `AdminLayout`, section dans `models/auth.ts`, droits dans `server/lib/access.ts`, route serveur + route `router.tsx` + page dans `features/admin/pages`.
- **une langue** : dictionnaires `src/i18n/<lang>/*` + entrée dans `LOCALES`.
- **une route de premier niveau** : l'ajouter à `RESERVED_USERNAMES` (collision avec `/:username`).

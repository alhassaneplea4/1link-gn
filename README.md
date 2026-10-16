# 1Link — Un lien, pour toute votre présence.

Plateforme de présence numérique **1Link** : site public, authentification (e-mail ou téléphone), onboarding par catégorie, dashboard, éditeur de page par blocs, éditeur d'apparence, pages publiques, statistiques et **Admin Center** — avec un **vrai backend** et une **vraie base PostgreSQL**.

> **Toutes les données viennent de la base de données.** Il n'y a plus de mode démonstration, de stockage local de données ni de jeu d'exemple : la base de production démarre **vide**. Le navigateur ne conserve que des préférences d'affichage (langue, thème, mode économe).

```
React 19 + Vite  ──►  /api (Hono, fonction Vercel Node 24)  ──►  PostgreSQL 17 (Neon)
   interface              sessions httpOnly · validation zod · Drizzle ORM     migrations SQL versionnées
```

## Démarrer (une commande)

```bash
npm install
npm run dev      # PostgreSQL réel embarqué (.data/), API (8787) et interface (http://localhost:5173)
```

Aucune variable à définir en local. Les e-mails et codes WhatsApp/SMS sont affichés dans le terminal (fournisseur « développement », jamais actif en production).
Premier administrateur : `npm run admin -- create-admin --email moi@exemple.com --name "Moi"` (avec `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/onelink`).

## Déployer sur Vercel

Voir **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** : base Neon, variables d'environnement, migrations, premier administrateur, Resend, Twilio, cron, sauvegardes, retour arrière.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Base + API + interface en local |
| `npm run typecheck` | TypeScript strict : interface **et** serveur |
| `npm test` | Vitest : 66+ tests serveur (SQL réel) et tests d'interface qui parlent au **vrai** serveur |
| `npm run e2e` | Playwright (desktop + mobile, axe-core) contre PostgreSQL + API + interface réels |
| `npm run verify:vercel` | Prouve que la fonction Vercel démarre en ESM natif en configuration de production |
| `npm run db:generate` / `db:migrate` | Génère / applique les migrations SQL (`drizzle/`) |
| `npm run admin -- …` | `create-admin`, `set-role`, `set-plan` |

## Ce que contient le dépôt

| Dossier | Contenu |
|---|---|
| `src/` | Interface (React, i18n fr/en, éditeur de blocs, Admin Center) |
| `server/` | API Hono : routes, services, validation zod, schéma Drizzle (`db/schema.ts`), tests serveur |
| `api/index.ts` | Point d'entrée Vercel |
| `drizzle/` | Migrations SQL versionnées |
| `e2e/` | Tests de bout en bout |
| `docs/` | Déploiement, architecture, API, sécurité, limites |
| `.claude/skills/` | Consignes de travail du projet pour Claude Code (backend, base de données, déploiement, tests) |

## Routes de l'interface

| Espace | Routes |
|---|---|
| Public | `/` · `/features` · `/pricing` · `/faq` |
| Auth | `/auth/login` · `register` · `forgot-password` · `reset-password` · `verify-email` · `sign-out` · `signed-out` · `session-expired` |
| Onboarding | `/onboarding` |
| Dashboard | `/dashboard` · `page` · `content` · `appearance` · `analytics` · `subscription` · `settings` · `security` · `print` |
| Admin Center | `/admin` · `realtime` · `users` (+ `/:id`) · `profiles` · `analytics` · `subscriptions` · `payments` · `moderation` · `reports` · `support` · `security` · `logs` · `system` · `settings` |
| Page publique | `/:username` (noms réservés : `RESERVED_USERNAMES`) · `/403` · 404 |

## Fonctions orientées marché guinéen / africain
Boutique **commande WhatsApp** (aucune transaction sur la plateforme), moyens de paiement affichés (Orange Money, MTN MoMo…), carte de contact **vCard**, **mode économe en données**,
connexion par **téléphone** (WhatsApp/SMS), **vérification en deux étapes** (SMS, e-mail, application d'authentification, codes de secours), inscription par **code e-mail** sans mot de passe, offres **Free / Basique / Pro / Business** avec essais, et mot de passe oublié par SMS, prix multi-devises pour la diaspora, prise de rendez-vous par WhatsApp, programmation de blocs, affiche et cartes imprimables avec liens de suivi par canal, badge **Profil vérifié**, interface en **français et anglais**.

## Documentation
- [Déploiement Vercel + PostgreSQL](docs/DEPLOYMENT.md)
- [Architecture et décisions](docs/ARCHITECTURE.md)
- [API HTTP](docs/API.md)
- [Sécurité des données](docs/SECURITY.md)
- [Limites connues](docs/LIMITS.md)
- [Audit initial (Phase 0)](docs/AUDIT.md)

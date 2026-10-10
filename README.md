# 1Link — Un lien, pour toute votre présence.

Front-end de la plateforme de présence numérique **1Link** : site public, authentification, onboarding par catégorie, dashboard, éditeur de page par blocs, éditeur d'apparence, page publique, analytics et **Admin Center**.

> **Périmètre : front-end uniquement.** Sans backend, l'application tourne en **mode démonstration** (données locales et fictives, clairement signalées). La connexion à une vraie API se fait en implémentant/validant `src/services/api/http` — voir [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Démarrer

```bash
npm install
npm run dev            # http://localhost:5173 (mode démonstration)
npm run build          # typecheck + build de production
npm run preview        # sert le build
```

Variables (voir `.env.example`) : `VITE_API_MODE=demo|http`, `VITE_API_BASE_URL`, `VITE_REALTIME_URL`, `VITE_PUBLIC_DOMAIN`.

### Comptes de démonstration
Écran de connexion → boutons « Comptes d'essai » (aucun mot de passe n'est vérifié) :

| Compte | Pour voir… |
|---|---|
| Créatrice · Pro | Dashboard « créateur », page publiée (`/mariama`), éditeur, analytics |
| Super Admin / Admin / Moderator / Support / Analyst / Finance | Admin Center adapté aux permissions de chaque rôle |
| Nouveau compte (`/auth/register`) | Onboarding complet, état « e-mail non vérifié », vérification simulée |

Pages publiques d'états : `/mariama` (publiée), `/brouillon-demo`, `/compte-suspendu`, `/indisponible-demo`, `/n-importe-quoi` (introuvable).

## Nouveautés orientées marché guinéen / africain
- Boutique **commande WhatsApp** (sans paiement sur la plateforme) et **moyens de paiement** affichés (Orange Money, MTN MoMo, banque…).
- **Enregistrer mon contact** (vCard), **mode économe en données**, **signalement** d'une page par un visiteur.
- Interface en **français et anglais**.

## Routes

| Espace | Routes |
|---|---|
| Public | `/` · `/features` · `/pricing` · `/faq` |
| Auth | `/auth/login` · `register` · `forgot-password` · `reset-password` · `verify-email` · `sign-out` · `signed-out` · `session-expired` |
| Onboarding | `/onboarding` |
| Dashboard | `/dashboard` · `page` · `content` · `appearance` · `analytics` · `subscription` · `settings` · `security` |
| Admin Center | `/admin` · `realtime` · `users` (+ `/:id`) · `profiles` · `analytics` · `subscriptions` · `payments` · `moderation` · `reports` · `support` · `security` · `logs` · `system` · `settings` |
| Page publique | `/:username` (noms réservés : `RESERVED_USERNAMES`) · `/403` · 404 |

## Qualité

```bash
npm run typecheck           # TypeScript strict
npm test                    # Vitest : unitaires, composants, intégration (routeur en mémoire)
npm run e2e                 # Playwright (Edge) : desktop + mobile, y compris audit axe-core
npm run verify:http-build   # prouve qu'un build HTTP n'embarque aucun code de démonstration
```

Couverture : validation (couleurs, contrastes WCAG, liens sûrs, pseudonymes réservés), registre de blocs (rendu + traductions complètes), store de l'éditeur (historique, limites, échec d'enregistrement), composants (focus de modale, onglets, menu, tableau, pagination), onboarding par catégorie, guards et rôles, parcours E2E (navigation publique, inscription → onboarding, édition de blocs, apparence, aperçu, page publique, analytics, abonnement, admin, états d'erreur) sur deux tailles d'écran.

## Documentation
- [Architecture et décisions](docs/ARCHITECTURE.md)
- [Audit initial (Phase 0)](docs/AUDIT.md)
- [Limites connues et mode démonstration](docs/LIMITS.md)

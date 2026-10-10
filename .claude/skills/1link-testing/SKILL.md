---
name: 1link-testing
description: Écrire et lancer les tests de 1Link (serveur sur PostgreSQL réel, interface contre le vrai serveur, e2e Playwright, axe). À utiliser pour ajouter un test, diagnostiquer un échec ou préparer une validation avant commit.
---

# Tests

Principe : **aucun double de l'API**. Tout test d'interface ou e2e parle au vrai serveur et à un vrai PostgreSQL jetable.

| Niveau | Où | Comment |
|---|---|---|
| Serveur | `server/tests/*.test.ts` | `createTestApp()` → app complète + base clonée du modèle migré ; `app.client()` = navigateur avec cookies ; `app.clock.advance(ms)` ; `app.mailer.outbox`, `app.otp.sent` |
| Interface | `src/**/*.test.tsx` | `useBackend()` (`src/test/backend.ts`) redirige `fetch` vers le vrai serveur, vide les tables avant chaque test, fixe une IP par test. Comptes : `createUser(backend.app.db, …)` puis connexion par le formulaire (`loginThroughForm`) |
| e2e | `e2e/*.spec.ts` | `global-setup` démarre PostgreSQL + API (port 8788) ; `vite preview` (4173) proxifie `/api` ; fixtures `seed.creator()/admin(role)/report()/views()` créent les comptes **dans la base** ; `signIn(page, compte)` ; `latestMail(request, email)` lit la boîte d'envoi simulée (`/api/dev/outbox`) |
| Accessibilité | `e2e/a11y.spec.ts` | axe-core WCAG A/AA, 0 violation « serious/critical » |
| Packaging | `npm run verify:vercel` | la fonction démarre en ESM natif |

Commandes : `npm test` (tout Vitest), `npm run test:server`, `npx vitest run --project web <fichier>`, `npm run e2e` (`-g "motif"`, `--project desktop`), `npm run typecheck`.

## Conventions
- Un test = ses propres comptes (e-mail unique via `uniqueEmail()`), jamais de dépendance à l'ordre ou à un autre test.
- Limites de débit : une IP distincte par « navigateur » (`x-real-ip`) ; le e2e utilise `RATE_LIMIT_SCALE=1000`.
- Tester aussi l'abus : 401/403, entrées malformées, limites, réutilisation d'un jeton, injection dans recherche/tri.
- Preuves d'honnêteté : paiements `unavailable`, `mail_unavailable`/`otp_unavailable` sans fournisseur.

## Pièges
- Processus `postgres.exe` orphelins après interruption → `taskkill /F /IM postgres.exe`. Port 4173 occupé par un vieux `vite preview` → le tuer (la config n'en réutilise jamais).
- Premier démarrage de PostgreSQL embarqué ~5–10 s (initdb).
- `getByTitle` peut voir un cache navigateur si l'API envoie des en-têtes de cache : les réponses publiques doivent rester `max-age=0, must-revalidate`.
- Écrire les scripts de patch dans un `.mjs` ; si Windows répond `UNKNOWN: open …` à l'écriture d'un fichier qu'on vient de modifier, réessayer après 2 s.

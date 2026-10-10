---
name: 1link-vercel-deploy
description: Déployer 1Link sur Vercel avec Neon (variables d'environnement, migrations, cron, vérification de la fonction, retour arrière). À utiliser avant toute mise en production ou pour diagnostiquer un déploiement.
---

# Déploiement Vercel + Neon

Guide complet : `docs/DEPLOYMENT.md`. Un projet Vercel sert la SPA (`dist/`) et l'API (`api/[...path].ts`, Hono) sur la même origine. `vercel.json` : fonction (60 s, 1 Go), réécriture SPA qui **exclut `/api/`**, cron de maintenance, en-têtes de sécurité (CSP, HSTS…).

## Avant de pousser
1. `npm run typecheck && npm test` ; `npm run e2e` pour les changements d'interface/parcours.
2. `npm run verify:vercel` — compile `api/`+`server/` comme Vercel et démarre la fonction en **ESM natif** (échoue si un import relatif n'a pas `.js`, si l'alias `@/` s'est glissé, ou si la configuration de production est invalide).
3. Schéma modifié ? migration générée, relue, rétro-compatible (voir skill `1link-database`).

## Variables (Production ET Preview)
`DATABASE_URL` (pooled) · `APP_SECRET` (≥32) · `CRON_SECRET` · `APP_URL` · `MAIL_PROVIDER=resend`+`RESEND_API_KEY`+`MAIL_FROM` · `OTP_PROVIDER=twilio`+`TWILIO_*`. `MIGRATE_ON_BUILD=1` **uniquement en Production**. Interdits en production/preview (le serveur refuse de démarrer) : `MAIL_PROVIDER=dev`, `OTP_PROVIDER=dev`, `ENABLE_DEV_ROUTES`, `RATE_LIMIT_SCALE`.

## Après déploiement
`/api/health` → `ok` · inscription + e-mail reçu + publication d'une page · Admin Center → Système (base opérationnelle, fournisseurs « opérationnel ») · cron `/api/cron/maintenance` listé.

## Diagnostic
- `server_misconfigured` (500) : variable manquante/invalide → lire le message dans les logs Vercel (`Configuration invalide : …`).
- `ERR_MODULE_NOT_FOUND` : import sans `.js` (relancer `verify:vercel`).
- 429 inattendus derrière le CDN : vérifier que l'IP vient de `x-vercel-forwarded-for` (ne jamais faire confiance à `x-forwarded-for` hors Vercel).
- Retour arrière : Vercel → Deployments → Instant Rollback (la base reste compatible grâce à expand/contract).

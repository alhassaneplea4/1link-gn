---
name: 1link-backend-api
description: Ajouter ou modifier une route de l'API 1Link (Hono, server/). À utiliser pour tout endpoint, service métier, validation zod, erreur HTTP ou synchronisation du contrat avec l'interface.
---

# Ajouter ou modifier une route d'API

Architecture : `routes/` (HTTP fin) → `services/` (règles métier + SQL) → `db/schema.ts`. L'application est assemblée par `createApp(deps)` (`server/app.ts`) avec des dépendances injectées.

## Étapes
1. **Contrat d'abord** : types dans `src/models/*` (partagés avec l'interface) puis signature dans `src/services/api/types.ts`.
2. **Validation** : schéma zod dans `server/validation/` ; lire le corps avec `readJson(c, schema)` (renvoie `422 { message:'invalid', fields }`). Les clés inconnues sont retirées ; borner longueurs et tailles.
3. **Service** dans `server/services/` : reçoit `deps` (db, config, mailer, otp, now, defer) et `AuthContext`. Toute écriture multi-tables dans `deps.db.transaction`. Heure = `deps.now()` (jamais `new Date()` : les tests contrôlent l'horloge).
4. **Route** dans `server/routes/` : `requireAuth` / `optionalAuth` / `requireAnyPermission(...)` ; permissions définies dans `server/lib/access.ts` (jamais déduites du client).
5. **Erreurs** : `throw badRequest|unauthorized|forbidden|notFound|conflict|tooMany(...)` (`server/lib/errors.ts`). Le `message` est un **code stable** traduit par l'interface ; jamais de détail interne. Statuts : 401 non connecté, 403 interdit, 404, 409 conflit, 422 invalide, 429 limite, 503 fournisseur absent.
6. **Limites de débit** pour toute route sensible/anonyme : `enforce(deps.db, keyFor('portee', …), limite, fenêtreSec, deps.now())` (clés sans IP en clair).
7. **Client** : méthode dans `src/services/api/http/index.ts` (chemin identique à la route).
8. **Tests** : `server/tests/*.test.ts` avec `createTestApp()` (SQL réel) — cas nominal, 401/403, validation, conflit/limite, et au moins un test d'abus.
9. `npm run typecheck && npm test`.

## Règles
- Imports relatifs **avec `.js`**, jamais `@/` (ESM natif Vercel). Seuls des modules « feuilles » de `src/` sont importables côté serveur (`server/tests/imports.test.ts`).
- Réponses privées : `Cache-Control: no-store` (défaut). Public mis en cache : `Vercel-CDN-Cache-Control` seulement (jamais `s-maxage` + `stale-while-revalidate` côté navigateur).
- `db.execute(sql…)` renvoie les dates en **texte** ; les requêtes Drizzle typées renvoient des `Date`.
- Aucun secret ni donnée personnelle dans les journaux ; les erreurs 500 sont enregistrées dans `app_errors` sans détail renvoyé au client.
- Si une action envoie un e-mail/SMS : `deps.mailer` / `deps.otp` ; sans fournisseur → `mail_unavailable` / `otp_unavailable`, jamais de faux succès.

---
name: 1link-database
description: Modifier le schéma PostgreSQL de 1Link (Drizzle), générer et appliquer des migrations sans interrompre la production, créer le premier administrateur. À utiliser pour toute table, colonne, index, contrainte ou migration.
---

# Base de données (PostgreSQL + Drizzle)

Source de vérité : `server/db/schema.ts`. Migrations SQL versionnées : `drizzle/` (générées, relues, committées). Production : Neon (pooler `-pooler`, `sslmode=require`). Local/tests : PostgreSQL 17 réel embarqué.

## Modifier le schéma
1. Éditer `server/db/schema.ts` (ids texte préfixés via `newId('xxx')`, `timestamptz`, contraintes `check`, index uniques ; énumérations en `const` partagées avec le CHECK).
2. `npm run db:generate -- --name <description>` → **relire le SQL** dans `drizzle/` (pas de `DROP`/renommage destructif sans plan).
3. Adapter services, fixtures (`server/testing/fixtures.ts`), tests.
4. `npm test` (le gabarit de test applique TOUTES les migrations : une migration cassée fait échouer la suite).
5. Ne jamais modifier une migration déjà appliquée en production : en créer une nouvelle.

## Compatibilité sans interruption (expand → migrate → contract)
Pendant un déploiement l'ancien code tourne encore. Donc : ajouter colonnes **nullables ou avec défaut** et nouvelles tables d'abord ; basculer le code ; supprimer l'ancien plus tard dans un déploiement séparé. Index sur grosse table : `CREATE INDEX CONCURRENTLY` dans une migration dédiée.

## Appliquer
- Local : `npm run dev` migre automatiquement. Tests : le modèle de base est recréé à chaque session.
- Production : `MIGRATE_ON_BUILD=1` (environnement Production seulement) ou `DATABASE_URL=… npm run db:migrate` (verrou consultatif, idempotent).
- **Aucune donnée d'exemple** : la base de production démarre vide. Premier administrateur : `npm run admin -- create-admin --email … --name …`. Offre manuelle : `set-plan`. Rôle : `set-role`.

## Pièges
- Valeurs `timestamptz` issues de `db.execute(sql…)` : texte ; via les requêtes Drizzle : `Date`.
- `TRUNCATE … CASCADE` pour isoler les tests (`resetData`) ; ne jamais exécuter de fixtures sur une base réelle (le code de production n'importe pas `server/testing`).
- Les requêtes d'Admin Center passent par `server/lib/lists.ts` (colonnes en liste blanche, valeurs liées) : ne jamais interpoler une chaîne venant du client.
- Après un test interrompu : `taskkill /F /IM postgres.exe` (processus embarqués orphelins).

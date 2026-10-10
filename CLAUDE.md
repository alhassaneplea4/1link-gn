# 1Link — consignes pour Claude Code

Plateforme de présence numérique (« Un lien, pour toute votre présence. »), Guinée → Afrique francophone. React 19 + Vite (interface) · Hono sur Vercel (`server/`, `api/`) · PostgreSQL (Drizzle). Déploiement : Vercel + Neon.

## Règles de fond (à ne jamais enfreindre)
- **Toutes les données viennent de PostgreSQL.** Aucun mode démo, aucune donnée d'exemple dans le produit, aucune donnée utilisateur dans `localStorage` (seulement langue, thème, mode économe).
- **Honnêteté** : ne jamais simuler un paiement, un envoi d'e-mail/SMS ou une décision. Sans fournisseur : l'API répond `mail_unavailable` / `otp_unavailable`.
- **Pas de transaction financière sur la plateforme** (commande par WhatsApp, moyens de paiement affichés seulement).
- **Langues : français et anglais** uniquement (Admin Center : français).
- **Le serveur est l'autorité** (droits, limites d'offre, badge vérifié, unicité) ; l'interface ne fait que refléter.
- Après chaque modification : typecheck + tests → commit (message en français + ligne `Co-Authored-By`) → push sur `origin main`. Jamais de `--force`.

## Commandes
`npm run dev` · `npm run typecheck` · `npm test` · `npm run e2e` · `npm run verify:vercel` · `npm run db:generate` · `npm run db:migrate` · `npm run admin -- …`

## Pièges connus
- Code serveur : imports relatifs **avec `.js`**, jamais l'alias `@/` (ESM natif sur Vercel) — `server/tests/imports.test.ts`.
- Dates renvoyées par `db.execute(sql…)` : **texte** (pas `Date`) → utiliser `new Date(x)`.
- Les scripts de modification multi-lignes : les écrire dans un fichier `.mjs` (les heredocs/`node -e` abîment backslashes et apostrophes).
- Des `postgres.exe` orphelins après un test interrompu : `taskkill /F /IM postgres.exe`. Un vieux `vite preview` sur le port 4173 fausse les e2e.
- Skills du projet : `.claude/skills/` (backend, base de données, déploiement, tests, sécurité).

# Déploiement sur Vercel + PostgreSQL (Neon)

Un seul projet Vercel sert **l'interface** (fichiers statiques Vite) et **l'API** (fonction `api/index.ts`, application Hono)
sur la **même origine** : pas de CORS, cookies de session `httpOnly` + `SameSite=Lax`, une seule URL.

```
Navigateur ──► Vercel CDN ──► dist/ (SPA)                      /…
                          └─► Fonction Node 24 (Fluid compute)  /api/…  ──► PostgreSQL (Neon, pooled)
                                  └─► Resend (e-mails) · Twilio (WhatsApp/SMS)
```

## Versions et compatibilité

| Élément | Version | Pourquoi |
|---|---|---|
| Node.js | **24** (≥ 22 accepté, `engines` dans `package.json`) | Runtime Vercel et développement local identiques |
| PostgreSQL | **17** (compatible 15 → 18) | Neon propose 14 → 18 ; le schéma n'utilise aucune extension |
| `drizzle-orm` / `drizzle-kit` | 0.45.x / 0.31.x (paire fixée par `package-lock.json`) | Générateur de migrations et exécution du même schéma |
| `pg` | 8.x | Pilote standard, fonctionne avec Neon (pooler), Supabase, RDS… |
| `hono` | 4.x | Standards Web (`Request`/`Response`) : le même code tourne sur Vercel, Node et dans les tests |
| Interface | React 19, Vite 8, TypeScript 7 | inchangé |

`package-lock.json` est versionné : `npm ci` reproduit exactement l'arbre de dépendances testé en CI.
Le test `server/tests/imports.test.ts` et la commande `npm run verify:vercel` garantissent que la fonction démarre en **ESM natif**
(imports relatifs avec extension `.js`, pas d'alias `@/`), condition d'exécution sur Vercel.

## 1. Créer la base (Neon)

1. Créer un projet Neon, région **`aws-eu-central-1` (Francfort)** : la plus proche de l'Afrique de l'Ouest parmi les régions Neon.
2. Copier la chaîne **pooled** (hôte contenant `-pooler`) avec `?sslmode=require` → c'est `DATABASE_URL`.
   Le pooler (PgBouncer) évite de saturer la base quand Vercel multiplie les instances.
3. Recommandé : installer l'**intégration Neon ↔ Vercel**. Chaque déploiement *Preview* reçoit automatiquement sa propre
   **branche** de base (copie isolée) : les tests manuels n'altèrent jamais la production.
4. Activer la restauration à un instant donné (*point-in-time restore*) selon votre offre Neon : c'est votre sauvegarde.

## 2. Créer le projet Vercel

1. *Add New → Project*, importer le dépôt GitHub. Framework détecté : **Vite**. Aucune commande à saisir :
   `vercel.json` et le script `vercel-build` s'en chargent.
2. *Settings → General → Node.js Version* : **24.x**.
3. *Settings → Environment Variables* (Production **et** Preview) — voir `.env.example` :

| Variable | Obligatoire | Rôle |
|---|---|---|
| `DATABASE_URL` | oui | Chaîne PostgreSQL pooled |
| `APP_SECRET` | oui | 32+ caractères (`openssl rand -base64 48`). Les codes OTP et empreintes de visiteurs en dépendent : **ne pas la changer** sans conséquence (codes en cours invalidés) |
| `APP_URL` | recommandé | URL publique (liens des e-mails). Déduite de Vercel sinon |
| `CRON_SECRET` | oui | Autorise la tâche de maintenance quotidienne |
| `SMTP_USER` + `SMTP_PASS` + `MAIL_FROM` (ou `RESEND_API_KEY`) | pour les e-mails | Accueil, vérification d'adresse, mot de passe oublié, page en ligne, décisions de modération |
| `ADMIN_SEED_EMAIL` · `ADMIN_SEED_PASSWORD` · `ADMIN_SEED_NAME` · `ADMIN_SEED_PHONE` | non | Crée **une seule fois**, au premier déploiement, le super administrateur (mot de passe ≥ 12 caractères ; un compte existant n'est jamais écrasé). À retirer des variables Vercel ensuite. Le numéro reste non vérifié jusqu'à la saisie d'un code SMS dans *Sécurité* |
| `SMSMOBILEAPI_KEY` (ou `SMS8_API_KEY`, `TWILIO_*`) | pour le téléphone | Codes par SMS pour 3 usages : inscription/connexion par téléphone, **double authentification** (code après le mot de passe) et **mot de passe oublié par SMS**. Choix automatique : smsmobileapi > SMS8 > Twilio |
| `MIGRATE_ON_BUILD=1` | **Production uniquement** | Applique les migrations pendant le build |

Sans fournisseur configuré, l'API **refuse honnêtement** (`mail_unavailable`, `otp_unavailable`) au lieu de simuler un envoi.
En production, `MAIL_PROVIDER=dev`, `OTP_PROVIDER=dev` et `ENABLE_DEV_ROUTES=1` sont **interdits** : le serveur refuse de démarrer.

## 3. Première mise en ligne

```bash
# 1. Appliquer le schéma (une fois, depuis votre poste ; ensuite MIGRATE_ON_BUILD s'en charge)
DATABASE_URL="postgres://…-pooler…?sslmode=require" npm run db:migrate

# 2. Créer le premier administrateur (la base est vide : aucune donnée d'exemple n'existe)
DATABASE_URL="…" npm run admin -- create-admin --email vous@exemple.com --name "Votre Nom"
#    → affiche un mot de passe temporaire, une seule fois. Connectez-vous sur /auth/login puis changez-le.

# 3. Déployer
git push origin main      # Vercel construit et déploie (vercel-build : migrations → tests de types → vite build)
```

Vérifications après déploiement :

- `https://votre-domaine/api/health` → `{"status":"ok","db":<ms>}`
- Inscription par e-mail → réception du lien de confirmation → publication d'une page → la page s'ouvre sur `/<pseudonyme>`
- Admin Center → *Système* : la base doit être « opérationnelle » ; e-mails / codes : « opérationnel » (et non « mode développement »)
- Vercel → *Settings → Cron Jobs* : `/api/cron/maintenance` planifié (03:17 UTC)

## 4. Fournisseurs

**SMTP / Gmail (e-mails)** : activer la validation en 2 étapes du compte Google, créer un *mot de passe d'application*, renseigner `SMTP_USER` (l'adresse Gmail), `SMTP_PASS` (le mot de passe de 16 caractères, espaces ignorés) et `MAIL_FROM` (nom affiché). Gmail impose l'adresse du compte comme expéditeur et limite à ~500 e-mails/jour : suffisant au démarrage, à remplacer par un domaine dédié (Resend, SES…) ensuite. Les e-mails envoyés : accueil + confirmation, mot de passe oublié / modifié, première publication, décision de vérification, suspension/réactivation de compte ou de page, avertissement de modération (français ou anglais selon la langue du compte).

**smsmobileapi.com (SMS)** : `SMSMOBILEAPI_KEY` suffit (clé du tableau de bord, jamais dans le dépôt). Envoi par `POST https://api.smsmobileapi.com/sendsms/` ; le succès est vérifié strictement (`error=0` et `sent=1`), sinon l'API répond `otp_unavailable` au lieu de prétendre avoir envoyé. Les SMS partent du téléphone appairé : il doit rester allumé et connecté. Codes valables 5 min, renvoi après 30 s, 5/h/numéro. Test : `npm run sms:test -- +224…`.

**SMS8.io (SMS)** : la clé se trouve dans app.sms8.io → *Developers → API* ; `SMS8_API_KEY` suffit (le fournisseur est choisi automatiquement). Les SMS partent du téléphone Android appairé : il doit rester allumé, connecté et avec du crédit/forfait SMS, et chaque envoi consomme un crédit SMS8 (offre d'essai limitée). Le serveur génère et vérifie lui-même les codes (stockés hachés) : SMS8 ne sert que de transport. WhatsApp n'est pas disponible avec SMS8 : l'interface n'affiche alors que « SMS ». Test : `npm run sms:test -- +224…` (votre numéro), `npm run mail:test -- vous@exemple.com`.

**Resend (e-mails, alternative)** : ajouter et vérifier votre domaine (enregistrements SPF et DKIM), créer une clé API, renseigner `MAIL_FROM` avec une adresse de ce domaine.

**Twilio (WhatsApp / SMS)** :
- *SMS* : numéro ou *Messaging Service* adapté aux pays visés (la couverture en Guinée dépend des opérateurs — tester avant d'ouvrir).
- *WhatsApp* : expéditeur WhatsApp Business approuvé + **modèle de catégorie « Authentication »** (Content Template) ; renseigner `TWILIO_WHATSAPP_FROM` et `TWILIO_WHATSAPP_CONTENT_SID`. Sans modèle approuvé, WhatsApp refuse d'écrire en premier à un utilisateur.
- Limiter les indicatifs avec `OTP_ALLOWED_DIAL_CODES` (protection contre la fraude au SMS payant). Les plafonds de débit (20 demandes/h/IP, 5/h/numéro) sont appliqués par le serveur en base.

## 5. Migrations sans interruption

Le schéma évolue avec `npm run db:generate` (Drizzle Kit lit `server/db/schema.ts`, écrit un fichier SQL dans `drizzle/`) — **relire le SQL** avant de le committer.
Règles pour ne jamais casser la production (une ancienne version du code tourne encore pendant un déploiement) :

1. *Étendre* d'abord (nouvelle colonne nullable / avec défaut, nouvelle table), déployer ;
2. basculer le code ; 3. *contracter* plus tard (supprimer l'ancienne colonne) dans un déploiement ultérieur.

Les migrations sont verrouillées (`pg_advisory_lock`) : deux builds simultanés ne migrent jamais en même temps.
Retour arrière : *Vercel → Deployments → Promote/Instant Rollback* ; la base reste compatible grâce à la règle ci-dessus.

## 6. Exploitation

- **Sauvegardes** : Neon (PITR). Tester une restauration sur une branche avant d'en avoir besoin.
- **Journaux** : Vercel → *Logs* (erreurs 500 aussi enregistrées dans la table `app_errors`, visibles dans *Système*).
- **Rétention** : le cron purge sessions/jetons/codes expirés, compteurs de débit, événements d'audience (> 400 j) et erreurs (> 90 j).
- **Domaine personnalisé** : ajouter le domaine dans Vercel, puis `APP_URL` et (si le domaine d'affichage diffère) `VITE_PUBLIC_DOMAIN`.
- **Images** : stockées dans PostgreSQL (≤ 1,5 Mo, quota 40 Mo/compte). Au-delà de quelques milliers de comptes actifs, migrer vers Vercel Blob / S3 (une seule fonction : `server/services/media.ts`).
- **Statistiques** : table `page_events` indexée ; au-delà de plusieurs dizaines de millions de lignes, ajouter une table de cumul quotidien.

## 7. Développement local

```bash
npm install
npm run dev     # PostgreSQL 17 réel embarqué (.data/), API (port 8787) et interface (5173) — aucune variable à définir
```

Les e-mails et codes OTP sont affichés dans le terminal ; l'interface montre le code dans un encadré « Mode développement »
(uniquement quand le fournisseur est `dev`, jamais en production). Premier administrateur local :
`npm run admin -- create-admin --email moi@exemple.com --name Moi` avec `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/onelink`.

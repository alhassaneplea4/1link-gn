---
name: 1link-security-review
description: Liste de contrôle de sécurité pour toute modification du serveur 1Link (authentification, sessions, OTP, autorisations, entrées, vie privée, secrets). À utiliser avant de fusionner du code serveur sensible.
---

# Revue de sécurité (serveur)

Référence : `docs/SECURITY.md`. Cocher chaque point pour toute route ou service touché.

- [ ] **Authentification** : route privée derrière `requireAuth` ; rôle admin → `requireAnyPermission` + permission dans `server/lib/access.ts` ; jamais de droit déduit d'un champ envoyé par le client.
- [ ] **Autorité** : propriétaire vérifié par `auth.user.id` (pas par un identifiant du corps) ; champs réservés au serveur (`verified`, `status`, `plan`) jamais acceptés en entrée.
- [ ] **Entrées** : schéma zod strict, longueurs/tailles bornées, énumérations fermées, URL sans `javascript:`/`data:` ; corps lu avec `readJson` (taille limitée).
- [ ] **SQL** : paramétré ; tri/colonnes via liste blanche (`lib/lists.ts`) ; aucune concaténation de texte client.
- [ ] **Énumération/timing** : réponses identiques pour compte inconnu/existant ; hash factice ; pas d'existence révélée avant preuve de possession.
- [ ] **Abus** : limiteur (`enforce`) sur toute route anonyme ou coûteuse (e-mail, SMS, upload, recherche) ; clés hachées.
- [ ] **Secrets** : jetons/codes stockés hachés (SHA-256/HMAC) ; comparaison en temps constant ; aucun secret ou donnée personnelle dans les journaux ni les réponses d'erreur.
- [ ] **Sessions** : révocation lors d'un changement d'identifiants ou d'une suspension ; cookies `httpOnly`, `SameSite=Lax`, `Secure` en production.
- [ ] **CSRF/Origine** : écritures protégées par `originGuard` ; pas de `GET` qui modifie l'état (sauf cron signé).
- [ ] **Vie privée** : pas d'IP ni d'identifiant durable dans les événements d'audience ; DNT/GPC respectés ; durée de conservation définie (cron).
- [ ] **Honnêteté** : aucun faux succès (paiement, e-mail, SMS) ; erreur explicite si le fournisseur est absent.
- [ ] **Configuration** : tout nouveau drapeau de développement est refusé en production par `loadConfig`, et reste **fermé par défaut** (il exige `ENABLE_DEV_ROUTES=1` ou `NODE_ENV=test`, jamais l'absence d'une variable d'environnement).
- [ ] **Preuve avant création** : aucun compte ni session sans preuve de possession de l'adresse ou du numéro ; tout compte antérieur à la preuve perd ses identifiants à la première preuve (`claimUnverifiedAccount`).
- [ ] **Plafonds par cible** : un limiteur indexé sur la cible seule (adresse, numéro) permet à un tiers de la verrouiller ; l'indexer sur (IP, cible) et ajouter un filet large.
- [ ] **Caractères de contrôle** : tout champ qui finit dans un fichier, un en-tête ou une ligne structurée (vCard, e-mail, CSV) rejette ou échappe `\r`, `\n` et les caractères de contrôle.
- [ ] **Tests d'abus** ajoutés (accès refusé, entrée hostile, réutilisation de jeton, dépassement de limite).

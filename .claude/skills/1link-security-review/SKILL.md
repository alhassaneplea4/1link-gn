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
- [ ] **Configuration** : tout nouveau drapeau de développement est refusé en production par `loadConfig`.
- [ ] **Tests d'abus** ajoutés (accès refusé, entrée hostile, réutilisation de jeton, dépassement de limite).

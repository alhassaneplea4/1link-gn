# API HTTP

Base : `/api` (même origine que l'interface). JSON partout. Erreurs : `{ "message": "<code stable>", "fields"?: { … } }` avec le statut HTTP adapté
(`401` non connecté, `403` interdit, `404`, `409` conflit, `422` invalide, `429` trop de requêtes + `Retry-After`, `503` fournisseur absent).
Le contrat TypeScript côté interface est `src/services/api/types.ts`, son implémentation `src/services/api/http/`.

## Authentification (`/auth`)
| Méthode & chemin | Rôle |
|---|---|
| `GET /auth/session` | Session courante ou `null` (200) |
| `POST /auth/email-code/{request,verify}` | **Inscription et connexion par code reçu par e-mail** (sans mot de passe) : le code prouve l'adresse, ouvre le compte ou le crée (conditions acceptées) |
| `POST /auth/sign-up` · `/auth/sign-in` · `/auth/sign-out` | Compte e-mail + mot de passe (comptes existants) |
| `POST /auth/otp/request` · `/auth/otp/verify` | Connexion / inscription par code WhatsApp ou SMS (`mode: sign_in \| sign_up`) |
| `POST /auth/password/forgot` · `/auth/password/reset` | Réinitialisation par e-mail (jeton à usage unique) |
| `POST /auth/password/forgot-phone` · `/auth/password/reset-phone` | Réinitialisation par **code SMS** (réponse identique que le numéro ait un compte ou non ; coupe les sessions ouvertes) |
| `POST /auth/sign-in/mfa` · `/auth/sign-in/mfa/send` | 2e étape de connexion quand une vérification en deux étapes (SMS, e-mail, application, code de secours) est active : la 1re étape répond alors `{ twoFactor: { challenge, methods, method, … } }` **sans session** ; le code + le jeton signé (10 min) ouvrent la session. Anciennes routes `/sign-in/2fa` conservées (SMS) |
| `POST /auth/delete/{target,code,confirm}` | Confirmation finale de la suppression du compte (lien reçu par e-mail après 15 jours sans activité) : mot de passe, ou code e-mail pour un compte sans mot de passe |
| `POST /auth/email/verify` · `/auth/email/resend` | Vérification de l'adresse |

## Compte connecté (`/me`)
`GET /me/page` · `PUT /me/page/draft` · `POST /me/page/publish` · `POST /me/page/unpublish` · `GET|POST /me/verification` · `GET /me/analytics?from&to&preset` ·
`GET /me/subscription` · `GET /me/invoices` · `POST /me/subscription/{change,cancel,resume}` · `GET|PUT /me/onboarding` · `POST /me/phone/{request,verify,remove}` (ajout d'un numéro avec preuve de possession ; retrait = mot de passe) · `POST /me/2fa` (SMS) · `GET /me/mfa` · `POST /me/mfa/email` · `POST /me/mfa/totp/{setup,enable,disable}` · `POST /me/mfa/recovery` · `POST /me/password` (définir/changer) · `POST /me/identity/code` (code de confirmation sans mot de passe) — chaque opération sensible exige une **preuve d'identité** (mot de passe ou code) · `POST /me/delete/request` (demande de suppression : sessions fermées, confirmation après 15 jours) · `PATCH /me/page/username` (changement de lien, 5/jour) · `POST /me/media` (multipart `file` → `{ url }`)

## Public
`GET /pages/:username` (états `published | draft | suspended | not_found`) · `POST /pages/:username/events` (vue/clic) · `POST /pages/:username/reports` ·
`GET /usernames/check?username=` · `GET /media/:id` · `GET /health`

## Admin Center (`/admin`, permission requise par rubrique)
`overview` · `users` (+ `/:id`, `PATCH /:id/status`, `POST /:id/subscription` activation d'un abonnement après paiement) · `profiles` · `reports` (+ `POST /:id/decision`) · `verifications` (+ `POST /:id/decision`) · `subscriptions` · `payments` ·
`tickets` · `logs` · `security/events` · `system/status` · `roles` · `realtime` (SSE).
Les listes acceptent `page, pageSize (≤100), search, sort, dir` et des filtres (`status=…`, `plan=…`).

## Maintenance
`GET /cron/maintenance` — réservé à Vercel Cron (`Authorization: Bearer $CRON_SECRET`).

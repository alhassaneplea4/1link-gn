---
name: 1link-auth-mfa
description: Inscription et connexion par code e-mail (sans mot de passe), vérification en deux étapes (SMS, e-mail, application TOTP, codes de secours), confirmation d'identité et suppression de compte différée. À utiliser pour toute modification de l'authentification ou de la page Sécurité.
---

# Authentification, MFA et suppression de compte

## Parcours
- **Inscription = adresse e-mail seule.** `POST /auth/email-code/request` puis `/verify` (conditions acceptées) : crée le compte (nom provisoire tiré de l'adresse, e-mail vérifié, aucun mot de passe) ou ouvre le compte existant. Le code vit dans `otp_codes` (clé `mail:<adresse>`, canal `email`), mêmes plafonds que le SMS (30 s, 5/h, 5 essais, 5 min). Sans fournisseur d'e-mail : `mail_unavailable`.
- Connexion par mot de passe conservée (comptes existants) ; un mot de passe se définit dans Sécurité.
- Assistant (`/onboarding`) : 2 étapes (type de compte, profil : photo, couverture, nom complet, secteur, titre) → « Valider mon compte » crée et publie la page (adresse automatique `usernameCandidates`) → vue d'ensemble.

## Vérification en deux étapes (`server/services/mfa.ts`)
Méthodes : `sms` (`users.two_factor_sms`, numéro vérifié), `email` (`two_factor_email`), `totp` (`totp_secret` chiffré AES-GCM + `totp_enabled_at`, `recovery_codes` = empreintes). **Toutes désactivées par défaut.**
- `mfaChallenge()` : si une méthode est active, la première étape (mot de passe / code e-mail / code SMS) ne crée AUCUNE session ; un défi signé de 10 minutes est renvoyé. La méthode identique à la première étape n'est pas redemandée.
- Seconde étape : `POST /auth/sign-in/mfa` (`method`: sms|email|totp|recovery), renvoi `POST /auth/sign-in/mfa/send`. Anciennes routes `/sign-in/2fa` conservées.
- Gestion : `/me/mfa` (état), `/me/2fa` (SMS), `/me/mfa/email`, `/me/mfa/totp/{setup,enable,disable}`, `/me/mfa/recovery`. Les codes de secours ne sont montrés qu'une fois.
- **Confirmation d'identité** (`server/services/identity.ts`) avant toute opération sensible : mot de passe, OU code envoyé à l'e-mail du compte (compte sans mot de passe) via `POST /me/identity/code`.

## Suppression de compte (`server/services/account-deletion.ts`)
1. `POST /me/delete/request` (preuve d'identité) → `deletion_requested_at`, toutes les sessions fermées.
2. Se reconnecter pendant le délai **annule** la demande (`openSession`).
3. Après 15 jours sans connexion, la tâche planifiée `/api/cron/maintenance` (`processDeletionRequests`) envoie un lien de confirmation (valable 7 jours, jeton `account_delete`).
4. `/auth/confirm-deletion?token=` → mot de passe (ou code e-mail) → `deleteAccount` définitif. Sans confirmation sous 7 jours la demande est abandonnée. Les comptes ayant des paiements/administrateurs passent par le support.

## Règles
- Jamais de réponse qui révèle si une adresse a un compte avant la preuve de possession.
- Tests : `server/tests/mfa.test.ts`, `seo-deletion.test.ts`, `auth.test.ts`, `sms.test.ts` ; e2e `e2e/plans.spec.ts` (section sécurité).
- Après tout changement : revue avec `1link-security-review`.

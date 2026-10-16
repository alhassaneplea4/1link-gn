---
name: 1link-plans-trials
description: Offres Free/Basique/Pro/Business, droits par offre, essais (7 jours puis 15 jours à la souscription), verrouillage et activation après paiement. À utiliser pour tout ajout de fonctionnalité soumise à une offre, tout changement de tarif ou de limite, ou toute modification du flux d'abonnement.
---

# Offres, droits et essais

**Source unique** : `src/models/access.ts` (module « feuille » partagé serveur/interface, listé dans `SHARED` de `server/tests/imports.test.ts`). Rien d'autre ne code un droit en dur.

## Offres et droits (`RIGHTS`)
| | Free | Basique (10 000 GNF) | Pro (20 000) | Business (35 000) |
|---|---|---|---|---|
| Blocs | profil, lien, réseaux, services, contacts | + Texte | tous | tous |
| Liens / services / contacts | 4 / 2 / 2 | 10 / 5 / 5 | illimité | illimité |
| Thèmes | Minimal, Modern, Dark (+ Personnalisé) | + Professional, Creator, Elegant | tous | tous |
| Onglets d'apparence | Thèmes, Couleurs | + Boutons & cartes, Texte | tous | tous |
| Statistiques | non | aujourd'hui + 7 jours, totaux seulement | complètes (90 j) | complètes (365 j) |

Prix mensuels dans `src/app/configuration/plans.ts` (annuel = ×10). Tout bloc est unique dans une page sauf `MULTI_BLOCKS` (lien, séparateur).

## Essais (`computeAccess`)
- Inscription : **essai gratuit de 7 jours**, une seule fois (`users.free_trial_ends_at`). Sans abonnement après : `phase: 'expired'`, `locked: true`.
- Souscrire une offre payante : **essai de 15 jours**, une seule fois par compte (`users.paid_trial_used_at`, `subscriptions.trial_ends_at`, statut `trialing`). L'abonnement ne compte qu'après ces 15 jours (`renewsAt` démarre à la fin de l'essai).
- L'équipe (`adminRole`) a toujours l'accès complet (`phase: 'staff'`, aucun badge d'abonné : `badgePlanOf`).

## Où le serveur applique les droits
- `writePage` → `assertNotLocked`, `assertPageRights` (`server/services/page-rights.ts` : types de blocs, nombre de liens/services/contacts, thèmes, onglets d'apparence — les réglages d'un onglet fermé doivent rester ceux enregistrés ou ceux d'un thème autorisé).
- `userReport` (statistiques), `changeUsername`, page publique (`locked` → `unavailable`).
- Erreurs : `403 plan_required` avec `fields.feature` (`block:text`, `links`, `theme:soft`, `tab:text`, `analytics`…) ; `403 subscription_required`.

## Paiement (honnêteté)
Aucune passerelle : `POST /me/subscription/change` démarre l'essai (une fois), sinon répond `unavailable / payments_not_connected`. Après réception d'un paiement (Mobile Money, virement), l'équipe active l'abonnement : `POST /admin/users/:id/subscription` (permission `subscriptions:write`) → statut `active`, paiement `paid` enregistré, `renewsAt` = fin d'essai (ou maintenant) + période. Ne jamais simuler un paiement réussi.

## Pour ajouter un droit
1. L'ajouter dans `PlanRights`/`RIGHTS` (+ test `server/tests/plans.test.ts`).
2. L'appliquer côté serveur (service concerné) **avant** de le refléter dans l'interface (`useAccess()`, `PlanGateNotice`).
3. Libellés fr+en (`billing.features.*`, `billing.comparison.*`), tableau `PLAN_COMPARISON`.

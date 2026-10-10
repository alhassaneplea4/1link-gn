# Phase 0 — Audit du front-end existant

**Date** : 10 octobre 2026

## Constat
Le dépôt `1link-gn` était **vide** : aucun commit, aucun fichier source, aucun logo, aucune police, aucune dépendance, aucune configuration.

Conformément à la consigne (« va sur la base que rien n'est fait »), tout a été conçu depuis zéro. Il n'y avait donc ni dette à rembourser, ni composant à préserver.

## Conséquences et décisions
| Sujet | Décision |
|---|---|
| Framework | React 19 + TypeScript strict + Vite (voir `ARCHITECTURE.md`) |
| Logo officiel | **Non fourni.** Un symbole provisoire fidèle au concept (« 1 » + « L » + maillon) est centralisé dans `components/ui/Logo.tsx` et `public/favicon.svg`. Remplacer ces deux éléments suffit à propager le logo officiel. Les variantes demandées existent (horizontal, compact, symbole, clair/sombre, favicon) |
| Polices | Plus Jakarta Sans (globale), Manrope et Fraunces (à la demande) |
| Backend | Absent → couche d'accès aux données à interfaces + adaptateurs de démonstration isolés |
| Tarifs | Aucune grille fournie → valeurs **indicatives** en GNF dans `app/configuration/plans.ts` (à confirmer), signalées comme telles dans l'interface |

## Plan de travail réalisé
0. Audit → 1. Fondations (tokens, routes, couche de données, état) → 2. Design system → 3. Site public → 4. Authentification + onboarding → 5. Dashboard par catégorie → 6. Éditeur de blocs → 7. Apparence → 8. Page publique → 9. Analytics → 10. Admin Center → 11. Qualité (tests unitaires, intégration, E2E, accessibilité, performance).

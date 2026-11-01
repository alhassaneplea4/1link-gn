# 1Link Cards — cartes de visite QR / NFC

Cartes physiques liées au profil public. Production **externalisée** (partenaires en Guinée) ; la plateforme gère la commande, le paiement *enregistré*, la validation du visuel, les fichiers d'impression, la programmation NFC (saisie manuelle) et la livraison.

## Principe : une adresse qui ne change jamais
Chaque carte a un **code public** unique et définitif (10 caractères, `a-z2-9` sans ambigus) : `https://<domaine>/c/<code>`.
- Le **QR code** et la **puce NFC** n'écrivent que cette adresse — jamais de donnée personnelle.
- `GET /c/<code>` redirige (302, jamais mis en cache) vers `/<pseudonyme actuel>?src=card` : la carte suit le profil même si le pseudonyme ou le contenu changent. Les vues sont comptées dans les statistiques sous le canal « card ».
- Carte désactivée (perte, vol), annulée, inconnue ou profil hors ligne : la même adresse sert une page d'information (410/404, `noindex`), sans compte ni application.
- Vercel : réécriture `/c/:code` → `/api` (voir `vercel.json`, `api/index.ts`). Le chemin à deux segments ne peut pas entrer en collision avec `/:username`.

## Commande (espace client : *Cartes de visite*)
Assistant en 5 étapes (modèle → personnalisation → quantité → livraison → récapitulatif), aperçu recto/verso en direct. Les informations du profil (nom, titre, photo, téléphone) préremplissent la carte. Le profil doit être **publié**.
- 8 modèles (`CARD_TEMPLATES`, `src/models/cards.ts`) ; la personnalisation reste dans les limites du modèle (textes courts, image téléversée sur 1Link, accent parmi les couleurs prévues). Le serveur revalide tout.
- Produits : QR Basic, NFC Premium, packs de 10. **Les prix sont en base** (`card_products`, modifiables en administration) ; le serveur recalcule toujours le total. Valeurs initiales de la migration : 40 000 / 75 000 / 350 000 / 600 000 GNF.
- Chaque carte commandée reçoit son code à la commande.

## Paiement — aucune simulation
La plateforme **n'encaisse rien**. Le client règle selon la *consigne de paiement* rédigée par l'équipe (Admin Center → Cartes → Tarifs et paiement) en citant la référence `CRT-XXXXXX`. L'équipe **enregistre le paiement reçu** (moyen + référence) : seule cette action fait passer la commande à « Payée ».

## Statuts et garde-fous (imposés par le serveur)
`awaiting_payment → paid → validating → in_production → quality_check → shipped → delivered` (+ `canceled`).
- Production : paiement enregistré **et** visuel validé **et** partenaire d'impression renseigné.
- Expédition d'une carte NFC : chaque puce doit être programmée avec **exactement** l'adresse de sa carte et testée (`passed`).
- Le client peut corriger son visuel tant qu'il n'est pas en production (la validation est alors annulée) et annuler tant que rien n'est payé.
- Annuler une commande désactive ses cartes.

## Administration (*Cartes de visite*, section `cards`)
Permissions : lecture — admin, support, finance, super admin ; écriture — admin, finance, super admin. Liste filtrable, détail (client, livraison, paiement, visuel, partenaire, cartes, NFC, historique), tarifs et consigne de paiement.

## Fichiers d'impression (générés dans le navigateur de l'administrateur)
Distincts de l'aperçu : **85,6 × 54 mm** de coupe, **fond perdu 3 mm** (91,6 × 60 mm), marge de sécurité 4 mm, angles droits, sans reflet ; image intégrée en base64.
- SVG vectoriel (dimensions en mm) et PNG **600 dpi** (2 164 × 1 417 px).
- Le verso (QR, niveau de correction Q) est propre à chaque carte ; le recto est commun à la commande.
- Textes en polices système (Helvetica/Arial) : pour l'impression professionnelle, le PNG est le fichier de référence ; le SVG peut nécessiter la vectorisation des textes par l'imprimeur.

## NFC
La programmation et le test sont **manuels** (équipe ou partenaire, avec une application d'écriture NFC) : l'interface enregistre l'identifiant de la puce, l'adresse programmée (copiable, vérifiée côté serveur) et le résultat du test. Rien n'est écrit automatiquement dans une puce.

## Limites connues
- Pas de notification automatique (e-mail/SMS) sur les changements de statut des commandes : le client consulte *Mes commandes*.
- Un seul profil par compte : la carte est associée à la page du compte.
- Un remboursement après paiement est traité à la main (hors plateforme).

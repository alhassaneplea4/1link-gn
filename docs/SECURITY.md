# Sécurité des données

Principe : **le navigateur n'est jamais une source de vérité**. Toute donnée vit dans PostgreSQL, toute règle est appliquée par le
serveur (l'interface ne fait que refléter). Chaque contrôle ci-dessous est couvert par un test (`server/tests/`).

## Authentification et sessions
| Contrôle | Mise en œuvre |
|---|---|
| Mots de passe | **scrypt** (N=2¹⁵, r=8, p=1, sel de 16 octets), format auto-descriptif `scrypt$…` (coût relevable sans casser les anciens hash), comparaison en temps constant, politique (8–200 car., liste de mots triviaux) |
| Énumération de comptes | Message identique « identifiants incorrects » ; hash factice calculé pour un e-mail inconnu (même durée) ; mot de passe oublié répond toujours 204, envoi hors du chemin de réponse |
| Force brute | Limiteur en base, fenêtre fixe, atomique : 10 essais / 15 min par (IP, e-mail), 20 / h par e-mail, 100 / h par IP → `429` + `Retry-After` |
| Sessions | Jeton de 256 bits en cookie `httpOnly`, `Secure` (préfixe `__Host-` en production), `SameSite=Lax` ; **seul le SHA-256 est stocké** (une fuite de la base ne permet pas de rejouer une session). Durée 30 j glissants (12 h absolues pour un administrateur). Révoquées au changement de mot de passe et à la suspension |
| Jetons e-mail | 256 bits, hash en base, usage unique, 24 h (vérification) / 1 h (réinitialisation) ; la force du mot de passe est contrôlée **avant** de consommer le jeton |
| Codes WhatsApp/SMS | 6 chiffres tirés par `crypto.randomInt`, stockés en **HMAC** (jamais en clair), 5 min, 5 essais, 1 code actif par numéro, renvoi après 30 s, 5/h/numéro, 20/h/IP, indicatifs autorisés. Un compte n'est révélé **qu'après** un code correct |
| CSRF | `SameSite=Lax` + contrôle de l'en-tête `Origin` / `Sec-Fetch-Site` sur toute écriture |

## Autorisations
- Rôles et permissions définis **côté serveur** (`server/lib/access.ts`) et revérifiés à **chaque** requête (une révocation est immédiate) ; l'interface ne reçoit que la liste pour adapter la navigation.
- Un administrateur ne peut pas se suspendre lui-même ni suspendre un rang égal ou supérieur (sauf super administrateur).
- Le badge « Profil vérifié » n'est modifiable que par la modération : tout `verified` envoyé par un client est écrasé.
- Limites d'offre (nombre de blocs, historique d'audience) appliquées par le serveur.

## Données et contenus
- Entrées validées par schémas **zod** (types, énumérations, longueurs, tailles) ; clés inconnues retirées ; schémas `javascript:`, `data:`, `vbscript:`… refusés ; publication : liens, e-mails, téléphones et images doivent être valides.
- SQL **paramétré** partout ; tri, filtres et colonnes de l'Admin Center issus d'une liste blanche (test d'injection).
- Images : type réel déduit des octets (le `Content-Type` du client n'est pas cru), SVG interdit, 1,5 Mo max, quota par compte ; servies avec `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, cache immuable.
- Concurrence optimiste (`version`) : deux appareils ne s'écrasent jamais (`409 version_conflict`).
- Intégrité en base : clés étrangères, contraintes `CHECK` (énumérations, format du pseudonyme, e-mail en minuscules), index uniques (e-mail, téléphone, pseudonyme, une seule demande de vérification en attente).

## Vie privée
- Mesure d'audience **sans cookie** ni identifiant durable : empreinte quotidienne `HMAC(secret, jour|IP|UA)`, **aucune adresse IP** n'est stockée dans les événements ; « Ne pas me suivre » et Global Privacy Control respectés ; robots et propriétaire ignorés.
- Signalants anonymes : seule une empreinte est conservée (limitation d'abus), jamais l'identité.
- Rétention automatique (cron) : événements 400 j, erreurs 90 j, sessions/jetons/codes dès expiration.
- Les adresses IP ne figurent que dans les journaux d'audit/sécurité et les sessions (finalité sécurité).

## Transport et navigateur (`vercel.json`)
CSP stricte (`default-src 'self'`, `frame-ancestors 'none'`, iframes limitées à YouTube-nocookie et Vimeo), HSTS (2 ans, preload), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP.
Réponses d'API privées en `Cache-Control: no-store`. Les pages publiques sont mises en cache **par le CDN seulement** (10 s) et revalidées par le navigateur.

## Configuration défensive
Le serveur **refuse de démarrer** en production/preview si `APP_SECRET` est absent ou court, `DATABASE_URL` manque, ou si un mode de développement
(`MAIL_PROVIDER=dev`, `OTP_PROVIDER=dev`, `ENABLE_DEV_ROUTES=1`, `RATE_LIMIT_SCALE`) est activé.

## Reste à votre charge
Rotation périodique des clés (Resend, Twilio, `CRON_SECRET`), revue des accès Vercel/Neon (2FA obligatoire), surveillance des alertes
(Vercel Observability / Neon), test de restauration, et procédure de réponse aux incidents.

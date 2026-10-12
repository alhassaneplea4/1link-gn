# Mise en ligne : site, moteurs de recherche et application mobile

## Ce qui est déjà en place (dans le dépôt)

| Besoin | Où | État |
|---|---|---|
| Politique de confidentialité, conditions d'utilisation, suppression du compte | `/legal/privacy`, `/legal/terms`, `/legal/delete-account` (`src/features/legal/content.ts`, fr + en) | en ligne, liées depuis le pied de page et l'inscription |
| Suppression du compte par l'utilisateur (exigée par Google Play / App Store) | Paramètres → zone de danger ; `POST /api/me/delete` | en ligne |
| `robots.txt` | `public/robots.txt` | autorise le site et les pages publiques, interdit `/api`, `/dashboard`, `/admin`, `/auth` |
| Plan du site | `/sitemap.xml` (généré depuis la base : pages publiées actives, jamais les comptes de test) | en ligne |
| Balises de partage et SEO par page (titre, description, image Open Graph, canonique, données structurées `ProfilePage`) | `server/routes/seo.ts`, réécriture `/<pseudo>` dans `vercel.json` | en ligne : WhatsApp, Facebook, X et Google lisent le HTML brut |
| Métadonnées du site | `index.html` (Open Graph, Twitter, JSON-LD `Organization`/`WebSite`) | en ligne |
| Installation sur téléphone (PWA) | `public/manifest.webmanifest`, icônes `public/icon-*.png` | en ligne |
| Application Android (APK) | `mobile/` (Capacitor) | voir `mobile/README.md` |

## À faire côté propriétaire (comptes que seul le propriétaire peut ouvrir)

1. **Nom de domaine propre** (recommandé avant toute communication large) : acheter un domaine, l'ajouter dans Vercel → Settings → Domains, puis définir `APP_URL=https://votre-domaine` et mettre à jour les adresses codées en dur dans `index.html`, `public/robots.txt` et `mobile/capacitor.config.json`.
2. **Google Search Console** : ajouter la propriété (méthode « balise HTML » ou DNS), puis *Sitemaps → envoyer* `https://…/sitemap.xml`. Même chose avec **Bing Webmaster Tools** (importe depuis Search Console).
3. **Google Play Console** (frais uniques de 25 USD) : créer l'application, renseigner la fiche (descriptions, captures, icône 512×512 `public/icon-512.png`, image de présentation 1024×500), l'URL de la politique de confidentialité (`/legal/privacy`), l'URL de suppression de compte (`/legal/delete-account`), le questionnaire « Sécurité des données » (e-mail, téléphone, nom, contenu utilisateur ; chiffré en transit ; suppression possible) et la classification du contenu, puis téléverser un **AAB** signé (`gradlew bundleRelease`) en conservant la clé `mobile/keystore/`.
4. **Faire relire** les textes juridiques par un juriste (raison sociale exacte, adresse, autorité de protection des données, âge minimum).

## Indexation : à quoi s'attendre

- Les pages publiques d'utilisateurs sont indexables dès leur publication (plan du site + balises par page). La prise en compte par Google prend de quelques jours à quelques semaines.
- Les comptes de démonstration (`@comptes-test.invalid`) sont en `noindex` et absents du plan du site.
- Les pages d'un utilisateur suspendu, brouillon ou supprimé répondent `404`/`noindex`.

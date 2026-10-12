# Application Android 1Link

Enveloppe native (Capacitor 8) du site `https://1link-gn.vercel.app` : l'application affiche le vrai site (mêmes comptes, mêmes données, mêmes mises à jour sans republier l'APK). Hors connexion, un écran « Pas de connexion » avec bouton Réessayer s'affiche (`www/offline.html`).

- Identifiant : `gn.astronet.onelink` · version `1.0.0` (`android/app/build.gradle`, incrémenter `versionCode` à chaque publication)
- Android 7.0 (API 24) et plus
- Les liens externes (WhatsApp, réseaux sociaux…) s'ouvrent dans leur application ; seule l'adresse du site reste dans l'application.

## Construire l'APK

Prérequis : Android Studio (SDK Android 36 + JDK ≥ 21 avec `jlink`) et Node.

```bash
cd mobile
npm install
node scripts/build-apk.mjs release   # APK signé  → mobile/dist/1Link-1.0.0-release.apk
node scripts/build-apk.mjs debug     # APK de test → mobile/dist/1Link-1.0.0-debug.apk
```

La première fois, le script crée la clé de signature `mobile/keystore/onelink-release.jks` (mot de passe dans `keystore.properties`). **Ces fichiers sont ignorés par git : sauvegardez-les.** Sans cette clé, il est impossible de publier une mise à jour d'une application déjà installée ou publiée.

Pour changer les icônes/écrans de démarrage : `node scripts/make-icons.mjs` (à partir du logo), puis reconstruire.

## Installer sur un téléphone

Copier l'APK sur le téléphone, l'ouvrir et autoriser « Installer des applications inconnues » pour l'application utilisée (Fichiers, Chrome…). Ou, avec le câble : `adb install mobile/dist/1Link-1.0.0-release.apk`.

## Publier sur Google Play

Voir `docs/PUBLICATION.md`. Google Play exige un **AAB** : `android/gradlew bundleRelease` (sortie dans `android/app/build/outputs/bundle/release/`), signé avec la même clé.

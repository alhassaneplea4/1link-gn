/**
 * Construit l'APK Android de 1Link.
 *   node scripts/build-apk.mjs release   → APK signé (clé dans mobile/keystore, créée au besoin)
 *   node scripts/build-apk.mjs debug     → APK de test signé avec la clé de débogage Android
 * Prérequis : Android Studio (SDK + JDK intégré). Le résultat est copié dans mobile/dist/.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const variant = process.argv[2] === 'debug' ? 'debug' : 'release';
const win = process.platform === 'win32';

// Capacitor 8 + Gradle 8.14 : JDK 21 recommandé (le JDK 25 d'Android Studio est trop récent pour Gradle 8). Premier JDK complet trouvé.
const jdkCandidates = [process.env.JAVA_HOME, 'C:/Program Files/Eclipse Adoptium/jdk-21', 'C:/Program Files/Java/jdk-21', 'C:/Program Files/Android/Android Studio/jbr', '/Applications/Android Studio.app/Contents/jbr/Contents/Home'].filter(Boolean);
const javaHome = jdkCandidates.find((p) => existsSync(resolve(p, 'bin', win ? 'jlink.exe' : 'jlink')));
const sdkCandidates = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, resolve(homedir(), 'AppData/Local/Android/Sdk'), resolve(homedir(), 'Library/Android/sdk'), resolve(homedir(), 'Android/Sdk')].filter(Boolean);
const sdk = sdkCandidates.find((p) => existsSync(p));
if (!javaHome || !sdk) {
  console.error('JDK (Android Studio) ou SDK Android introuvable : définir JAVA_HOME et ANDROID_HOME.');
  process.exit(1);
}
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
const run = (cmd, args, cwd = mobile, shell = win) => {
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

writeFileSync(resolve(mobile, 'android/local.properties'), `sdk.dir=${sdk.replace(/\\/g, '/')}\n`);

if (variant === 'release') {
  const dir = resolve(mobile, 'keystore');
  const props = resolve(dir, 'keystore.properties');
  if (!existsSync(props)) {
    mkdirSync(dir, { recursive: true });
    const password = randomBytes(18).toString('base64url');
    run(resolve(javaHome, 'bin', win ? 'keytool.exe' : 'keytool'), ['-genkeypair', '-v', '-keystore', resolve(dir, 'onelink-release.jks'), '-alias', 'onelink', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-storepass', password, '-keypass', password, '-dname', 'CN=1Link, OU=ASTRONET GN INC, O=ASTRONET GN INC, L=Conakry, C=GN'], mobile, false);
    writeFileSync(props, `storeFile=onelink-release.jks\nkeyAlias=onelink\nstorePassword=${password}\nkeyPassword=${password}\n`);
    console.log('Clé de signature créée dans mobile/keystore/ : SAUVEGARDEZ-LA (elle ne peut pas être régénérée pour mettre à jour l’app).');
  }
}

run('npx', ['cap', 'sync', 'android']);
run(resolve(mobile, 'android', win ? 'gradlew.bat' : 'gradlew'), [variant === 'release' ? 'assembleRelease' : 'assembleDebug', '--no-daemon'], resolve(mobile, 'android'));

const version = /versionName "([^"]+)"/.exec(readFileSync(resolve(mobile, 'android/app/build.gradle'), 'utf8'))?.[1] ?? '1.0.0';
const built = resolve(mobile, `android/app/build/outputs/apk/${variant}/app-${variant}${variant === 'release' && !existsSync(resolve(mobile, 'keystore/keystore.properties')) ? '-unsigned' : ''}.apk`);
mkdirSync(resolve(mobile, 'dist'), { recursive: true });
const target = resolve(mobile, `dist/1Link-${version}-${variant}.apk`);
copyFileSync(built, target);
console.log(`APK prêt : ${target}`);

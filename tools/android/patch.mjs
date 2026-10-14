// Runs in CI after `npx cap add android` (.github/workflows/android-release.yml): the android/ project is generated
// fresh every build and never committed, so everything native we change lives here.
//  - MainActivity: back button → the game, full screen.
//  - app/build.gradle: versionCode/versionName from VERSION_CODE/VERSION_NAME, release signing from the upload
//    keystore (ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD).
import { appendFileSync, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const { appId } = JSON.parse(readFileSync(resolve(root, 'capacitor.config.json'), 'utf8'));

function need(path) {
  if (!existsSync(path)) throw new Error(`patch: ${path} not found (did the Capacitor template change?)`);
  return path;
}

const activity = need(resolve(root, 'android/app/src/main/java', ...appId.split('.'), 'MainActivity.java'));
copyFileSync(resolve(here, 'MainActivity.java'), activity);

// A second android {} block after the template's own overrides its values.
const gradle = need(resolve(root, 'android/app/build.gradle'));
appendFileSync(
  gradle,
  `
// Added by tools/android/patch.mjs
android {
    defaultConfig {
        versionCode Integer.parseInt(System.getenv('VERSION_CODE') ?: '1')
        versionName System.getenv('VERSION_NAME') ?: '0.0.0'
    }
    signingConfigs {
        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
`,
);
console.log('patch: MainActivity + build.gradle done');

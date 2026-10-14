# Heliaxis Android app

A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity) around
`https://heliaxis.co.uk/admin`: Chrome renders the live staff site full-screen, under the Heliaxis
icon. Web changes reach the app on every deploy; you only need a new APK to change the shell
(name, icon, permissions, trusted domains).

- **Offline**: the service worker (`src/app/sw.js/route.ts`) keeps the dashboard and Tasks; Tasks
  queues changes and syncs when back online (`src/lib/tasks-offline.ts`).
- **Notifications**: Web Push (`src/lib/notify.ts`), shown as app notifications via the
  `DelegationService` in the manifest.
- **Updates**: the app opens `/admin?app=android-<versionCode>`; `AppRuntime` compares that with
  `public/app/version.json` and shows an Update banner (or a must-update screen).
- **Download**: `/admin/app` (open to every approved user).

## Releasing a new APK

```bash
node scripts/android-release.mjs --notes "What changed for users"
```

Add `--minor`/`--major` for bigger version bumps and `--force` to make everyone update before
they can carry on. Then commit `android/release.json` and `public/app/` and deploy.

Needs Android Studio (its bundled JDK and the Android SDK).

## Signing key — back it up

`~/.heliaxis-secrets/heliaxis-android.jks` and `android-keystore.properties` (passwords).
Android only installs an update signed with the **same** key, so if it's lost, everyone has to
uninstall and reinstall. Keep a copy in the password manager.

Its SHA-256 fingerprint is in `public/.well-known/assetlinks.json`; that file is what lets the app
open the site without a browser bar. If the key ever changes, update the fingerprint there too.

To give Social media studio and RAMS the same full-screen treatment, publish the same
`assetlinks.json` at `/.well-known/assetlinks.json` on those sites (they're already listed as
trusted origins in the app).

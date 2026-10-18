# Heliaxis Android app

A [Trusted Web Activity](https://developer.chrome.com/docs/android/trusted-web-activity) around
`https://heliaxis.co.uk/admin`: Chrome renders the live staff site full-screen, under the Heliaxis
icon. Web changes reach the app on every deploy; you only need a new APK to change the shell
(name, icon, permissions, trusted domains).

- **Offline**: the service worker (`src/app/sw.js/route.ts`) keeps the dashboard and Tasks; Tasks
  queues changes and syncs when back online (`src/lib/tasks-offline.ts`).
- **Notifications**: native, via Firebase Cloud Messaging. `HeliaxisLauncherActivity` gets the
  phone's FCM token and opens the site with `#hx-fcm=<token>&hx-np=<1|0>`; the site
  (`src/lib/push-client.ts`) registers it (`/api/push/native`) and turns off Web Push on that
  phone. `src/lib/notify.ts` sends data messages (`src/lib/fcm.ts`) and `Notifications.java`
  shows them on per-type channels (WhatsApp, New leads, Tasks, Customers & jobs, Other), with
  "Send now"/"Cancel reply" buttons on queued smart replies (signed tokens,
  `/api/push/native/action`). Built without `google-services.json`, the app falls back to Web
  Push shown through the `DelegationService`.
- **Updates**: the app opens `/admin?app=android-<versionCode>`; `AppRuntime` compares that with
  `public/app/version.json` and shows an Update banner (or a must-update screen).
- **Download**: `/admin/app` (open to every approved user).

## Releasing a new APK

**In the cloud (no Android Studio):** GitHub → Actions → **Android app** → Run workflow on `main`,
with the notes staff will see. It bumps the version, builds and signs the APK, checks the key
matches `assetlinks.json`, and commits `android/release.json` + `public/app/` to `main`, so Vercel
publishes it. Pull requests touching `android/` get a test build too
(`.github/workflows/android.yml`). It needs these repository secrets:

- `ANDROID_KEYSTORE_BASE64`: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\.heliaxis-secrets\heliaxis-android.jks")) | Set-Clipboard` in PowerShell
- `ANDROID_KEYSTORE_PROPERTIES`: the contents of `android-keystore.properties` (its `storeFile` line is replaced)
- `GOOGLE_SERVICES_JSON`: Firebase → Project settings → Your apps → `google-services.json`

**On a PC with Android Studio** (its bundled JDK and the Android SDK):

```bash
node scripts/android-release.mjs --notes "What changed for users"
```

Add `--minor`/`--major` for bigger version bumps and `--force` to make everyone update before
they can carry on. Then commit `android/release.json` and `public/app/` and deploy. Put
`google-services.json` in `android/app/` for native notifications.

## Signing key — back it up

`~/.heliaxis-secrets/heliaxis-android.jks` and `android-keystore.properties` (passwords).
Android only installs an update signed with the **same** key, so if it's lost, everyone has to
uninstall and reinstall. Keep a copy in the password manager.

Its SHA-256 fingerprint is in `public/.well-known/assetlinks.json`; that file is what lets the app
open the site without a browser bar. If the key ever changes, update the fingerprint there too.

To give Social media studio and RAMS the same full-screen treatment, publish the same
`assetlinks.json` at `/.well-known/assetlinks.json` on those sites (they're already listed as
trusted origins in the app).

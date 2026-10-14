#!/usr/bin/env node
/**
 * Build a new Heliaxis Android app release and publish it to the website.
 *
 *   node scripts/android-release.mjs --notes "What changed" [--notes "…"] [--minor|--major] [--force]
 *   node scripts/android-release.mjs --rebuild      # rebuild the current version, no bump
 *
 * 1. Bumps android/release.json (versionCode +1, versionName patch/minor/major).
 * 2. Builds the signed APK (key from ~/.heliaxis-secrets, see android/README.md).
 * 3. Copies it to public/app/heliaxis.apk and writes public/app/version.json.
 * Commit + deploy → every installed app shows an "Update" banner (or, with --force,
 * a must-update screen) the next time it opens.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const notes = args.flatMap((a, i) => (a === '--notes' && args[i + 1] ? [args[i + 1]] : []));

const releasePath = join(root, 'android', 'release.json');
const versionPath = join(root, 'public', 'app', 'version.json');
const release = JSON.parse(readFileSync(releasePath, 'utf8'));
const published = JSON.parse(readFileSync(versionPath, 'utf8'));

if (!flag('--rebuild')) {
  if (!notes.length) {
    console.error('Add at least one --notes "…" describing the release (shown to users).');
    process.exit(1);
  }
  const [maj, min, pat] = release.versionName.split('.').map(Number);
  release.versionCode += 1;
  release.versionName = flag('--major') ? `${maj + 1}.0.0` : flag('--minor') ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;
  writeFileSync(releasePath, JSON.stringify(release, null, 2) + '\n');
}

// Java/SDK from Android Studio; a plain temp dir avoids Java's "Unable to establish
// loopback connection" on some Windows setups.
const tmp = join(homedir(), '.heliaxis-build-tmp');
mkdirSync(tmp, { recursive: true });
const env = {
  ...process.env,
  JAVA_HOME: process.env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr',
  ANDROID_HOME: process.env.ANDROID_HOME || join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk'),
  TEMP: tmp,
  TMP: tmp,
  JAVA_TOOL_OPTIONS: `-Djava.io.tmpdir=${tmp} -Djdk.net.unixdomain.tmpdir=${tmp}`,
};
const android = join(root, 'android');
const gradlew = process.platform === 'win32' ? join(android, 'gradlew.bat') : './gradlew';
console.log(`Building Heliaxis ${release.versionName} (build ${release.versionCode})…`);
execFileSync(gradlew, ['--no-daemon', 'assembleRelease'], { cwd: android, env, stdio: 'inherit', shell: process.platform === 'win32' });

const apk = join(android, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const out = join(root, 'public', 'app', 'heliaxis.apk');
copyFileSync(apk, out);
const bytes = readFileSync(out);

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  versionPath,
  JSON.stringify(
    {
      versionCode: release.versionCode,
      versionName: release.versionName,
      minVersionCode: flag('--force') ? release.versionCode : published.minVersionCode ?? 1,
      releasedAt: flag('--rebuild') ? published.releasedAt ?? today : today,
      notes: notes.length ? notes : published.notes ?? [],
      apk: '/app/heliaxis.apk',
      sizeBytes: statSync(out).size,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
    null,
    2
  ) + '\n'
);

console.log(`\nDone: public/app/heliaxis.apk (${(bytes.length / 1048576).toFixed(1)} MB), version ${release.versionName}.`);
console.log('Commit android/release.json + public/app/ and deploy — installed apps will offer the update.');

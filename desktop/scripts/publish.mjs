// Uploads a built release (desktop/dist) to the public folder that METIS_UPDATE_URL points at: the App page download
// and the app's auto-update both read from there.
//
// Vercel Blob (recommended: no small size cap):
//   $env:BLOB_READ_WRITE_TOKEN = "<the token from Vercel > Storage > metis-desktop-releases > .env.local>"
//   npm run publish
//
// Supabase Storage (only if your plan allows files this big; the free plan caps uploads at 50 MB):
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service role key>"
//   npm run publish
//
// Order matters for auto-update: the installers go first and the latest*.yml files last, so a copy that checks for updates
// never finds a yml that points at a file which is not there yet. A key or token is only read from the environment, is used
// only to upload, and is never printed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] || 'dist');
const blobToken = process.env.BLOB_READ_WRITE_TOKEN || '';
const sbUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const bucket = process.env.METIS_BUCKET || 'metis-desktop';
const looksLikePlaceholder = (v) => /paste|your|key here|\.\.\./i.test(v);

if (!blobToken && !(sbUrl && sbKey)) {
  console.error('Set BLOB_READ_WRITE_TOKEN (Vercel Blob), or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Supabase Storage), first.');
  process.exit(1);
}
if ([blobToken, sbKey].some((v) => v && looksLikePlaceholder(v))) {
  console.error('That looks like the placeholder text, not a real key. Copy the real value and set it again.');
  process.exit(1);
}

const TYPES = { '.exe': 'application/vnd.microsoft.portable-executable', '.dmg': 'application/x-apple-diskimage', '.zip': 'application/zip', '.yml': 'text/yaml', '.blockmap': 'application/octet-stream' };
const files = readdirSync(dir).filter((f) => statSync(path.join(dir, f)).isFile() && (/^latest.*\.yml$/.test(f) || /\.(exe|dmg|zip|blockmap)$/.test(f)) && !/__uninstaller|builder-debug/.test(f));
const rank = (f) => (/\.yml$/.test(f) ? 2 : /\.blockmap$/.test(f) ? 1 : 0);
files.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
if (!files.length) {
  console.error(`Nothing to upload in ${dir}. Run npm run dist first.`);
  process.exit(1);
}

async function toBlob() {
  const { put } = await import('@vercel/blob');
  let base = '';
  for (const f of files) {
    const body = readFileSync(path.join(dir, f));
    process.stdout.write(`Uploading ${f} (${(body.length / 1048576).toFixed(1)} MB)… `);
    const r = await put(`${bucket}/${f}`, body, {
      access: 'public',
      token: blobToken,
      addRandomSuffix: false,
      allowOverwrite: true,
      multipart: body.length > 20 * 1048576,
      contentType: TYPES[path.extname(f)] || 'application/octet-stream',
      // The feed must be seen quickly; the installers never change once published.
      cacheControlMaxAge: /\.yml$/.test(f) ? 60 : 31536000,
    });
    console.log('done');
    base = r.url.slice(0, r.url.lastIndexOf('/'));
  }
  return base;
}

async function toSupabase() {
  for (const f of files) {
    const body = readFileSync(path.join(dir, f));
    process.stdout.write(`Uploading ${f} (${(body.length / 1048576).toFixed(1)} MB)… `);
    const r = await fetch(`${sbUrl}/storage/v1/object/${bucket}/${encodeURIComponent(f)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sbKey}`, apikey: sbKey, 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'x-upsert': 'true', 'Cache-Control': /\.yml$/.test(f) ? 'no-cache' : 'max-age=31536000' },
      body,
    });
    if (!r.ok) {
      console.log('failed');
      const text = (await r.text()).slice(0, 300).replace(sbKey, '…');
      console.error(`${r.status} ${text}`);
      if (/too large|413|exceeded the maximum/i.test(text)) console.error('\nYour Supabase plan caps the file size. Use Vercel Blob instead (set BLOB_READ_WRITE_TOKEN).');
      process.exit(1);
    }
    console.log('done');
  }
  return `${sbUrl}/storage/v1/object/public/${bucket}`;
}

try {
  const base = blobToken ? await toBlob() : await toSupabase();
  console.log(`\nPublished. Set METIS_UPDATE_URL in Vercel to:\n${base}`);
} catch (e) {
  console.error(`\nUpload failed: ${String(e.message || e).replace(blobToken || '\u0000', '…')}`);
  process.exitCode = 1;
}

// Uploads a built release (desktop/dist) to the public Supabase Storage bucket that METIS_UPDATE_URL points at.
//
//   $env:SUPABASE_URL = "https://<project>.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service role key>"      # never commit it; it is only read from the environment
//   npm run publish
//
// Order matters for auto-update: the installers go first and the latest*.yml files last, so a copy that checks for updates
// never finds a yml that points at a file which is not there yet. The key is used only to upload and is never printed.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const bucket = process.env.METIS_BUCKET || 'metis-desktop';
const dir = path.resolve(process.argv[2] || 'dist');
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
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

for (const f of files) {
  const body = readFileSync(path.join(dir, f));
  process.stdout.write(`Uploading ${f} (${(body.length / 1048576).toFixed(1)} MB)… `);
  const r = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(f)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'x-upsert': 'true', 'Cache-Control': /\.yml$/.test(f) ? 'no-cache' : 'max-age=31536000' },
    body,
  });
  if (!r.ok) {
    console.log('failed');
    console.error(`${r.status} ${(await r.text()).slice(0, 300).replace(key, '…')}`);
    process.exit(1);
  }
  console.log('done');
}
console.log(`\nPublished to ${url}/storage/v1/object/public/${bucket}/. Set METIS_UPDATE_URL in Vercel to that address.`);

// The ProspectPV map (maplibre-gl 6) does its tile work in a web worker that has to be served as a file; a bundler does not
// emit it. Copied from node_modules to /maplibre/ before `next build` and `next dev` (package.json), like the zxing decoder.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'node_modules/maplibre-gl/dist');
const to = join(root, 'public/maplibre');
const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
if (!existsSync(join(dist, files[0]))) {
  console.warn('copy-maplibre: maplibre-gl is not installed; the ProspectPV map will not load.');
} else {
  mkdirSync(to, { recursive: true });
  for (const f of files) if (existsSync(join(dist, f))) copyFileSync(join(dist, f), join(to, f));
}

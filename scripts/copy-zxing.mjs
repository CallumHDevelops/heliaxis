// The site app's barcode decoder (zxing-wasm, used by the barcode-detector ponyfill on iPhones and
// Firefox) is served from /portal/site/zxing_reader.wasm, so it works offline and never comes from
// jsDelivr. Copied from node_modules before `next build` and `next dev` (package.json).
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm');
const to = join(root, 'public/portal/site/zxing_reader.wasm');
if (!existsSync(from)) {
  console.warn('copy-zxing: zxing-wasm is not installed; scanning will need the native detector.');
} else {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

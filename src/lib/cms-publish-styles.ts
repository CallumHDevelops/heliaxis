import { readFileSync } from 'fs';
import { join } from 'path';

const CMS_CSS_PATH = join(process.cwd(), 'src/app/admin/cms.css');
const PREVIEW_MARKER = '/* ---------- PREVIEW (brand) ---------- */';

export type PublishStyles = { root: string; preview: string };

export function extractPublishStylesFromCss(full: string): PublishStyles {
  const previewPart = full.split(PREVIEW_MARKER)[1];
  if (!previewPart) {
    throw new Error('Publish preview styles not found in cms.css');
  }
  const preview = previewPart
    .split('.modal{')[0]
    .replace(/\.preview /g, '')
    .replace(/\.pv-block[^}]*}/g, '');

  const rootPart = full.split(':root')[1]?.split('/* app shell */')[0];
  if (!rootPart) {
    throw new Error('Publish root styles not found in cms.css');
  }
  const root = ':root' + rootPart;

  return { root, preview };
}

export function getPublishStyles(): PublishStyles {
  const full = readFileSync(CMS_CSS_PATH, 'utf8');
  return extractPublishStylesFromCss(full);
}

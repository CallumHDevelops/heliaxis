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

  // Only the CSS variables — do NOT include admin shell rules like
  // body{height:100vh;overflow:hidden} which break scrolling on the live site.
  const rootMatch = full.match(/:root\{[^}]*\}/);
  if (!rootMatch) {
    throw new Error('Publish root styles not found in cms.css');
  }

  return { root: rootMatch[0], preview };
}

export function getPublishStyles(): PublishStyles {
  const full = readFileSync(CMS_CSS_PATH, 'utf8');
  return extractPublishStylesFromCss(full);
}

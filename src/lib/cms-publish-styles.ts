import { readFileSync } from 'fs';
import { join } from 'path';

const CMS_CSS_PATH = join(process.cwd(), 'src/app/admin/cms.css');
const PREVIEW_MARKER = '/* ---------- PREVIEW (brand) ---------- */';

export type PublishStyles = { root: string; preview: string };

/** Pull @import / @font-face / :root so published pages match the CMS editor fonts. */
function extractFontAndRoot(full: string): string {
  const parts: string[] = [];
  const importMatch = full.match(/@import url\([^)]+\);?/);
  if (importMatch) parts.push(importMatch[0]);

  const faces = full.match(/@font-face\{[^}]*\}/g);
  if (faces?.length) parts.push(faces.join(''));

  const rootMatch = full.match(/:root\{[^}]*\}/);
  if (!rootMatch) {
    throw new Error('Publish root styles not found in cms.css');
  }
  parts.push(rootMatch[0]);
  return parts.join('');
}

export function extractPublishStylesFromCss(full: string): PublishStyles {
  const previewPart = full.split(PREVIEW_MARKER)[1];
  if (!previewPart) {
    throw new Error('Publish preview styles not found in cms.css');
  }
  const preview = previewPart
    .split('.modal{')[0]
    .replace(/\.preview /g, '')
    .replace(/\.pv-block[^}]*}/g, '');

  return { root: extractFontAndRoot(full), preview };
}

export function getPublishStyles(): PublishStyles {
  const full = readFileSync(CMS_CSS_PATH, 'utf8');
  return extractPublishStylesFromCss(full);
}

/** CSS bundle used by live CMS pages (matches cms-engine buildPublishCss). */
export function buildLivePublishCss(): string {
  const s = getPublishStyles();
  return (
    s.root +
    '*,*::before,*::after{box-sizing:border-box}html,body{height:auto;min-height:0;overflow:auto}body{margin:0;font-family:var(--body);background:var(--paper);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;--pv-max:1160px;--pv-gutter:24px;--pv-pad:max(var(--pv-gutter),calc((100% - var(--pv-max)) / 2))}body.dk{background:var(--paper);color:var(--ink)}.pv-page{max-width:none;margin:0;background:var(--paper);width:100%;min-height:0}body.dk .pv-page{background:var(--paper)}' +
    s.preview
  );
}

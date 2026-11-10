/**
 * Server-only: renders letters to a complete HTML document for headless
 * Chromium (PDF) or for the admin preview iframe. Fonts are embedded.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { embeddedFontCss } from '@/components/prospectpv/brand/fonts.server';
import { LETTER_CSS } from './letterCss';
import { LetterPages, type LetterPagesProps } from './registry';

/**
 * Inside a Next.js app every import of react-dom/server resolves to an empty module (the React Server Components build
 * has no string renderer), and the build fails. The letters are plain markup with no hooks or client code, so they are
 * rendered with the ordinary Node build of react-dom, loaded from node_modules at run time. next.config.ts lists these
 * files for the routes that use it, so they are present on Vercel.
 */
type DomServer = typeof import('react-dom/server');
let domServer: DomServer | null = null;
function renderToStaticMarkup(node: Parameters<DomServer['renderToStaticMarkup']>[0]): string {
  domServer ??= createRequire(path.join(process.cwd(), 'package.json'))(/* turbopackIgnore: true */ ['react-dom', 'server.node'].join('/')) as DomServer;
  return domServer.renderToStaticMarkup(node);
}

export type AddressWindowMm = { left: number; top: number; width: number; height: number };

export type RenderOptions = {
  /** Adds 3 mm bleed on every edge (settings letters.bleed_mm). */
  bleed?: boolean;
  /** DL window zone, from settings once the envelope is confirmed. */
  addressWindow?: AddressWindowMm;
  /** Override font CSS (e.g. in tests). Defaults to embedded fonts. */
  fontCss?: string;
  title?: string;
  /** Extra CSS appended last (e.g. to lay pages side by side in a preview). */
  extraCss?: string;
};

export function renderLettersHtml(letters: LetterPagesProps[], opts: RenderOptions = {}): string {
  const w = opts.addressWindow;
  const vars = w
    ? `.pv-page{--addr-left:${w.left}mm;--addr-top:${w.top}mm;--addr-w:${w.width}mm;--addr-h:${w.height}mm}`
    : '';
  const bleedCss = opts.bleed ? `@page{size:216mm 303mm;margin:0} .pv-page{--bleed:3mm}` : '';
  const body = renderToStaticMarkup(
    <>
      {letters.map((l, i) => (
        <LetterPages key={i} {...l} />
      ))}
    </>,
  );
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${escapeHtml(opts.title ?? 'ProspectPV letters')}</title>
<style>${opts.fontCss ?? embeddedFontCss()}</style>
<style>${LETTER_CSS}${vars}${bleedCss}${opts.extraCss ?? ''}</style></head><body>${body}</body></html>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

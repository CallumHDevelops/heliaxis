/**
 * Server-only: letters → print-ready A4 PDF via headless Chromium.
 *
 * On Vercel, pass a launcher using @sparticuz/chromium:
 *   import chromium from '@sparticuz/chromium';
 *   const launch = () => playwright.chromium.launch({ executablePath: await chromium.executablePath(), args: chromium.args });
 * Locally, playwright-core finds the installed Chromium.
 *
 * Fonts are embedded (data URIs in the HTML), so Chromium embeds them in the PDF.
 * If batch runs exceed Vercel's time limit, call this from a worker instead
 * (spec section 2); the function has no Next.js dependencies.
 */
import type { Browser } from 'playwright-core';
import type { LetterPagesProps } from './registry';
import { renderLettersHtml, type RenderOptions } from './render.server';

export class LetterOverflowError extends Error {
  constructor(public readonly pages: { page: number; overflowPx: number }[]) {
    super(
      `Letter content does not fit on ${pages.length} page(s): ` +
        pages.map((p) => `page ${p.page} by ${p.overflowPx}px`).join(', ') +
        '. Shorten the copy or finance wording for this template.',
    );
    this.name = 'LetterOverflowError';
  }
}

/** Measures every page: the footer must end inside the sheet. */
const OVERFLOW_CHECK = `(() => [...document.querySelectorAll('section.pv-page')].map((p, i) => {
  const box = p.getBoundingClientRect();
  const foot = p.querySelector('.pv-footer');
  const bottom = foot ? foot.getBoundingClientRect().bottom : box.bottom;
  return { page: i + 1, overflowPx: Math.ceil(bottom - box.bottom) };
}).filter((r) => r.overflowPx > 0))()`;

export async function renderLettersPdf(
  browser: Browser,
  letters: LetterPagesProps[],
  opts: RenderOptions = {},
): Promise<Buffer> {
  const html = renderLettersHtml(letters, opts);
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const overflow = (await page.evaluate(OVERFLOW_CHECK)) as { page: number; overflowPx: number }[];
    if (overflow.length) throw new LetterOverflowError(overflow);
    const pdf = await page.pdf({
      width: opts.bleed ? '216mm' : '210mm',
      height: opts.bleed ? '303mm' : '297mm',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

/** Individual PDFs named {campaign}_{UPRN}.pdf (spec 6.4), one browser for the batch. */
export async function renderIndividualPdfs(
  browser: Browser,
  campaignSlug: string,
  letters: (LetterPagesProps & { uprn: string | number })[],
  opts: RenderOptions = {},
): Promise<{ filename: string; pdf: Buffer }[]> {
  const out: { filename: string; pdf: Buffer }[] = [];
  for (const l of letters) {
    out.push({ filename: `${campaignSlug}_${l.uprn}.pdf`, pdf: await renderLettersPdf(browser, [l], opts) });
  }
  return out;
}

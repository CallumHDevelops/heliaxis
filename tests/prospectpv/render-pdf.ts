/** Renders the five sample letters (and one with bleed) to PDF: npx tsx scripts/render-pdf.ts */
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { renderLettersPdf } from '@/components/prospectpv/letters/renderPdf.server';
import { SAMPLE_LETTER, STRESS_LETTER } from '@/lib/prospectpv/fixtures/sample';
import type { TemplateKey } from '@/lib/prospectpv/types';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
try {
  const keys = [1, 2, 3, 4, 5] as TemplateKey[];
  fs.mkdirSync('preview', { recursive: true });
  fs.writeFileSync('preview/sample-letters.pdf', await renderLettersPdf(browser, keys.map((k) => ({ data: SAMPLE_LETTER, templateKey: k, preview: true }))));
  fs.writeFileSync('preview/stress-letters-bleed.pdf', await renderLettersPdf(browser, keys.map((k) => ({ data: STRESS_LETTER, templateKey: k })), { bleed: true }));
  console.log('PDFs written to preview/');
} finally {
  await browser.close();
}

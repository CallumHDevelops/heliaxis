/**
 * Renders every template (finance off and on) with SAMPLE data to HTML in
 * ./preview, and writes PDFs + PNGs if Playwright is available.
 *   npx tsx scripts/render-previews.tsx
 */
import fs from 'node:fs';
import path from 'node:path';
import { renderLettersHtml } from '@/components/prospectpv/letters/render.server';
import { TEMPLATES } from '@/components/prospectpv/letters/registry';
import { SAMPLE_LETTER, SAMPLE_LETTER_FINANCE, STRESS_LETTER } from '@/lib/prospectpv/fixtures/sample';
import type { TemplateKey } from '@/lib/prospectpv/types';

const out = path.resolve('preview');
fs.mkdirSync(out, { recursive: true });

for (const key of Object.keys(TEMPLATES).map(Number) as TemplateKey[]) {
  for (const [suffix, data] of [['', SAMPLE_LETTER], ['-finance', SAMPLE_LETTER_FINANCE], ['-stress', STRESS_LETTER]] as const) {
    const html = renderLettersHtml([{ data, templateKey: key, preview: true }], { title: `Template ${key}` });
    fs.writeFileSync(path.join(out, `template-${key}${suffix}.html`), html);
  }
}
// All five in one file, as a campaign batch would be.
fs.writeFileSync(
  path.join(out, 'all-templates.html'),
  renderLettersHtml(
    ([1, 2, 3, 4, 5] as TemplateKey[]).map((k) => ({ data: SAMPLE_LETTER, templateKey: k, preview: true })),
    { title: 'All templates' },
  ),
);
console.log('Wrote previews to', out);

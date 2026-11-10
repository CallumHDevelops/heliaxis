import { describe, expect, it } from 'vitest';
import { renderLettersHtml } from '@/components/prospectpv/letters/render.server';
import { SAMPLE_INPUTS, SAMPLE_LETTER } from '@/lib/prospectpv/fixtures/sample';
import { buildLetterData } from './letterData';
import { assetPublicUrl } from './images';
import type { TemplateKey } from './types';

const ESA = 'https://example.test/esa-unit.png';
const PKG = 'https://example.test/package-home.jpg';
const keys: TemplateKey[] = [1, 2, 3, 4, 5];

const withImages = (esa: string | null, pkg: string | null) =>
  buildLetterData({ ...SAMPLE_INPUTS, assets: { ...SAMPLE_INPUTS.assets, esa_unit: esa, package_image: pkg } }).data;

describe('package picture on the letter', () => {
  it('is carried into the letter data', () => {
    expect(withImages(ESA, PKG).images.package).toBe(PKG);
    expect(withImages(ESA, null).images.package).toBeUndefined();
    expect(SAMPLE_LETTER.images.package).toBeUndefined();
  });

  it.each(keys)('template %i shows the package picture instead of the ESA photo, when there is one', (key) => {
    const html = renderLettersHtml([{ data: withImages(ESA, PKG), templateKey: key }], { fontCss: '' });
    expect(html).toContain(PKG);
    expect(html).not.toContain(ESA);
  });

  it.each(keys)('template %i falls back to the ESA photo when the package has no picture', (key) => {
    const html = renderLettersHtml([{ data: withImages(ESA, null), templateKey: key }], { fontCss: '' });
    expect(html).toContain(ESA);
    expect(html).not.toContain(PKG);
  });

  it.each(keys)('template %i still prints when neither picture is set', (key) => {
    const html = renderLettersHtml([{ data: withImages(null, null), templateKey: key }], { fontCss: '' });
    expect(html).toContain('pv-page');
  });

  it('builds a storage address that can be loaded by anyone', () => {
    expect(assetPublicUrl('https://x.supabase.co/', 'package/abc/1.png')).toBe('https://x.supabase.co/storage/v1/object/public/prospectpv-assets/package/abc/1.png');
  });
});

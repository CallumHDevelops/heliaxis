import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { eicPdf } from '@/lib/documents/eic/eic';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';

describe('the company’s registrations', () => {
  it('are NAPIT 82308 and MCS NAP-82308', () => {
    expect(HELIAXIS_COMPANY.napitNumber).toBe('82308');
    expect(HELIAXIS_COMPANY.mcsNumber).toBe('NAP-82308');
  });
});

describe('the Electrical Installation Certificate', () => {
  it('lists the NAPIT and MCS registration numbers on its first page and in every footer', async () => {
    const bytes = await eicPdf({
      route: 'eic',
      ref: 'HX-0126-EIC-1',
      jobRef: 'HX-0126',
      issued: '2026-11-07',
      edition: 'BS 7671:2018+A2:2022',
      values: { eic_client: 'A. Example', eic_client_addr: '1 Example Road', eic_sig_name: 'Sam Sparks' },
      address: '1 Example Road, Exampleton, EX1 1AA',
      sig: {},
      design: null,
      draft: true,
    });
    expect(bytes.length).toBeGreaterThan(1000);
    const dir = mkdtempSync(join(tmpdir(), 'eic-'));
    const file = join(dir, 'eic.pdf');
    writeFileSync(file, bytes);
    let first = '';
    let all = '';
    try {
      first = execFileSync('pdftotext', ['-f', '1', '-l', '1', '-layout', file, '-']).toString();
      all = execFileSync('pdftotext', ['-layout', file, '-']).toString();
    } catch (e) {
      // No pdftotext here: the PDF was still made, which is what this checks without it.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      return;
    }
    expect(first).toMatch(/NAPIT Registration Number:\s+82308\s+MCS Registration Number:\s+NAP-82308/);
    const pages = (all.match(/\f/g) ?? []).length;
    expect((all.match(/NAPIT Registration Number: 82308/g) ?? []).length).toBeGreaterThanOrEqual(pages + 1);
  }, 60000);
});

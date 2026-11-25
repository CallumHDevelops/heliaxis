import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MetisDesktop } from '@/app/admin/app/MetisDesktop';
import type { MetisRelease } from '@/lib/metis-release';

const rel = (o: Partial<MetisRelease> = {}): MetisRelease => ({
  version: '0.1.0',
  releasedAt: '2026-11-25T20:54:25.010Z',
  windows: { file: 'Metis-Setup-0.1.0.exe', url: 'https://f.example.com/m/Metis-Setup-0.1.0.exe', sizeBytes: 102676555, sha512: null },
  mac: null,
  ...o,
});

describe('the Metis card on the App page', () => {
  it('says it is not published yet when there is no release', () => {
    const html = renderToStaticMarkup(<MetisDesktop release={null} signed={false} />);
    expect(html).toContain('Metis for your computer');
    expect(html).toContain('Not published yet');
    expect(html).not.toContain('<a ');
  });
  it('offers the Windows download with its size, and says the Mac one is not published yet', () => {
    const html = renderToStaticMarkup(<MetisDesktop release={rel()} signed={false} />);
    expect(html).toContain('Version 0.1.0');
    expect(html).toContain('href="https://f.example.com/m/Metis-Setup-0.1.0.exe"');
    expect(html).toContain('Download for Windows (98 MB)');
    expect(html).toContain('Mac version not published yet');
  });
  it('offers both when both are published', () => {
    const html = renderToStaticMarkup(<MetisDesktop release={rel({ mac: { file: 'Metis-0.1.0-mac.dmg', url: 'https://f.example.com/m/Metis-0.1.0-mac.dmg', sizeBytes: 210000000, sha512: null } })} signed />);
    expect(html).toContain('Download for Windows');
    expect(html).toContain('Download for Mac (200 MB)');
  });
  it('warns about unsigned installers until they are signed', () => {
    expect(renderToStaticMarkup(<MetisDesktop release={rel()} signed={false} />)).toContain('not code-signed yet');
    expect(renderToStaticMarkup(<MetisDesktop release={rel()} signed />)).not.toContain('not code-signed yet');
  });
});

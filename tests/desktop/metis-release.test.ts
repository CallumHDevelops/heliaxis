import { describe, expect, it } from 'vitest';
import { downloadFrom, parseFeed, releaseFrom, safeName } from '@/lib/metis-release';

// What electron-builder wrote for the real Windows build.
const WIN = `version: 0.1.0
files:
  - url: Metis-Setup-0.1.0.exe
    sha512: /6v8l8yk0JqMyqtzKr3fFN1eTU5eLrhEMlK2gC4RMGyaSvVYO2DJ2MTstuVF/LHx+Rwbvf1QobgQlFz5KoVM8Q==
    size: 102676555
path: Metis-Setup-0.1.0.exe
sha512: /6v8l8yk0JqMyqtzKr3fFN1eTU5eLrhEMlK2gC4RMGyaSvVYO2DJ2MTstuVF/LHx+Rwbvf1QobgQlFz5KoVM8Q==
releaseDate: '2026-11-25T20:54:25.010Z'
`;
const MAC = `version: 0.1.0
files:
  - url: Metis-0.1.0-universal-mac.zip
    sha512: aaa
    size: 200000000
  - url: Metis-0.1.0-mac.dmg
    sha512: bbb
    size: 210000000
path: Metis-0.1.0-universal-mac.zip
sha512: aaa
releaseDate: '2026-11-26T09:00:00.000Z'
`;
const BASE = 'https://files.example.com/metis-desktop';

describe('the Metis release feed', () => {
  it('reads the version, date, size and checksum from the Windows feed', () => {
    const p = parseFeed(WIN)!;
    expect(p.version).toBe('0.1.0');
    expect(p.releasedAt).toBe('2026-11-25T20:54:25.010Z');
    expect(downloadFrom(p, BASE, '.exe')).toEqual({ file: 'Metis-Setup-0.1.0.exe', url: `${BASE}/Metis-Setup-0.1.0.exe`, sizeBytes: 102676555, sha512: '/6v8l8yk0JqMyqtzKr3fFN1eTU5eLrhEMlK2gC4RMGyaSvVYO2DJ2MTstuVF/LHx+Rwbvf1QobgQlFz5KoVM8Q==' });
  });
  it('offers the Mac disk image, not the update zip', () => {
    const d = downloadFrom(parseFeed(MAC), BASE, '.dmg')!;
    expect(d.file).toBe('Metis-0.1.0-mac.dmg');
    expect(d.sizeBytes).toBe(210000000);
  });
  it('combines both, and works with only one published', () => {
    const both = releaseFrom(WIN, MAC, BASE)!;
    expect(both.windows?.file).toMatch(/\.exe$/);
    expect(both.mac?.file).toMatch(/\.dmg$/);
    expect(releaseFrom(WIN, null, BASE)!.mac).toBeNull();
    expect(releaseFrom(null, MAC, BASE)!.windows).toBeNull();
  });
  it('returns nothing when nothing usable is published', () => {
    expect(releaseFrom(null, null, BASE)).toBeNull();
    expect(releaseFrom('not a feed', '', BASE)).toBeNull();
    expect(parseFeed('files:\n  - url: x.exe')).toBeNull(); // no version
  });
  it('never builds a link from a file name that is a path or has odd characters', () => {
    for (const bad of ['../evil.exe', 'a/b.exe', '..\\x.exe', 'http://evil.example/x.exe', 'x.exe?y=1', '']) expect(safeName(bad), bad).toBe(false);
    const feed = `version: 1.0.0\nfiles:\n  - url: http://evil.example/x.exe\n    size: 1\n`;
    expect(downloadFrom(parseFeed(feed), BASE, '.exe')).toBeNull();
    expect(safeName('Metis-Setup-0.1.0.exe')).toBe(true);
  });
  it('always builds the address from our own base', () => {
    const d = downloadFrom(parseFeed(WIN), `${BASE}/`, '.exe')!;
    expect(d.url.startsWith(`${BASE}/`)).toBe(true);
    expect(d.url).not.toContain('//Metis');
  });
});

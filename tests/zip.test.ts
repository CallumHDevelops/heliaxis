import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, uniqueName, zip, zipName } from '@/lib/zip';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('zip', () => {
  it('reads back: names, contents and checksums (UTF-8 names included)', () => {
    const out = zip([
      { name: 'HX-0126 Covering letter.pdf', data: bytes('%PDF-1.7 hello') },
      { name: 'Café notes.txt', data: bytes('one\ntwo') },
      { name: 'empty.txt', data: new Uint8Array() },
    ]);
    // End of central directory: the entry count and where the directory starts.
    const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
    expect(v.getUint32(out.length - 22, true)).toBe(0x06054b50);
    expect(v.getUint16(out.length - 22 + 10, true)).toBe(3);
    // And a real unzip agrees.
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    const file = join(dir, 'a.zip');
    writeFileSync(file, out);
    let listed = '';
    try {
      listed = execFileSync('python3', ['-I', '-c', 'import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print("|".join(i.filename for i in z.infolist())); print(z.read("Café notes.txt").decode())', file]).toString();
    } catch (e) {
      // No python here: the structure checks above still ran.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    if (listed) {
      expect(listed).toContain('HX-0126 Covering letter.pdf|Café notes.txt|empty.txt');
      expect(listed).toContain('one\ntwo');
    }
    expect(readFileSync(file).length).toBe(out.length);
  });
});

describe('names', () => {
  it('cleans what a computer refuses and what would make a folder', () => {
    expect(zipName('HX-0126 / Cover: letter?.pdf')).toBe('HX-0126 Cover letter .pdf');
    expect(zipName('..\\..\\evil.pdf')).toBe('evil.pdf');
    expect(zipName('   ')).toBe('file');
  });
  it('makes a repeated name unique', () => {
    const used = new Set<string>();
    expect(uniqueName('Quote.pdf', used)).toBe('Quote.pdf');
    expect(uniqueName('quote.PDF', used)).toBe('quote (2).PDF');
    expect(uniqueName('Quote.pdf', used)).toBe('Quote (3).pdf');
  });
});

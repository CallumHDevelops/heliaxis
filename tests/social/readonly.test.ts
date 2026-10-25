import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertReadOnly, ReadOnlyViolation } from '@/lib/social/readonlyGuard';

describe('read-only guard', () => {
  it('allows GET to Meta hosts', () => {
    expect(() => assertReadOnly('GET', 'https://graph.facebook.com/v23.0/me')).not.toThrow();
    expect(() => assertReadOnly('get', 'https://graph.instagram.com/me')).not.toThrow();
  });
  it('refuses every other method', () => {
    for (const m of ['POST', 'DELETE', 'PUT', 'PATCH']) expect(() => assertReadOnly(m, 'https://graph.facebook.com/x/comments')).toThrow(ReadOnlyViolation);
  });
  it('refuses other hosts', () => {
    expect(() => assertReadOnly('GET', 'https://example.com/')).toThrow(ReadOnlyViolation);
  });
});

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

describe('social code never writes to a platform', () => {
  const roots = ['src/lib/social', 'src/app/admin/social', 'src/app/api/cron/social'].filter((r) => fs.existsSync(r));
  const src = roots.flatMap(files).filter((f) => /\.tsx?$/.test(f) && !f.endsWith('readonlyGuard.ts'));
  it('has no direct fetch, and no method other than GET', () => {
    for (const f of src) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/\bfetch\s*\(/);
      expect(text, f).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
    }
  });
});

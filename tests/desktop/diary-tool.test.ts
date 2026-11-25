import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(path.resolve(__dirname, '../../src/lib/assistant/diary-tools.ts'), 'utf8');

describe('the diary tool', () => {
  it('only ever writes to the diary, through the same validation as the Diary page', () => {
    const tables = [...src.matchAll(/\.from\('([a-z_]+)'\)\s*\.(insert|update|upsert|delete)\(/g)].map((m) => `${m[1]}.${m[2]}`);
    expect(tables).toEqual(['diary_entries.insert']);
    expect(src).toMatch(/entryFromInput\(raw, null, settings\)/);
  });
  it('puts it in the user’s own diary and never guesses whose', () => {
    expect(src).toMatch(/profileEmail\.toLowerCase\(\) === email/);
    expect(src).toMatch(/mine\.length !== 1/);
    expect(src.indexOf('mine.length !== 1')).toBeLessThan(src.indexOf('entryFromInput('));
    expect(src).not.toMatch(/surveyor_key:\s*s\(input/); // the diary owner is never taken from what the model says
  });
  it('invites and sends nothing', () => {
    expect(src).not.toMatch(/resend|ms365|sendMail|whatsapp\/send|sendManual|sendSms|attendees/i);
  });
});

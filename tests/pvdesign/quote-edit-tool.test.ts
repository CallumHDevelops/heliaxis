import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '../..');
const src = readFileSync(path.join(root, 'src/lib/assistant/quote-edit-tools.ts'), 'utf8');
const versions = readFileSync(path.join(root, 'src/lib/quotes/versions.ts'), 'utf8');

describe('quote edits: versioned, confirmed, draft only', () => {
  it('refuses to edit a quote that has been sent or accepted', () => {
    expect(src).toMatch(/q\.status === 'draft'/);
    const edit = src.slice(src.indexOf("case 'edit_quote'"));
    expect(edit.indexOf('draftOnly(q)')).toBeGreaterThan(0);
    expect(edit.indexOf('draftOnly(q)')).toBeLessThan(edit.indexOf('applyEdits('));
  });
  it('saves the new version before it changes the quote, and the quote update is guarded to drafts', () => {
    const i = src.indexOf('await saveVersion(db, q.id, { title, content: next');
    const j = src.indexOf(".from('crm_quotes').update({ content: next");
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(src.slice(j, j + 200)).toMatch(/\.eq\('status', 'draft'\)/);
  });
  it('previews a change that overwrites and only saves with confirmed true', () => {
    const gate = src.indexOf('overwrites && input.confirmed !== true');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(src.indexOf('await saveVersion(db, q.id, { title, content: next'));
    expect(src).toMatch(/needs_confirmation: true/);
  });
  it('restoring is also a new version and needs confirmation', () => {
    expect(src).toMatch(/overwrites = true;\s*summary = `Restored version/);
  });
  it('never sets a quote to sent or accepted, never deletes, never sends', () => {
    expect(src).not.toMatch(/status:\s*'(sent|accepted|declined)'/);
    expect(src).not.toMatch(/sent_at|\.delete\(/);
    expect(src).not.toMatch(/resend|ms365|sendMail|whatsapp\/send|sendManual|sendSms|sendQuoteForSigning/);
  });
  it('writes only the quote row, and the version and document stores', () => {
    const tables = [...src.matchAll(/\.from\('([a-z_]+)'\)\s*\.(insert|update|upsert)\(/g)].map((m) => `${m[1]}.${m[2]}`);
    expect(new Set(tables)).toEqual(new Set(['crm_quotes.update']));
    expect(versions).toMatch(/from\('crm_quote_versions'\)\.insert\(/);
    expect(versions).not.toMatch(/\.(update|upsert|delete)\(/); // a version is never changed or removed
  });
  it('never guesses a price for an added item: price-book items are priced from the book', () => {
    expect(src).toMatch(/priceJob\(\{ items: \[\{ sku: o\.sku/);
  });
  it('the version table has no policies and keeps versions unique', () => {
    const sql = readFileSync(path.join(root, 'supabase/quote-versions.sql'), 'utf8');
    expect(sql).toMatch(/enable row level security/);
    expect(sql).toMatch(/unique \(quote_id, version\)/);
    expect(sql).not.toMatch(/create policy/i);
  });
});

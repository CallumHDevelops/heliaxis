import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { threadTitle, visibleMessages } from '@/lib/assistant/thread';
import type { Msg } from '@/lib/assistant/run';

const user = (text: string): Msg => ({ role: 'user', content: text });
const bot = (text: string): Msg => ({ role: 'assistant', content: [{ type: 'text', text } as never] });

describe('thread titles', () => {
  it('uses the given name first', () => {
    expect(threadTitle({ title: '  Price job  ', messages: [user('hello')] })).toBe('Price job');
  });
  it('falls back to the start of the first thing said, tidied and shortened', () => {
    expect(threadTitle({ title: null, messages: [user('Create a quote\n for   Henry Price')] })).toBe('Create a quote for Henry Price');
    const long = threadTitle({ title: null, messages: [user('x'.repeat(200))] });
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith('…')).toBe(true);
  });
  it('calls an empty chat "New chat"', () => {
    expect(threadTitle({ title: undefined, messages: [] })).toBe('New chat');
  });
  it('shows only words, not tool calls', () => {
    const m: Msg[] = [user('hi'), { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 'x', input: {} } as never] }, bot('done')];
    expect(visibleMessages(m).map((x) => x.text)).toEqual(['hi', 'done']);
  });
});

/** The lookups are read-only and keep to what the person may reach. */
describe('lookup tools', () => {
  const src = readFileSync(path.resolve(__dirname, '../../src/lib/assistant/lookup-tools.ts'), 'utf8');
  it('never write to the database', () => {
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(src).not.toMatch(/\.rpc\(/);
  });
  it('check the Subcontractors portal and keep mail to the user’s own mailbox', () => {
    expect(src).toMatch(/canAccess\(p, 'subcontractors'\)/);
    expect(src).toMatch(/from\('mail_boxes'\)[^;]*eq\('user_id', me\.id\)/);
  });
  it('never expose subcontractor secrets or banking-like fields', () => {
    expect(src).not.toMatch(/token_hash|cis_|bespoke_rates/);
  });
});

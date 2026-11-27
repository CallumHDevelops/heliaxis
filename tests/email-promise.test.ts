import { describe, expect, it } from 'vitest';
import { findPromise } from '@/lib/email/promise';

const THURSDAY = '2026-11-26';
describe('findPromise', () => {
  it.each([
    ['I’ll get a quote over to you this weekend.', 'a quote', '2026-11-28'],
    ['I\'ll call you tomorrow morning to talk it through.', 'a call', '2026-11-27'],
    ['We will send the design by Friday.', 'the design', '2026-11-27'],
    ['I’ll pop the proposal over to you early next week', 'the proposal', '2026-11-30'],
    ['I\'ll email you the quote on Monday', 'a quote', '2026-11-30'],
    ['The quote will be with you by end of week', 'a quote', '2026-11-27'],
  ])('%s', (text, item, due) => {
    const p = findPromise(text, THURSDAY);
    expect(p?.item).toBe(item);
    expect(p?.due).toBe(due);
  });
  it('on a Saturday, "this weekend" means today', () => {
    expect(findPromise('I\'ll send the quote over this weekend', '2026-11-28')?.due).toBe('2026-11-28');
  });
  it('ignores pleasantries and requests', () => {
    expect(findPromise('Let me know if you need anything.', THURSDAY)).toBeNull();
    expect(findPromise('Please let me know when you are free and I\'ll call you.', THURSDAY)).toBeNull();
    expect(findPromise('Thanks for your time today.', THURSDAY)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { extractShortCode } from './shortCode';

describe('extractShortCode', () => {
  it.each([
    ['7KQ4M2XA', '7KQ4M2XA'],
    [' 7kq4m2xa ', '7KQ4M2XA'],
    ['heliaxis.co.uk/r/7KQ4M2XA', '7KQ4M2XA'],
    ['https://heliaxis.co.uk/r/7kq4m2xa/optout?x=1', '7KQ4M2XA'],
  ])('%s → %s', (input, out) => expect(extractShortCode(input)).toBe(out));
  it.each(['', '   ', 'hello', '7KQ4M2X0', 'https://example.com/r/short', null, undefined])('rejects %s', (input) => expect(extractShortCode(input)).toBeNull());
});

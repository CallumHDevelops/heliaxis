import { describe, expect, it } from 'vitest';
import { parseKv, toKv } from '@/lib/kv-json';

describe('cms_kv settings are stored as JSON text', () => {
  it('round-trips an object', () => {
    expect(parseKv(toKv({ a: 1, b: { c: 2 } }))).toEqual({ a: 1, b: { c: 2 } });
  });
  it('still reads a value that was already an object', () => {
    expect(parseKv({ a: 1 })).toEqual({ a: 1 });
  });
  it('treats empty, broken or non-object values as nothing saved', () => {
    expect(parseKv(null)).toEqual({});
    expect(parseKv('')).toEqual({});
    expect(parseKv('not json')).toEqual({});
    expect(parseKv('42')).toEqual({});
  });
});

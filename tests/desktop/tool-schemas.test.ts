import { describe, expect, it } from 'vitest';
import { TOOLS } from '@/lib/assistant/tools';

/**
 * Anthropic checks every tool definition on every request, in strict mode, and rejects the whole request if one is invalid:
 * a bad tool breaks Metis completely, in HAP as well as in the desktop app. These checks catch the mistakes we have made.
 */
type Schema = Record<string, unknown>;

const typeOf = (v: unknown) => (v === null ? 'null' : Number.isInteger(v) ? 'integer' : typeof v);

/** Every problem in one schema node and below, as "path: what". */
function problems(node: unknown, at: string): string[] {
  if (!node || typeof node !== 'object') return [];
  const s = node as Schema;
  const out: string[] = [];
  const types = s.type === undefined ? null : ([] as unknown[]).concat(s.type).map(String);
  if (Array.isArray(s.enum)) {
    // A list of options is one plain type, and every option is that type: nothing to be "or null" about.
    if (Array.isArray(s.type)) out.push(`${at}: an enum cannot be combined with a type list (${JSON.stringify(s.type)}); use a plain type and an explicit option such as "any"`);
    if (types && s.enum.some((v) => !types.includes(typeOf(v)) && !(typeOf(v) === 'integer' && types.includes('number')))) out.push(`${at}: an enum value does not match the type ${JSON.stringify(s.type)}`);
  }
  if (s.type === 'object') {
    const props = (s.properties ?? {}) as Record<string, unknown>;
    if (s.additionalProperties !== false) out.push(`${at}: additionalProperties must be false`);
    const req = ((s.required ?? []) as string[]).slice().sort();
    if (JSON.stringify(req) !== JSON.stringify(Object.keys(props).sort())) out.push(`${at}: every property must be required (strict mode)`);
    for (const [k, v] of Object.entries(props)) out.push(...problems(v, `${at}.${k}`));
  }
  if (s.type === 'array') {
    if (!s.items) out.push(`${at}: an array needs items`);
    else out.push(...problems(s.items, `${at}[]`));
  }
  for (const bad of ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'format', 'minItems', 'maxItems']) if (bad in s) out.push(`${at}: "${bad}" is not supported in strict tool schemas`);
  return out;
}

describe('every Metis tool definition is valid for the API', () => {
  it('has tools', () => {
    expect(TOOLS.length).toBeGreaterThan(30);
  });
  it('has unique, well-formed names', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z][a-z0-9_]{1,63}$/);
  });
  it('has a description on every tool', () => {
    for (const t of TOOLS) expect((t.description ?? '').length, t.name).toBeGreaterThan(20);
  });
  for (const t of TOOLS) {
    it(`${t.name}: schema is valid (strict)`, () => {
      expect(problems(t.input_schema, t.name)).toEqual([]);
    });
  }
  it('the checker really catches the mistake that broke Metis', () => {
    const bad = { type: 'object', additionalProperties: false, required: ['status'], properties: { status: { type: ['string', 'null'], enum: ['draft', null] } } };
    expect(problems(bad, 'x').join(' ')).toMatch(/enum cannot be combined with a type list/);
  });
});

import { STRICT_TOOLS } from '@/lib/assistant/run';

/** The API's documented strict-mode limits: at most 20 strict tools, 24 optional parameters and 16 union-typed parameters in total. */
describe('the strict tools stay inside the API limits', () => {
  const strict = TOOLS.filter((t) => STRICT_TOOLS.has(t.name));
  const props = (t: (typeof TOOLS)[number]) => Object.values(((t.input_schema as Schema).properties ?? {}) as Record<string, Schema>);
  it('only names tools that exist', () => {
    for (const n of STRICT_TOOLS) expect(TOOLS.some((t) => t.name === n), n).toBe(true);
  });
  it('has at most 20 strict tools', () => expect(strict.length).toBeLessThanOrEqual(20));
  it('has at most 16 union-typed parameters across them', () => {
    const unions = strict.flatMap(props).filter((p) => Array.isArray(p.type)).length;
    expect(unions).toBeLessThanOrEqual(16);
  });
  it('the newer tools are not strict, so their schemas can never block Metis', () => {
    for (const n of ['create_quote', 'edit_quote', 'create_design_pack', 'create_offgrid_contract_pack', 'create_diary_entry', 'price_quote', 'list_quotes', 'find_product']) expect(STRICT_TOOLS.has(n), n).toBe(false);
  });
});

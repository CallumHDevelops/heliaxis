import { describe, expect, it } from 'vitest';
import { system, withCacheMark, type Msg } from '@/lib/assistant/run';

type Block = { type: string; text?: string; cache_control?: { type: string } };

describe('the prompt is built so it can be cached', () => {
  const a = system({ id: '1', name: 'Callum Hiscott' }) as unknown as Block[];
  const b = system({ id: '2', name: 'Esther Jones' }) as unknown as Block[];
  it('has a long stable block marked for caching, then a short one that changes', () => {
    expect(a).toHaveLength(2);
    expect(a[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(a[1].cache_control).toBeUndefined();
    expect((a[0].text ?? '').length).toBeGreaterThan(3000);
    expect((a[1].text ?? '').length).toBeLessThan(200);
  });
  it('keeps the person and the time out of the cached part, so everyone shares one cache', () => {
    expect(a[0].text).toBe(b[0].text);
    expect(a[0].text).not.toMatch(/Callum|Esther|\(UK time\)/);
    expect(a[1].text).toContain('Callum Hiscott');
    expect(b[1].text).toContain('Esther Jones');
    expect(a[1].text).toMatch(/It is .+ \(UK time\)/);
  });
  it('still tells Metis the things she must always know', () => {
    expect(a[0].text).toMatch(/cannot send anything to a customer/);
    expect(a[0].text).toMatch(/create_offgrid_contract_pack/);
  });
});

describe('withCacheMark', () => {
  it('marks the last block of the last message, on a copy', () => {
    const msgs: Msg[] = [{ role: 'user', content: 'hello' }, { role: 'assistant', content: [{ type: 'text', text: 'hi' }] as never }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'ok' }] as never }];
    const snap = JSON.stringify(msgs);
    const out = withCacheMark(msgs);
    expect(JSON.stringify(msgs)).toBe(snap); // the saved history is never touched
    const last = out[2].content as Block[];
    expect(last[last.length - 1].cache_control).toEqual({ type: 'ephemeral' });
    expect(JSON.stringify(out.slice(0, 2))).toBe(JSON.stringify(msgs.slice(0, 2)));
  });
  it('turns a plain-text message into a block so it can carry the mark', () => {
    const out = withCacheMark([{ role: 'user', content: 'hello' }]);
    expect(out[0].content).toEqual([{ type: 'text', text: 'hello', cache_control: { type: 'ephemeral' } }]);
  });
  it('leaves a history alone when its last block cannot carry a mark, and copes with none', () => {
    const odd: Msg[] = [{ role: 'assistant', content: [{ type: 'thinking', thinking: 'x', signature: 's' }] as never }];
    expect(withCacheMark(odd)).toBe(odd);
    expect(withCacheMark([])).toEqual([]);
  });
});

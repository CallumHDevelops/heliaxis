import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendTemplate } from '@/lib/whatsapp/api';
import { ESTIMATE_TEMPLATE, estimateTemplateName } from '@/lib/estimator/quote-whatsapp';
import { REFERENCE_PATTERN } from '@/lib/estimator/quote-input';
import { whatsappLink } from '@/lib/estimator/whatsapp-link';

describe('WhatsApp template with a document header', () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  beforeEach(() => {
    process.env.WHATSAPP_TOKEN = 't';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123';
    calls.length = 0;
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ messages: [{ id: 'wamid.X' }] }) };
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the PDF as the template’s header and fills the body’s blanks', async () => {
    const r = await sendTemplate('447700900123', 'estimate_ready', 'en_GB', ['Sam', 'HX-EST-ABC234'], { link: 'https://files.example/x.pdf', filename: 'Heliaxis solar estimate HX-EST-ABC234.pdf' });
    expect(r.ok).toBe(true);
    const t = calls[0].body.template as { name: string; language: { code: string }; components: { type: string; parameters: Record<string, unknown>[] }[] };
    expect(calls[0].url).toContain('/123/messages');
    expect(t.name).toBe('estimate_ready');
    expect(t.components[0]).toEqual({ type: 'header', parameters: [{ type: 'document', document: { link: 'https://files.example/x.pdf', filename: 'Heliaxis solar estimate HX-EST-ABC234.pdf' } }] });
    expect(t.components[1]).toEqual({ type: 'body', parameters: [{ type: 'text', text: 'Sam' }, { type: 'text', text: 'HX-EST-ABC234' }] });
  });
  it('a template with no header and no blanks is unchanged', async () => {
    await sendTemplate('447700900123', 'hello_world', 'en_GB');
    expect((calls[0].body.template as Record<string, unknown>).components).toBeUndefined();
  });
  it('without a header it sends only the body, as before', async () => {
    await sendTemplate('447700900123', 'x', 'en_GB', ['A']);
    const t = calls[0].body.template as { components: { type: string }[] };
    expect(t.components.map((c) => c.type)).toEqual(['body']);
  });
});

describe('the estimate template to submit', () => {
  it('is a Utility template whose two blanks have examples', () => {
    expect(ESTIMATE_TEMPLATE.category).toBe('UTILITY');
    expect([...ESTIMATE_TEMPLATE.body.matchAll(/\{\{(\d)\}\}/g)].map((m) => m[1])).toEqual(['1', '2']);
    expect(ESTIMATE_TEMPLATE.examples).toHaveLength(2);
    expect(ESTIMATE_TEMPLATE.examples[1]).toMatch(REFERENCE_PATTERN);
    expect(estimateTemplateName()).toBe('estimate_ready');
  });
  it('the wa.me link carries the reference in plain words for the webhook to read', () => {
    const url = new URL(whatsappLink('Please send my estimate HX-EST-ABC234'));
    expect(url.hostname).toBe('wa.me');
    const text = url.searchParams.get('text')!;
    expect(text.toUpperCase().match(REFERENCE_PATTERN)?.[0]).toBe('HX-EST-ABC234');
  });
});

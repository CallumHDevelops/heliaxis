import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildLeadEvent, sendLead } from '@/lib/meta-capi';
import { pixel } from '@/lib/meta-pixel';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const base = { enquiryId: '6f1c2d3e-0000-4000-8000-000000000001', email: ' Sam@Example.COM ', phone: '447700900123', postcode: 'NP20 1AA', ip: '203.0.113.9', userAgent: 'UA', fbp: 'fb.1.1.2', fbc: 'fb.1.1.abc', sourceUrl: 'https://heliaxis.co.uk/solar-estimator', value: 8262.4, kwp: 4.5, battery: true, now: 1_795_000_000_000 };

describe('Meta Lead payload', () => {
  it('is a website Lead whose event_id is the enquiry id (the same id the Pixel sends), so Meta de-duplicates', () => {
    const e = buildLeadEvent(base);
    expect(e.event_name).toBe('Lead');
    expect(e.event_id).toBe(base.enquiryId);
    expect(e.action_source).toBe('website');
    expect(e.event_source_url).toBe(base.sourceUrl);
    expect(e.event_time).toBe(1_795_000_000);
  });
  it('hashes email, phone and postcode (lower-case, trimmed, digits only) and sends the rest as given', () => {
    const u = buildLeadEvent(base).user_data as Record<string, unknown>;
    expect(u.em).toEqual([sha('sam@example.com')]);
    expect(u.ph).toEqual([sha('447700900123')]);
    expect(u.zp).toEqual([sha('np201aa')]);
    expect(u.country).toEqual([sha('gb')]);
    expect(u.client_ip_address).toBe('203.0.113.9');
    expect(u.client_user_agent).toBe('UA');
    expect(u.fbp).toBe('fb.1.1.2');
    expect(u.fbc).toBe('fb.1.1.abc');
    expect(JSON.stringify(u)).not.toContain('sam@example.com');
    expect(JSON.stringify(u)).not.toContain('447700900123');
  });
  it('leaves out what it does not have, and reports the value in whole pounds', () => {
    const e = buildLeadEvent({ ...base, phone: null, fbp: null, fbc: null, postcode: '' });
    const u = e.user_data as Record<string, unknown>;
    expect(u.ph).toBeUndefined();
    expect(u.fbp).toBeUndefined();
    expect(u.fbc).toBeUndefined();
    expect(u.zp).toBeUndefined();
    expect(e.custom_data).toMatchObject({ currency: 'GBP', value: 8262, kwp: 4.5, battery: true });
  });
});

describe('sending the Lead', () => {
  const calls: { url: string; body: { data: unknown[]; test_event_code?: string } }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return { ok: true, text: async () => '' };
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.META_PIXEL_ID;
    delete process.env.META_CAPI_TOKEN;
    delete process.env.META_TEST_EVENT_CODE;
  });
  it('does nothing until the pixel id and token are set', async () => {
    expect(await sendLead(base)).toBe(false);
    expect(calls).toHaveLength(0);
  });
  it('posts exactly one event to the pixel’s events endpoint, with the test code when set', async () => {
    process.env.META_PIXEL_ID = '1234567890';
    process.env.META_CAPI_TOKEN = 'tok';
    process.env.META_TEST_EVENT_CODE = 'TEST123';
    expect(await sendLead(base)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/1234567890/events?access_token=tok');
    expect(calls[0].body.data).toHaveLength(1);
    expect(calls[0].body.test_event_code).toBe('TEST123');
  });
});

describe('browser Pixel helper', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('is a no-op when the Pixel is not loaded (no consent)', () => {
    vi.stubGlobal('window', {});
    expect(() => pixel('Lead', { a: 1 }, 'id')).not.toThrow();
  });
  it('sends the event with the enquiry id as its eventID', () => {
    const fbq = vi.fn();
    vi.stubGlobal('window', { fbq });
    pixel('Lead', { value: 1 }, 'enq-1');
    expect(fbq).toHaveBeenCalledWith('track', 'Lead', { value: 1 }, { eventID: 'enq-1' });
  });
});

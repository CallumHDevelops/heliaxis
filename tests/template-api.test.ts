import { afterEach, describe, expect, it, vi } from 'vitest';
import { formView, type FormRow } from '@/lib/templates/forms';
import { CYLINDER_COMMISSIONING, HEAT_PUMP_COMMISSIONING } from '@/lib/templates/seed/heat-pump';
import { templateByCode, templatesForProducts } from '@/lib/templates/registry';

vi.mock('server-only', () => ({}));

const KEY = 'k'.repeat(40);
const call = async (header?: string) => {
  const { checkSimpliHeatKey } = await import('@/lib/templates/api-key');
  return checkSimpliHeatKey(new Request('https://example.test/x', { headers: header ? { authorization: header } : {} }));
};

describe('the SimpliHeat shared secret', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('says it is not configured, and answers nothing, when the key is unset or too short', async () => {
    vi.stubEnv('SIMPLIHEAT_API_KEY', '');
    expect((await call(`Bearer ${KEY}`))?.status).toBe(503);
    vi.stubEnv('SIMPLIHEAT_API_KEY', 'short');
    expect((await call('Bearer short'))?.status).toBe(503);
  });
  it('refuses a missing, wrong or differently-shaped credential', async () => {
    vi.stubEnv('SIMPLIHEAT_API_KEY', KEY);
    expect((await call())?.status).toBe(401);
    expect((await call('Bearer nope'))?.status).toBe(401);
    expect((await call(KEY))?.status).toBe(401);
    expect((await call(`Bearer ${KEY}x`))?.status).toBe(401);
    expect((await call('Bearer '))?.status).toBe(401);
  });
  it('lets the right key through', async () => {
    vi.stubEnv('SIMPLIHEAT_API_KEY', KEY);
    expect(await call(`Bearer ${KEY}`)).toBeNull();
  });
});

describe('the registry', () => {
  it('finds a template by its code', () => {
    expect(templateByCode('HX-HP-02')?.title).toBe('Heat pump commissioning record');
    expect(templateByCode('F26A')).toBeNull();
  });
  it('puts the heat pump forms on a heat pump job, and none on a solar one', () => {
    expect(templatesForProducts(['heatpump']).map((t) => t.code)).toEqual(['HX-HP-02', 'HX-HP-03', 'HX-HP-04']);
    expect(templatesForProducts(['solar', 'battery'])).toEqual([]);
    expect(templatesForProducts(['solar', 'heatpump']).length).toBe(3);
  });
});

describe('what the screen shows for a form', () => {
  const row = (over: Partial<FormRow> = {}): FormRow => ({
    id: 'r1', project_id: 'p1', template_code: 'HX-HP-02', issue: 'Issue 1', revision: 1, status: 'draft',
    answers: { hpType: 'Air source (ASHP)', supplyPhase: 'Single phase', hpModel: 'EH-8' },
    provenance: { hpModel: { by: 'Sam', at: '2026-11-06T10:00:00Z', source: 'hap' } },
    signed: {}, signed_at: null, created_at: '2026-11-06T09:00:00Z', updated_at: '2026-11-06T10:00:00Z', ...over,
  });

  it('is a form not started when there is no record: only the questions that are asked before anything is answered', () => {
    const v = formView(HEAT_PUMP_COMMISSIONING, null);
    expect(v.status).toBe('none');
    expect(v.revision).toBe(0);
    expect(v.progress.answered).toBe(0);
    // 120 questions, less the 7 three phase readings and the notification reference, which wait for an answer.
    expect(v.progress.asked).toBe(112);
    expect(v.visible.fields).toContain('collectorType');
    expect(v.visible.fields).toContain('antifreezeType');
    expect(v.visible.fields).not.toContain('v_l2n');
  });
  it('counts what is done and what is asked, for the answers given', () => {
    const v = formView(HEAT_PUMP_COMMISSIONING, row());
    expect(v.progress.answered).toBe(3);
    expect(v.progress.asked).toBe(v.progress.answered + v.progress.left);
    expect(v.visible.fields).not.toContain('collectorType');
    expect(v.visible.fields).not.toContain('v_l2n');
    expect(v.outstanding).not.toContain('hpModel');
    expect(v.outstanding).toContain('hpSerial');
  });
  it('shows who signed without sending the drawn signature', () => {
    const v = formView(HEAT_PUMP_COMMISSIONING, row({ status: 'signed', signed: { technician: { name: 'A. Engineer', at: '2026-11-06T10:15:00Z', source: 'device', image: 'data:image/png;base64,AAAA'.repeat(1000) } } }));
    expect(v.signed.technician).toEqual({ name: 'A. Engineer', at: '2026-11-06T10:15:00Z', source: 'device', image: true });
    expect(JSON.stringify(v)).not.toContain('base64');
  });
  it('works for the cylinder record too', () => {
    const v = formView(CYLINDER_COMMISSIONING, null);
    expect(v.code).toBe('HX-HP-03');
    expect(v.progress.asked).toBeGreaterThan(20);
  });
});

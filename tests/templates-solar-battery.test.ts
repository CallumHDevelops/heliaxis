import { describe, expect, it } from 'vitest';
import { isSlot } from '@/lib/handover/slots';
import { targetOf, targetsFor } from '@/lib/requests/targets';
import { outstanding } from '@/lib/templates/answers';
import { templatesForProducts } from '@/lib/templates/registry';
import { validateTemplate, visibility } from '@/lib/templates/rules';
import { PV_ARRAY_TEST, SOLAR_BATTERY_TEMPLATES } from '@/lib/templates/seed/solar-battery';

describe('the solar and battery forms', () => {
  it('pass the template rules', () => {
    for (const t of SOLAR_BATTERY_TEMPLATES) expect([t.code, validateTemplate(t)]).toEqual([t.code, []]);
  });
  it('each fills its handover pack item', () => {
    for (const t of SOLAR_BATTERY_TEMPLATES) {
      expect(isSlot(t.code)).toBe(true);
      expect(targetOf(t.code, ['solar', 'battery'])?.slot).toBe(t.code);
    }
  });
  it('belong on jobs with their technology only', () => {
    expect(templatesForProducts(['solar']).map((t) => t.code)).toEqual(['HX-PV-02', 'HX-PV-01', 'HX-PV-03']);
    expect(templatesForProducts(['battery']).map((t) => t.code)).toEqual(['HX-BAT-01', 'HX-BAT-02']);
    expect(targetsFor(['solar', 'battery']).map((t) => t.code)).toContain('HX-PV-02');
  });
  it('asks for as many strings as there are', () => {
    const asked = (n: string) => [...visibility(PV_ARRAY_TEST, { strings: n }).fields].filter((k) => /^s\d_voc$/.test(k));
    expect(asked('1')).toEqual(['s1_voc']);
    expect(asked('3')).toEqual(['s1_voc', 's2_voc', 's3_voc']);
  });
  it('asks what failed only when a string failed', () => {
    const left = (a: Record<string, string>) => outstanding(PV_ARRAY_TEST, a).map((f) => f.key);
    expect(left({ strings: '1', all_pass: 'yes' })).not.toContain('failed');
    expect(left({ strings: '1', all_pass: 'no' })).toContain('failed');
  });
});

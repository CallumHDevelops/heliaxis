import { describe, expect, it } from 'vitest';
import { widgetPayload, WIDGET_MAX_BYTES, type WidgetData } from '@/lib/widget-shared';

const base: WidgetData = {
  at: 1795345080000,
  day: 'Saturday 22 November',
  calendar: { today: [{ time: '09:00', title: 'Survey: Sarah Davies', where: 'SA19 6AB', allDay: false }], tomorrow: [] },
  tasks: [{ title: 'Call GoodWe about the inverter', due: 'Today', late: false, sub: '', href: '/admin/tasks' }],
  email: { need: 4, urgent: 1, top: [{ who: 'Sarah Davies', what: 'Wants the revised price today', urgent: true, href: '/admin/mail?t=1' }] },
};

describe('the widget payload', () => {
  it('has what the phone reads, in short keys', () => {
    const p = JSON.parse(widgetPayload(base));
    expect(p.v).toBe(1);
    expect(p.d).toBe('Saturday 22 November');
    expect(p.c[0]).toEqual({ t: '09:00', n: 'Survey: Sarah Davies', w: 'SA19 6AB' });
    expect(p.k[0]).toMatchObject({ n: 'Call GoodWe about the inverter', d: 'Today', l: 0, h: '/admin/tasks' });
    expect(p.e).toMatchObject({ n: 4, u: 1 });
    expect(p.e.i[0]).toMatchObject({ n: 'Sarah Davies', u: 1, h: '/admin/mail?t=1' });
  });

  it('links a survey or install to its job', () => {
    const p = JSON.parse(
      widgetPayload({ ...base, calendar: { today: [{ time: '10:30', title: 'Survey: Merrie Rees', where: 'CF32 8DR', allDay: false, href: '/admin/crm/687c1a54-977d-47a0-9d83-d6258f29457a' }], tomorrow: [] } })
    );
    expect(p.c[0].h).toBe('/admin/crm/687c1a54-977d-47a0-9d83-d6258f29457a');
    expect(JSON.parse(widgetPayload(base)).c[0].h).toBeUndefined();
  });

  it('leaves out the calendar and email when they can’t be read', () => {
    const p = JSON.parse(widgetPayload({ ...base, calendar: null, email: null }));
    expect(p.c).toBeUndefined();
    expect(p.e).toBeUndefined();
    expect(p.k).toHaveLength(1);
  });

  it('always fits in a Firebase message, trimming a long day', () => {
    const long = 'x'.repeat(300);
    const big: WidgetData = {
      ...base,
      calendar: { today: Array.from({ length: 30 }, () => ({ time: '10:00', title: long, where: long, allDay: false })), tomorrow: Array.from({ length: 30 }, () => ({ time: '11:00', title: long, where: '', allDay: false })) },
      tasks: Array.from({ length: 30 }, () => ({ title: long, due: 'Mon', late: true, sub: long, href: '/admin/tasks' })),
      email: { need: 99, urgent: 9, top: Array.from({ length: 10 }, () => ({ who: long, what: long, urgent: false, href: '/admin/mail?t=1' })) },
    };
    const out = widgetPayload(big);
    expect(new TextEncoder().encode(out).length).toBeLessThanOrEqual(WIDGET_MAX_BYTES);
    const p = JSON.parse(out);
    expect(p.c.length).toBeGreaterThan(0);
    expect(p.c[0].n.endsWith('…')).toBe(true);
  });
});

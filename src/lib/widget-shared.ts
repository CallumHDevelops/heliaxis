/**
 * The Hestia widget's content, and the small JSON the phone gets (android/…/HestiaWidget.java reads it). Pure, so
 * it's tested on its own (tests/widget.test.ts). Field names are short because a Firebase message must stay under
 * 4 KB: the widget shows a handful of lines anyway, so lists and text are trimmed until it fits.
 */

export type WidgetData = {
  at: number;
  day: string; // "Sat 22 Nov"
  /** Null when your Outlook calendar can't be read. */
  calendar: { today: WidgetEvent[]; tomorrow: WidgetEvent[] } | null;
  tasks: { title: string; due: string; late: boolean; sub: string; href: string }[];
  /** Null when your mailbox isn't connected to Hestia. */
  email: { need: number; urgent: number; top: { who: string; what: string; urgent: boolean; href: string }[] } | null;
};
export type WidgetEvent = { time: string; title: string; where: string; allDay: boolean };

/**
 * The phone's format, version 1:
 * { v, at, d (day), c (today's events) / m (tomorrow's): [{t time, n title, w where}], k (tasks): [{n, d due, l late 1/0,
 * s sub, h href}], e (email): {n need, u urgent, i: [{n who, s what, u 1/0, h href}]} }. c, m or e are left out when
 * there's nothing to read (so the widget can say "Calendar not connected").
 */
export const WIDGET_MAX_BYTES = 3500;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function widgetPayload(w: WidgetData, maxBytes = WIDGET_MAX_BYTES): string {
  // Longest to shortest: fewer items and shorter text until it fits.
  const shapes = [
    { items: 8, text: 60 },
    { items: 6, text: 48 },
    { items: 4, text: 40 },
    { items: 3, text: 32 },
    { items: 2, text: 24 },
  ];
  let out = '';
  for (const { items, text } of shapes) {
    const ev = (e: WidgetEvent) => ({ t: e.time, n: cut(e.title, text), ...(e.where ? { w: cut(e.where, 20) } : {}) });
    const body: Record<string, unknown> = { v: 1, at: w.at, d: w.day };
    if (w.calendar) {
      body.c = w.calendar.today.slice(0, items).map(ev);
      body.m = w.calendar.tomorrow.slice(0, Math.min(3, items)).map(ev);
    }
    body.k = w.tasks.slice(0, items).map((t) => ({ n: cut(t.title, text), d: t.due, l: t.late ? 1 : 0, ...(t.sub ? { s: cut(t.sub, text) } : {}), h: t.href }));
    if (w.email) {
      body.e = {
        n: w.email.need,
        u: w.email.urgent,
        i: w.email.top.slice(0, Math.min(4, items)).map((m) => ({ n: cut(m.who, 30), s: cut(m.what, text), u: m.urgent ? 1 : 0, h: m.href })),
      };
    }
    out = JSON.stringify(body);
    if (new TextEncoder().encode(out).length <= maxBytes) return out;
  }
  return out;
}

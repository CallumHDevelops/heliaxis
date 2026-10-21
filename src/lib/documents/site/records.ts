import 'server-only';
import { newDocument, type Kit, type Row } from '@/lib/documents/pdf-kit';
import { ISSUE } from '@/lib/documents/issue';
import { EV_FIELDS, EV_TITLE } from '@/lib/site/forms/electrician/ev';
import { HP_FIELDS, HP_TITLE } from '@/lib/site/forms/electrician/heatpump';
import { captures } from '@/lib/site/forms/electrician/shared';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { visibleFields } from '@/lib/site/rules';
import { signature, siteBox, words, type ElectricianDocInput } from './common';

/**
 * HX-EV-01, the EV Charge Point Installation Record (SPEC 2.10), and HX-HP-01, the Heat Pump
 * Electrical Supply Record (2.11): Heliaxis's own records, not regulated forms, so they print the questions as asked, in
 * their groups, with the answers. Only questions asked on the job print; nothing empty.
 */

/** The rows of a record, grouped as the phone asked them. */
function record(kit: Kit, fields: Field[], c: FormCtx) {
  const step = { key: 'x', title: '', fields };
  let group = '';
  let rows: Row[] = [];
  const flush = () => {
    if (rows.length) kit.rows(rows);
    rows = [];
  };
  const groups = new Map<string, string>();
  for (const f of fields) {
    if (f.group) group = f.group;
    groups.set(f.key, group);
  }
  let current = '';
  for (const f of visibleFields(step, c)) {
    if (f.type === 'PHOTOS' || f.type === 'AUTO') continue;
    const g = groups.get(f.key) ?? '';
    if (g !== current) {
      flush();
      current = g;
      kit.section(g);
    }
    const v = words(f, c.values[f.key]);
    if (f.level === 'optional' && !v) continue;
    rows.push({ label: f.label, value: v, must: f.level === 'must' });
  }
  flush();
}

/** The serials captured in Serials, as printed ("ZAPPI-22110456"; unread labels said so). */
function serialRow(label: string, v: unknown): Row[] {
  const list = captures(v);
  if (!list.length) return [];
  const read = list.filter((x) => !x.unread).map((x) => x.s);
  const unread = list.length - read.length;
  return [{ label, value: [read.join(', '), unread ? `${unread} label${unread === 1 ? '' : 's'} couldn’t be read (photo kept)` : ''].filter(Boolean).join('; ') }];
}

export async function makeEvRecord(d: ElectricianDocInput): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'HX-EV-01', title: EV_TITLE, revision: ISSUE['HX-EV-01'], jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Installed by');
  const top = [...(d.ctx.el?.ev_model ? [{ label: 'Charger', value: d.ctx.el.ev_model }] : []), ...serialRow('Charger serial number', d.ctx.values.SN_EV)];
  if (top.length) kit.rows(top);
  record(kit, EV_FIELDS, d.ctx);
  await signature(kit, d, 'Installed and tested by');
  return kit.save();
}

export async function makeHpRecord(d: ElectricianDocInput): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'HX-HP-01', title: HP_TITLE, revision: ISSUE['HX-HP-01'], jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Installed by');
  const top = [
    ...(d.ctx.el?.heat_pump_model ? [{ label: 'Heat pump', value: d.ctx.el.heat_pump_model }] : []),
    ...serialRow('Outdoor unit serial number', d.ctx.values.SN_HP),
    ...serialRow('Indoor unit / controller serial number', d.ctx.values.SN_HP2),
  ];
  if (top.length) kit.rows(top);
  kit.note('The electrical supply only. The heat pump’s own commissioning record comes from the heating engineer.');
  record(kit, HP_FIELDS, d.ctx);
  await signature(kit, d, 'Installed and tested by');
  return kit.save();
}

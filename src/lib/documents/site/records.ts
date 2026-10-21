import 'server-only';
import { newDocument, type Kit, type Row } from '@/lib/documents/pdf-kit';
import { EV_FIELDS, EV_REVISION, EV_TITLE } from '@/lib/site/forms/electrician/ev';
import { HP_FIELDS, HP_REVISION, HP_TITLE } from '@/lib/site/forms/electrician/heatpump';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { visibleFields } from '@/lib/site/rules';
import { signature, siteBox, words, type ElectricianDocInput } from './common';

/**
 * The EV Charge Point Installation Record (SPEC 2.10) and the Heat Pump Electrical Supply Record
 * (2.11): Heliaxis's own records, not regulated forms, so they print the questions as asked, in
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

export async function makeEvRecord(d: ElectricianDocInput): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'EV', label: 'EV record', title: EV_TITLE, revision: EV_REVISION, jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Project reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Installed by');
  if (d.ctx.el?.ev_model) kit.rows([{ label: 'Charger', value: d.ctx.el.ev_model }]);
  record(kit, EV_FIELDS, d.ctx);
  await signature(kit, d, 'Installed and tested by');
  return kit.save();
}

export async function makeHpRecord(d: ElectricianDocInput): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'HP', label: 'Heat pump supply', title: HP_TITLE, revision: HP_REVISION, jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Project reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Installed by');
  if (d.ctx.el?.heat_pump_model) kit.rows([{ label: 'Heat pump', value: d.ctx.el.heat_pump_model }]);
  kit.note('The electrical supply only. The heat pump’s own commissioning record comes from the heating engineer.');
  record(kit, HP_FIELDS, d.ctx);
  await signature(kit, d, 'Installed and tested by');
  return kit.save();
}

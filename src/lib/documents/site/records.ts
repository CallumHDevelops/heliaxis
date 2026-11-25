import 'server-only';
import { newDocument, type Kit, type Row } from '@/lib/documents/pdf-kit';
import { ISSUE } from '@/lib/documents/issue';
import { HELIAXIS_COMPANY } from '@/lib/subcontractors/agreement';
import { evCircuit } from '@/lib/site/forms/electrician/carry';
import { EV_FIELDS, EV_TITLE } from '@/lib/site/forms/electrician/ev';
import { HP_FIELDS, HP_TITLE } from '@/lib/site/forms/electrician/heatpump';
import { captures, readOf } from '@/lib/site/forms/electrician/shared';
import { NEW_IN_V6, NOT_ON_EARLIER, V6 } from '@/lib/site/forms/legacy';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { visibleFields } from '@/lib/site/rules';
import { signature, siteBox, words, type ElectricianDocInput } from './common';

/**
 * HX-EV-01, the EV Charge Point Installation Record (SPEC 2.10), and HX-HP-01, the Heat Pump
 * Electrical Supply Record (2.11): Heliaxis's own records, not regulated forms, so they print the questions as asked, in
 * their groups, with the answers. Only questions asked on the job print; nothing empty. A record
 * from an assignment made before version 6 says "Not on the earlier version" for a version 6
 * question left unanswered.
 */

/** The rows of a record, grouped as the phone asked them. */
function record(kit: Kit, fields: Field[], c: FormCtx, version: number = V6) {
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
    if (!v && version < V6 && NEW_IN_V6.has(f.key)) {
      rows.push({ label: f.label, value: NOT_ON_EARLIER });
      continue;
    }
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
  const kit = await newDocument({ code: 'HX-EV-01', title: EV_TITLE, revision: ISSUE['HX-EV-01'], jobRef: d.jobRef, issued: d.date, draft: d.draft, variant: d.variant });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Installed by');
  const top = [...(d.ctx.el?.ev_model ? [{ label: 'Charger', value: d.ctx.el.ev_model }] : []), ...serialRow('Charger serial number', d.ctx.values.SN_EV)];
  if (top.length) kit.rows(top);
  record(kit, EV_FIELDS, d.ctx, d.schemaVersion ?? 1);
  await signature(kit, d, 'Installed and tested by');
  return kit.save();
}

/* ── HX-EV-03: the customer's commissioning and handover certificate ───────── */

export const EV_HANDOVER_TITLE = 'EV charger commissioning and handover certificate';

const EV_FIELD = new Map(EV_FIELDS.map((f) => [f.key, f]));
/** "B32 A" from the EIC's circuit: the overcurrent device's type and rating, and its RCD. */
function deviceWords(c: Record<string, unknown>): string | null {
  const str = (k: string) => (typeof c[k] === 'string' && (c[k] as string).trim() ? (c[k] as string).trim() : null);
  const n = (k: string) => (typeof c[k] === 'number' ? (c[k] as number) : null);
  const ocpd = [str('ocpd_type') && n('ocpd_a') !== null ? `Type ${str('ocpd_type')} ${n('ocpd_a')} A` : n('ocpd_a') !== null ? `${n('ocpd_a')} A` : null, str('ocpd_bs') ? `BS EN ${str('ocpd_bs')}` : null].filter(Boolean).join(', ');
  const rcd = c.rcd === 'yes' ? ['RCD', str('rcd_type') && `Type ${str('rcd_type')}`, n('rcd_idn') !== null && `${n('rcd_idn')} mA`].filter(Boolean).join(' ') : null;
  return [ocpd, rcd].filter(Boolean).join('; ') || null;
}

/**
 * HX-EV-03 (25 Nov 2026): what the customer is handed for their charger, made at the electrician's
 * sign-off from what they already gave (the EV record, the serials, the EIC's circuit and the job's
 * charger model), so nothing is typed twice. What was installed, how it's set up, the test charge,
 * and what the customer was shown. Signed by the electrician only: the customer's own signature is
 * the completion sign-off's (HX-HO-08). Claims no certification for the charger.
 */
export async function makeEvHandover(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const v = c.values;
  const version = d.schemaVersion ?? 1;
  const kit = await newDocument({ code: 'HX-EV-03', title: EV_HANDOVER_TITLE, revision: ISSUE['HX-EV-03'], jobRef: d.jobRef, issued: d.date, draft: d.draft, variant: d.variant });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Commissioned by');
  /** An EV record answer as a row: its words, "Not on the earlier version" for one schema 6 added, else empty (must). */
  const row = (key: string, label?: string): Row => {
    const f = EV_FIELD.get(key)!;
    const value = words(f, v[key]);
    if (!value && version < V6 && NEW_IN_V6.has(key)) return { label: label ?? f.label, value: NOT_ON_EARLIER };
    return { label: label ?? f.label, value, must: true };
  };
  const yes = (k: string) => v[k] === true;

  const circuit = evCircuit(v);
  kit.section('What was installed');
  // The model and serial come from Job details and the label photo: shown when known, never a reason not to print.
  const model = c.el?.ev_model || [readOf(c, 'EP41')?.make, readOf(c, 'EP41')?.model].filter(Boolean).join(' ') || null;
  kit.rows([
    { label: 'Charger', value: model },
    ...(serialRow('Serial number', v.SN_EV).length ? serialRow('Serial number', v.SN_EV) : [{ label: 'Serial number', value: null }]),
    row('ev_kw', 'Rating'),
    row('ev_tether', 'Tethered or untethered'),
    { label: 'Circuit', value: circuit ? [circuit.n ? `Circuit ${circuit.n}` : null, typeof circuit.desc === 'string' ? circuit.desc : null].filter(Boolean).join(': ') || null : null },
    { label: 'Protective device', value: (circuit && deviceWords(circuit)) || words(EV_FIELD.get('ev_rcd')!, v.ev_rcd), must: true },
    ...(v.ev_isolator === 'yes' || v.ev_isolator === 'no' ? [{ label: 'Isolator', value: v.ev_isolator === 'yes' ? 'Fitted, labelled' : 'None: isolate it at the consumer unit' }] : []),
  ]);

  kit.section('How it’s set up');
  kit.rows([
    { label: 'Current limit', value: v.ev_load === 'yes' ? (typeof v.ev_limit === 'number' ? `${v.ev_limit} A` : null) : v.ev_load === 'no' ? 'None set (no load management)' : null, must: true },
    { label: 'Load management', value: v.ev_load === 'yes' ? 'Fitted (CT clamp or load management)' : v.ev_load === 'no' ? 'None' : null, must: true },
    { label: 'Connection', value: v.ev_online === 'yes' ? 'Online (Wi-Fi or 4G)' : v.ev_online === 'no' ? `Not online${typeof v.ev_online_n === 'string' && v.ev_online_n.trim() ? `: ${v.ev_online_n.trim()}` : ''}` : null, must: true },
    { label: 'Default off-peak charging hours', value: yes('ev_hours') ? 'Set, and shown to you with how to change them' : null, must: true },
    { label: 'Randomised delay', value: yes('ev_random') ? 'Active' : version < V6 && v.ev_random === undefined ? NOT_ON_EARLIER : null, must: true },
    row('ev_firmware', 'Firmware version'),
    row('ev_app', 'Your app account set up'),
    row('ev_test', 'Test charge'),
  ]);

  const shown = ['ev_show_start', 'ev_show_sched', 'ev_show_rcd', 'ev_show_iso', 'ev_show_lights', 'ev_show_contact', 'ev_show_warranty'];
  kit.section('What we showed you');
  kit.rows(shown.map((k) => (yes(k) ? { label: EV_FIELD.get(k)!.label, value: 'Shown' } : row(k))));

  kit.section('If something isn’t right');
  kit.paragraph(`Stop charging and switch the charger off at its isolator, or at its circuit breaker in the consumer unit. Then call us on ${HELIAXIS_COMPANY.phone} or email ${HELIAXIS_COMPANY.email}.`);

  await signature(kit, d, 'Commissioned and handed over by');
  return kit.save();
}

export async function makeHpRecord(d: ElectricianDocInput): Promise<Uint8Array> {
  const kit = await newDocument({ code: 'HX-HP-01', title: HP_TITLE, revision: ISSUE['HX-HP-01'], jobRef: d.jobRef, issued: d.date, draft: d.draft, variant: d.variant });
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

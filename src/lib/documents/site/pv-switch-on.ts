import 'server-only';
import { newDocument, type CheckItem } from '@/lib/documents/pdf-kit';
import { ISSUE } from '@/lib/documents/issue';
import { RECORD_TITLE } from '@/lib/site/declaration';
import { PV_SWITCHON_FIELDS, PV_SWITCHON_GROUPS, PV_SWITCHON_ROWS } from '@/lib/site/forms/electrician/pv-switch-on';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { valueOf } from '@/lib/site/rules';
import { markOf, signature, siteBox, type ElectricianDocInput } from './common';

/**
 * HX-PV-03 Solar PV switch-on record (WORDING-SPEC 3.2): its three groups, a drawn ✓, ✗ or N/A on
 * each row, worked-out rows saying where they came from, numbered notes for each ✗, then the
 * statement as signed and the signature of whoever switched it on.
 */

export const PV_SWITCHON_TITLE = RECORD_TITLE['HX-PV-03'];
const CODE = 'HX-PV-03';

const BY_KEY = new Map<string, Field>(PV_SWITCHON_FIELDS.map((f) => [f.key, f]));
const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Where a worked-out row's answer came from, on the record. */
function from(key: string, c: FormCtx): string | null {
  if (key === 'pvc_labels') return 'From the PV inspection';
  if (key === 'pvc_start' || key === 'pvc_monitoring') return 'From Finish';
  if (key === 'pvc_meter') return num(c.values.EP26r) !== null ? `From Serials: ${c.values.EP26r} kWh` : 'From Serials';
  if (key === 'pvc_export') return 'No export limit in the design';
  return null;
}

export async function makePvSwitchOn(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const kit = await newDocument({ code: CODE, title: PV_SWITCHON_TITLE, revision: ISSUE[CODE], jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Switched on by', 'Switch-on date');
  const notes: string[] = [];
  for (const g of PV_SWITCHON_GROUPS) {
    kit.section(g);
    kit.checklist(
      PV_SWITCHON_ROWS.filter((r) => r.group === g).map((r): CheckItem => {
        const f = BY_KEY.get(r.key)!;
        const given = Object.prototype.hasOwnProperty.call(c.values, r.key);
        const v = valueOf(f, c);
        const mark = markOf(v);
        let note: string | null = null;
        if (mark === 'cross') {
          notes.push((r.key === 'pvc_monitoring' ? text(c, 'EF2n') : text(c, `${r.key}n`)) || 'See the notes below.');
          note = `Note ${notes.length}`;
        }
        const worked = !given && v !== undefined ? from(r.key, c) : null;
        return { label: r.q, mark, must: true, note: [note, worked].filter(Boolean).join(' · ') || null };
      })
    );
  }
  if (notes.length) {
    kit.section('Notes');
    kit.rows(notes.map((t, i) => ({ label: `Note ${i + 1}`, value: t })));
  }
  await signature(kit, d, 'Switched on by', CODE);
  return kit.save();
}

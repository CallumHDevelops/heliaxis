import 'server-only';
import { newDocument, type CheckItem } from '@/lib/documents/pdf-kit';
import { ISSUE } from '@/lib/documents/issue';
import { RECORD_TITLE } from '@/lib/site/declaration';
import { FRAME_QUESTIONS, frameNeedsLine, mountingOf, MOUNTINGS, PV_INSPECT_FIELDS, PV_INSPECT_ROWS, PV_INSPECT_SECTIONS, type PvInspectRow, type PvInspectSection } from '@/lib/site/forms/electrician/pv-inspect';
import { NEW_IN_V4, NOT_ON_EARLIER, savedBeforeV4 } from '@/lib/site/forms/legacy';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { valueOf } from '@/lib/site/rules';
import { markOf, signature, siteBox, type ElectricianDocInput } from './common';

/**
 * HX-PV-01 Solar PV inspection record (WORDING-SPEC 1.10): the eight sections, each question with a
 * drawn ✓, ✗ (and its note number) or N/A, worked-out rows saying where they came from. Roof and
 * panels comes from the roofer's sign-off (an older record: its electrician's own answers); the frame
 * earthing's answers and what the frame needs; the DC rating check's worked limit; Building
 * Control; the notes; the statement as signed and the inspector's signature.
 */

export const PV_INSPECT_TITLE = RECORD_TITLE['HX-PV-01'];
const CODE = 'HX-PV-01';

const BY_KEY = new Map<string, Field>(PV_INSPECT_FIELDS.map((f) => [f.key, f]));
const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');
/** Where a worked-out row's answer came from, on the record. */
const FROM: Record<string, string> = { pvi_dno: 'From the job', pvi_tests: 'From the string tests', pvi_cert: 'From the certificate', pvi_grid: 'From the switch-on' };
const YN: Record<string, string> = { yes: 'Yes', no: 'No' };

/** "Note 1", "Note 2"…: the ✗ rows' notes, numbered in the order they print, listed under Notes. */
function notes() {
  const list: string[] = [];
  return {
    add: (why: string | null | undefined) => {
      list.push(why?.trim() || 'See the notes below.');
      return `Note ${list.length}`;
    },
    list,
  };
}

export async function makePvInspect(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const kit = await newDocument({ code: CODE, title: PV_INSPECT_TITLE, revision: ISSUE[CODE], jobRef: d.jobRef, issued: d.date, draft: d.draft, variant: d.variant });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Inspected by');
  const n = notes();
  // A record signed before version 4 (a preview job) has no answer for the questions added since: it says so.
  const earlier = (key: string) => savedBeforeV4(c.answers) && NEW_IN_V4.has(key) && c.values[key] === undefined;

  const item = (key: string): CheckItem | null => {
    const f = BY_KEY.get(key)!;
    if (f.show && !f.show(c)) return null;
    const given = Object.prototype.hasOwnProperty.call(c.values, key);
    const v = valueOf(f, c);
    const mark = markOf(v);
    const why = key === 'pvi_grid' && !given ? text(c, 'pvc_gridn') : text(c, `${key}n`);
    const worked = !given && v !== undefined ? FROM[key] : null;
    const extra = key === 'pvi_dc_volts' ? (f.note?.(c) ?? null) : null;
    if (!mark && earlier(key)) return { label: f.label, mark: 'empty', note: NOT_ON_EARLIER };
    return { label: f.label, mark, must: true, note: [mark === 'cross' ? n.add(why) : null, worked, extra].filter(Boolean).join(' · ') || null };
  };
  /** A roof row: the electrician's own answer on an older record, else the roofer's sign-off. */
  const roofItem = (r: PvInspectRow): CheckItem => {
    if (c.values[r.key] !== undefined) {
      const mark = markOf(c.values[r.key]);
      return { label: r.q, mark, must: true, note: mark === 'cross' ? n.add(text(c, `${r.key}n`)) : null };
    }
    if (earlier(r.key)) return { label: r.q, mark: 'empty', note: NOT_ON_EARLIER };
    const got = r.fromRoofer!(c);
    // No roofer on the app, or one who signed before these questions: left blank, never holding up the record.
    if (!got) return { label: r.q, mark: 'empty', note: 'Not in the roofer’s sign-off' };
    const from = got.v === 'na' && mountingOf(c) === 'ground' ? 'Ground mount: not on a roof' : 'From the roofer’s sign-off';
    return { label: r.q, mark: markOf(got.v), must: true, note: [got.v === 'problem' ? n.add(got.why) : null, from].filter(Boolean).join(' · ') };
  };
  const checklist = (s: PvInspectSection) => {
    const items = PV_INSPECT_ROWS.filter((r) => r.section === s)
      .map((r) => (r.fromRoofer ? roofItem(r) : item(r.key)))
      .filter((x): x is CheckItem => !!x);
    if (items.length) kit.checklist(items);
  };

  for (const s of PV_INSPECT_SECTIONS) {
    if (s === 'Notes') continue;
    kit.section(s);
    if (s === 'Roof and panels') {
      kit.note('Checked by the roofer on the roof: from their signed sign-off.');
      kit.rows([{ label: 'Mounting', value: MOUNTINGS.find((m) => m.key === mountingOf(c))?.label ?? (earlier('pvi_mount') ? NOT_ON_EARLIER : null), must: true }]);
    }
    if (s === 'Frame earthing') {
      kit.rows(FRAME_QUESTIONS.filter((f) => !f.show || f.show(c)).map((f) => ({ label: f.label, value: YN[String(c.values[f.key] ?? '')] ?? (earlier(f.key) ? NOT_ON_EARLIER : null), must: true })));
    }
    checklist(s);
    if (s === 'Frame earthing') {
      const needs = frameNeedsLine(c);
      if (needs) kit.paragraph(needs, { bold: true });
    }
    if (s === 'Paperwork') kit.note(d.buildingRef ? `Building Control: notified by Heliaxis, ref ${d.buildingRef}` : 'Building Control: Heliaxis will notify them.');
  }

  kit.section('Notes');
  kit.rows([...n.list.map((t, i) => ({ label: `Note ${i + 1}`, value: t })), { label: 'Notes', value: text(c, 'pvi_notes') || 'None' }]);
  await signature(kit, d, 'Inspected by', CODE);
  return kit.save();
}

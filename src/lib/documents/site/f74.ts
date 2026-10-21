import 'server-only';
import { newDocument, type Kit, type ResultItem } from '@/lib/documents/pdf-kit';
import { EESS_ROWS } from '@/lib/site/forms/electrician/eess';
import { F74_INTRO, F74_PART1, F74_REVISION, F75_REVISION } from '@/lib/site/forms/electrician/f74';
import { BATTERY_SPOTS } from '@/lib/site/forms/electrician/pas63100';
import type { FormCtx } from '@/lib/site/forms/types';
import { markOf, noter, signature, siteBox, type ElectricianDocInput } from './common';

/**
 * F74 Battery Storage Inspection and Commissioning Checklist (Parts 1–4) and F75 Battery Storage
 * Commissioning Checklist (FORMS 1.3, 1.4): the 15 tests are answered once and printed in both, F74
 * under "PART 3/4", F75 under its own headings. F74 adds the maker's reference and the Part 4 notes
 * (with the earth electrode reading), and the battery location check when the job has one. F75 is
 * signed with the electrician's final signature; F74 has it at the end too (Rec.).
 */

export const F74_TITLE = 'Battery Storage Inspection and Commissioning Checklist';
export const F75_TITLE = 'Battery Storage Commissioning Checklist';

const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');
const PFN: Record<string, string> = { pass: 'Pass', fail: 'Fail', na: 'N/A' };
const YNN: Record<string, string> = { yes: 'Y', no: 'N', na: 'NA' };

/** Parts 3 and 4 (F74) or F75's two tables: the same rows and answers. */
function tests(kit: Kit, c: FormCtx, headings: [string, string]) {
  for (const part of [3, 4] as const) {
    kit.section(headings[part - 3]);
    kit.results(
      EESS_ROWS.filter((r) => r.part === part).map((r): ResultItem => {
        // The back-up tests aren't asked of a battery that gives no back-up: the electrician said so.
        const notAsked = r.backup && c.values.eess_backup === 'no';
        return {
          title: r.title,
          label: r.test,
          guidance: r.guidance ?? null,
          value: notAsked ? 'N/A' : (PFN[String(c.values[r.key] ?? '')] ?? null),
          note: notAsked ? 'No back-up on this battery.' : null,
          must: true,
        };
      })
    );
  }
}

const backupWords = (c: FormCtx) => (c.values.eess_backup === 'yes' ? 'Yes' : c.values.eess_backup === 'no' ? 'No' : null);

export async function makeF74(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const kit = await newDocument({ code: 'F74', title: F74_TITLE, revision: F74_REVISION, jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Project reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Completed by');
  kit.paragraph(F74_INTRO);
  kit.rows([{ label: 'Does this battery give back-up (island mode) power in a power cut?', value: backupWords(c), must: true }]);

  kit.section('PART 1: SYSTEM INSPECTION', { intro: 'Complete' });
  const note = noter();
  let section = '';
  let batch: ResultItem[] = [];
  const flush = () => {
    if (batch.length) kit.results(batch);
    batch = [];
  };
  for (const r of F74_PART1) {
    if (r.section !== section) {
      flush();
      section = r.section;
      kit.section(section);
    }
    const mark = markOf(c.values[r.key]);
    batch.push({ label: `${r.n}. ${r.label}`, lines: r.lines, italic: r.italic, mark, must: true, note: mark === 'cross' ? note(text(c, `${r.key}n`)) : null });
  }
  flush();
  kit.rows([{ label: 'Part 1: Notes and Observations', value: text(c, 'f74_1_notes') || 'None' }]);

  kit.section('PART 2: TESTS ACCORDING TO BS 7671');
  kit.results([{ label: 'Tests carried out', value: YNN[String(c.values.f74_2_tests ?? '')] ?? null, must: true, note: 'Y/N/NA' }]);
  kit.rows([
    { label: 'Part 2 BS 7671 certificate and schedule references', value: text(c, 'f74_2_refs') || null, must: true },
    { label: 'Part 2: Notes and observations', value: text(c, 'f74_2_notes') || 'None' },
  ]);

  tests(kit, c, ['PART 3: EQUIPMENT AND SYSTEM TESTS', 'PART 4: APPLICATION TESTS']);
  const ra = typeof c.values.eess_a_06_ra === 'number' ? `Earth electrode resistance: ${c.values.eess_a_06_ra} Ω` : null;
  kit.rows([
    { label: 'Manufacturer’s commissioning test report/schedule reference(s) (where appropriate)', value: text(c, 'f74_mfr_ref') || 'None given' },
    { label: 'Part 4: Notes and observations', value: [ra, text(c, 'f74_4_notes')].filter(Boolean).join('\n') || 'None' },
  ]);

  // The battery location check (Heliaxis's own, until the PAS 63100 wording is in: SPEC 2.9).
  if (c.values.bl_where !== undefined) {
    const yn = (k: string) => (c.values[k] === 'yes' ? 'Yes' : c.values[k] === 'no' ? 'No' : null);
    kit.section('Battery location check', { intro: 'Heliaxis’s own check of where the battery is. Not the PAS 63100 checklist.' });
    kit.rows([
      { label: 'Where is the battery?', value: BATTERY_SPOTS.find((s) => s.key === c.values.bl_where)?.label ?? null },
      ...(text(c, 'bl_whynot') ? [{ label: 'Why it isn’t outdoors', value: text(c, 'bl_whynot') }] : []),
      { label: 'Ventilated as the battery’s maker asks', value: yn('bl_vent') },
      { label: 'Smoke or heat detector where the battery is', value: yn('bl_detect') },
      { label: 'Protected from knocks', value: yn('bl_impact') },
      { label: 'Battery notices up', value: yn('bl_notice') },
      ...(text(c, 'bl_notes') ? [{ label: 'Notes', value: text(c, 'bl_notes') }] : []),
    ]);
  }
  await signature(kit, d, 'Completed by');
  return kit.save();
}

export async function makeF75(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const kit = await newDocument({ code: 'F75', title: F75_TITLE, revision: F75_REVISION, jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Project reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Completed by');
  tests(kit, c, ['Equipment and systems test', 'Application tests']);
  await signature(kit, d, 'Signed');
  return kit.save();
}

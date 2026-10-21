import 'server-only';
import { newDocument, type CheckItem, type ResultItem } from '@/lib/documents/pdf-kit';
import { ISSUE } from '@/lib/documents/issue';
import { RECORD_TITLE } from '@/lib/site/declaration';
import { BAT_INSPECT_ROWS, BAT_INSPECT_SECTIONS, BATTERY_SPOTS } from '@/lib/site/forms/electrician/battery';
import { BAT_TEST_SECTIONS, BAT_TESTS } from '@/lib/site/forms/electrician/battery-tests';
import type { FormCtx } from '@/lib/site/forms/types';
import { markOf, signature, siteBox, type ElectricianDocInput } from './common';

/**
 * The battery's two records (WORDING-SPEC 4.10, 5.1). HX-BAT-01, the inspection: back-up or not, then
 * each section's checks with a drawn ✓, ✗ (and its note number) or N/A, the location questions on
 * PAS 63100 jobs, the BS 7671 tests' reference, the notes. HX-BAT-02, the switch-on and tests: the
 * maker's commissioning, then each test as its question, help and how-to with Pass, Fail or N/A, the
 * electrode reading beside the changeover test. Each test prints once, here. Both end with the
 * statement as signed and the electrician's signature.
 */

export const BAT_INSPECT_TITLE = RECORD_TITLE['HX-BAT-01'];
export const BAT_TESTS_TITLE = RECORD_TITLE['HX-BAT-02'];

const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');
const PFN: Record<string, string> = { pass: 'Pass', fail: 'Fail', na: 'N/A' };
const YNN: Record<string, string> = { yes: 'Yes', no: 'No', na: 'N/A' };
const yn = (c: FormCtx, k: string) => (c.values[k] === 'yes' ? 'Yes' : c.values[k] === 'no' ? 'No' : null);
const noBackup = (c: FormCtx) => c.values.eess_backup === 'no';

export async function makeBatteryInspection(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const code = 'HX-BAT-01';
  const kit = await newDocument({ code, title: BAT_INSPECT_TITLE, revision: ISSUE[code], jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Inspected by');
  kit.rows([{ label: 'Back-up in a power cut', value: yn(c, 'eess_backup'), must: true }]);

  const notes: string[] = [];
  const note = (why: string) => {
    notes.push(why || 'See the notes below.');
    return `Note ${notes.length}`;
  };
  for (const s of BAT_INSPECT_SECTIONS) {
    if (s === 'Notes') continue;
    if (s === 'Electrical tests') {
      kit.section(s);
      kit.rows([
        { label: 'BS 7671 tests done', value: YNN[String(c.values.bat_tests_done ?? '')] ?? null, must: true },
        { label: 'Certificate', value: text(c, 'bat_tests_ref') || null, must: true },
      ]);
      continue;
    }
    const rows = BAT_INSPECT_ROWS.filter((r) => r.section === s);
    // No back-up and every back-up row N/A: one line says so.
    if (s === 'Back-up supply' && noBackup(c) && rows.every((r) => c.values[r.key] === 'na')) {
      kit.section(s);
      kit.paragraph('Back-up supply: not applicable, this battery gives no back-up.');
      continue;
    }
    kit.section(s);
    kit.checklist(
      rows.map((r): CheckItem => {
        const mark = markOf(c.values[r.key]);
        return { label: r.q, mark, must: true, note: mark === 'cross' ? note(text(c, `${r.key}n`)) : null };
      })
    );
    // PAS 63100 jobs: the location questions, under their own small line.
    if (s === 'Where it is' && c.values.bl_where !== undefined) {
      kit.note('PAS 63100 checks');
      kit.rows([
        { label: 'Where is the battery?', value: BATTERY_SPOTS.find((x) => x.key === c.values.bl_where)?.label ?? null },
        ...(text(c, 'bl_whynot') ? [{ label: 'Why it isn’t outside', value: text(c, 'bl_whynot') }] : []),
        { label: 'Smoke or heat detector where the battery is', value: yn(c, 'bl_detect') },
        { label: 'Protected from knocks', value: yn(c, 'bl_impact') },
        ...(text(c, 'bl_notes') ? [{ label: 'Anything else about where it’s fitted', value: text(c, 'bl_notes') }] : []),
      ]);
    }
  }
  kit.section('Notes');
  kit.rows([...notes.map((t, i) => ({ label: `Note ${i + 1}`, value: t })), { label: 'Notes', value: text(c, 'bat_inspect_notes') || 'None' }]);
  await signature(kit, d, 'Inspected by', code);
  return kit.save();
}

export async function makeBatteryTests(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const code = 'HX-BAT-02';
  const kit = await newDocument({ code, title: BAT_TESTS_TITLE, revision: ISSUE[code], jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Job reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Tested by');
  for (const s of BAT_TEST_SECTIONS) {
    if (s === 'Notes') continue;
    kit.section(s);
    if (s === 'The maker’s commissioning') {
      kit.rows([{ label: 'Maker’s commissioning reference', value: text(c, 'bat_mfr_ref') || 'None given' }]);
      continue;
    }
    // The back-up tests aren't asked of a battery that gives no back-up: the electrician said so.
    if (s === 'Back-up' && noBackup(c)) {
      kit.paragraph('Back-up: not applicable, this battery gives no back-up.');
      continue;
    }
    kit.results(
      BAT_TESTS.filter((r) => r.section === s).map((r): ResultItem => {
        const ra = r.key === 'bat_bu_switch' && typeof c.values.bat_bu_ra === 'number' ? `Earth electrode resistance: ${c.values.bat_bu_ra} Ω` : null;
        return { title: r.q, label: r.help, guidance: r.info ?? null, value: PFN[String(c.values[r.key] ?? '')] ?? null, note: ra, must: true };
      })
    );
  }
  kit.section('Notes');
  kit.rows([{ label: 'Notes', value: text(c, 'bat_test_notes') || 'None' }]);
  await signature(kit, d, 'Tested by', code);
  return kit.save();
}

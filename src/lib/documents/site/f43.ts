import 'server-only';
import { newDocument } from '@/lib/documents/pdf-kit';
import { f43Field, stringsF43 } from '@/lib/site/forms/electrician/f43';
import { perStringValues } from '@/lib/site/rules';
import { answer, signature, siteBox, words, type ElectricianDocInput } from './common';

/**
 * F43 PV Array Test Report (FORMS 1.1, SPEC 2.14): the owner's form, cleaner. The title rows, then
 * the string table with the form's groups and wording, one column per string and a new block after
 * six; comments; and the inspector's signature (Rec.: the form has no signature line).
 */

export const F43_TITLE = 'PV Array Test Report';
export const F43_REVISION = 'Rev 2';

/** The string table's rows, in the form's order and wording (the label's unit is the form's). */
export const F43_TABLE: { group: string; rows: [key: string, label: string][] }[] = [
  {
    group: 'Array',
    rows: [
      ['f43_module', 'Module'],
      ['f43_qty', 'Quantity'],
    ],
  },
  {
    group: 'Array Parameters (as specified)',
    rows: [
      ['f43_spec_voc', 'Voc (STC)'],
      ['f43_spec_isc', 'Isc (STC)'],
    ],
  },
  {
    group: 'String over-current protective device',
    rows: [
      ['f43_ocpd_type', 'Type'],
      ['f43_ocpd_a', 'Rating (A)'],
      ['f43_ocpd_v', 'DC Rating (V)'],
      ['f43_ocpd_ka', 'Capacity (kA)'],
    ],
  },
  {
    group: 'String Wiring',
    rows: [
      ['f43_wire_type', 'Type'],
      ['f43_wire_phase', 'Phase CSA (mm²)'],
      ['f43_wire_earth', 'Earth CSA (mm²)'],
    ],
  },
  {
    group: 'String Test',
    rows: [
      ['f43_test_voc', 'Voc (STC)'],
      ['f43_test_isc', 'Isc (STC)'],
      ['f43_irr', 'Irradiance'],
    ],
  },
  { group: 'Polarity Check', rows: [['f43_polarity', '']] },
  {
    group: 'Array Insulation resistance',
    rows: [
      ['f43_ir_v', 'Test Voltage (V)'],
      ['f43_ir_pos', 'Pos - Earth (MΩ)'],
      ['f43_ir_neg', 'Neg - Earth (MΩ)'],
    ],
  },
  { group: 'Earth Continuity (where fitted)', rows: [['f43_earth_cont', '']] },
  {
    group: 'Array Isolator',
    rows: [
      ['f43_iso_a', 'Rating (A)'],
      ['f43_iso_v', 'Rating (V)'],
      ['f43_iso_loc', 'Location'],
      ['f43_iso_func', 'Functional Check'],
    ],
  },
  {
    group: 'Inverter',
    rows: [
      ['f43_inv_model', 'Make and model'],
      ['f43_inv_serial', 'Serial number'],
      ['f43_inv_func', 'Functional check'],
    ],
  },
];

const PER_BLOCK = 6;

export async function makeF43(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const kit = await newDocument({ code: 'F43', title: F43_TITLE, revision: F43_REVISION, jobRef: d.jobRef, issued: d.date, draft: d.draft, variant: d.variant });
  kit.header({ meta: [['Reference', d.jobRef ?? '–'], ['Date', d.date.split('-').reverse().join('/')]] });
  const kind = f43Field('f43_kind');
  kit.rows([{ label: 'PV System Verification Certificate', value: words(kind, answer(kind, c)), must: true }]);
  siteBox(kit, d, 'Inspector');
  kit.rows([
    { label: 'Description of work under test', value: words(f43Field('f43_desc'), c.values.f43_desc), must: true },
    { label: 'Test Instruments', value: [c.values.f43_instruments, c.values.f43_cal ? `calibrated ${c.values.f43_cal}` : null].filter(Boolean).join(', ') || null, must: true },
  ]);

  // One column per string, six to a block (the form's six columns).
  const n = Math.min(12, Math.max(1, Math.round(stringsF43(c))));
  for (let from = 0; from < n; from += PER_BLOCK) {
    const cols = Array.from({ length: Math.min(PER_BLOCK, n - from) }, (_, i) => from + i);
    kit.section(n > PER_BLOCK ? `Strings ${from + 1} to ${cols.at(-1)! + 1}` : 'String tests', { intro: from === 0 ? `${n} string${n === 1 ? '' : 's'}.` : null });
    const rows: (string | null)[][] = [];
    for (const g of F43_TABLE) {
      g.rows.forEach(([key, label], i) => {
        const f = f43Field(key);
        const values = perStringValues(f, c);
        // The form's label carries the unit ("Rating (A)"); where it doesn't ("Voc (STC)"), the value does.
        const unitInLabel = !f.unit || label.includes(`(${f.unit})`) || f.unit === 'panels';
        rows.push([i === 0 ? g.group : '', label, ...cols.map((j) => words(f, values[j], unitInLabel) ?? (d.draft ? 'Not answered' : '–'))]);
      });
    }
    kit.grid({ columns: ['', 'String reference', ...cols.map((j) => String(j + 1))], rows, widths: [2.2, 1.8, ...cols.map(() => 1.2)] });
  }

  kit.section('Comments');
  kit.rows([
    ...(typeof c.values.f43_failn === 'string' && c.values.f43_failn.trim() ? [{ label: 'What failed, and what was done about it', value: c.values.f43_failn }] : []),
    { label: 'Comments', value: typeof c.values.f43_comments === 'string' && c.values.f43_comments.trim() ? c.values.f43_comments : 'None' },
  ]);
  await signature(kit, d, 'Inspector');
  return kit.save();
}

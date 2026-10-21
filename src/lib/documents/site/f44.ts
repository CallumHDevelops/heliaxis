import 'server-only';
import { newDocument, type CheckItem } from '@/lib/documents/pdf-kit';
import { F44_20_KINDS, F44_FIELDS, F44_REVISION, F44_ROWS, F44_TABLE2, F44_TABLE2_INSTRUCTION, F44_TABLE2_NOTES } from '@/lib/site/forms/electrician/f44';
import { F44A_FIELDS, F44A_REVISION, F44A_ROWS, F44A_TITLE } from '@/lib/site/forms/electrician/f44a';
import type { Field, FormCtx } from '@/lib/site/forms/types';
import { valueOf } from '@/lib/site/rules';
import { installerLines, markOf, noter, signature, siteBox, type ElectricianDocInput } from './common';

/**
 * F44 Solar PV Installation Checklist (FORMS 1.2) and F44A Solar PV Commissioning Checklist (D13,
 * ours until the owner's arrives). F44: the 38 rows with drawn ✓ / ✗ (with a note number) / N/A,
 * item 20's chosen roof, Table 2 with its instruction and notes exactly; F44A: its nine rows, the
 * worked-out ones as they were worked out. Both end with the inspector's signature.
 */

export const F44_TITLE = 'Solar PV Installation Checklist';

const BY_KEY = new Map<string, Field>([...F44_FIELDS, ...F44A_FIELDS].map((f) => [f.key, f]));
/** A row's answer: as given, else as the form works it out (items 36–38, F44A). */
const answerOf = (key: string, c: FormCtx) => valueOf(BY_KEY.get(key)!, c);
const text = (c: FormCtx, k: string) => (typeof c.values[k] === 'string' ? (c.values[k] as string).trim() : '');

export async function makeF44(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const kit = await newDocument({ code: 'F44', title: F44_TITLE, revision: F44_REVISION, jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Project reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Inspection by');
  kit.note(`Installer: ${installerLines()}`);
  const note = noter();
  const items: CheckItem[] = [];
  for (const r of F44_ROWS) {
    const mark = markOf(answerOf(r.key, c));
    if (r.n === 20) {
      const kind = F44_20_KINDS.find((k) => k.key === c.values.f44_20_kind)?.label ?? null;
      items.push({ label: `${r.n}. ${r.label} ${kind ?? ''}`.trim(), mark, must: true, note: mark === 'cross' ? note(text(c, `${r.key}n`)) : kind ? `This roof: ${kind} (not ${F44_20_KINDS.filter((k) => k.label !== kind).map((k) => k.label).join(', ')})` : null });
      continue;
    }
    items.push({ label: `${r.n}. ${r.label}`, mark, must: true, note: mark === 'cross' ? note(text(c, `${r.key}n`)) : null });
  }
  kit.section('Checklist');
  kit.checklist(items);

  kit.section('Table 2: Array Frame Earthing', { intro: F44_TABLE2_INSTRUCTION });
  const t2 = Array.isArray(c.values.f44_t2) ? (c.values.f44_t2 as string[]) : [];
  kit.checklist(F44_TABLE2.map((r) => ({ label: `${r.condition}\n${r.requirement.join('\n')}`, mark: t2.includes(r.key) ? 'tick' : 'empty' })));
  for (const n of F44_TABLE2_NOTES) kit.note(n);

  if (text(c, 'f44_comments')) {
    kit.section('Comments');
    kit.paragraph(text(c, 'f44_comments'));
  }
  await signature(kit, d, 'Inspection by');
  return kit.save();
}

export async function makeF44A(d: ElectricianDocInput): Promise<Uint8Array> {
  const c = d.ctx;
  const kit = await newDocument({ code: 'F44A', title: F44A_TITLE, revision: F44A_REVISION, jobRef: d.jobRef, issued: d.date, draft: d.draft });
  kit.header({ meta: [['Project reference', d.jobRef ?? '–']] });
  siteBox(kit, d, 'Commissioned by');
  const note = noter();
  kit.section('Commissioning');
  kit.checklist(
    F44A_ROWS.map((r) => {
      const mark = markOf(answerOf(r.key, c));
      const why = r.n === 6 ? text(c, 'EF2n') : text(c, `${r.key}n`);
      return { label: `${r.n}. ${r.label}`, mark, must: true, note: mark === 'cross' ? note(why) : null };
    })
  );
  await signature(kit, d, 'Commissioned by');
  return kit.save();
}

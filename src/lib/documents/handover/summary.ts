import 'server-only';
import { longDay, type SummaryInput } from '@/lib/handover/inputs';
import { SUMMARY_DECLARATIONS } from '@/lib/site/declaration';
import { stampWords } from '../pdf-kit';
import { begin, INSTALLER_LINES, MCS_CONTACT, type Loader } from './common';

/**
 * HX-HO-02, the system summary and sign-off (WORDING-SPEC 7.4): what was installed and its ratings,
 * solar and battery each in its own section (or a line saying there's none), the MCS battery system
 * class with this system's marked, the records behind the summary (each with its code, reference and
 * whether it's in the pack), the next inspection and notes, then the two sign-offs, each under its
 * own declaration (a) and (b) naming only the standards that apply ((b) as the electrician signed
 * it), with the note (c) under both,
 * and who to contact.
 */
export const SUMMARY_TITLE = 'System summary and sign-off';
const kw = (n: number) => `${n.toLocaleString('en-GB', { maximumFractionDigits: 3 })} kW`;
const KIND: Record<SummaryInput['kind'], string> = { initial: 'New installation', periodic: 'Re-test of an existing system' };

export async function makeSummary(f: SummaryInput, load: Loader): Promise<Uint8Array> {
  const tested = f.kind === 'initial' ? 'Tested and switched on' : 'Re-tested on';
  const kit = await begin('HX-HO-02', SUMMARY_TITLE, f, { pairs: [[tested, longDay(f.testDate)], ['Type', KIND[f.kind]]] });
  kit.paragraph('What we installed, the records behind it and who signed it off. The full records are in this pack.');

  kit.section('Solar panels');
  if (f.pv) {
    kit.rows([
      { label: 'What was fitted', value: f.pv.desc, must: true },
      { label: 'Panel power (kWp, DC)', value: f.pv.kwp.toLocaleString('en-GB', { minimumFractionDigits: 3, maximumFractionDigits: 3 }), must: true },
      { label: 'Where the panels are', value: f.pv.location, must: true },
      { label: 'Estimated generation per year', value: `${f.pv.est.toLocaleString('en-GB')} kWh: the MCS estimate from the design. See “Solar estimate, shading and care”.`, must: true },
    ]);
  } else kit.paragraph('No solar panels in this installation.');

  kit.section('Battery');
  if (f.battery) {
    kit.rows([
      { label: 'What was fitted', value: f.battery.desc, must: true },
      { label: 'Usable storage', value: `${f.battery.usableKwh.toLocaleString('en-GB', { maximumFractionDigits: 2 })} kWh`, must: true },
      { label: 'Maximum output', value: kw(f.battery.maxKw), must: true },
      { label: 'Gives power in a power cut (island mode)', value: f.battery.island === null ? null : f.battery.island ? 'Yes' : 'No', must: true },
    ]);
    kit.grid({ columns: ['MCS battery system class (MIS 3012)', 'Class 1', 'Class 2', 'Class 3', 'Class 4'], rows: [['This system', ...[1, 2, 3, 4].map((n) => (n === f.battery!.cls ? `Class ${n}` : '–'))]], widths: [2.4, 1, 1, 1, 1] });
  } else kit.paragraph('No battery in this installation.');

  kit.section('Records behind this summary', { intro: 'The full records are in this pack.' });
  if (f.pv) kit.rows([{ label: 'What was tested', value: f.pv.circuits }]);
  kit.grid({ columns: ['Record', 'Code', 'Reference', 'In this pack'], rows: f.records.map((r) => [r.record, r.code, r.ref, r.inPack ? '✓' : 'To follow']), widths: [3.2, 1.5, 1.8, 1] });

  kit.section('Next inspection and notes');
  kit.rows([
    { label: 'Next inspection', value: f.next, must: true },
    { label: 'Notes', value: f.comments ?? 'None' },
  ]);

  kit.section('Sign-off', { keep: 200 });
  kit.paragraph(`Designed by. ${SUMMARY_DECLARATIONS.design(f.standards)}`);
  kit.paragraph(`Installed, inspected and tested by. ${f.electrician.statement}`);
  const [dPng, ePng] = await Promise.all([load('docs', f.design.path), load('docs', f.electrician.path)]);
  await kit.signatures([
    { title: 'Designed by', png: dPng, name: f.design.name, at: f.design.signed_at, line: `Signed in the Heliaxis office, ${stampWords(f.design.signed_at)}` },
    { title: 'Installed, inspected and tested by', png: ePng, name: [f.electrician.name, f.electrician.company].filter(Boolean).join(', '), at: f.electrician.at },
  ]);
  kit.note(SUMMARY_DECLARATIONS.note);

  kit.section('Who to contact');
  kit.rows([
    { label: 'Heliaxis, your installer', value: INSTALLER_LINES },
    { label: 'MCS, the scheme that certifies our work', value: MCS_CONTACT },
  ]);
  return kit.save();
}

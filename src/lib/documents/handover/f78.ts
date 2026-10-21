import 'server-only';
import { F78_DECLARATION, longDay, type F78Input } from '@/lib/handover/inputs';
import { stampWords } from '../pdf-kit';
import { begin, CONTRACTOR, MCS_CONTACT, type Loader } from './common';

/**
 * F78, the EESS & PV handover document (SPEC 4.5, FORMS 1.5): the owner's form with every field from
 * its source. The EESS table prints only on battery jobs and the PV table only on solar jobs (the
 * other says "Not part of this installation"); all four MIS 3012 system classes print with this
 * system's marked; the four part ticks are the F74/F75 documents being on the job; the declaration
 * is printed exactly; two signatures, the electrician's (EF_SIG) and the office's design signature.
 */
export const F78_TITLE = 'EESS & PV Handover Document';
const NOT_PART = 'Not part of this installation.';
const kw = (n: number) => `${n.toLocaleString('en-GB', { maximumFractionDigits: 3 })} kW`;

export async function makeF78(f: F78Input, load: Loader): Promise<Uint8Array> {
  const kit = await begin('F78', F78_TITLE, f, { pairs: [['Test date', longDay(f.testDate)], ['Certificate', f.kind === 'initial' ? 'Initial verification' : 'Periodic verification']] });
  kit.section('Contractor');
  kit.rows([
    { label: 'Contractor’s details', value: CONTRACTOR },
    { label: 'MCS contact', value: MCS_CONTACT },
  ]);

  kit.section('EESS');
  if (f.eess) {
    kit.rows([{ label: 'Description of installation (key components installed)', value: f.eess.desc, must: true }]);
    kit.grid({ columns: ['System class (see MIS 3012 section 2.2)', 'Class 1', 'Class 2', 'Class 3', 'Class 4'], rows: [['This system', ...[1, 2, 3, 4].map((n) => (n === f.eess!.cls ? `Class ${n}` : '–'))]], widths: [2.4, 1, 1, 1, 1] });
    kit.rows([
      { label: 'Island mode capable?', value: f.eess.island === null ? null : f.eess.island ? 'Yes' : 'No', must: true },
      { label: 'Max power output', value: kw(f.eess.maxKw), must: true },
      { label: 'Usable capacity', value: `${f.eess.usableKwh.toLocaleString('en-GB', { maximumFractionDigits: 2 })} kWh`, must: true },
    ]);
    kit.checklist([
      { label: 'Commissioning certificate part 1 (F74)', mark: f.eess.parts[0] ? 'tick' : null, must: true },
      { label: 'Commissioning certificate part 2 (F74)', mark: f.eess.parts[1] ? 'tick' : null, must: true },
      { label: 'Commissioning certificate part 3 (F75)', mark: f.eess.parts[2] ? 'tick' : null, must: true },
      { label: 'Commissioning certificate part 4 (F75)', mark: f.eess.parts[3] ? 'tick' : null, must: true },
    ]);
  } else kit.paragraph(NOT_PART);

  kit.section('PV');
  if (f.pv) {
    kit.rows([
      { label: 'Description of installation (key components installed)', value: f.pv.desc, must: true },
      { label: 'Rated power (kW DC)', value: kw(f.pv.kw), must: true },
      { label: 'Location', value: f.pv.location, must: true },
      { label: 'Estimated system performance (kWh)', value: `${f.pv.est.toLocaleString('en-GB')} kWh`, must: true },
      { label: 'Circuits tested', value: f.pv.circuits },
      { label: 'IEC 60364-6 inspection report reference', value: f.pv.insp, must: true },
      { label: 'IEC 60364-6 test report reference', value: f.pv.test, must: true },
      { label: 'PV array inspection report reference (F44A)', value: f.pv.f44a, must: true },
      { label: 'PV array test report reference (F43)', value: f.pv.f43, must: true },
    ]);
  } else kit.paragraph(NOT_PART);

  kit.section('Design, construction, inspection and testing');
  kit.paragraph(F78_DECLARATION);
  const [ePng, dPng] = await Promise.all([load('docs', f.electrician.path), load('docs', f.design.path)]);
  await kit.signatures([
    { title: 'Construction, inspection and testing', png: ePng, name: f.electrician.name, at: f.electrician.at },
    { title: 'Design', png: dPng, name: f.design.name, at: f.design.signed_at, line: `Signed in the Heliaxis office, ${stampWords(f.design.signed_at)}` },
  ]);
  kit.note('(The extent of liability of the signatory(s) is limited to the work described above.)');
  kit.rows([
    { label: 'Next inspection recommended after not more than', value: f.next, must: true },
    { label: 'Comments', value: f.comments ?? 'None' },
  ]);
  return kit.save();
}

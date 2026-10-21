import 'server-only';
import { editionWords } from '@/lib/site/fixed/iet-eic';
import { IET_MEIWC } from '@/lib/site/fixed/iet-meiwc';
import { COMMENTS, EARTHING } from '@/lib/site/forms/electrician/eic';
import { isGt, readingOf, type Circuit } from '@/lib/site/forms/electrician/eic-model';
import { longDate, newDocument, type Variant } from '../pdf-kit';
import { band, cells, signatureRow } from './parts';
import type { SigImage } from './eic';

/**
 * Minor Works (SPEC 3.3, REGS 1.5): one short PDF per circuit worked on. The certificate's own
 * wording isn't in the app yet (fixed/iet-meiwc.ts), so until it is each one prints as a "Minor Works
 * data sheet": every value in the form's order (the minor works, the installation, the essential
 * tests, the instruments, the person), signed, for copying onto the electrician's own Minor Works
 * certificate. Once the wording is verified the same sheet prints as the certificate itself.
 */

export const MEIWC_REVISION = 'Rev 1';

export type MeiwcInput = {
  ref: string | null;
  jobRef: string | null;
  issued: string;
  edition: string;
  values: Record<string, unknown>;
  address: string;
  circuit: Circuit;
  /** "DB1 circuit 4 (Sockets)". */
  name: string;
  sig: SigImage;
  draft: boolean;
  wording?: { verified: boolean; declaration: ((amended: string) => string) | null };
  /** 'digital' (the default: what's filed) or 'print' (the ink saver, on request). */
  variant?: Variant;
};

const reading = (v: unknown, unit?: string) => {
  const r = readingOf(v);
  return r === null ? null : `${isGt(v) ? `>${r}` : String(v)}${unit ? ` ${unit}` : ''}`;
};
const yesMark = (v: unknown) => (v === true || v === 'pass' ? ('tick' as const) : v === 'fail' ? ('cross' as const) : v === 'na' ? ('na' as const) : null);

export async function meiwcPdf(x: MeiwcInput): Promise<Uint8Array> {
  const v = x.values;
  const c = x.circuit;
  const s = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : null);
  const wording = x.wording ?? IET_MEIWC;
  const cert = wording.verified && !!wording.declaration;
  const amended = editionWords(x.edition);
  const draft = x.draft;
  const kit = await newDocument({
    code: 'MEIWC',
    title: cert ? 'Minor Electrical Installation Works Certificate' : 'Minor Works data sheet',
    revision: MEIWC_REVISION,
    jobRef: x.jobRef,
    issued: x.issued,
    draft,
    variant: x.variant,
  });
  const sig = x.sig.png ? await kit.embed(x.sig.png) : null;
  kit.header({ meta: [['Reference', x.ref ?? '–'], ['Date', longDate(x.issued)], ['Circuit', x.name]] });
  if (!cert) {
    kit.note(
      'This sheet holds the values for a Minor Electrical Installation Works Certificate, in the form’s order. It isn’t the certificate: copy them onto your Minor Works certificate, sign it and send it to Heliaxis for the customer’s handover pack.'
    );
  }

  band(kit, 'Details of the minor works');
  cells(kit, [{ label: 'Client', value: s(v, 'eic_client'), must: true }, { label: 'Installation address', value: x.address, must: true, w: 2 }], draft);
  cells(kit, [{ label: 'Description of the minor works', value: s(c, 'work'), must: true }], draft);
  cells(kit, [
    { label: 'Date the minor works were completed', value: x.sig.at ? longDate(x.sig.at.slice(0, 10)) : null, must: true },
    { label: 'Details of departures from BS 7671', value: v.eic_dep === 'yes' ? s(v, 'eic_dep_what') : 'None', must: true, w: 2 },
  ], draft);
  cells(kit, [
    { label: 'Details of permitted exceptions (Regulation 411.3.3)', value: v.eic_exc === 'yes' ? s(v, 'eic_exc_what') : 'N/A', w: 3 },
    { label: 'Risk assessment attached', mark: v.eic_exc === 'yes' ? 'tick' : 'na' },
  ], draft);
  kit.gap(6);

  band(kit, 'Installation details');
  cells(kit, [
    { label: 'System earthing arrangement', value: EARTHING.find((o) => o.key === v.eic_earthing)?.label ?? null, must: true },
    { label: 'Method of fault protection', value: s(v, 'eic_mw_fp'), must: true, w: 2 },
  ], draft);
  cells(kit, [
    { label: 'Protective device for the modified circuit: BS (EN)', value: s(c, 'ocpd_bs'), must: true, w: 1.6 },
    { label: 'Type', value: s(c, 'ocpd_type'), must: true },
    { label: 'Rating', value: reading(c.ocpd_a, 'A'), must: true },
    { label: 'Breaking capacity', value: reading(c.ocpd_ka, 'kA'), must: true },
  ], draft);
  const picked = Array.isArray(v.eic_cmt) ? (v.eic_cmt as string[]).map((k) => COMMENTS.find((o) => o.key === k)?.label).filter(Boolean) : [];
  cells(kit, [{ label: 'Comments on the existing installation, including the adequacy of earthing and bonding (Regulation 644.1.2)', value: [...picked, s(v, 'eic_cmt_more')].filter(Boolean).join('. ') || null, must: true }], draft);
  kit.gap(6);

  band(kit, 'Essential tests');
  const ring = c.ring === 'yes';
  const rcd = c.rcd === 'yes';
  cells(kit, [
    { label: 'Protective conductor continuity: R1 + R2', value: reading(c.r12, 'Ω') ?? 'N/A' },
    { label: 'or R2', value: reading(c.r2only, 'Ω') ?? 'N/A' },
    { label: 'Ring final circuit: r1', value: ring ? reading(c.r1, 'Ω') : 'N/A', must: ring },
    { label: 'rn', value: ring ? reading(c.rn, 'Ω') : 'N/A', must: ring },
    { label: 'r2', value: ring ? reading(c.r2, 'Ω') : 'N/A', must: ring },
  ], draft);
  cells(kit, [
    { label: 'Insulation resistance: test voltage', value: reading(c.ir_v, 'V'), must: true },
    { label: 'Live – Live', value: reading(c.ir_ll, 'MΩ'), must: true },
    { label: 'Live – Earth', value: reading(c.ir_le, 'MΩ'), must: true },
    { label: 'Polarity', mark: yesMark(c.pol) },
    { label: 'Earth fault loop impedance, Zs', value: reading(c.zs, 'Ω'), must: true },
    { label: 'Maximum permitted Zs', value: reading(c.zs_max, 'Ω'), must: true },
  ], draft);
  cells(kit, [
    { label: 'RCD: BS (EN)', value: rcd ? s(c, 'rcd_bs') : 'N/A', must: rcd },
    { label: 'Type', value: rcd ? s(c, 'rcd_type') : 'N/A', must: rcd },
    { label: 'IΔn', value: rcd ? reading(c.rcd_idn, 'mA') : 'N/A', must: rcd },
    { label: 'Operating time at IΔn', value: rcd ? reading(c.rcd_ms, 'ms') : 'N/A', must: rcd },
    { label: 'RCD test button operation', mark: rcd ? yesMark(c.rcd_btn) : 'na' },
    { label: 'AFDD test button operation', mark: c.afdd === 'yes' ? yesMark(c.afdd_btn) : 'na' },
  ], draft);
  const inst = (v.eic_inst ?? {}) as Record<string, string>;
  const t = (k: string) => (typeof inst[k] === 'string' && inst[k].trim() ? inst[k].trim() : 'N/A');
  cells(kit, [
    { label: 'Test instruments: multi-functional', value: t('mft'), w: 1.4 },
    { label: 'Continuity', value: t('cont') },
    { label: 'Insulation resistance', value: t('ir') },
    { label: 'Earth fault loop impedance', value: t('efli') },
    { label: 'RCD', value: t('rcd') },
  ], draft);
  if (s(c, 'remarks')) cells(kit, [{ label: 'Remarks', value: s(c, 'remarks') }], draft);
  kit.gap(6);

  band(kit, cert ? 'Declaration' : 'Who did the work');
  if (cert && wording.declaration) kit.note(wording.declaration(amended));
  cells(kit, [
    { label: 'Company', value: s(v, 'eic_sig_co'), must: true },
    { label: 'Address', value: [s(v, 'eic_sig_addr'), s(v, 'eic_sig_pc')].filter(Boolean).join(', ') || null, must: true, w: 2 },
    { label: 'Tel', value: s(v, 'eic_sig_tel'), must: true },
  ], draft);
  signatureRow(kit, cert ? 'Designed, constructed, inspected and tested by' : 'Electrician', sig, x.sig.at, s(v, 'eic_sig_name'), draft);
  return kit.save();
}

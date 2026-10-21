import 'server-only';
import type { EicFacts } from '../forms/types';
import { isRoute } from '../forms/electrician/eic-model';
import type { AssignmentRow, ContactRow, Db, FirmRow } from '../server';

/**
 * What the electrician's certificate questions are offered from (FormCtx.eic): the route the office
 * chose (D16), the certificate's reference, the client's name, the person signing (their firm's
 * registered or base address from Schedule B) and the test instruments remembered from their last job.
 * Put into the job pack (so it works with no signal) and into the server's context (so the gate reads
 * the same route). Never a reading: everything measured is typed on site.
 */

const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** "9 Turner Street, Newport, NP19 7AZ" → the address without its postcode, and the postcode. */
export function splitPostcode(address: string | null): { address: string | null; postcode: string | null } {
  if (!address) return { address: null, postcode: null };
  const flat = address.replace(/\s*\n\s*/g, ', ').trim();
  const m = POSTCODE.exec(flat);
  if (!m) return { address: flat, postcode: null };
  return { address: flat.slice(0, m.index).replace(/[,\s]+$/, '') || null, postcode: m[1].toUpperCase().replace(/\s*(\d[A-Z]{2})$/, ' $1') };
}

/** The test instruments kept on the contact: [{ k: 'eic_mft', v: '…' }] (other units keep their own keys alongside). */
export function rememberedInstruments(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const x of Array.isArray(list) ? list : []) {
    const o = x as { k?: unknown; v?: unknown };
    if (typeof o?.k === 'string' && o.k.startsWith('eic_') && typeof o.v === 'string' && o.v.trim()) out[o.k.slice(4)] = o.v.trim();
  }
  return out;
}

/** HX-0042-EIC for the job's first electrician, HX-0042-EIC2 for a second (by when they were added, cancelled ones included, so a number never moves). */
export async function eicRef(db: Db, a: Pick<AssignmentRow, 'id' | 'project_id'>, jobRef: string | null): Promise<string | null> {
  if (!jobRef) return null;
  const { data } = await db.from('site_assignments').select('id').eq('project_id', a.project_id).eq('trade', 'electrician').order('created_at');
  const i = Math.max(0, ((data ?? []) as { id: string }[]).findIndex((x) => x.id === a.id));
  return `${jobRef}-EIC${i ? i + 1 : ''}`;
}

export async function eicFacts(db: Db, a: AssignmentRow, project: Record<string, unknown>): Promise<EicFacts | undefined> {
  if (a.trade !== 'electrician') return undefined;
  const [{ data: contact }, { data: cust }] = await Promise.all([
    db.from('site_contacts').select('*').eq('id', a.contact_id).maybeSingle(),
    project.enquiry_id ? db.from('enquiries').select('name').eq('id', String(project.enquiry_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const person = contact as ContactRow | null;
  let firm: FirmRow | null = null;
  if (person?.subcontractor_id) {
    const { data } = await db.from('subcontractors').select('*').eq('id', person.subcontractor_id).maybeSingle();
    firm = (data as FirmRow | null) ?? null;
  }
  const details = (firm?.details ?? {}) as { legalName?: string; registeredAddress?: string; baseAddress?: string };
  const where = splitPostcode(str(details.baseAddress) ?? str(details.registeredAddress));
  return {
    route: isRoute(a.cert_route) ? a.cert_route : 'eic',
    ref: await eicRef(db, a, str(project.project_ref)),
    client: str((cust as { name?: string } | null)?.name),
    contact: {
      name: person?.name ?? '',
      company: str(person?.company) ?? str(details.legalName) ?? str(firm?.company_name),
      mobile: str(person?.mobile),
      email: str(person?.email),
      address: where.address,
      postcode: where.postcode,
      scheme: str(person?.scheme),
      scheme_number: str(person?.scheme_number),
    },
    instruments: rememberedInstruments(person?.instruments),
  };
}

import { DEFAULT_RATES, HELIAXIS_PARTY, type Section } from './agreement';

export type SubStatus =
  | 'invited'
  | 'in_progress'
  | 'awaiting_countersign'
  | 'active'
  | 'suspended'
  | 'terminated';

export const STATUS_LABEL: Record<SubStatus, string> = {
  invited: 'Invited',
  in_progress: 'In progress',
  awaiting_countersign: 'Awaiting countersign',
  active: 'Active',
  suspended: 'Suspended',
  terminated: 'Terminated',
};

export type BespokeRate = { trade: string; rate: string; basis: string };

/** Schedule B ("Party Details and Notices") + payment + operatives. */
export type SubDetails = {
  entityType?: 'limited' | 'sole_trader' | 'partnership';
  legalName?: string;
  registeredAddress?: string;
  baseAddress?: string; // principal place of work — mileage is measured from here (Cl. 4.4)
  companyNumber?: string;
  vatNumber?: string;
  utr?: string;
  cisStatus?: 'gross' | 'net' | 'unregistered';
  cisNumber?: string;
  noticesEmail?: string;
  accountsEmail?: string;
  primaryContact?: string;
  phone?: string;
  bankAccountName?: string;
  sortCode?: string;
  accountNumber?: string;
  employsStaff?: boolean;
  operatives?: string; // one name per line
};

export type SubcontractorRow = {
  id: string;
  ref: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  trade: string | null;
  status: SubStatus;
  rate_option: 'default' | 'bespoke';
  bespoke_rates: BespokeRate[];
  details: SubDetails;
  details_completed_at: string | null;
  docs_submitted_at: string | null;
  invited_at: string | null;
  last_seen_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type AgreementRow = {
  id: string;
  subcontractor_id: string;
  version: string;
  content_hash: string;
  snapshot: AgreementSnapshot;
  sub_name: string;
  sub_title: string | null;
  sub_signature: string;
  sub_signed_at: string;
  sub_ip: string | null;
  sub_user_agent: string | null;
  hlx_name: string | null;
  hlx_title: string | null;
  hlx_signature: string | null;
  hlx_signed_at: string | null;
  hlx_signed_by: string | null;
  hlx_ip: string | null;
};

export type DocumentRow = {
  id: string;
  subcontractor_id: string;
  category: string;
  label: string | null;
  operative_name: string | null;
  reference: string | null;
  cover_amount: string | null;
  expires_on: string | null;
  storage_path: string;
  file_name: string;
  mime: string | null;
  size_bytes: number | null;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  uploaded_at: string;
};

export type EventRow = {
  id: string;
  actor: string;
  type: string;
  detail: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
};

/** Everything that varies per subcontractor in the agreement text. Frozen at signing. */
export type AgreementSnapshot = {
  version: string;
  ref: string;
  companyName: string;
  contactName: string;
  trade: string;
  rateOption: 'default' | 'bespoke';
  bespokeRates: BespokeRate[];
  defaultRates: typeof DEFAULT_RATES;
  details: SubDetails;
  heliaxis: typeof HELIAXIS_PARTY;
  /** The exact clause text and Schedule A shown at signing, so signed copies never drift. */
  sections: Section[];
  scheduleA: [string, string][];
};

export const SUB_COLUMNS =
  'id, ref, company_name, contact_name, email, phone, trade, status, rate_option, bespoke_rates, details, details_completed_at, docs_submitted_at, invited_at, last_seen_at, notes, created_by, created_at';

export const CIS_LABEL: Record<string, string> = {
  gross: 'Gross payment status',
  net: 'Net payment status',
  unregistered: 'Not registered',
};

export const ENTITY_LABEL: Record<string, string> = {
  limited: 'Limited company',
  sole_trader: 'Sole trader',
  partnership: 'Partnership',
};

/** Schedule B fields the subcontractor must complete before they can sign. */
export function missingDetails(d: SubDetails): string[] {
  const miss: string[] = [];
  if (!d.entityType) miss.push('Business type');
  if (!d.legalName?.trim()) miss.push('Legal / trading name');
  if (!d.registeredAddress?.trim()) miss.push('Registered address');
  if (!d.baseAddress?.trim()) miss.push('Principal place of work');
  if (d.entityType === 'limited' && !d.companyNumber?.trim()) miss.push('Company number');
  if (!d.utr?.trim()) miss.push('UTR');
  if (!d.cisStatus) miss.push('CIS status');
  if (!d.noticesEmail?.trim()) miss.push('Notices email');
  if (!d.accountsEmail?.trim()) miss.push('Accounts email');
  if (!d.primaryContact?.trim()) miss.push('Primary contact');
  if (!d.phone?.trim()) miss.push('Phone');
  if (!d.bankAccountName?.trim()) miss.push('Bank account name');
  if (!/^\d{2}-?\d{2}-?\d{2}$/.test(d.sortCode?.trim() || '')) miss.push('Sort code');
  if (!/^\d{8}$/.test(d.accountNumber?.trim() || '')) miss.push('Account number');
  if (typeof d.employsStaff !== 'boolean') miss.push('Whether you employ staff');
  return miss;
}

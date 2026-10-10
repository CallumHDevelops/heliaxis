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
  // CIS verification with HMRC (supabase/portal-v3.sql) — only on queries that select '*'.
  cis_verified_on?: string | null;
  cis_rate?: CisRate | null;
  cis_verification_ref?: string | null;
  cis_verified_by?: string | null;
  cis_verified_at?: string | null;
};

/** The deduction rate HMRC gives when the firm is verified. */
export type CisRate = 'gross' | 'net' | 'higher';

export const CIS_RATE_LABEL: Record<CisRate, string> = {
  gross: 'Gross — 0% deduction',
  net: 'Net — 20% deduction',
  higher: 'Higher rate — 30% deduction (unmatched)',
};

/** The rate a firm's own declared CIS status should verify at. */
export const DECLARED_CIS_RATE: Record<string, CisRate> = { gross: 'gross', net: 'net', unregistered: 'higher' };

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
  operative_id?: string | null;
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
  // Conversion to one compact PDF (supabase/portal-v4.sql) — absent until that has run.
  /** What the firm uploaded, kept until the document is approved. */
  original_files?: OriginalFile[] | null;
  original_bytes?: number | null;
  processed_at?: string | null;
  processing_note?: string | null;
};

export type OriginalFile = { path: string; name: string; mime: string; size: number };

/** Heliaxis asking a firm for a document (supabase/portal-v3.sql). */
export type DocRequestRow = {
  id: string;
  subcontractor_id: string;
  category: string;
  operative_id: string | null;
  operative_name: string | null;
  label: string | null;
  note: string | null;
  due_on: string | null;
  /** Set when asked for while rejecting a document. */
  replaces_document_id: string | null;
  status: 'open' | 'fulfilled' | 'cancelled';
  requested_by: string;
  created_at: string;
  emailed_at: string | null;
  fulfilled_at: string | null;
  fulfilled_document_id: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
};

/** A document request as the portal sees it — no admin-only fields. */
export type PortalRequest = {
  id: string;
  category: string;
  operativeId: string | null;
  operativeName: string | null;
  label: string | null;
  note: string | null;
  dueOn: string | null;
  createdAt: string;
  /** Asked for when rejecting a document; `note` is the reason. */
  replacement: boolean;
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

export type OperativeRow = {
  id: string;
  subcontractor_id: string;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  archived_at: string | null;
  created_at: string;
};

export type AssignmentStatus = 'awaiting_crew' | 'crew_confirmed' | 'declined' | 'cancelled';

export type AssignmentRow = {
  id: string;
  subcontractor_id: string;
  status: AssignmentStatus;
  rams_project_id: string;
  rams_project_ref: string | null;
  rams_project_name: string;
  site_address: string | null;
  rams_document_id: string;
  rams_document_title: string | null;
  scope: string | null;
  start_date: string | null;
  crew: string[];
  decline_reason: string | null;
  requested_by_name: string | null;
  requested_by_email: string | null;
  confirmed_at: string | null;
  webhook_status: string | null;
  created_at: string;
  updated_at: string;
};

export const ASSIGNMENT_LABEL: Record<AssignmentStatus, string> = {
  awaiting_crew: 'Choose your crew',
  crew_confirmed: 'Crew confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

export type PullRow = {
  id: string;
  subcontractor_id: string;
  document_id: string | null;
  assignment_id: string | null;
  category: string | null;
  title: string | null;
  file_name: string | null;
  sha256: string;
  rams_project_id: string | null;
  rams_project_ref: string | null;
  rams_project_name: string | null;
  rams_document_id: string | null;
  rams_document_title: string | null;
  pulled_by_name: string | null;
  pulled_by_email: string | null;
  pulled_at: string;
};

export type NtpStatus = 'awaiting_signature' | 'awaiting_countersign' | 'active' | 'expired' | 'superseded' | 'cancelled';

export const NTP_STATUS_LABEL: Record<NtpStatus, string> = {
  awaiting_signature: 'Awaiting signature',
  awaiting_countersign: 'Awaiting countersign',
  active: 'Active',
  expired: 'Expired',
  superseded: 'Renewed',
  cancelled: 'Cancelled',
};

/** Everything that varies per NTP agreement, frozen when it is issued. */
export type NtpSnapshot = {
  version: string;
  ref: string;
  frameworkRef: string;
  companyName: string;
  ntpName: string;
  technologies: { key: string; label: string; standard: string }[];
  minDaysPerMonth: number | null;
  supervision: {
    geography?: string;
    installsPerMonth?: string;
    typicalDuration?: string;
    installersToSupervise?: string;
    notes?: string;
  };
  fee: string | null;
  heliaxis: { name: string; registeredAddress: string; companyNumber: string };
  sections: import('./agreement').Section[];
};

export type NtpRow = {
  id: string;
  subcontractor_id: string;
  ref: string;
  status: NtpStatus;
  technologies: string[];
  operative_id: string | null;
  ntp_name: string;
  ntp_email?: string | null;
  min_days_per_month: number | null;
  supervision: NtpSnapshot['supervision'];
  fee: string | null;
  renewal_of: string | null;
  snapshot: NtpSnapshot;
  content_hash: string;
  sub_name: string | null;
  sub_title: string | null;
  sub_signature: string | null;
  sub_signed_at: string | null;
  sub_ip: string | null;
  hlx_name: string | null;
  hlx_title: string | null;
  hlx_signature: string | null;
  hlx_signed_at: string | null;
  hlx_signed_by: string | null;
  valid_from: string | null;
  expires_on: string | null;
  requested_by: string | null;
  created_at: string;
};

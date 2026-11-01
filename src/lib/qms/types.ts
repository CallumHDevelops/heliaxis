/** Operations › QMS: the shapes shared by the server and the screens. Safe to import anywhere. */

export type DocKind = 'internal' | 'procedure' | 'form' | 'external';
export type DocStatus = 'draft' | 'in_review' | 'changes_requested' | 'approved' | 'archived';
export type CommentStatus = 'open' | 'addressed' | 'resolved';

export const KINDS: { key: DocKind; label: string; plural: string; prefix: string; what: string }[] = [
  { key: 'internal', label: 'Internal document', plural: 'Internal documents', prefix: 'A / D', what: 'The quality plan, policies, manual and company logs' },
  { key: 'procedure', label: 'Procedure', plural: 'Procedures', prefix: 'P', what: 'How we do things, step by step' },
  { key: 'form', label: 'Form', plural: 'Forms', prefix: 'F', what: 'Blank forms and templates we fill in' },
  { key: 'external', label: 'External document', plural: 'External documents', prefix: 'EX / L', what: 'Standards, guidance and regulations we work to' },
];

export const STATUS_LABEL: Record<DocStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  archived: 'Archived',
};

export const SECTIONS: Record<DocKind, { key: string; label: string }[]> = {
  internal: [],
  procedure: [],
  form: [
    { key: 'general', label: 'General' },
    { key: 'heat_pump', label: 'Heat pump' },
    { key: 'solar_pv', label: 'Solar PV' },
    { key: 'battery', label: 'Battery' },
  ],
  external: [
    { key: 'standard', label: 'Standards' },
    { key: 'guidance', label: 'Guidance' },
    { key: 'regulation', label: 'Regulations' },
    { key: 'link', label: 'Websites' },
  ],
};

export type QmsDoc = {
  id: string;
  kind: DocKind;
  ref: string;
  section: string | null;
  title: string;
  revision: string;
  revision_date: string | null;
  status: DocStatus;
  owner: string | null;
  summary: string | null;
  body_md: string | null;
  source_url: string | null;
  file_path: string | null;
  review_months: number;
  next_review_on: string | null;
  approved_revision: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QmsComment = {
  id: string;
  document_id: string;
  revision: string | null;
  author: string;
  body: string;
  quote: string | null;
  status: CommentStatus;
  response: string | null;
  responded_by: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type QmsRevision = {
  id: string;
  document_id: string;
  revision: string;
  revision_date: string | null;
  title: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type QmsReview = {
  id: string;
  document_id: string;
  revision: string;
  reviewer: string;
  decision: 'approved' | 'changes_requested';
  checklist: Record<string, boolean>;
  note: string | null;
  created_at: string;
};

export const DOC_COLUMNS =
  'id, kind, ref, section, title, revision, revision_date, status, owner, summary, body_md, source_url, file_path, review_months, next_review_on, approved_revision, approved_by, approved_at, created_at, updated_at';

/** What the approver confirms by hand, on top of the automatic checks. */
export const APPROVAL_CHECKLIST: Record<DocKind, { key: string; label: string }[]> = {
  internal: [
    { key: 'right_place', label: 'It is filed in the right place, with the right reference' },
    { key: 'accurate', label: 'It is accurate and matches how Heliaxis actually works' },
    { key: 'current', label: 'The revision and date are right, and nothing in it is out of date' },
  ],
  procedure: [
    { key: 'right_place', label: 'It is filed in the right place, with the right reference' },
    { key: 'accurate', label: 'The steps are accurate and match how Heliaxis actually works' },
    { key: 'roles', label: 'Roles and responsibilities are named and real' },
    { key: 'records', label: 'The forms and records it mentions exist and are listed' },
    { key: 'standards', label: 'It meets the standards it relies on (MCS, TrustMark, BS 7671 etc.)' },
  ],
  form: [
    { key: 'right_place', label: 'It is filed in the right place, with the right reference' },
    { key: 'complete', label: 'Every field a user needs is there, and nothing they don’t' },
    { key: 'procedure', label: 'It is called for by a procedure, and the procedure names it' },
    { key: 'branding', label: 'It carries the Heliaxis name and the revision and date' },
  ],
  external: [
    { key: 'right_place', label: 'It is filed in the right place, with the right reference' },
    { key: 'current', label: 'This is the current version from the issuer' },
    { key: 'link', label: 'The link or the uploaded copy opens and is the right document' },
  ],
};

/** Records that live in qms_records. */
export type RecordKind = 'capa' | 'review' | 'complaint' | 'calibration' | 'training';
export const RECORD_KINDS: { key: RecordKind; code: string; prefix: string; label: string; plural: string; fields: { key: string; label: string; long?: boolean; date?: boolean }[] }[] = [
  {
    key: 'capa', code: 'R02', prefix: 'CAPA', label: 'Corrective / preventive action', plural: 'Corrective & preventive actions',
    fields: [
      { key: 'source', label: 'Where it came from (audit, complaint, near miss…)' },
      { key: 'problem', label: 'What went wrong', long: true },
      { key: 'root_cause', label: 'Root cause', long: true },
      { key: 'action', label: 'Action taken or planned', long: true },
      { key: 'check', label: 'How we will check it worked', long: true },
    ],
  },
  {
    key: 'complaint', code: 'R06', prefix: 'COMP', label: 'Customer complaint', plural: 'Customer complaints',
    fields: [
      { key: 'customer', label: 'Customer' },
      { key: 'received', label: 'Received on', date: true },
      { key: 'complaint', label: 'The complaint', long: true },
      { key: 'investigation', label: 'Investigation', long: true },
      { key: 'outcome', label: 'Outcome and what we told the customer', long: true },
    ],
  },
  {
    key: 'review', code: 'R05', prefix: 'REV', label: 'Internal review', plural: 'Internal reviews',
    fields: [
      { key: 'held', label: 'Held on', date: true },
      { key: 'attendees', label: 'Who took part' },
      { key: 'findings', label: 'Findings', long: true },
      { key: 'actions', label: 'Actions agreed', long: true },
    ],
  },
  {
    key: 'calibration', code: 'R04', prefix: 'CAL', label: 'Tool calibration', plural: 'Tool calibration',
    fields: [
      { key: 'serial', label: 'Serial number' },
      { key: 'last', label: 'Last calibrated', date: true },
      { key: 'certificate', label: 'Certificate number' },
      { key: 'where', label: 'Who has it / where it is kept' },
    ],
  },
  {
    key: 'training', code: 'R07', prefix: 'TRN', label: 'Skills & training', plural: 'Skills & training matrix',
    fields: [
      { key: 'person', label: 'Person' },
      { key: 'skill', label: 'Skill or qualification' },
      { key: 'achieved', label: 'Achieved on', date: true },
      { key: 'evidence', label: 'Evidence (certificate, card number…)' },
    ],
  },
];

export type QmsRecord = {
  id: string;
  kind: RecordKind;
  ref: string;
  title: string;
  status: 'open' | 'in_progress' | 'closed';
  owner: string | null;
  due_on: string | null;
  closed_on: string | null;
  data: Record<string, string>;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const RECORD_COLUMNS = 'id, kind, ref, title, status, owner, due_on, closed_on, data, notes, created_at, updated_at';

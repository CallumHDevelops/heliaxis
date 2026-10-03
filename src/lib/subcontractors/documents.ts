import type { DocumentRow, SubDetails } from './types';

export type DocCategory = {
  key: string;
  label: string;
  hint: string;
  clause: string;
  /** Ask for an expiry date — 'required' blocks upload without one. */
  expiry: 'required' | 'optional' | 'none';
  /** Ask which operative the document belongs to. */
  operative?: boolean;
  /** Ask for the cover amount (insurance). */
  cover?: boolean;
  required: (d: SubDetails) => boolean;
};

const always = () => true;
const never = () => false;

export const DOC_CATEGORIES: DocCategory[] = [
  {
    key: 'photo_id',
    label: 'Photo ID',
    hint: 'Passport, driving licence or other government-issued photo ID — one for each operative who will attend site.',
    clause: '3A.1',
    expiry: 'optional',
    operative: true,
    required: always,
  },
  {
    key: 'qualification',
    label: 'Trade qualifications',
    hint: 'e.g. City & Guilds 2391 / 2394 / 2395, 18th Edition (2382), 2919 / 2921 renewables, NVQ, Gas Safe, roofing NVQ.',
    clause: '3.6 · 3A.1',
    expiry: 'optional',
    operative: true,
    required: always,
  },
  {
    key: 'registration',
    label: 'Scheme registrations',
    hint: 'NICEIC, NAPIT, MCS, CIPHE, NHBC or any other competent person / accreditation body.',
    clause: '3A.1',
    expiry: 'required',
    required: never,
  },
  {
    key: 'card',
    label: 'Cards',
    hint: 'ECS / JIB, CSCS, IPAF, PASMA, SMSTS / SSSTS — front and back.',
    clause: '3A.1',
    expiry: 'required',
    operative: true,
    required: never,
  },
  {
    key: 'insurance_pl',
    label: 'Public liability insurance',
    hint: 'Minimum £2,000,000 per occurrence.',
    clause: '7.1',
    expiry: 'required',
    cover: true,
    required: always,
  },
  {
    key: 'insurance_el',
    label: "Employers' liability insurance",
    hint: 'Minimum £5,000,000 — required if you employ anyone.',
    clause: '7.1',
    expiry: 'required',
    cover: true,
    required: (d) => d.employsStaff === true,
  },
  {
    key: 'insurance_tools',
    label: 'Tools & equipment insurance',
    hint: 'Covering the full replacement value of your tools and equipment.',
    clause: '7.1',
    expiry: 'required',
    cover: true,
    required: always,
  },
  {
    key: 'insurance_pi',
    label: 'Professional indemnity insurance',
    hint: 'Not less than £500,000 — only where it applies to your scope of services (e.g. design work).',
    clause: '7.1',
    expiry: 'required',
    cover: true,
    required: never,
  },
  {
    key: 'rams',
    label: 'RAMS',
    hint: 'Your standard risk assessments and method statements.',
    clause: '8.4',
    expiry: 'none',
    required: never,
  },
  {
    key: 'other',
    label: 'Other documents',
    hint: 'Anything else you would like us to hold on file.',
    clause: '',
    expiry: 'optional',
    required: never,
  },
];

export const CATEGORY_BY_KEY: Record<string, DocCategory> = Object.fromEntries(
  DOC_CATEGORIES.map((c) => [c.key, c])
);

export const ALLOWED_MIME = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function safeFileName(name: string) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : '';
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'document';
  return ext ? `${base}.${ext}` : base;
}

/** Clause 3A.2: subcontractors must flag renewals 30 days before expiry. */
export const EXPIRY_WARN_DAYS = 30;

export type ExpiryState = 'expired' | 'expiring' | 'ok' | 'none';

export function expiryState(expiresOn: string | null, now = new Date()): ExpiryState {
  if (!expiresOn) return 'none';
  const end = new Date(`${expiresOn}T23:59:59`);
  const days = (end.getTime() - now.getTime()) / 86_400_000;
  if (days < 0) return 'expired';
  if (days <= EXPIRY_WARN_DAYS) return 'expiring';
  return 'ok';
}

export type Compliance = {
  missing: string[]; // labels of required categories with no live document
  expired: DocumentRow[];
  expiring: DocumentRow[];
  pendingReview: number;
  ok: boolean;
};

/**
 * Required categories are satisfied by any non-rejected, non-expired document.
 * Expired / expiring lists only count each category's newest document, so an
 * uploaded renewal clears the warning on the old one.
 */
export function compliance(details: SubDetails, docs: DocumentRow[], now = new Date()): Compliance {
  const live = docs.filter((d) => d.status !== 'rejected');
  const missing = DOC_CATEGORIES.filter(
    (c) => c.required(details) && !live.some((d) => d.category === c.key && expiryState(d.expires_on, now) !== 'expired')
  ).map((c) => c.label);

  // Latest doc per (category, operative) — older ones are superseded by renewals.
  const latest = new Map<string, DocumentRow>();
  for (const d of [...live].sort((a, b) => a.uploaded_at.localeCompare(b.uploaded_at))) {
    const norm = (s: string | null) => (s || '').toLowerCase().trim();
    latest.set(`${d.category}|${norm(d.operative_name)}|${norm(d.label)}`, d);
  }
  const current = [...latest.values()];
  const expired = current.filter((d) => expiryState(d.expires_on, now) === 'expired');
  const expiring = current.filter((d) => expiryState(d.expires_on, now) === 'expiring');
  const pendingReview = docs.filter((d) => d.status === 'pending').length;

  return { missing, expired, expiring, pendingReview, ok: !missing.length && !expired.length };
}

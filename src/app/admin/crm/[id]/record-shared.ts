/**
 * The job record page's data (GET /api/crm/projects/{id}) and the small helpers its parts share.
 * Safe for the browser: dates are worked out in UK time from a `now` the component was given.
 */
import type { CheckView } from '@/lib/projects/checklist';
import type { Deadline } from '@/lib/projects/deadlines';
import type { EnaInfo } from '@/lib/projects/ena';
import type { NextDate, TeamMember } from '@/lib/projects/server';
import type { OrdersSummary } from '@/lib/purchase-orders/shared';
import type { SchemaReady } from '@/lib/schema-ready';
import type { TrackerStep } from '@/lib/crm/tracker';
import type { ChaseView } from '@/lib/whatsapp/schedule';
import { isProjectStage } from '@/lib/crm/stages';
import { ukPostcode } from '@/lib/crm/site-postcode';
import type { CrmDoc } from './ProjectExtras';
import { shortDate, ukDayOf, ukTime } from '../crm-shared';

/** crm_projects, read with select('*'): the crm-v3.sql and survey-booking.sql columns may be missing. */
export type Project = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  products: string[];
  value: number | null;
  owner_id: string | null;
  address: string | null;
  postcode: string | null;
  survey_at: string | null;
  install_at: string | null;
  simpliheat_url: string | null;
  opensolar_url: string | null;
  lost_reason: string | null;
  notes: string | null;
  next_step: string | null;
  next_step_at: string | null;
  dno_status: string | null;
  dno_ref: string | null;
  deposit_amount: number | null;
  deposit_paid_at: string | null;
  accepted_at: string | null;
  accepted_name: string | null;
  created_at: string;
  updated_at: string;
  stage_changed_at?: string | null;
  first_contact_at?: string | null;
  portal_token?: string | null;
  project_ref?: string | null;
  project_started_at?: string | null;
  on_hold?: boolean | null;
  hold_reason?: string | null;
  install_days?: number | null;
  install_team?: string[] | null;
  scaffold_up_on?: string | null;
  scaffold_down_on?: string | null;
  commissioned_at?: string | null;
  handover_at?: string | null;
  rams_project_id?: string | null;
  survey_type?: string | null;
  system?: Record<string, unknown> | null;
  paperwork?: Record<string, string> | null;
};

export type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  postcode: string | null;
  interest: string | null;
  property_type?: string | null;
  source: string;
  /** `source` in words, with the Meta ad's name now ("Meta ad · Tim Facts"), from the server. */
  source_label?: string;
  /** "was Video 1" when the ad has been renamed since they came in. */
  source_note?: string | null;
  created_at?: string;
  wa_id: string | null;
  wa_unread: number;
  /** Present once WhatsApp permission is in the database (Unit A). */
  whatsapp_opt_in?: boolean | null;
  whatsapp_opt_in_at?: string | null;
  whatsapp_opt_in_source?: string | null;
  /** The permission in words, from the server: "Agreed on 3 Oct via website form", "Replied STOP on 3 Oct: …". */
  whatsapp_permission_words?: string;
  /** Present once customer-refs.sql has run. */
  customer_ref?: string | null;
};

export type Entry = {
  id: string;
  kind: string;
  body: string | null;
  meta: Record<string, unknown> | null;
  by: string | null;
  at: string;
  /** Logged on another of the customer's jobs. */
  other_project?: string | null;
};

export type CrmTask = {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
  assignee_id: string | null;
  assignee: string;
  completed_at?: string | null;
  /** Made by the paperwork deadlines (source_key 'deadline:…'). */
  deadline?: boolean;
};

export type Photo = { id: string; category: string; caption: string | null; url: string | null; thumb: string | null; by: string; created_at: string };

export type WaInfo = {
  configured: boolean;
  number: string | null;
  threadId: string | null;
  enquiryIds: string[];
  windowOpen: boolean;
  lastInbound?: string | null;
  unread: number;
  unreadIds: string[];
  messages: number;
  chaseHours: number;
  /** Quiet hours and the evening rule, to say when a chaser would really go. */
  chaseView?: ChaseView | null;
};

export type OtherJob = { id: string; title: string; stage: string; products: string[]; created_at: string; project_ref: string | null };
export type Duplicate = { enquiry_id: string; name: string; project_ref: string | null; project_id: string | null };
export type SurveyItem = { id: string; type: string; status: string; completed_at: string | null; flags: string[]; surveyor: string };
export type Booking = {
  id: string;
  status: string;
  start: string | null;
  end: string | null;
  minutes: number | null;
  survey_type: string | null;
  source: string | null;
  surveyor: string;
  booked_by: string;
  would_confirm: boolean | null;
  overridden: boolean;
};
export type Subcontract = { status: string } & Record<string, unknown>;

/** Everything GET /api/crm/projects/{id} sends. */
export type RecordData = {
  project: Project;
  customer: Customer;
  portal: string | null;
  portalOpen: boolean;
  portalMode: 'quote' | 'full' | null;
  tracker: TrackerStep[];
  documents: CrmDoc[];
  connected: { email: boolean; stripe: boolean };
  whatsapp: WaInfo;
  timeline: Entry[];
  photos: Photo[];
  team: TeamMember[];
  tasks: CrmTask[];
  others: OtherJob[];
  duplicates: Duplicate[];
  surveys: SurveyItem[];
  booking: Booking | null;
  bookingLink: string | null;
  notify: 'whatsapp' | 'email' | 'call';
  calendar: { outlook: boolean; survey: boolean; install: boolean; error: string | null };
  checklist: { stage: string; items: CheckView[] }[];
  progress: { done: number; total: number; keyMissing: number };
  deadlines: Deadline[];
  install: { dates: string[]; words: string } | null;
  next_date: NextDate | null;
  subcontracts: Subcontract[];
  /** "For the ENA application" (the main cut-out and meter photos). Null before surveys.sql, and for jobs with no solar or battery. */
  ena: EnaInfo | null;
  schema: SchemaReady;
  /** The job's purchase orders at a glance (null before purchase-orders.sql). */
  orders?: OrdersSummary | null;
};

/** ?light=1&since=: what the page polls for. */
export type LightData = {
  light: true;
  cursor: string;
  project: Project;
  customer: Customer;
  tasks: CrmTask[];
  whatsapp: WaInfo;
  counts: { photos: number; documents: number; tasks: number };
  timeline: Entry[];
};

export type Tab = 'overview' | 'activity' | 'photos' | 'docs' | 'orders' | 'site' | 'handover' | 'surveys' | 'details';
export const TABS: Tab[] = ['overview', 'activity', 'photos', 'docs', 'orders', 'site', 'handover', 'surveys', 'details'];
/** The Handover tab's stages (handover.sql): from Ready, so the prep before the install day has a home. */
export const HANDOVER_STAGES = ['ready', 'install_booked', 'installing', 'commissioning', 'handover', 'complete'];
export type Area = 'crm' | 'projects';

/** The tab a job opens on (spec 4.3): Overview for projects, Activity for opportunities (and Lost jobs). */
export function defaultTab(stage: string, area: Area): Tab {
  if (stage === 'lost') return 'activity';
  return isProjectStage(stage) || area === 'projects' ? 'overview' : 'activity';
}

/** 'Tue 3 Nov, 11:45' in UK time. */
export const ukWhen = (iso: string) => `${shortDate(ukDayOf(iso))}, ${ukTime(iso)}`;

/** The header's next date: 'Survey Tue 3 Nov, 11:45', 'Install Fri 6 Nov · 3 days', or 'Nothing booked'. */
export function nextDateWords(n: NextDate | null | undefined, p?: Pick<Project, 'survey_at' | 'install_at'> | null): string {
  if (n?.kind === 'install') return `Install ${shortDate(ukDayOf(n.at))}${(n.days ?? 1) > 1 ? ` · ${n.days} days` : ''}`;
  if (n?.kind === 'survey') return `Survey ${ukWhen(n.at)}`;
  // Before the full read (or a date already past): what's on the job.
  if (!n && p?.install_at) return `Install ${shortDate(ukDayOf(p.install_at))}`;
  if (!n && p?.survey_at) return `Survey ${ukWhen(p.survey_at)}`;
  return 'Nothing booked';
}

/** Whole days since `iso` (null until the clock is known). */
export const daysSince = (iso: string | null | undefined, now: number) => (iso && now ? Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000)) : null);
/** How long a job has been at its stage: 'today', '1 day', '6 days'. */
export const dayWord = (n: number) => (n === 0 ? 'today' : `${n} day${n === 1 ? '' : 's'}`);

/** The job's own ref, else the customer's (customer-refs.sql), for the header and the dock. */
export const refOf = (p: Pick<Project, 'project_ref'>, c: Pick<Customer, 'customer_ref'> | null) => p.project_ref || c?.customer_ref || null;

/** "07700 900123" as typed, or the WhatsApp number written the UK way. */
export function phoneShown(c: Pick<Customer, 'phone'>, waNumber: string | null): string | null {
  if (c.phone?.trim()) return c.phone.trim();
  if (waNumber?.startsWith('44')) return `0${waNumber.slice(2, 6)} ${waNumber.slice(6)}`;
  return waNumber ? `+${waNumber}` : null;
}

/** Google Maps directions to the site (address and postcode). */
export const directionsHref = (place: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}`;

/** The site's postcode: the job's own, else the customer's. */
export const sitePostcodeOf = (p: Pick<Project, 'postcode'>, c: Pick<Customer, 'postcode'>) => p.postcode || c.postcode || '';

/** The site, for Directions and Copy: the job's address, then its postcode, then the customer's. */
export function siteOf(p: Pick<Project, 'address' | 'postcode'>, c: Pick<Customer, 'postcode'>): string {
  const pc = sitePostcodeOf(p, c);
  const addr = (p.address || '').trim();
  return addr ? (pc && !addr.toUpperCase().includes(pc.toUpperCase()) ? `${addr}, ${pc}` : addr) : pc;
}

/** "Check postcode" under the site when its postcode isn't UK-shaped (a lead form's "88888"). */
export function postcodeHint(p: Pick<Project, 'postcode'>, c: Pick<Customer, 'postcode'>): string | undefined {
  const pc = sitePostcodeOf(p, c);
  return pc && !ukPostcode(pc) ? 'Check postcode: it doesn’t look like a UK one' : undefined;
}

/** POST/PATCH JSON, with the API's error message (or `fallback`) thrown on failure. */
export async function send<T = Record<string, unknown>>(url: string, method: string, body: unknown, fallback = 'Not saved. Try again.'): Promise<T> {
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error((d as { error?: string }).error || fallback), { status: r.status, data: d });
  return d as T;
}

/** Copy to the clipboard, or show it to copy by hand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    window.prompt('Copy this', text);
    return false;
  }
}

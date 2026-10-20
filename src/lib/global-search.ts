import { isProjectStage, stageLabel } from './crm/stages';
import { dbToUiStatus } from './enquiries';
import { leadSourceLabel } from './lead-source';
import { refMatches } from './projects/refs';

/**
 * The search on the dashboard and in the header (GET /api/search): what it sends back, how people and
 * their jobs are put together and ordered, and the list the search box shows. Pure, so it runs in the
 * browser and in scripts/test-global-search.mjs; the reads are in src/app/api/search/route.ts and
 * src/lib/customer-search.ts.
 */

/** At most this many people, each with at most this many jobs listed. */
export const MAX_PEOPLE = 8;
export const JOBS_EACH = 3;

export type SearchJob = { id: string; title: string; stage: string; ref: string | null; href: string };
export type SearchPerson = {
  id: string;
  name: string;
  /** HX-0042 (customer-refs.sql). */
  ref: string | null;
  postcode: string | null;
  phone: string | null;
  /** Where they came from, in plain words ("Meta ad · Video 4"). */
  source: string;
  /** Their enquiry's status: New, Contacted, Quoted, Won or Lost. */
  status: string;
  created_at: string;
  /** Where picking them goes: their job (the one that matched, else the latest open one), else their details on Enquiries; null when this person can open neither. */
  href: string | null;
  /** Their jobs, for CRM staff (the one that matched first, then open ones, newest first). */
  jobs: SearchJob[];
  /** Jobs they have beyond those listed. */
  more: number;
};

/** What was typed, made safe to put in a filter: characters that would change its meaning come out (spec 1). Up to 80 characters. */
export const cleanSearch = (raw: string | null | undefined) =>
  (raw ?? '').replace(/[,()%*\\"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/** A postcode typed with or without its space ("np204ab" finds NP20 4AB): the ilike pattern that finds it either way, or null. */
export function postcodePattern(q: string): string | null {
  const squashed = q.replace(/\s/g, '');
  return /^[a-z]{1,2}\d[a-z\d]?\d[a-z]{2}$/i.test(squashed) ? `%${squashed.slice(0, -3)}%${squashed.slice(-3)}%` : null;
}

/**
 * Order for a customer in the results: 0 when the reference searched for (`refs`, from refPatterns) is
 * theirs or one of their jobs', 1 when their name starts with what was typed, 2 otherwise.
 */
export function customerRank(q: string, refs: string[], c: { name: string; ref: string | null | undefined; jobRefs: (string | null | undefined)[] }): number {
  if (refs.length && (refMatches(q, c.ref) || c.jobRefs.some((r) => refMatches(q, r)))) return 0;
  return c.name.toLowerCase().startsWith(q.toLowerCase()) ? 1 : 2;
}

export type PersonRow = {
  id: string;
  name: string;
  postcode: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
  customer_ref?: string | null;
};
export type JobRow = {
  id: string;
  enquiry_id: string;
  title: string | null;
  stage: string;
  created_at: string;
  address?: string | null;
  postcode?: string | null;
  project_ref?: string | null;
};

export const jobHref = (j: { id: string; stage: string }) => (isProjectStage(j.stage) ? `/admin/projects/${j.id}` : `/admin/crm/${j.id}`);
const isOpen = (stage: string) => stage !== 'complete' && stage !== 'lost';

/**
 * Does the job itself match what was typed: its title, site address or postcode (with or without the
 * space), or its reference? The query's rows are checked again here, as a reference pattern finds a
 * little more than refMatches does.
 */
export function jobMatches(j: JobRow, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  if (refMatches(q, j.project_ref)) return true;
  if (`${j.title ?? ''} ${j.address ?? ''} ${j.postcode ?? ''}`.toLowerCase().includes(t)) return true;
  const squashed = t.replace(/\s/g, '');
  return squashed.length >= 2 && (j.postcode ?? '').replace(/\s/g, '').toLowerCase().includes(squashed);
}

/**
 * The results: the people found (customers matching, and the owners of jobs that matched), each with
 * their jobs. References first, then names starting with what was typed, then the rest, newest first
 * within each; up to MAX_PEOPLE, with JOBS_EACH jobs each. `matched` are the ids of jobs that matched
 * themselves; they come first under their person. `enquiries`: this person can open Enquiries.
 */
export function groupResults(a: { q: string; refs: string[]; people: PersonRow[]; jobs: JobRow[]; matched: ReadonlySet<string>; enquiries: boolean }): SearchPerson[] {
  const jobsOf = new Map<string, JobRow[]>();
  for (const j of a.jobs) jobsOf.set(j.enquiry_id, [...(jobsOf.get(j.enquiry_id) ?? []), j]);
  const order = (x: JobRow, y: JobRow) =>
    Number(a.matched.has(y.id)) - Number(a.matched.has(x.id)) || Number(isOpen(y.stage)) - Number(isOpen(x.stage)) || y.created_at.localeCompare(x.created_at);
  return a.people
    .map((p) => {
      const theirs = [...(jobsOf.get(p.id) ?? [])].sort(order);
      return { p, theirs, rank: customerRank(a.q, a.refs, { name: p.name, ref: p.customer_ref, jobRefs: theirs.map((j) => j.project_ref) }) };
    })
    .sort((x, y) => x.rank - y.rank || y.p.created_at.localeCompare(x.p.created_at))
    .slice(0, MAX_PEOPLE)
    .map(({ p, theirs }) => {
      const jobs = theirs.slice(0, JOBS_EACH).map((j) => ({ id: j.id, title: j.title?.trim() || 'Job', stage: stageLabel(j.stage), ref: j.project_ref || null, href: jobHref(j) }));
      return {
        id: p.id,
        name: p.name,
        ref: p.customer_ref || null,
        postcode: p.postcode || null,
        phone: p.phone || null,
        source: leadSourceLabel(p.source),
        status: dbToUiStatus(p.status ?? ''),
        created_at: p.created_at,
        href: jobs[0]?.href ?? (a.enquiries ? `/admin/enquiries?open=${p.id}` : null),
        jobs,
        more: theirs.length - jobs.length,
      };
    });
}

// ── The search box's list ──

/** One line in the list: a person, or (when they have several) one of their jobs beneath them. */
export type SearchOption = { key: string; kind: 'person' | 'job'; person: SearchPerson; job: SearchJob | null; href: string | null };

/** A person with one job opens it from their own line; with several, each job gets a line of its own. */
export function searchOptions(people: SearchPerson[]): SearchOption[] {
  return people.flatMap((p) => [
    { key: `p-${p.id}`, kind: 'person' as const, person: p, job: null, href: p.href },
    ...(p.jobs.length > 1 ? p.jobs.map((j) => ({ key: `j-${j.id}`, kind: 'job' as const, person: p, job: j, href: j.href })) : []),
  ]);
}

/** ↑ / ↓ from `from` (-1: nothing yet), round the ends, skipping lines that open nothing. -1 when none do. */
export function stepOption(options: SearchOption[], from: number, dir: 1 | -1): number {
  const n = options.length;
  if (!n) return -1;
  let i = from < 0 ? (dir === 1 ? -1 : n) : from;
  for (let k = 0; k < n; k++) {
    i = (i + dir + n) % n;
    if (options[i].href) return i;
  }
  return -1;
}

/** The right-hand side of a person's line: their job's stage, how many jobs, their enquiry's status, or "No job yet". */
export function personHint(p: SearchPerson): string {
  const n = p.jobs.length + p.more;
  if (n === 1) return p.jobs[0]?.stage ?? '1 job';
  if (n > 1) return `${n} jobs`;
  return p.href ? p.status : 'No job yet';
}

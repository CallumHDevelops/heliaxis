/**
 * The CRM home's two lists across every job: Latest notes (GET /api/crm/activity) and My work
 * (GET /api/crm/my-work). What kind each timeline row is, which rows are milestones, and which UK-day
 * group a due date falls in.
 *
 * Pure (no imports), so scripts/test-projects.mjs loads it straight into node. Days are 'YYYY-MM-DD'
 * in UK time, worked out by the caller (ukDay in src/lib/bank-holidays.ts).
 */

/** The Latest notes chips, plus the two kinds only shown with "Show stage changes" (or as milestones). */
export type FeedKind = 'note' | 'call' | 'visit' | 'survey' | 'email' | 'doc' | 'stage' | 'update';
export const FEED_CHIPS = ['note', 'call', 'visit', 'survey', 'email', 'doc'] as const;
export type FeedChip = (typeof FEED_CHIPS)[number];

export type ActivityRow = { kind: string; body: string | null; meta: Record<string, unknown> | null };

/** Rows that come from an import or the automatic WhatsApp/email messages: never in Latest notes. */
const AUTOMATIC =
  /^(Imported\b|Also filled in\b|WhatsApp:|Follow-up \d+ (sent|skipped)|Review request not sent|.* (confirmation|reminder)( \(.*\))? not sent)|Added by import\.$/i;
const DOC = /^(Document added|Survey document added)\b|\bsent for signing\b|\b(marked as signed|no longer marked as signed)\b/i;
const SIGNED = /\b(accepted and signed|marked as signed by)\b/i;
const MILESTONE_STAGES = new Set(['won', 'complete']);

/**
 * What a timeline row is for the feed, and whether it's a milestone (moved to Won or Complete, a quote
 * signed, a survey finished: always shown). `hidden`: imports and automatic messages.
 */
export function classifyActivity(row: ActivityRow): { kind: FeedKind; milestone: boolean; hidden: boolean } {
  const body = (row.body ?? '').trim();
  const meta = row.meta ?? {};
  switch (row.kind) {
    case 'note':
    case 'call':
    case 'email':
      return { kind: row.kind, milestone: false, hidden: meta.via === 'import' };
    case 'visit': {
      const survey = typeof meta.survey_id === 'string' || /\bsurvey\b/i.test(body);
      return { kind: survey ? 'survey' : 'visit', milestone: survey && /\bcompleted\b/i.test(body), hidden: false };
    }
    case 'stage': {
      if (SIGNED.test(body)) return { kind: 'doc', milestone: true, hidden: false };
      const to = typeof meta.to === 'string' ? meta.to : '';
      return { kind: 'stage', milestone: MILESTONE_STAGES.has(to), hidden: false };
    }
    case 'system':
      if (AUTOMATIC.test(body)) return { kind: 'update', milestone: false, hidden: true };
      if (DOC.test(body)) return { kind: 'doc', milestone: SIGNED.test(body), hidden: false };
      return { kind: 'update', milestone: false, hidden: false };
    default:
      // Photos and anything newer: an update.
      return { kind: 'update', milestone: false, hidden: false };
  }
}

/**
 * Is this row in the feed? `chips`: the kinds asked for (all six when none are picked). Documents and
 * signatures count as their own kind. Stage moves and other updates show only with "Show stage
 * changes", except milestones, which show whenever every kind is wanted.
 */
export function inFeed(c: { kind: FeedKind; milestone: boolean; hidden: boolean }, chips: readonly string[], stages: boolean): boolean {
  if (c.hidden) return false;
  if (c.kind === 'stage' || c.kind === 'update') return chips.length === FEED_CHIPS.length && (stages || c.milestone);
  return chips.includes(c.kind);
}

/** The DB kinds worth reading for these chips (fewer rows to page through). */
export function dbKindsFor(chips: readonly string[], stages: boolean): string[] {
  const kinds = new Set<string>();
  for (const c of chips) {
    if (c === 'note' || c === 'call' || c === 'email') kinds.add(c);
    if (c === 'visit' || c === 'survey') kinds.add('visit');
    if (c === 'doc') kinds.add('system').add('stage');
  }
  if (chips.length === FEED_CHIPS.length) {
    kinds.add('stage');
    if (stages) kinds.add('system').add('photo');
  }
  return [...kinds];
}

/**
 * The same as a PostgREST `or` filter, narrowing updates to ones that could be about documents when
 * only those are wanted (most updates are tasks and automatic messages). classifyActivity still has
 * the last word.
 */
export function dbFilterFor(chips: readonly string[], stages: boolean): string {
  const kinds = dbKindsFor(chips, stages);
  const plain = kinds.filter((k) => k !== 'system');
  const parts = plain.length ? [`kind.in.(${plain.join(',')})`] : [];
  if (kinds.includes('system')) {
    parts.push(stages && chips.length === FEED_CHIPS.length ? 'kind.eq.system' : 'and(kind.eq.system,or(body.ilike.*document*,body.ilike.*signed*,body.ilike.*signing*))');
  }
  return parts.join(',');
}

/* ── My work: due dates in UK-day groups ─────────────────────────────────────── */

export type DueGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'nodate';
export const DUE_GROUPS: DueGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'nodate'];

/** n calendar days after a UK date. */
export function plusDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n, 12));
  return t.toISOString().slice(0, 10);
}

const LONDON_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' });

/** The moment a UK day starts (00:00 in London), as an ISO time, for "from today" database filters. */
export function ukDayStart(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const midnightUtc = Date.UTC(y, m - 1, d);
  // London is on UTC or an hour ahead, so its midnight is that many hours before midnight UTC.
  const ahead = Number(LONDON_HOUR.format(midnightUtc));
  return new Date(midnightUtc - ahead * 3_600_000).toISOString();
}

/** Which group a due day is in, from `today` (both UK dates). "week" is the 5 days after tomorrow. */
export function dueGroup(due: string | null | undefined, today: string): DueGroup {
  if (!due) return 'nodate';
  if (due < today) return 'overdue';
  if (due === today) return 'today';
  if (due === plusDays(today, 1)) return 'tomorrow';
  if (due <= plusDays(today, 6)) return 'week';
  return 'later';
}

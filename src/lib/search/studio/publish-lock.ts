/**
 * Pure rules for claiming a page to publish (two admins pressing Approve at once). The claim itself is a conditional
 * update in publish.ts: in_review → approved, or, for a retry, approved → approved with the same approved_at as read.
 */

/** A publish is treated as still running for this long after its claim, unless it recorded a failure. */
export const PUBLISH_LOCK_MS = 5 * 60_000;

type Row = { status: string; approved_by: string | null; approved_at: string | null; checks?: { error?: unknown } | Record<string, unknown> | null };

/** Why this row cannot be claimed now (another publish of it is probably still running), or null. */
export function publishInFlight(row: Row, now: number): string | null {
  if (row.status !== 'approved' || !row.approved_at) return null;
  const at = Date.parse(row.approved_at);
  if (!Number.isFinite(at) || now - at >= PUBLISH_LOCK_MS) return null;
  const err = String((row.checks as { error?: unknown } | null)?.error ?? '');
  if (err.startsWith('Publishing failed')) return null;
  const wait = Math.ceil((at + PUBLISH_LOCK_MS - now) / 60_000);
  return `${row.approved_by ?? 'Someone'} approved this page moments ago and it is still being published. Reload in a minute; if it has not gone live, try again in ${wait} minute${wait === 1 ? '' : 's'}.`;
}

/**
 * Other new pages claimed for publishing just before this one and not yet published (so not in the week's published
 * count). Ties on the same instant go to the lower id, so of two claims at once exactly one sees the other.
 */
export function claimedAhead(self: { id: number; approvedAt: string }, others: { id: number; approved_at: string | null }[]): number {
  const mine = Date.parse(self.approvedAt);
  return others.filter((o) => {
    if (o.id === self.id || !o.approved_at) return false;
    const t = Date.parse(o.approved_at);
    return t < mine || (t === mine && o.id < self.id);
  }).length;
}

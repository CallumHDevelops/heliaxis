import { sevRank, type Severity } from '@/lib/social/rules/types';

export const SEVERITY_LABEL: Record<string, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', positive: 'Positive', ignore: 'Ignore' };
export const TYPE_LABEL: Record<string, string> = { quote_request: 'Quote request', question: 'Question', positive: 'Positive', complaint: 'Complaint', general: 'General', spam: 'Spam' };
export const PLATFORM_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', trustpilot: 'Trustpilot', google: 'Google', manual: 'Manual' };
export const STATUS_LABEL: Record<string, string> = { new: 'New', in_review: 'In review', approved: 'Approved', copied: 'Copied', posted: 'Posted', dismissed: 'Dismissed', escalated: 'Escalated' };

/** Most urgent first, then oldest first (the one waiting longest). */
export function byUrgency<T extends { severity: string | null; created_at: string }>(a: T, b: T) {
  return sevRank(b.severity as Severity | null) - sevRank(a.severity as Severity | null) || Date.parse(a.created_at) - Date.parse(b.created_at);
}

export function ago(iso: string, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

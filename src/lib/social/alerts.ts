import 'server-only';
import { notify } from '@/lib/notify';
import { canAccess } from '@/lib/portals';
import { createAdminClient } from '@/lib/supabase/admin';
import settings from './config/settings.defaults.json';
import { inQuietHours, quietEnds, type QuietHours } from './time';
import type { Severity } from './rules/types';

const PLATFORM_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', trustpilot: 'Trustpilot', google: 'Google', manual: 'Manual' };
const QUIET: QuietHours = { start: settings.quiet_hours.start, end: settings.quiet_hours.end };

export type AlertMention = { id: string; platform: string; kind: string; text: string; version: number; severity: Severity };

/** Everyone who can open Social monitoring: approved admins, plus members with the tick. */
export async function socialRecipients(): Promise<string[]> {
  const db = createAdminClient();
  const { data } = await db.from('profiles').select('*').eq('status', 'approved');
  return (data ?? []).filter((p) => canAccess(p, 'social_monitoring')).map((p) => p.id as string);
}

export function alertCopy(m: Pick<AlertMention, 'platform' | 'kind' | 'text' | 'severity'>) {
  const label = PLATFORM_LABEL[m.platform] ?? m.platform;
  const what = m.kind === 'review' ? 'review' : m.kind === 'reply' ? 'reply' : 'comment';
  const flat = m.text.replace(/\s+/g, ' ').trim();
  return {
    title: `${m.severity === 'critical' ? 'CRITICAL' : 'HIGH'} · ${label} ${what}`,
    body: flat.length > 120 ? `${flat.slice(0, 119).trimEnd()}…` : flat || '(no text)',
  };
}

/**
 * Tell the team about a Critical or High mention, once per version and severity. Critical always goes now;
 * High waits out quiet hours (its alert row keeps `deferred_until`, and sendDueAlerts() sends it).
 * Never throws: a failed push must not lose the comment, which is already saved.
 */
export async function alertForMention(m: AlertMention, now = new Date()): Promise<'sent' | 'deferred' | 'duplicate' | 'none'> {
  if (m.severity !== 'critical' && m.severity !== 'high') return 'none';
  const db = createAdminClient();
  const deferUntil = m.severity === 'high' && inQuietHours(now, QUIET) ? quietEnds(now, QUIET) : null;
  const { error } = await db.from('social_alert').insert({
    kind: m.severity === 'critical' ? 'social_critical' : 'social_high',
    mention_id: m.id,
    severity: m.severity,
    dedupe_key: `mention:${m.id}:v${m.version}:${m.severity}`,
    deferred_until: deferUntil?.toISOString() ?? null,
  });
  if (error) return error.code === '23505' ? 'duplicate' : 'none';
  if (deferUntil) return 'deferred';
  await sendAlert(m, `mention:${m.id}:v${m.version}:${m.severity}`);
  return 'sent';
}

async function sendAlert(m: AlertMention, dedupeKey: string) {
  const db = createAdminClient();
  const ids = await socialRecipients();
  const { title, body } = alertCopy(m);
  await Promise.all(
    ids.map((userId) =>
      notify({ userId, kind: 'social', title, body, href: `/admin/social/review/${m.id}`, tag: `social-${m.id}`, ref: `social:${m.id}` }).catch(() => undefined)
    )
  );
  await db.from('social_alert').update({ recipients: ids.length, sent_at: new Date().toISOString() }).eq('dedupe_key', dedupeKey);
}

/** Sends High alerts whose quiet hours have ended. Run by the cron every minute. */
export async function sendDueAlerts(now = new Date()): Promise<number> {
  const db = createAdminClient();
  const { data } = await db
    .from('social_alert')
    .select('dedupe_key, mention_id, severity')
    .is('sent_at', null)
    .not('deferred_until', 'is', null)
    .lte('deferred_until', now.toISOString())
    .limit(50);
  let sent = 0;
  for (const a of data ?? []) {
    const { data: m } = await db.from('social_mention').select('id, platform, kind, text, version, severity, status').eq('id', a.mention_id).maybeSingle();
    if (m && m.status !== 'dismissed') await sendAlert(m as AlertMention, a.dedupe_key);
    else await db.from('social_alert').update({ sent_at: now.toISOString() }).eq('dedupe_key', a.dedupe_key);
    sent++;
  }
  return sent;
}

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fcmConfigured, sendFcm } from '@/lib/fcm';
import { calendarView, msConfigured } from '@/lib/ms365';
import { mailForHome } from '@/lib/mail/server';
import { todayISO } from '@/lib/tasks';
import { widgetPayload, type WidgetData } from '@/lib/widget-shared';

/**
 * The Hestia widget on the Android app's home screen (android/…/HestiaWidget.java): today's calendar, your tasks and
 * the emails that need you. The phone never asks for it: the site sends it, as a data message on the same Firebase
 * channel as notifications, every 15 minutes (the mail job), when Hestia has sorted something new, and whenever the
 * app is opened. Only to app builds that have the widget (WIDGET_FROM_APP_VERSION).
 */

/** First Android app build with the widget (the release after versionCode 5 in android/release.json). */
export const WIDGET_FROM_APP_VERSION = 6;
const EVERY_MS = 15 * 60_000;
const PUSHED_KEY = 'widget-pushed';

type Db = ReturnType<typeof createAdminClient>;

const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ukDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
const longDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short' });

/** Everything the widget shows for one person, as plain data (made small by widgetPayload). */
export async function widgetFor(userId: string, db: Db = createAdminClient()): Promise<WidgetData> {
  const now = new Date();
  const today = ukDate.format(now);
  const tomorrow = ukDate.format(new Date(now.getTime() + 86_400_000));
  const { data: me } = await db.from('profiles').select('email').eq('id', userId).maybeSingle();
  const email = String(me?.email || '').toLowerCase();

  // The calendar: your own Outlook calendar (surveys, installs and diary entries are copied into it), today's still
  // to come and tomorrow's. Not there (Microsoft 365 not connected, or no access to this mailbox): left out.
  let calendar: WidgetData['calendar'] = null;
  if (email && msConfigured()) {
    try {
      const events = await calendarView(email, new Date(now.getTime() - 12 * 3_600_000), new Date(now.getTime() + 48 * 3_600_000));
      const live = events.filter((e) => !e.isCancelled);
      const on = (day: string) =>
        live.filter((e) => (e.isAllDay ? !!e.allDayFrom && e.allDayFrom <= day && (e.allDayTo ?? '') > day : ukDate.format(e.start) === day));
      const item = (e: (typeof live)[number]) => ({
        time: e.isAllDay ? 'All day' : hhmm.format(e.start),
        title: e.subject || '(no title)',
        where: e.location?.postalCode || e.location?.displayName || '',
        allDay: e.isAllDay,
      });
      calendar = {
        today: on(today)
          .filter((e) => e.isAllDay || e.end.getTime() > now.getTime())
          .map(item),
        tomorrow: on(tomorrow).map(item),
      };
    } catch {
      calendar = null;
    }
  }

  // Tasks: CRM follow-ups due by today first, then your open tasks (late and today's first).
  const endOfToday = new Date(`${today}T23:59:59Z`);
  const [{ data: followUps }, { data: tasks }] = await Promise.all([
    db
      .from('crm_projects')
      .select('id, title, next_step, next_step_at')
      .lte('next_step_at', endOfToday.toISOString())
      .not('stage', 'in', '(complete,lost)')
      .or(`owner_id.eq.${userId},owner_id.is.null`)
      .order('next_step_at')
      .limit(5)
      .then(
        (r) => r,
        () => ({ data: null })
      ),
    db
      .from('tasks')
      .select('id, title, due_date, priority')
      .eq('assignee_id', userId)
      .neq('status', 'done')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(8)
      .then(
        (r) => r,
        () => ({ data: null })
      ),
  ]);
  const due = (d: string | null) => {
    if (!d) return { label: '', late: false };
    if (d < todayISO()) {
      const days = Math.round((Date.parse(`${todayISO()}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / 86_400_000);
      return { label: days === 1 ? 'Yesterday' : `${days}d late`, late: true };
    }
    if (d === todayISO()) return { label: 'Today', late: false };
    return { label: shortDay.format(new Date(`${d}T12:00:00Z`)), late: false };
  };
  const todo: WidgetData['tasks'] = [
    ...(followUps ?? []).map((f) => {
      const late = !!f.next_step_at && ukDate.format(new Date(String(f.next_step_at))) < today;
      return { title: String(f.next_step || 'Follow up'), due: late ? 'Late' : 'Today', late, sub: String(f.title || ''), href: `/admin/crm/${f.id}` };
    }),
    ...(tasks ?? []).map((t) => {
      const d = due((t.due_date as string | null) ?? null);
      return { title: String(t.title), due: d.label, late: d.late, sub: t.priority === 'high' ? 'High priority' : '', href: '/admin/tasks' };
    }),
  ];

  // Hestia: the emails that need you, the most important first.
  const mail = await mailForHome(userId).catch(() => null);
  const emails: WidgetData['email'] =
    mail && mail !== 'none'
      ? {
          need: mail.counts.reply,
          urgent: mail.counts.urgent,
          top: mail.top.slice(0, 4).map((t) => ({
            who: t.who_name || t.rule?.label || t.who_address || 'Someone',
            what: t.summary || t.subject || '',
            urgent: t.priority === 'urgent',
            href: `/admin/mail?t=${t.id}`,
          })),
        }
      : null;

  return { at: now.getTime(), day: longDay.format(now), calendar, tasks: todo, email: emails };
}

/** Sends one person's widget to each of their phones with the widget. True if at least one got it. */
export async function pushWidget(userId: string, db: Db = createAdminClient()): Promise<boolean> {
  if (!fcmConfigured()) return false;
  const { data: tokens } = await db.from('native_push_tokens').select('id, token').eq('user_id', userId).gte('app_version', WIDGET_FROM_APP_VERSION);
  if (!tokens?.length) return false;
  const payload = widgetPayload(await widgetFor(userId, db));
  let sent = false;
  for (const t of tokens) {
    // NORMAL priority: it shows nothing by itself (Android deprioritises apps whose high-priority messages don't).
    const r = await sendFcm(t.token, { type: 'widget', w: payload }, 'NORMAL');
    if (r === 'ok') sent = true;
    if (r === 'gone') await db.from('native_push_tokens').delete().eq('id', t.id);
  }
  return sent;
}

/**
 * Everyone with the widget whose last one is 15 minutes old, plus anyone in `now` (something changed for them).
 * Stops starting new ones after `until`. Called from the mail job every two minutes.
 */
export async function pushWidgets(o: { now?: string[]; until: number }): Promise<number> {
  if (!fcmConfigured()) return 0;
  const db = createAdminClient();
  const { data: rows } = await db.from('native_push_tokens').select('user_id').gte('app_version', WIDGET_FROM_APP_VERSION);
  const users = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  if (!users.length) return 0;
  const { data: kv } = await db.from('cms_kv').select('value').eq('key', PUSHED_KEY).maybeSingle();
  let last: Record<string, number> = {};
  try {
    last = kv?.value ? (JSON.parse(kv.value as string) as Record<string, number>) : {};
  } catch {
    last = {};
  }
  const force = new Set(o.now ?? []);
  let n = 0;
  for (const u of users) {
    if (Date.now() > o.until) break;
    if (!force.has(u) && Date.now() - (last[u] ?? 0) < EVERY_MS - 60_000) continue;
    if (await pushWidget(u, db).catch(() => false)) n++;
    last[u] = Date.now();
  }
  const now = new Date().toISOString();
  await db.from('cms_kv').upsert({ key: PUSHED_KEY, value: JSON.stringify(last), updated_at: now });
  return n;
}

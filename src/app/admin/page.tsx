import type { Metadata } from 'next';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { PORTALS, portalsFor, type PortalKey } from '@/lib/portals';
import { todayISO } from '@/lib/tasks';
import { setupPeople, visibleSetupTodos } from '@/lib/setup-checks';
import { schemaReady } from '@/lib/schema-ready';
import { installDayList, ukBankHolidays, ukDay } from '@/lib/bank-holidays';
import { DEFAULT_SURVEY_MINUTES, isSurveyType, noSurveyNeeded, SURVEY_TYPES, surveyTypeFor, type SurveyTypeKey } from '@/lib/crm/stages';
import { HubView, type HubTask, type HubFollowUp, type HubToday, type HubTodayItem } from './HubView';
import { newMetaLeads } from './meta-leads';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard · Heliaxis',
  robots: { index: false, follow: false },
};

/** Small "needs you" counts per portal. Each is best-effort — a failing query just hides the badge. */
export type NeedCount = { n: number; detail: string };

/** How many things need someone, per area (shown as big numbers on the dashboard). */
async function badges(keys: PortalKey[], isAdmin: boolean) {
  const admin = createAdminClient();
  const out: Partial<Record<PortalKey | 'users' | 'whatsapp' | 'drafts', NeedCount>> = {};
  const count = async (q: PromiseLike<{ count: number | null }>) => {
    try {
      return (await q).count ?? 0;
    } catch {
      return 0;
    }
  };
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  await Promise.all([
    keys.includes('enquiries') &&
      count(admin.from('enquiries').select('id', { count: 'exact', head: true }).gt('wa_unread', 0)).then((n) => {
        if (n) out.whatsapp = { n, detail: `unread chat${n === 1 ? '' : 's'}` };
      }),
    keys.includes('enquiries') &&
      count(admin.from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new')).then((n) => {
        if (n) out.enquiries = { n, detail: 'new' };
      }),
    keys.includes('tasks') &&
      count(
        admin.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').lt('due_date', todayISO())
      ).then((n) => {
        if (n) out.tasks = { n, detail: 'overdue' };
      }),
    keys.includes('crm') &&
      count(
        admin
          .from('crm_projects')
          .select('id', { count: 'exact', head: true })
          .not('stage', 'in', '(complete,lost)')
          .lte('next_step_at', endOfToday.toISOString())
      ).then((n) => {
        if (n) out.crm = { n, detail: `follow-up${n === 1 ? '' : 's'} due` };
      }),
    keys.includes('subcontractors') &&
      Promise.all([
        count(admin.from('subcontractors').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_countersign')),
        count(admin.from('subcontractor_documents').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      ]).then(([sign, docs]) => {
        const parts = [sign && `${sign} to countersign`, docs && `${docs} docs to review`].filter(Boolean);
        if (sign + docs) out.subcontractors = { n: sign + docs, detail: parts.join(' · ') };
      }),
    keys.includes('crm') &&
      count(admin.from('assistant_drafts').select('id', { count: 'exact', head: true }).eq('status', 'draft')).then((n) => {
        if (n) out.drafts = { n, detail: `draft${n === 1 ? '' : 's'} from Metis to send` };
      }),
    isAdmin &&
      count(admin.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')).then((n) => {
        if (n) out.users = { n, detail: 'awaiting approval' };
      }),
  ]);
  return out;
}

/** What's on this person's plate: their open tasks, CRM follow-ups due today, unread WhatsApp chats. */
async function myDay(userId: string, keys: PortalKey[]) {
  const admin = createAdminClient();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const safe = async <T,>(q: PromiseLike<{ data: T | null }>, fallback: T) => {
    try {
      return (await q).data ?? fallback;
    } catch {
      return fallback;
    }
  };
  const [tasks, followUps] = await Promise.all([
    keys.includes('tasks')
      ? safe(
          admin
            .from('tasks')
            .select('id, title, due_date, priority')
            .eq('assignee_id', userId)
            .neq('status', 'done')
            .order('due_date', { ascending: true, nullsFirst: false })
            .limit(6),
          [] as HubTask[]
        )
      : ([] as HubTask[]),
    keys.includes('crm')
      ? safe(
          admin
            .from('crm_projects')
            .select('id, title, next_step, next_step_at')
            .lte('next_step_at', endOfToday.toISOString())
            .not('stage', 'in', '(complete,lost)')
            .or(`owner_id.eq.${userId},owner_id.is.null`)
            .order('next_step_at')
            .limit(6),
          [] as HubFollowUp[]
        )
      : ([] as HubFollowUp[]),
  ]);
  return { tasks, followUps };
}

type Row = Record<string, unknown>;

const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const timeOf = (iso: unknown) => hhmm.format(new Date(String(iso)));
const directions = (...where: unknown[]) => {
  const to = where.filter((x) => typeof x === 'string' && x.trim()).join(', ');
  return to ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(to)}` : null;
};
const DIARY_KIND: Record<string, string> = { site_visit: 'Site visit', install: 'Install', meeting: 'Meeting', personal: 'Personal', other: 'Other' };

/** Reads that may fail (a table not there yet) come back empty. */
async function rows(q: PromiseLike<{ data: unknown }>): Promise<Row[]> {
  try {
    return (((await q).data as Row[] | null) ?? []) as Row[];
  } catch {
    return [];
  }
}

/** Whose diary entries are mine: my email, and any booking surveyor row matched to it (cms_kv 'survey-booking'). */
async function myDiaryKeys(email: string): Promise<string[]> {
  const keys = new Set([email]);
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', 'survey-booking').maybeSingle();
    const v = data?.value ? JSON.parse(data.value as string) : null;
    for (const sv of Array.isArray(v?.surveyors) ? v.surveyors : []) {
      if (typeof sv?.key === 'string' && String(sv.profileEmail || '').toLowerCase() === email) keys.add(sv.key.toLowerCase());
    }
  } catch {
    // Booking settings not saved yet: the default surveyor's key is their email.
  }
  return [...keys];
}

/**
 * Home → Today, for people on the CRM once surveys.sql has run: today's surveys and installs (any
 * of the job's working install days), and my own diary entries. Every read is defensive.
 */
async function todayList(email: string | null, keys: PortalKey[]): Promise<HubToday | null> {
  if (!keys.includes('crm')) return null;
  const ready = await schemaReady();
  if (!ready.surveys) return null;
  const db = createAdminClient();
  const today = todayISO();
  const now = Date.now();
  const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
  // Wide windows, then the exact UK day in code (no time-zone maths in the query).
  const [surveyJobs, installJobs] = await Promise.all([
    rows(db.from('crm_projects').select('*').gte('survey_at', at(-36)).lte('survey_at', at(36)).neq('stage', 'lost').limit(100)),
    rows(db.from('crm_projects').select('*').gte('install_at', at(-24 * 62)).lte('install_at', at(36)).neq('stage', 'lost').order('install_at', { ascending: false }).limit(300)),
  ]);
  const surveys = surveyJobs.filter((p) => ukDay(String(p.survey_at)) === today);
  const longInstall = installJobs.some((p) => Number(p.install_days ?? 1) > 1);
  const hols = longInstall ? await ukBankHolidays() : new Set<string>();
  const installs = installJobs
    .map((p) => ({ p, days: installDayList(ukDay(String(p.install_at)), Number(p.install_days ?? 1), hols) }))
    .filter((x) => x.days.includes(today));

  const projectIds = [...new Set([...surveys, ...installs.map((x) => x.p)].map((p) => String(p.id)))];
  const enquiryIds = [...new Set([...surveys, ...installs.map((x) => x.p)].map((p) => String(p.enquiry_id)))];
  const mine = email ? await myDiaryKeys(email.toLowerCase()) : [];
  const [customers, surveyRows, timed, allDay] = await Promise.all([
    enquiryIds.length ? rows(db.from('enquiries').select('id, name, postcode').in('id', enquiryIds)) : Promise.resolve([]),
    projectIds.length
      ? rows(db.from('crm_surveys').select('id, project_id, type, status, updated_at').in('project_id', projectIds).in('status', ['booked', 'draft', 'complete']))
      : Promise.resolve([]),
    ready.booking && mine.length
      ? rows(db.from('diary_entries').select('*').is('deleted_at', null).in('surveyor_key', mine).eq('all_day', false).gte('starts_at', at(-36)).lte('starts_at', at(36)))
      : Promise.resolve([]),
    ready.booking && mine.length
      ? rows(db.from('diary_entries').select('*').is('deleted_at', null).in('surveyor_key', mine).eq('all_day', true).lte('day_from', today).gte('day_to', today))
      : Promise.resolve([]),
  ]);
  const customer = new Map(customers.map((c) => [String(c.id), c]));
  const nameOf = (p: Row) => String(customer.get(String(p.enquiry_id))?.name || p.title || 'Customer');
  const postcodeOf = (p: Row) => String(p.postcode || customer.get(String(p.enquiry_id))?.postcode || '');
  const items: HubTodayItem[] = [];

  for (const p of surveys) {
    const type: SurveyTypeKey = isSurveyType(p.survey_type) ? p.survey_type : (surveyTypeFor((p.products as string[] | null) ?? []) ?? 'solar');
    // Solar (and solar + heat pump) surveys are done in the app; heat pump only is the SimpliHeat record.
    const appType = type === 'ashp' ? 'ashp' : 'solar';
    const mineRows = surveyRows.filter((r) => r.project_id === p.id && r.type === appType);
    const open = mineRows.find((r) => r.status === 'booked' || r.status === 'draft');
    const done = mineRows.find((r) => r.status === 'complete');
    const start = Date.parse(String(p.survey_at));
    const minutes = Number(p.survey_minutes) || DEFAULT_SURVEY_MINUTES[type];
    // Infrared, EV or LED only (and no survey started for it): a home visit, with no survey form.
    const visit = !open && !done && noSurveyNeeded({ survey_type: p.survey_type as string | null, products: p.products as string[] | null });
    items.push({
      key: `s-${p.id}`,
      kind: 'survey',
      ...(visit ? { tag: 'Visit' } : {}),
      sort: start,
      time: `${timeOf(p.survey_at)}–${hhmm.format(new Date(start + minutes * 60_000))}`,
      title: nameOf(p),
      sub: [visit ? 'Home visit' : `${SURVEY_TYPES.find((t) => t.key === type)?.short ?? 'Solar'} survey`, postcodeOf(p)].filter(Boolean).join(' · '),
      href: `/admin/crm/${p.id}`,
      action: open
        ? { href: `/admin/surveys/${open.id}`, label: open.status === 'draft' ? 'Continue' : 'Start survey' }
        : done
          ? { href: `/admin/surveys/${done.id}/report`, label: 'Report' }
          : visit
            ? null
            : { href: `/admin/surveys/start?project=${p.id}&type=${appType}`, label: 'Start survey' },
      directions: directions(p.address, postcodeOf(p)),
    });
  }
  for (const { p, days } of installs) {
    const n = days.indexOf(today) + 1;
    items.push({
      key: `i-${p.id}`,
      kind: 'install',
      sort: n === 1 ? Date.parse(String(p.install_at)) : 0,
      time: n === 1 ? timeOf(p.install_at) : 'All day',
      title: nameOf(p),
      sub: [days.length > 1 ? `Install, day ${n} of ${days.length}` : 'Install', postcodeOf(p)].filter(Boolean).join(' · '),
      href: `/admin/crm/${p.id}`,
      action: null,
      directions: directions(p.address, postcodeOf(p)),
    });
  }
  for (const e of [...allDay, ...timed.filter((x) => ukDay(String(x.starts_at)) === today)]) {
    const where = e.where_kind === 'home' ? 'At home' : e.where_kind === 'online' ? 'Online / phone' : String(e.postcode || '');
    items.push({
      key: `d-${e.id}`,
      kind: 'diary',
      sort: e.all_day ? 0 : Date.parse(String(e.starts_at)),
      time: e.all_day ? 'All day' : `${timeOf(e.starts_at)}–${timeOf(e.ends_at)}`,
      title: String(e.title || DIARY_KIND[String(e.kind)] || 'Diary'),
      sub: [DIARY_KIND[String(e.kind)] || 'Diary', where].filter(Boolean).join(' · '),
      href: e.project_id ? `/admin/crm/${e.project_id}` : '/admin/surveys',
      action: null,
      directions: e.where_kind === 'address' ? directions(e.address, e.postcode) : null,
    });
  }
  items.sort((a, b) => a.sort - b.sort);
  return { items, canAddDiary: ready.booking };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const { user, profile } = await getSessionProfile();
  const isAdmin = profile?.role === 'admin';
  const keys = portalsFor(profile);
  const portals = PORTALS.filter((p) => keys.includes(p.key));
  const [counts, day, today, setup, people, metaLeads] = await Promise.all([
    badges(keys, isAdmin),
    user ? myDay(user.id, keys) : null,
    user ? todayList(profile?.email || user.email || null, keys).catch(() => null) : null,
    // Admins see the setup to-dos unless one's been passed to someone; members only theirs.
    user ? visibleSetupTodos(user.id, isAdmin) : null,
    isAdmin ? setupPeople() : [],
    // New Meta leads (Enquiries and CRM staff): a failure just hides the panel.
    user ? newMetaLeads(keys).catch(() => null) : null,
  ]);
  const firstName = (profile?.full_name || profile?.email || '').split(/[\s@]/)[0];

  return (
    <AdminShell active="dashboard" isAdmin={isAdmin} wide>
      <HubView
        firstName={firstName}
        portals={portals.map((p) => ({ ...p, badge: counts[p.key] ? `${counts[p.key]!.n} ${counts[p.key]!.detail}` : undefined }))}
        needs={counts}
        usersBadge={isAdmin ? (counts.users ? `${counts.users.n} ${counts.users.detail}` : null) : undefined}
        denied={!!denied}
        tasks={day?.tasks ?? []}
        followUps={day?.followUps ?? []}
        today={todayISO()}
        todayList={today}
        setup={{
          todos: setup?.mine ?? [],
          admin: isAdmin && user ? { others: setup?.others ?? [], people, meId: user.id } : undefined,
        }}
        assistant={keys.includes('crm')}
        metaLeads={metaLeads}
      />
    </AdminShell>
  );
}

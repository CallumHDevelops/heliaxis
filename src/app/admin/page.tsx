import type { Metadata } from 'next';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { PORTALS, portalsFor, type PortalKey } from '@/lib/portals';
import { todayISO } from '@/lib/tasks';
import { HubView, type HubTask, type HubFollowUp } from './HubView';

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
  const out: Partial<Record<PortalKey | 'users' | 'whatsapp', NeedCount>> = {};
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const { user, profile } = await getSessionProfile();
  const isAdmin = profile?.role === 'admin';
  const keys = portalsFor(profile);
  const portals = PORTALS.filter((p) => keys.includes(p.key));
  const [counts, day] = await Promise.all([badges(keys, isAdmin), user ? myDay(user.id, keys) : null]);
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
      />
    </AdminShell>
  );
}

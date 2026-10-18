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
async function badges(keys: PortalKey[], isAdmin: boolean) {
  const admin = createAdminClient();
  const out: Partial<Record<PortalKey | 'users', string>> = {};
  const count = async (q: PromiseLike<{ count: number | null }>) => {
    try {
      return (await q).count ?? 0;
    } catch {
      return 0;
    }
  };
  await Promise.all([
    keys.includes('enquiries') &&
      count(admin.from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new')).then((n) => {
        if (n) out.enquiries = `${n} new`;
      }),
    keys.includes('tasks') &&
      count(
        admin.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done').lt('due_date', todayISO())
      ).then((n) => {
        if (n) out.tasks = `${n} overdue`;
      }),
    keys.includes('subcontractors') &&
      Promise.all([
        count(admin.from('subcontractors').select('id', { count: 'exact', head: true }).eq('status', 'awaiting_countersign')),
        count(admin.from('subcontractor_documents').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      ]).then(([sign, docs]) => {
        const parts = [sign && `${sign} to countersign`, docs && `${docs} docs to review`].filter(Boolean);
        if (parts.length) out.subcontractors = parts.join(' · ');
      }),
    keys.includes('crm') &&
      count(
        admin.from('crm_projects').select('id', { count: 'exact', head: true }).not('stage', 'in', '(complete,lost)')
      ).then((n) => {
        if (n) out.crm = `${n} live project${n === 1 ? '' : 's'}`;
      }),
    isAdmin &&
      count(admin.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending')).then((n) => {
        if (n) out.users = `${n} awaiting approval`;
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
  const [tasks, followUps, unread] = await Promise.all([
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
    keys.includes('enquiries')
      ? admin
          .from('enquiries')
          .select('id', { count: 'exact', head: true })
          .gt('wa_unread', 0)
          .then((r) => r.count ?? 0, () => 0)
      : 0,
  ]);
  return { tasks, followUps, unread };
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
        portals={portals.map((p) => ({ ...p, badge: counts[p.key] }))}
        usersBadge={isAdmin ? (counts.users ?? null) : undefined}
        denied={!!denied}
        tasks={day?.tasks ?? []}
        followUps={day?.followUps ?? []}
        waUnread={day?.unread ?? 0}
        today={todayISO()}
      />
    </AdminShell>
  );
}

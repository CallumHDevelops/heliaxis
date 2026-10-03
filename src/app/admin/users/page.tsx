import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { UsersManager, type UserRow } from './UsersManager';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  const { user, profile } = await getSessionProfile();
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  const rows = (data ?? []) as (UserRow & { portals?: string[] | null })[];
  const hasPortals = rows.length === 0 || rows.some((r) => 'portals' in r);

  return (
    <AdminShell active="users" isAdmin={profile?.role === 'admin'}>
      <UsersManager
        rows={rows.map((r) => ({ ...r, portals: Array.isArray(r.portals) ? r.portals : [] }))}
        selfId={user?.id ?? ''}
        hasPortals={hasPortals}
        loadError={error?.message ?? null}
      />
    </AdminShell>
  );
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { canAccess, type PortalKey } from '@/lib/portals';

export type Profile = {
  role: 'member' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  full_name: string | null;
  email: string | null;
  /** Portals a member may open (admins get all). Absent until the migration runs. */
  portals?: string[] | null;
};

// Current signed-in user + their profile (or nulls). For use in admin pages.
export async function getSessionProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null as Profile | null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  return { user, profile: (profile as Profile | null) ?? null };
}

/** Approved users only — returns null otherwise. */
export async function requireApproved() {
  const session = await getSessionProfile();
  if (!session.user || session.profile?.status !== 'approved') return null;
  return session as { user: NonNullable<typeof session.user>; profile: Profile };
}

/** Approved users with access to the given portal only — returns null otherwise. */
export async function requirePortal(key: PortalKey) {
  const session = await requireApproved();
  if (!session || !canAccess(session.profile, key)) return null;
  return session;
}

/** Redirect unauthenticated / unapproved users away from admin routes. */
export async function guardAdmin(nextPath = '/admin') {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'approved') {
    redirect('/pending');
  }

  return { user, profile: profile as Profile };
}

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type Profile = {
  role: 'member' | 'admin';
  status: 'pending' | 'approved' | 'rejected';
  full_name: string | null;
  email: string | null;
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
    .select('role, status, full_name, email')
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

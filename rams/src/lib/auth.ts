import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';

export type Session = { user: { id: string; email?: string }; profile: Profile };

/** Current user + profile, or nulls. Does not redirect. */
export async function getSession(): Promise<{
  user: { id: string; email?: string } | null;
  profile: Profile | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return { user, profile: (data as Profile | null) ?? null };
}

/**
 * Gate for every page inside the app shell. Redirects to /login when signed
 * out and to /pending when the account has not been approved.
 */
export async function requireUser(nextPath = '/'): Promise<Session> {
  const { user, profile } = await getSession();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  if (!profile || profile.status !== 'approved') redirect('/pending');
  return { user, profile };
}

/** Manager or admin only. */
export async function requireManager(nextPath = '/'): Promise<Session> {
  const session = await requireUser(nextPath);
  if (session.profile.role !== 'manager' && session.profile.role !== 'admin') redirect('/');
  return session;
}

/** Admin only. */
export async function requireAdmin(nextPath = '/'): Promise<Session> {
  const session = await requireUser(nextPath);
  if (session.profile.role !== 'admin') redirect('/');
  return session;
}

export function isManager(profile: Profile | null): boolean {
  return profile?.role === 'manager' || profile?.role === 'admin';
}

export function displayName(profile: Profile | null): string {
  return profile?.full_name?.trim() || profile?.email || 'Unknown user';
}

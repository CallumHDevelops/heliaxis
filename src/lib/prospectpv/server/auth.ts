/**
 * Server-only: who is signed in, and are they allowed into ProspectPV?
 *
 * Uses Heliaxis's own session and profile (src/lib/auth.ts, src/lib/portals.ts), so there is one sign-in for the whole
 * admin. Every query runs AS THE SIGNED-IN USER, and row level security decides what they can read and write.
 * The database applies the same rule as this file (pv_has_role in supabase/prospectpv/):
 *   - ProspectPV admin: an approved admin
 *   - ProspectPV staff: an approved admin, or an approved member with the CRM portal (Sales lives under CRM)
 */
import 'server-only';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { getSessionProfile, type Profile } from '@/lib/auth';
import { canAccess } from '@/lib/portals';
import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'staff';

export async function supabaseUser(): Promise<SupabaseClient> {
  return createClient();
}

export function roleOf(profile: Pick<Profile, 'role' | 'status' | 'portals'> | null | undefined): Role | null {
  if (!profile || profile.status !== 'approved') return null;
  if (profile.role === 'admin') return 'admin';
  return canAccess(profile, 'crm') ? 'staff' : null;
}

export type Session = { db: SupabaseClient; user: User; role: Role };

/** For pages and actions: sends the person to sign in, or back to the admin home if they have no access. */
export async function requireStaff(nextPath = '/admin/sales/prospectpv'): Promise<Session> {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  const role = roleOf(profile);
  if (!role) redirect('/admin?denied=1');
  return { db: await createClient(), user, role };
}

export async function requireAdmin(): Promise<Session> {
  const s = await requireStaff();
  if (s.role !== 'admin') throw new Error('Only ProspectPV admins can do that.');
  return s;
}

/** For route handlers and server actions, which answer with a message instead of redirecting. */
export async function staffOrNull(): Promise<Session | null> {
  const { user, profile } = await getSessionProfile();
  const role = roleOf(profile);
  return user && role ? { db: await createClient(), user, role } : null;
}

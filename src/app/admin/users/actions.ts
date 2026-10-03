'use server';

import { revalidatePath } from 'next/cache';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PORTAL_KEYS } from '@/lib/portals';

type Result = { ok: true } | { ok: false; error: string };

export async function updateUser(
  id: string,
  input: { status: string; role: string; portals: string[] }
): Promise<Result> {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.role !== 'admin' || profile.status !== 'approved') return { ok: false, error: 'Not authorised' };
  if (!['pending', 'approved', 'rejected'].includes(input.status)) return { ok: false, error: 'Bad status' };
  if (!['member', 'admin'].includes(input.role)) return { ok: false, error: 'Bad role' };
  // Avoid locking yourself out.
  if (id === user.id && (input.status !== 'approved' || input.role !== 'admin')) {
    return { ok: false, error: "You can't remove your own admin access." };
  }

  const portals = [...new Set(input.portals)].filter((k) => (PORTAL_KEYS as string[]).includes(k));
  const { error } = await createAdminClient()
    .from('profiles')
    .update({ status: input.status, role: input.role, portals })
    .eq('id', id);
  if (error) {
    return {
      ok: false,
      error: /portals/.test(error.message)
        ? 'The portals column is missing — run supabase/user-portals.sql in Supabase first.'
        : error.message,
    };
  }
  revalidatePath('/admin/users');
  return { ok: true };
}

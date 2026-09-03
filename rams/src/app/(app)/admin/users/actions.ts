'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUSES = ['pending', 'approved', 'rejected'] as const;
const ROLES = ['member', 'manager', 'admin'] as const;

export async function updateUser(formData: FormData) {
  const { user } = await requireAdmin('/admin/users');

  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!id) return;

  const update: Record<string, string> = {};
  if ((STATUSES as readonly string[]).includes(status)) update.status = status;
  if ((ROLES as readonly string[]).includes(role)) update.role = role;
  if (Object.keys(update).length === 0) return;

  // Guard against an admin locking themselves out and leaving nobody able to
  // approve anyone.
  if (id === user.id && (update.role === 'member' || update.status !== 'approved')) return;

  // Service role: RLS lets an admin update profiles, but going through the
  // admin client keeps the check in one place and survives policy changes.
  await createAdminClient().from('profiles').update(update).eq('id', id);

  revalidatePath('/admin/users');
}

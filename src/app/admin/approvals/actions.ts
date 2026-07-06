'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Verify the caller is an approved admin. Never trust the client.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin' || profile?.status !== 'approved') {
    throw new Error('Not authorized');
  }
  return user;
}

export async function setUserStatus(formData: FormData) {
  const admin_user = await requireAdmin();

  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  if (!id || !['approved', 'rejected'].includes(status)) return;
  // An admin cannot change their own status here (avoids self-lockout).
  if (id === admin_user.id) return;

  const admin = createAdminClient();
  await admin.from('profiles').update({ status }).eq('id', id);
  revalidatePath('/admin/approvals');
}

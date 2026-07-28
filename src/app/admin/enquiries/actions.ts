'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { labelToDbStatus } from '@/lib/enquiries';

export async function updateEnquiryStatus(formData: FormData) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect('/login');
  if (profile?.status !== 'approved') redirect('/pending');

  const id = String(formData.get('id') || '');
  const raw = String(formData.get('status') || '');
  const status = labelToDbStatus(raw);
  if (!id || !status) return;

  const admin = createAdminClient();
  await admin.from('enquiries').update({ status }).eq('id', id);
  revalidatePath('/admin/enquiries');
}

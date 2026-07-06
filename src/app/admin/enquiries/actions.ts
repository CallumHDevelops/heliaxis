'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'];

export async function updateEnquiryStatus(formData: FormData) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect('/login');
  if (profile?.status !== 'approved') redirect('/pending');

  const id = String(formData.get('id') || '');
  const status = String(formData.get('status') || '');
  if (!id || !STATUSES.includes(status)) return;

  const admin = createAdminClient();
  await admin.from('enquiries').update({ status }).eq('id', id);
  revalidatePath('/admin/enquiries');
}

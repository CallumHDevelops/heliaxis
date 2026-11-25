'use server';

import { revalidatePath } from 'next/cache';
import { getSessionProfile } from '@/lib/auth';
import { setApproval } from '@/lib/templates/approval';
import { createAdminClient } from '@/lib/supabase/admin';

/** Admins only. Approving records who approved which exact wording and when; withdrawing it puts the template back to draft. Metis cannot do this. */
export async function setTemplateApproval(f: FormData) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved' || profile.role !== 'admin') throw new Error('Only an admin can approve legal wording.');
  const code = String(f.get('code') ?? '');
  const approved = f.get('approved') === '1';
  const r = await setApproval(createAdminClient(), code, approved, user.id);
  if (!r.ok) throw new Error(r.error);
  revalidatePath('/admin/legal-templates');
}

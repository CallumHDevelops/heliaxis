'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { isManager, requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type CertState = { error?: string; ok?: string };

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

const schema = z.object({
  owner_type: z.enum(['company', 'user']),
  profile_id: z.string().uuid().nullable(),
  title: z.string().trim().min(2, 'Give the certificate a title.'),
  category: z.string().trim().optional(),
  issuing_body: z.string().trim().optional(),
  reference: z.string().trim().optional(),
  issue_date: z.string().trim().optional(),
  expiry_date: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function saveCertification(_prev: CertState, formData: FormData): Promise<CertState> {
  const { user, profile } = await requireUser('/certifications');

  const ownerType = str(formData, 'owner_type') === 'company' ? 'company' : 'user';
  const profileId = ownerType === 'user' ? str(formData, 'profile_id') || user.id : null;

  // Only a manager may record company-wide accreditations, or edit someone
  // else's competency record.
  if (ownerType === 'company' && !isManager(profile)) {
    return { error: 'Only managers can add company accreditations.' };
  }
  if (ownerType === 'user' && profileId !== user.id && !isManager(profile)) {
    return { error: "Only managers can record another person's certificate." };
  }

  const parsed = schema.safeParse({
    owner_type: ownerType,
    profile_id: profileId,
    title: str(formData, 'title'),
    category: str(formData, 'category'),
    issuing_body: str(formData, 'issuing_body'),
    reference: str(formData, 'reference'),
    issue_date: str(formData, 'issue_date'),
    expiry_date: str(formData, 'expiry_date'),
    notes: str(formData, 'notes'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form and try again.' };
  }

  const supabase = await createClient();

  // Denormalise the holder's name so the report and the expiry list don't need
  // a join, and so a departed staff member's certificate still reads correctly.
  let holderName: string | null = null;
  if (profileId) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', profileId)
      .maybeSingle();
    holderName = data?.full_name || data?.email || null;
  }

  const values = {
    ...parsed.data,
    issue_date: parsed.data.issue_date || null,
    expiry_date: parsed.data.expiry_date || null,
    category: parsed.data.category || null,
    issuing_body: parsed.data.issuing_body || null,
    reference: parsed.data.reference || null,
    notes: parsed.data.notes || null,
    holder_name: holderName,
    file_path: str(formData, 'file_path') || null,
    file_name: str(formData, 'file_name') || null,
  };

  const id = str(formData, 'id');
  const { error } = id
    ? await supabase.from('certifications').update(values).eq('id', id)
    : await supabase.from('certifications').insert({ ...values, created_by: user.id });

  if (error) return { error: error.message };

  revalidatePath('/certifications');
  return { ok: id ? 'Certificate updated.' : 'Certificate added.' };
}

export async function deleteCertification(formData: FormData) {
  await requireUser('/certifications');

  const id = String(formData.get('id') ?? '');
  const path = String(formData.get('file_path') ?? '');
  if (!id) return;

  const supabase = await createClient();
  // RLS decides whether this delete is permitted (own record or manager).
  const { error } = await supabase.from('certifications').delete().eq('id', id);
  if (!error && path) await supabase.storage.from('certifications').remove([path]);

  revalidatePath('/certifications');
}

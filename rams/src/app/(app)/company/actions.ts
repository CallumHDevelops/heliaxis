'use server';

import { revalidatePath } from 'next/cache';
import { requireManager, requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type SettingsState = { error?: string; ok?: string };

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

const FIELDS = [
  'name',
  'trading_name',
  'registration_number',
  'vat_number',
  'address',
  'postcode',
  'phone',
  'email',
  'website',
  'hs_policy_statement',
  'competent_person',
  'insurer',
  'policy_number',
  'emergency_contact',
] as const;

export async function saveCompany(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { user } = await requireManager('/company');

  const values: Record<string, unknown> = { updated_by: user.id };
  for (const key of FIELDS) values[key] = str(formData, key) || null;

  const name = str(formData, 'name');
  if (!name) return { error: 'The company name is required — it appears on every document.' };
  values.name = name;
  values.policy_expiry = str(formData, 'policy_expiry') || null;

  const supabase = await createClient();
  const { error } = await supabase.from('company_settings').update(values).eq('id', 1);
  if (error) return { error: error.message };

  revalidatePath('/company');
  return { ok: 'Company details saved.' };
}

export async function saveProfile(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { user } = await requireUser('/company');

  const fullName = str(formData, 'full_name');
  if (!fullName) return { error: 'Your name is required.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      job_title: str(formData, 'job_title') || null,
      phone: str(formData, 'phone') || null,
    })
    .eq('id', user.id);

  if (error) return { error: error.message };

  revalidatePath('/company');
  return { ok: 'Your details were saved.' };
}

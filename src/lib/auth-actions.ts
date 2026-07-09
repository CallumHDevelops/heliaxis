'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { safeAdminPath } from '@/lib/auth-utils';

export type AuthState = { error: string } | null;

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const next = safeAdminPath(String(formData.get('next') || ''));

  if (!email || !password) return { error: 'Please enter your email and password.' };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  // Gate on approval status.
  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', data.user.id)
    .single();

  if (!profile || profile.status !== 'approved') {
    redirect('/pending');
  }

  redirect(next);
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const fullName = String(formData.get('fullName') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');

  if (!fullName || !email || !password) return { error: 'All fields are required.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };

  // New accounts land as "pending" until an admin approves them.
  redirect('/pending?registered=1');
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

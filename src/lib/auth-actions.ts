'use server';

import { headers } from 'next/headers';
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

export type NoticeState = { error?: string; ok?: string } | null;

/** Email a password-reset link. Same reply whether or not the address has an account. */
export async function requestPasswordReset(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const email = String(formData.get('email') || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Enter your email address.' };
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${proto}://${host}/auth/confirm?next=/reset-password`,
  });
  return { ok: 'If that email has an account, a reset link is on its way. Check your inbox (and spam).' };
}

/** Set a new password for the signed-in user (arrived via the reset link). */
export async function updatePassword(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  if (password.length < 10) return { error: 'Use at least 10 characters.' };
  if (password !== confirm) return { error: "The passwords don't match." };
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { error: 'Your reset link has expired. Request a new one.' };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  redirect('/admin');
}

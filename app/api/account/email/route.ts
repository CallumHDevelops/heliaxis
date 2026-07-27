import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Let a signed-in user change their OWN sign-in email. Acts only on the
// caller's id (from their session), and auto-confirms so the change takes
// effect immediately without relying on a confirmation email.
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const email = String(body?.email || '')
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email))
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  if (email === (user.email || '').toLowerCase())
    return NextResponse.json({ error: 'That is already your email.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ ok: true });
}

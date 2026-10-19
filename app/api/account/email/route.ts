import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Let a signed-in user change their OWN sign-in email, through their own
// session. Supabase emails a confirmation link to the new address (and the old
// one, with secure email change on); nothing changes until it's confirmed, so
// nobody can take an address they don't own. The link comes back through
// /auth/callback?code=.
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

  const { origin } = new URL(req.url);
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${origin}/auth/callback` });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

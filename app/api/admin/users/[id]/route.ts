import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdminEmail } from '@/lib/auth/admin';

export const runtime = 'nodejs';

// Permanently delete a user's login. Admin only; cannot delete yourself.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!isAdminEmail(user.email))
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  if (params.id === user.id)
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  return NextResponse.json({ ok: true });
}

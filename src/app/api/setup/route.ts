import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { markManualDone, setupTodos } from '@/lib/setup-checks';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

async function admin() {
  const { profile } = await getSessionProfile();
  return profile?.role === 'admin' && profile.status === 'approved';
}

/** The "From Claude" setup to-dos (admins only). */
export async function GET() {
  if (!(await admin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  return NextResponse.json({ todos: await setupTodos() }, { headers: NO_STORE });
}

/** { done: id } ticks off a to-do that can't be checked automatically. */
export async function PATCH(req: Request) {
  if (!(await admin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
  const b = await req.json().catch(() => ({}));
  if (typeof b.done === 'string') await markManualDone(b.done);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

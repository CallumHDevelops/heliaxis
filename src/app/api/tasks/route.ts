import { NextRequest, NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cleanTaskInput, TASK_COLUMNS } from '@/lib/tasks';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
const fail = (error: string, status = 500) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function GET() {
  if (!(await requirePortal('tasks'))) return unauthorized();
  const { data, error } = await createAdminClient()
    .from('tasks')
    .select(TASK_COLUMNS)
    .order('created_at', { ascending: false });
  if (error) return fail(error.message);
  return NextResponse.json({ tasks: data ?? [] }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const session = await requirePortal('tasks');
  if (!session) return unauthorized();

  const body = await req.json().catch(() => null);
  const input = cleanTaskInput(body ?? {});
  if (!input.title) return fail('A task needs a title', 400);

  const { data, error } = await createAdminClient()
    .from('tasks')
    .insert({ ...input, created_by: session.user.id })
    .select(TASK_COLUMNS)
    .single();
  if (error) return fail(error.message);
  return NextResponse.json({ task: data }, { headers: NO_STORE });
}

export async function PATCH(req: NextRequest) {
  if (!(await requirePortal('tasks'))) return unauthorized();

  const body = await req.json().catch(() => null);
  const id = String(body?.id || '').trim();
  if (!id) return fail('id required', 400);
  const input = cleanTaskInput(body ?? {});
  if ('title' in input && !input.title) return fail('A task needs a title', 400);

  const patch: Record<string, unknown> = { ...input, updated_at: new Date().toISOString() };
  if (input.status) patch.completed_at = input.status === 'done' ? new Date().toISOString() : null;

  const { data, error } = await createAdminClient()
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select(TASK_COLUMNS)
    .single();
  if (error) return fail(error.message);
  return NextResponse.json({ task: data }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  if (!(await requirePortal('tasks'))) return unauthorized();
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return fail('id required', 400);
  const { error } = await createAdminClient().from('tasks').delete().eq('id', id);
  if (error) return fail(error.message);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

import { NextRequest, NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };
const STATUSES = ['open', 'in_progress', 'fixed', 'wontfix'];

async function requireApproved() {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved') return null;
  return user;
}

// List all reports (newest first) — for the CMS list and for reading via the read script.
export async function GET() {
  if (!(await requireApproved()))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('feedback')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ items: data ?? [] }, { headers: NO_STORE });
}

// Submit a bug report / feature request.
export async function POST(req: NextRequest) {
  if (!(await requireApproved()))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  const body = await req.json().catch(() => null);
  const type = body?.type === 'feature' ? 'feature' : 'bug';
  const title = String(body?.title || '').trim();
  const detail = String(body?.detail || '').trim();
  const page_url = String(body?.page_url || '').trim();
  if (!title) return NextResponse.json({ error: 'Title required' }, { status: 400, headers: NO_STORE });

  const admin = createAdminClient();
  const { error } = await admin.from('feedback').insert({ type, title, detail, page_url });
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

// Update a report's status (e.g. mark it fixed).
export async function PATCH(req: NextRequest) {
  if (!(await requireApproved()))
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  const body = await req.json().catch(() => null);
  const id = body?.id;
  const status = body?.status;
  if (!id || !STATUSES.includes(status))
    return NextResponse.json({ error: 'bad request' }, { status: 400, headers: NO_STORE });

  const admin = createAdminClient();
  const { error } = await admin.from('feedback').update({ status }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

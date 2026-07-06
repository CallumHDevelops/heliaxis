import { NextRequest, NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// Only approved, signed-in users may read/write CMS content.
async function requireApproved() {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved') return null;
  return user;
}

// Load a CMS document by key (the page-builder calls this via window.storage.get).
export async function GET(req: NextRequest) {
  const user = await requireApproved();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin.from('cms_kv').select('value').eq('key', key).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ value: data?.value ?? null });
}

// Save a CMS document (window.storage.set).
export async function POST(req: NextRequest) {
  const user = await requireApproved();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const key = body?.key;
  const value = body?.value;
  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'key and string value required' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('cms_kv')
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

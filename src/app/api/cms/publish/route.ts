import { NextResponse } from 'next/server';
import { getSessionProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const DRAFT_KEY = 'heliaxis-cms-v1';
const PUBLISHED_KEY = 'heliaxis-cms-published';

// Snapshot the current draft as the published (live) version.
export async function POST() {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('cms_kv')
    .select('value')
    .eq('key', DRAFT_KEY)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.value) return NextResponse.json({ error: 'Nothing to publish yet.' }, { status: 400 });

  const { error: upErr } = await admin
    .from('cms_kv')
    .upsert({ key: PUBLISHED_KEY, value: data.value, updated_at: new Date().toISOString() });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const DRAFT_KEY = 'heliaxis-cms-v1';
const PUBLISHED_KEY = 'heliaxis-cms-published';
const RENDERED_KEY = 'heliaxis-cms-rendered';

// Publish: snapshot the draft as published, and store the client-rendered
// page HTML + CSS that the live (site) route serves.
export async function POST(req: Request) {
  const session = await requireApproved();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();

  // 1. Snapshot the draft document as the published version (data backup).
  const { data } = await admin.from('cms_kv').select('value').eq('key', DRAFT_KEY).maybeSingle();
  if (data?.value) {
    await admin.from('cms_kv').upsert({ key: PUBLISHED_KEY, value: data.value, updated_at: now });
  }

  // 2. Store the rendered pages (HTML + CSS) the browser generated.
  const body = await req.json().catch(() => null);
  if (body?.rendered) {
    await admin
      .from('cms_kv')
      .upsert({ key: RENDERED_KEY, value: JSON.stringify(body.rendered), updated_at: now });
  }

  // Clear any cached site pages so visitors see the new content immediately.
  revalidatePath('/', 'layout');

  return NextResponse.json({ ok: true });
}

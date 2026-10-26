import { NextRequest, NextResponse } from 'next/server';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseCmsState } from '@/lib/blog/cms-blog-shared';
import { keepServerBlogStatus, keepServerPageDraft } from '@/lib/blog/cms-publish-rules';

// Never cache CMS reads/writes — the editor must always see the latest saved doc.
export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };

/**
 * The only document the page editor stores here. cms_kv also holds CRM settings and setup state,
 * which CMS editors mustn't be able to read or overwrite through this route.
 */
const EDITOR_KEYS = ['heliaxis-cms-v1'];
const badKey = () => NextResponse.json({ error: 'unknown key' }, { status: 400, headers: NO_STORE });

// Load a CMS document by key (the page-builder calls this via window.storage.get).
export async function GET(req: NextRequest) {
  const session = await requirePortal('cms');
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  if (!EDITOR_KEYS.includes(key)) return badKey();

  const admin = createAdminClient();
  const { data, error } = await admin.from('cms_kv').select('value').eq('key', key).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: NO_STORE });

  return NextResponse.json({ value: data?.value ?? null }, { headers: NO_STORE });
}

// Save a CMS document (window.storage.set).
export async function POST(req: NextRequest) {
  const session = await requirePortal('cms');
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const key = body?.key;
  const value = body?.value;
  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'key and string value required' }, { status: 400 });
  }
  if (!EDITOR_KEYS.includes(key)) return badKey();

  const admin = createAdminClient();
  // Blog articles keep the status saved here, and pages their draft flag: a tab opened before an article
  // was scheduled or taken down mustn't put it back, and one opened before a page was published mustn't
  // make it a draft again (src/lib/blog/cms-publish-rules.ts).
  const { data: saved, error: readErr } = await admin.from('cms_kv').select('value').eq('key', key).maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  let doc = value;
  try {
    const server = parseCmsState(saved?.value);
    doc = JSON.stringify(keepServerPageDraft(keepServerBlogStatus(JSON.parse(value), server, null), server, null));
  } catch {
    // Not a site document: saved as sent.
  }
  const { error } = await admin
    .from('cms_kv')
    .upsert({ key, value: doc, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

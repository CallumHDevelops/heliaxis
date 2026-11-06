import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkSimpliHeatKey } from '@/lib/templates/api-key';
import { feedForSimpliHeat, openForm, receiveSimpliHeat } from '@/lib/templates/forms';
import { templateByCode } from '@/lib/templates/registry';
import { formsReady, supabaseStore } from '@/lib/templates/store';
import type { SimpliHeatRecord } from '@/lib/templates/answers';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ ref: string; code: string }> };
const NO_STORE = { 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
const REF = /^HX-\d{4,6}(-\d{1,3})?$/i;
/** More than this is not a commissioning record. */
const MAX_BODY = 3_000_000;

/** The project a job reference names, and the form's template; or the answer to send instead. */
async function resolve(ref: string, code: string) {
  if (!REF.test(ref)) return { error: reply({ error: 'Not a job reference' }, 400) } as const;
  const template = templateByCode(code);
  if (!template) return { error: reply({ error: 'No such form' }, 404) } as const;
  const db = createAdminClient();
  if (!(await formsReady(db))) return { error: reply({ error: 'Forms are not set up yet' }, 503) } as const;
  const { data: p } = await db.from('crm_projects').select('id').ilike('project_ref', ref).maybeSingle();
  if (!p) return { error: reply({ error: 'No such project' }, 404) } as const;
  return { db, template, projectId: String(p.id) } as const;
}

/**
 * SimpliHeat reads what HAP has for a job's form: the answers entered here as suggestions (in its own types) with
 * who entered them and when, and the form's status. `?definition=1` adds the form's questions.
 */
export async function GET(req: Request, { params }: Ctx) {
  const denied = checkSimpliHeatKey(req);
  if (denied) return denied;
  const { ref, code } = await params;
  const r = await resolve(ref, code);
  if ('error' in r) return r.error;
  const row = await supabaseStore(r.db).live(r.projectId, r.template.code);
  const definition = new URL(req.url).searchParams.has('definition') ? { definition: r.template } : {};
  if (!row) return reply({ template: r.template.code, status: 'none', revision: 0, suggestions: {}, entered: {}, ...definition });
  return reply({ ...feedForSimpliHeat(r.template, row), ...definition });
}

/**
 * SimpliHeat sends its commissioning record: `{ record, savedAt }`. HAP takes in what it can (see
 * forms.ts receiveSimpliHeat) and says what changed, what clashed with an answer entered here, and what it could not take.
 */
export async function POST(req: Request, { params }: Ctx) {
  const denied = checkSimpliHeatKey(req);
  if (denied) return denied;
  const { ref, code } = await params;
  const r = await resolve(ref, code);
  if ('error' in r) return r.error;
  const raw = await req.text();
  if (raw.length > MAX_BODY) return reply({ error: 'Too large' }, 413);
  let body: { record?: SimpliHeatRecord; savedAt?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return reply({ error: 'Not JSON' }, 400);
  }
  const rec = body.record;
  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return reply({ error: 'record is required' }, 400);
  const savedAt = typeof body.savedAt === 'string' && !Number.isNaN(Date.parse(body.savedAt)) ? new Date(body.savedAt).toISOString() : undefined;
  const store = supabaseStore(r.db);
  await openForm(store, r.template, r.projectId, { id: null, name: 'SimpliHeat' });
  try {
    const out = await receiveSimpliHeat(store, r.template, r.projectId, { ...rec, savedAt }, new Date().toISOString());
    return reply({ status: out.row.status, revision: out.row.revision, changed: out.changed, conflicts: out.conflicts, dropped: out.dropped, skipped: out.skipped, locked: out.locked });
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : 'Could not save' }, 409);
  }
}

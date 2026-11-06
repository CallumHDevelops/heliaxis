import { createAdminClient } from '@/lib/supabase/admin';
import { crmSession, isUuid, json, logActivity } from '@/lib/crm/server';
import { formView, reviseForm, saveAnswers, signLine, type Who } from '@/lib/templates/forms';
import { mergeValues } from '@/lib/documents/templates/render';
import { templateByCode } from '@/lib/templates/registry';
import { formsReady, jobHeadFor, supabaseStore } from '@/lib/templates/store';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string; code: string }> };

/** The project and the form's template, or what to answer instead. */
async function target(id: string, code: string) {
  if (!isUuid(id)) return { error: json({ error: 'Not found' }, 404) } as const;
  const template = templateByCode(code);
  if (!template) return { error: json({ error: 'No such form' }, 404) } as const;
  const db = createAdminClient();
  if (!(await formsReady(db))) return { error: json({ error: 'Forms are not set up yet', ready: false }, 503) } as const;
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id').eq('id', id).maybeSingle();
  if (!p) return { error: json({ error: 'Not found' }, 404) } as const;
  return { db, template, enquiryId: String(p.enquiry_id) } as const;
}

/** The form for the screen: its questions (the template) and where it is. A form not started is not made by looking at it. */
export async function GET(_req: Request, { params }: Ctx) {
  if (!(await crmSession())) return json({ error: 'unauthorized' }, 401);
  const { id, code } = await params;
  const t = await target(id, code);
  if ('error' in t) return t.error;
  const row = await supabaseStore(t.db).live(id, t.template.code);
  // What the job fills in ({{customer}}, {{address}}…): shown on screen as it will print.
  const job = await jobHeadFor(t.db, id);
  return json({ template: t.template, form: formView(t.template, row), merge: job ? mergeValues(job) : {} });
}

/** Save answers: `{ answers: { key: value } }`. Answers that don't suit their question are listed in `problems`; the rest are saved. */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id, code } = await params;
  const t = await target(id, code);
  if ('error' in t) return t.error;
  const b = await req.json().catch(() => null);
  if (!b || typeof b.answers !== 'object' || b.answers === null || Array.isArray(b.answers)) return json({ error: 'answers is required' }, 400);
  const by: Who = { id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone' };
  try {
    const r = await saveAnswers(supabaseStore(t.db), t.template, id, b.answers as Record<string, unknown>, by, 'hap', new Date().toISOString());
    if (!r.ok) return json({ error: r.why, locked: true }, 409);
    return json({ form: formView(t.template, r.row), changed: r.changed, unknown: r.unknown, problems: r.problems });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not save' }, 409);
  }
}

/**
 * Actions on a form: `{ action: 'sign', line, name, image? }` signs a line (an admin only: it makes the form the record),
 * `{ action: 'revise' }` starts the next revision of a signed form (an admin only).
 */
export async function POST(req: Request, { params }: Ctx) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const { id, code } = await params;
  const t = await target(id, code);
  if ('error' in t) return t.error;
  if (s.profile.role !== 'admin') return json({ error: 'Only an admin can sign or revise a form.' }, 403);
  const b = await req.json().catch(() => ({}));
  const by: Who = { id: s.user.id, name: s.profile.full_name || s.profile.email || 'Someone' };
  const store = supabaseStore(t.db);
  const log = (body: string) => logActivity({ enquiryId: t.enquiryId, projectId: id, kind: 'system', body, byId: by.id }).catch(() => null);
  try {
    if (b.action === 'sign') {
      const r = await signLine(store, t.template, id, String(b.line ?? ''), { name: String(b.name ?? ''), image: typeof b.image === 'string' ? b.image : undefined }, by, 'hap', new Date().toISOString());
      if (!r.ok) return json({ error: r.why }, 409);
      await log(`${t.template.title}: signed by ${String(b.name).trim()} in HAP`);
      return json({ form: formView(t.template, r.row) });
    }
    if (b.action === 'revise') {
      const r = await reviseForm(store, t.template, id, by);
      if (!r.ok) return json({ error: r.why }, 409);
      await log(`${t.template.title}: revision ${r.row.revision} started`);
      return json({ form: formView(t.template, r.row) });
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not do that' }, 409);
  }
  return json({ error: 'Unknown action' }, 400);
}

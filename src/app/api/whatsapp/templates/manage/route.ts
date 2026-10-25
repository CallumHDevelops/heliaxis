import { getCrmSettings } from '@/lib/crm/crm-settings';
import { defaultTemplate } from '@/lib/whatsapp/api';
import { getSettings } from '@/lib/whatsapp/settings';
import { getFirstMessages, sendsByItself } from '@/lib/whatsapp/first-messages';
import { deleteTemplate, fetchTemplates, readyDraft, saveBlanks, submitTemplate, type NewTemplate } from '@/lib/whatsapp/templates';
import { cleanBlanks, INSERTABLE, readyMade, type JobKey } from '@/lib/whatsapp/templates-shared';
import { json, session } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

/** Meta allows template names up to 512 characters of a–z, 0–9 and _. */
const META_NAME = /^[a-z0-9_]{1,512}$/;

/** Anyone with Enquiries can look; only admins change anything (it's what customers receive). */
async function adminOnly() {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can change WhatsApp templates.' }, 403);
  return null;
}

/** The WhatsApp templates page: every template, and which one each automatic job uses. */
export async function GET() {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const [list, wa, crm, first] = await Promise.all([fetchTemplates(), getSettings(), getCrmSettings(), getFirstMessages()]);
  const def = defaultTemplate();
  const usage: Record<JobKey, { name: string; fallback: string }> = {
    firstContact: { name: wa.firstContactTemplate, fallback: def.name },
    chase: { name: wa.chaseTemplate, fallback: process.env.WHATSAPP_CHASE_TEMPLATE || wa.firstContactTemplate || def.name },
    survey: { name: crm.surveyTemplate, fallback: '' },
    install: { name: crm.installTemplate, fallback: '' },
    review: { name: crm.reviewTemplate, fallback: '' },
  };
  return json({
    isAdmin: s.profile.role === 'admin',
    items: list.ok ? list.items : [],
    problem: list.ok ? null : list.problem,
    lang: def.lang,
    autoFirst: sendsByItself(first),
    usage,
  });
}

/** Send a template to Meta for approval: { ready: name } for a ready-made one, or the New template form. */
export async function POST(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  let draft: NewTemplate | null;
  if (typeof b.ready === 'string') {
    draft = readyDraft(b.ready);
    if (!draft) return json({ error: 'That isn’t one of the ready-made templates.' }, 400);
  } else {
    const blanks = cleanBlanks(b.blanks);
    if (!blanks || blanks.some((x) => x.field === 'custom' || !INSERTABLE.includes(x.field))) return json({ error: 'Say what fills each blank.' }, 400);
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    if (readyMade(name)) return json({ error: `“${name}” is kept for a ready-made template. Send it from the Ready-made tab instead.` }, 400);
    const list = (v: unknown, max: number) => (Array.isArray(v) ? v.slice(0, max).map((x) => String(x ?? '')) : []);
    draft = {
      name,
      category: typeof b.category === 'string' ? b.category : '',
      body: typeof b.body === 'string' ? b.body : '',
      examples: list(b.examples, 20),
      buttons: list(b.buttons, 10).map((x) => x.trim()),
      blanks,
    };
  }
  const r = await submitTemplate(draft);
  return r.ok ? json(r) : json({ error: r.error }, 400);
}

/** { name, blanks }: what fills each blank of a template (e.g. one made in WhatsApp Manager). */
export async function PUT(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const b = await req.json().catch(() => ({}));
  const name = typeof b.name === 'string' ? b.name : '';
  const blanks = cleanBlanks(b.blanks);
  if (!META_NAME.test(name) || !blanks) return json({ error: 'Not saved: that doesn’t look right.' }, 400);
  const list = await fetchTemplates();
  if (!list.ok) return json({ error: list.problem.message }, 400);
  const t = list.items.find((x) => x.name === name);
  if (!t) return json({ error: `There’s no template called “${name}”.` }, 404);
  if (t.params !== blanks.length) return json({ error: `“${name}” has ${t.params} blank${t.params === 1 ? '' : 's'}. Say what fills each one.` }, 400);
  try {
    await saveBlanks(name, blanks);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
  }
  return json({ ok: true });
}

/** ?name=…&id=…: delete one template (id = that language only). */
export async function DELETE(req: Request) {
  const denied = await adminOnly();
  if (denied) return denied;
  const q = new URL(req.url).searchParams;
  const name = q.get('name') || '';
  const id = q.get('id') || '';
  if (!META_NAME.test(name) || (id && !/^\d{1,30}$/.test(id))) return json({ error: 'Not found' }, 404);
  const r = await deleteTemplate(name, id || null);
  return r.ok ? json({ ok: true }) : json({ error: r.error }, 400);
}

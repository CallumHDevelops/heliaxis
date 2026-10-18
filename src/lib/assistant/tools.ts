import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/crm/server';
import { PRODUCT_KEYS, stageLabel } from '@/lib/crm/stages';
import { notify } from '@/lib/notify';
import { todayISO } from '@/lib/tasks';
import { toWaId } from '@/lib/whatsapp/shared';

/**
 * What the assistant can do. It never contacts a customer: emails and WhatsApps are saved as
 * drafts for a person to check and send.
 */

export type Actor = { id: string; name: string };
/** Shown under the reply as chips ("Task for Esther", "Email draft — Jane Smith"). */
export type AssistantAction = { kind: 'task' | 'note' | 'next_step' | 'draft' | 'opportunity'; label: string; href: string };

const str = { type: 'string' } as const;
const nullable = (description: string) => ({ type: ['string', 'null'], description }) as const;

const obj = (properties: Record<string, unknown>) => ({
  type: 'object' as const,
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_customers',
    description:
      'Find customers/opportunities by name, postcode, phone or email. Returns project ids to use with the other tools. Use it before acting on a customer the user names.',
    input_schema: obj({ query: { ...str, description: 'Name, postcode, phone or email (partial is fine).' } }),
  },
  {
    name: 'get_customer',
    description:
      'Full picture of one opportunity: contact details, stage, value, next step, survey/install dates, recent timeline, WhatsApps, emails and open tasks.',
    input_schema: obj({ project_id: str }),
  },
  {
    name: 'my_day',
    description: "The user's open tasks, CRM follow-ups due, new enquiries and unread WhatsApp chats.",
    input_schema: obj({}),
  },
  {
    name: 'list_team',
    description: 'People who can be given tasks (id and name).',
    input_schema: obj({}),
  },
  {
    name: 'create_task',
    description:
      "Add a task to the shared to-do list. assignee_id null means the user themselves. Link it to an opportunity with project_id when it's about a customer.",
    input_schema: obj({
      title: { ...str, description: 'Short and actionable, e.g. "Send Jane Smith her invoice".' },
      notes: nullable('Extra detail, or null.'),
      assignee_id: nullable('A person id from list_team, or null for the user.'),
      due_date: nullable('YYYY-MM-DD, or null.'),
      priority: { type: 'string', enum: ['low', 'normal', 'high'] },
      project_id: nullable('Opportunity id, or null.'),
    }),
  },
  {
    name: 'add_note',
    description: "Add a note to a customer's timeline (e.g. what was said in a meeting, call or site visit).",
    input_schema: obj({
      project_id: str,
      kind: { type: 'string', enum: ['note', 'call', 'visit'] },
      text: str,
    }),
  },
  {
    name: 'set_next_step',
    description: 'Set the next step on an opportunity; the owner is reminded when it falls due.',
    input_schema: obj({
      project_id: str,
      text: { ...str, description: 'e.g. "Chase quote decision".' },
      due_at: { ...str, description: 'ISO date-time in UK time, e.g. 2026-10-21T10:00:00.' },
    }),
  },
  {
    name: 'draft_email',
    description:
      'Write an email to the customer and save it as a draft for the user to check and send. Sign off as Heliaxis. {portal_link} in the text becomes their portal link.',
    input_schema: obj({ project_id: str, subject: str, body: str }),
  },
  {
    name: 'draft_whatsapp',
    description:
      'Write a WhatsApp message to the customer and save it as a draft for the user to check and send. Short, friendly, no markdown.',
    input_schema: obj({ project_id: str, body: str }),
  },
  {
    name: 'create_opportunity',
    description: 'Add a new customer and opportunity (e.g. someone met at a show or a referral).',
    input_schema: obj({
      name: str,
      phone: nullable('Mobile number, or null.'),
      email: nullable('Email, or null.'),
      postcode: nullable('Postcode, or null.'),
      products: { type: 'array', items: { type: 'string', enum: PRODUCT_KEYS } },
      note: nullable('What they want / where they came from, or null.'),
    }),
  },
];

type Input = Record<string, unknown>;
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const projectHref = (id: string) => `/admin/crm/${id}`;

/** UK wall-clock "2026-10-21T10:00" → a real instant. */
function ukToIso(local: string) {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(local)) return new Date(local).toISOString();
  const guess = new Date(`${local}Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const inUk = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const inUtc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (inUk.getTime() - inUtc.getTime())).toISOString();
}

async function project(id: string) {
  if (!isUuid(id)) return null;
  const { data } = await createAdminClient().from('crm_projects').select('id, enquiry_id, title, owner_id').eq('id', id).maybeSingle();
  return data;
}

export async function runTool(name: string, input: Input, me: Actor, actions: AssistantAction[]): Promise<string> {
  const db = createAdminClient();
  switch (name) {
    case 'search_customers': {
      const q = s(input.query).replace(/[,()%*]/g, ' ').trim();
      if (!q) return 'Give a name, postcode, phone or email.';
      const digits = q.replace(/\D/g, '');
      const ors = [`name.ilike.%${q}%`, `email.ilike.%${q}%`, `postcode.ilike.%${q.replace(/\s+/g, '%')}%`];
      if (digits.length >= 6) ors.push(`phone.ilike.%${digits.slice(-9)}%`);
      const { data: people } = await db
        .from('enquiries')
        .select('id, name, email, phone, postcode')
        .or(ors.join(','))
        .order('created_at', { ascending: false })
        .limit(8);
      if (!people?.length) return 'No customers found.';
      const { data: projects } = await db
        .from('crm_projects')
        .select('id, enquiry_id, title, stage, value, updated_at')
        .in('enquiry_id', people.map((p) => p.id))
        .order('updated_at', { ascending: false });
      return JSON.stringify(
        people.map((p) => ({
          ...p,
          opportunities: (projects ?? [])
            .filter((o) => o.enquiry_id === p.id)
            .map((o) => ({ project_id: o.id, title: o.title, stage: stageLabel(o.stage), value: o.value })),
        }))
      );
    }

    case 'get_customer': {
      const id = s(input.project_id);
      if (!isUuid(id)) return 'Unknown project_id — search first.';
      const { data: p } = await db.from('crm_projects').select('*').eq('id', id).maybeSingle();
      if (!p) return 'Not found.';
      const [c, acts, wa, emails, tasks, drafts] = await Promise.all([
        db.from('enquiries').select('name, email, phone, postcode, interest, property_type, source, created_at').eq('id', p.enquiry_id).maybeSingle(),
        db.from('crm_activities').select('kind, body, at').eq('project_id', id).order('at', { ascending: false }).limit(12),
        db.from('whatsapp_messages').select('direction, body, created_at').eq('enquiry_id', p.enquiry_id).order('created_at', { ascending: false }).limit(10),
        db.from('crm_emails').select('direction, subject, body, at').eq('enquiry_id', p.enquiry_id).order('at', { ascending: false }).limit(4),
        db.from('tasks').select('title, assignee_name, due_date, status').eq('crm_project_id', id).neq('status', 'done'),
        db.from('assistant_drafts').select('kind, subject, body').eq('project_id', id).eq('status', 'draft'),
      ]);
      return JSON.stringify({
        project_id: id,
        customer: c.data,
        title: p.title,
        stage: stageLabel(p.stage),
        products: p.products,
        value: p.value,
        address: p.address,
        survey_at: p.survey_at,
        install_at: p.install_at,
        next_step: p.next_step,
        next_step_at: p.next_step_at,
        notes: p.notes,
        timeline: acts.data ?? [],
        whatsapp: (wa.data ?? []).map((m) => ({ ...m, body: m.body?.slice(0, 400) })),
        emails: (emails.data ?? []).map((m) => ({ ...m, body: m.body?.slice(0, 600) })),
        open_tasks: tasks.data ?? [],
        unsent_drafts: drafts.data ?? [],
      });
    }

    case 'my_day': {
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const [tasks, follow, fresh, unread] = await Promise.all([
        db.from('tasks').select('title, due_date, priority, crm_project_id').eq('assignee_id', me.id).neq('status', 'done').order('due_date', { nullsFirst: false }).limit(20),
        db
          .from('crm_projects')
          .select('id, title, next_step, next_step_at')
          .lte('next_step_at', end.toISOString())
          .not('stage', 'in', '(complete,lost)')
          .or(`owner_id.eq.${me.id},owner_id.is.null`)
          .limit(20),
        db.from('enquiries').select('name, postcode, interest, created_at').eq('status', 'new').order('created_at', { ascending: false }).limit(10),
        db.from('enquiries').select('name, wa_unread').gt('wa_unread', 0).limit(10),
      ]);
      return JSON.stringify({
        today: todayISO(),
        my_tasks: tasks.data ?? [],
        follow_ups_due: (follow.data ?? []).map((f) => ({ project_id: f.id, ...f })),
        new_enquiries: fresh.data ?? [],
        unread_whatsapp: unread.data ?? [],
      });
    }

    case 'list_team': {
      const { data } = await db.from('profiles').select('id, full_name, email').eq('status', 'approved');
      return JSON.stringify((data ?? []).map((p) => ({ id: p.id, name: p.full_name || p.email, is_me: p.id === me.id })));
    }

    case 'create_task': {
      const title = s(input.title).slice(0, 300);
      if (!title) return 'A task needs a title.';
      const assignee = s(input.assignee_id) || me.id;
      const { data: person } = isUuid(assignee)
        ? await db.from('profiles').select('id, full_name, email').eq('id', assignee).eq('status', 'approved').maybeSingle()
        : { data: null };
      if (!person) return 'Unknown assignee_id — use list_team.';
      const pid = s(input.project_id);
      const p = pid ? await project(pid) : null;
      if (pid && !p) return 'Unknown project_id.';
      const due = /^\d{4}-\d{2}-\d{2}$/.test(s(input.due_date)) ? s(input.due_date) : null;
      const priority = ['low', 'normal', 'high'].includes(s(input.priority)) ? s(input.priority) : 'normal';
      const notes = [s(input.notes), `Added by Claude for ${me.name}`].filter(Boolean).join('\n\n');
      const who = person.full_name || person.email || 'Someone';
      const { data: task, error } = await db
        .from('tasks')
        .insert({ title, notes, assignee_id: person.id, assignee_name: who, due_date: due, priority, status: 'todo', created_by: me.id, ...(p ? { crm_project_id: p.id } : {}) })
        .select('id')
        .single();
      if (error || !task) return `Not saved: ${error?.message}`;
      if (p) await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind: 'system', body: `Task added: ${title}`, byId: me.id });
      if (person.id !== me.id)
        await notify({ userId: person.id, kind: 'task_assigned', title: `New task from ${me.name}`, body: title, href: p ? projectHref(p.id) : `/admin/tasks?task=${task.id}` });
      actions.push({ kind: 'task', label: `Task${person.id === me.id ? '' : ` for ${who.split(' ')[0]}`}: ${title}`, href: p ? projectHref(p.id) : `/admin/tasks?task=${task.id}` });
      return `Task created for ${who}${due ? `, due ${due}` : ''}.`;
    }

    case 'add_note': {
      const p = await project(s(input.project_id));
      if (!p) return 'Unknown project_id.';
      const text = s(input.text).slice(0, 4000);
      if (!text) return 'Empty note.';
      const kind = (['note', 'call', 'visit'].includes(s(input.kind)) ? s(input.kind) : 'note') as 'note' | 'call' | 'visit';
      await logActivity({ enquiryId: p.enquiry_id, projectId: p.id, kind, body: text, meta: { via: 'claude' }, byId: me.id });
      await db.from('crm_projects').update({ updated_at: new Date().toISOString() }).eq('id', p.id);
      actions.push({ kind: 'note', label: `Note on ${p.title}`, href: projectHref(p.id) });
      return 'Note added.';
    }

    case 'set_next_step': {
      const p = await project(s(input.project_id));
      if (!p) return 'Unknown project_id.';
      const at = ukToIso(s(input.due_at));
      if (!at) return 'due_at must be an ISO date-time.';
      const text = s(input.text).slice(0, 300);
      await db.from('crm_projects').update({ next_step: text, next_step_at: at, next_step_notified_at: null, updated_at: new Date().toISOString() }).eq('id', p.id);
      const when = new Date(at).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      actions.push({ kind: 'next_step', label: `Next step: ${text} · ${when}`, href: projectHref(p.id) });
      return `Next step set for ${when}.`;
    }

    case 'draft_email':
    case 'draft_whatsapp': {
      const p = await project(s(input.project_id));
      if (!p) return 'Unknown project_id.';
      const email = name === 'draft_email';
      const body = s(input.body).slice(0, email ? 8000 : 4096);
      if (!body) return 'Empty draft.';
      const { data: c } = await db.from('enquiries').select('name, email, phone').eq('id', p.enquiry_id).maybeSingle();
      if (email && !c?.email) return 'This customer has no email address — offer a WhatsApp instead.';
      if (!email && !toWaId(c?.phone)) return 'This customer has no mobile number — offer an email instead.';
      const { data: d, error } = await db
        .from('assistant_drafts')
        .insert({ kind: email ? 'email' : 'whatsapp', project_id: p.id, enquiry_id: p.enquiry_id, subject: email ? s(input.subject).slice(0, 200) : null, body, created_by: me.id })
        .select('id')
        .single();
      if (error || !d) return `Not saved: ${error?.message}`;
      actions.push({ kind: 'draft', label: `${email ? 'Email' : 'WhatsApp'} draft — ${c?.name || p.title}`, href: `/admin/assistant#draft-${d.id}` });
      return 'Draft saved. The user will check and send it.';
    }

    case 'create_opportunity': {
      const nm = s(input.name).slice(0, 120);
      if (!nm) return 'A name is needed.';
      const phone = s(input.phone) || null;
      const postcode = s(input.postcode).toUpperCase() || null;
      const { data: c, error } = await db
        .from('enquiries')
        .insert({ name: nm, email: s(input.email), phone, postcode, wa_id: toWaId(phone), source: 'crm', status: 'contacted' })
        .select('id')
        .single();
      if (error || !c) return `Not saved: ${error?.message}`;
      const products = (Array.isArray(input.products) ? input.products : []).map(String).filter((k) => PRODUCT_KEYS.includes(k));
      const title = `${nm}${postcode ? ` · ${postcode}` : ''}`;
      const { data: p, error: e2 } = await db
        .from('crm_projects')
        .insert({ enquiry_id: c.id, title, products, postcode, owner_id: me.id, created_by: me.id, stage: 'lead' })
        .select('id')
        .single();
      if (e2 || !p) return `Customer saved but not the opportunity: ${e2?.message}`;
      await logActivity({ enquiryId: c.id, projectId: p.id, kind: 'system', body: 'Opportunity created by Claude', byId: me.id });
      if (s(input.note)) await logActivity({ enquiryId: c.id, projectId: p.id, kind: 'note', body: s(input.note), meta: { via: 'claude' }, byId: me.id });
      actions.push({ kind: 'opportunity', label: `New opportunity: ${title}`, href: projectHref(p.id) });
      return JSON.stringify({ project_id: p.id, title });
    }
  }
  return `Unknown tool ${name}`;
}

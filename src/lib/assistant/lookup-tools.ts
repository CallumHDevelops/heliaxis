import 'server-only';
import type Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccess } from '@/lib/portals';
import type { Profile } from '@/lib/auth';
import { stageLabel } from '@/lib/crm/stages';
import { cleanContent, totalsOf } from '@/lib/quotes/types';
import { todayISO } from '@/lib/tasks';

/**
 * Read-only lookups for Metis: quotes, surveys, the diary, subcontractors, the user's own mail and what's overdue or new.
 * None of them changes anything. Each respects what the person can already reach in HAP (subcontractors need that
 * portal; mail is only ever the person's own mailbox). Money comes from the quote code, never from the model.
 */

type Actor = { id: string; name: string };
const str = { type: 'string' } as const;
const nullable = (description: string) => ({ type: ['string', 'null'], description }) as const;
const obj = (properties: Record<string, unknown>) => ({ type: 'object' as const, properties, required: Object.keys(properties), additionalProperties: false });
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const gbp = (pence: number) => `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymd = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export const LOOKUP_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_quotes',
    description: 'Quotes (number, status, total inc VAT, customer). Filter by opportunity (project_id) and/or status. Totals are calculated by the system.',
    input_schema: obj({ project_id: nullable('Opportunity id, or null for all recent quotes.'), status: { type: ['string', 'null'], enum: ['draft', 'sent', 'accepted', 'declined', 'expired', null] } }),
  },
  {
    name: 'list_surveys',
    description: 'Site surveys: type, status, and when completed. Filter by opportunity (project_id), or null for the latest across all jobs.',
    input_schema: obj({ project_id: nullable('Opportunity id, or null.') }),
  },
  {
    name: 'list_diary',
    description: 'Diary entries (surveys, installs, visits, leave) between two dates inclusive.',
    input_schema: obj({ from: { ...str, description: 'YYYY-MM-DD' }, to: { ...str, description: 'YYYY-MM-DD' } }),
  },
  {
    name: 'list_subcontractors',
    description: 'Subcontractors: company, contact, trade and status. Optional search text.',
    input_schema: obj({ query: nullable('Part of a company name, contact or trade, or null for all.') }),
  },
  {
    name: 'list_my_mail',
    description: "The user's own email conversations that need a reply or action (Metis only ever sees the user's own mailbox).",
    input_schema: obj({ needs_reply_only: { type: 'boolean' } }),
  },
  {
    name: 'whats_overdue',
    description: 'Overdue tasks, overdue follow-ups (next steps past due) and installs/surveys that were due but not finished, across the team.',
    input_schema: obj({}),
  },
  {
    name: 'whats_new',
    description: 'What came in recently: new enquiries, quotes sent or accepted, and customer messages, over the last N days (1 = today).',
    input_schema: obj({ days: { type: 'integer', description: '1 to 14' } }),
  },
];

export const LOOKUP_NAMES = new Set(LOOKUP_TOOLS.map((t) => t.name));

async function profileOf(id: string) {
  const { data } = await createAdminClient().from('profiles').select('role, status, portals, full_name, email').eq('id', id).maybeSingle();
  return data as Profile | null;
}

export async function runLookup(name: string, input: Record<string, unknown>, me: Actor): Promise<string> {
  const db = createAdminClient();
  switch (name) {
    case 'list_quotes': {
      let q = db.from('crm_quotes').select('id, number, title, status, content, valid_until, sent_at, project_id, enquiry_id, updated_at').order('updated_at', { ascending: false }).limit(15);
      const pid = s(input.project_id);
      if (pid) {
        if (!isUuid(pid)) return 'Unknown project_id.';
        q = q.eq('project_id', pid);
      }
      if (['draft', 'sent', 'accepted', 'declined', 'expired'].includes(s(input.status))) q = q.eq('status', s(input.status));
      const { data, error } = await q;
      if (error) return `Couldn't read quotes: ${error.message}`;
      if (!data?.length) return 'No quotes found.';
      const ids = [...new Set(data.map((r) => r.enquiry_id as string))];
      const { data: people } = await db.from('enquiries').select('id, name').in('id', ids);
      const who = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
      return JSON.stringify(
        data.map((r) => ({
          number: r.number,
          title: r.title,
          status: r.status,
          customer: who.get(r.enquiry_id as string) ?? null,
          total_inc_vat: gbp(totalsOf(cleanContent(r.content)).gross),
          valid_until: r.valid_until,
          sent_at: r.sent_at,
          project_id: r.project_id,
          href: `/admin/sales/quotes/${r.id}`,
        }))
      );
    }

    case 'list_surveys': {
      let q = db.from('crm_surveys').select('id, project_id, type, status, completed_at, started_at, summary, flags, created_at').order('created_at', { ascending: false }).limit(15);
      const pid = s(input.project_id);
      if (pid) {
        if (!isUuid(pid)) return 'Unknown project_id.';
        q = q.eq('project_id', pid);
      }
      const { data, error } = await q;
      if (error) return `Couldn't read surveys: ${error.message}`;
      return data?.length ? JSON.stringify(data) : 'No surveys found.';
    }

    case 'list_diary': {
      const from = s(input.from);
      const to = s(input.to);
      if (!ymd(from) || !ymd(to)) return 'from and to must be YYYY-MM-DD.';
      const { data, error } = await db
        .from('diary_entries')
        .select('kind, title, all_day, starts_at, ends_at, day_from, day_to, address, postcode, project_id, surveyor_key')
        .is('deleted_at', null)
        .or(`and(starts_at.gte.${from}T00:00:00,starts_at.lte.${to}T23:59:59),and(day_from.lte.${to},day_to.gte.${from})`)
        .order('starts_at', { ascending: true, nullsFirst: false })
        .limit(60);
      if (error) return `Couldn't read the diary: ${error.message}`;
      return data?.length ? JSON.stringify(data) : 'Nothing in the diary for those dates.';
    }

    case 'list_subcontractors': {
      const p = await profileOf(me.id);
      if (!canAccess(p, 'subcontractors')) return 'You don’t have access to the Subcontractors portal in HAP, so I can’t look these up.';
      const term = s(input.query).replace(/[,()%*]/g, ' ').trim();
      let q = db.from('subcontractors').select('id, ref, company_name, contact_name, email, phone, trade, status').order('company_name').limit(30);
      if (term) q = q.or(`company_name.ilike.%${term}%,contact_name.ilike.%${term}%,trade.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) return `Couldn't read subcontractors: ${error.message}`;
      return data?.length ? JSON.stringify(data) : 'No subcontractors found.';
    }

    case 'list_my_mail': {
      const { data: box } = await db.from('mail_boxes').select('id').eq('user_id', me.id).maybeSingle();
      if (!box) return 'You don’t have a mailbox connected in HAP.';
      let q = db.from('mail_threads').select('id, subject, who_name, who_address, summary, needs_reply, priority, last_in_at, last_out_at, state, enquiry_id').eq('box_id', box.id).is('done_at', null).order('last_in_at', { ascending: false, nullsFirst: false }).limit(20);
      if (input.needs_reply_only === true) q = q.eq('needs_reply', true);
      const { data, error } = await q;
      if (error) return `Couldn't read mail: ${error.message}`;
      return data?.length ? JSON.stringify(data) : 'No open conversations.';
    }

    case 'whats_overdue': {
      const today = todayISO();
      const nowIso = new Date().toISOString();
      const [tasks, follow] = await Promise.all([
        db.from('tasks').select('title, assignee_name, due_date, priority, crm_project_id').neq('status', 'done').lt('due_date', today).order('due_date').limit(30),
        db.from('crm_projects').select('id, title, stage, next_step, next_step_at').lt('next_step_at', nowIso).not('next_step', 'is', null).not('stage', 'in', '(complete,lost)').order('next_step_at').limit(30),
      ]);
      return JSON.stringify({
        today,
        overdue_tasks: tasks.data ?? [],
        overdue_follow_ups: (follow.data ?? []).map((f) => ({ project_id: f.id, title: f.title, stage: stageLabel(f.stage), next_step: f.next_step, was_due: f.next_step_at })),
      });
    }

    case 'whats_new': {
      const days = Math.min(14, Math.max(1, Math.round(Number(input.days) || 1)));
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      since.setDate(since.getDate() - (days - 1));
      const iso = since.toISOString();
      const [enq, sent, accepted] = await Promise.all([
        db.from('enquiries').select('name, postcode, interest, source, created_at').gte('created_at', iso).order('created_at', { ascending: false }).limit(30),
        db.from('crm_quotes').select('number, title, sent_at').gte('sent_at', iso).order('sent_at', { ascending: false }).limit(20),
        db.from('crm_projects').select('id, title, accepted_at').gte('accepted_at', iso).order('accepted_at', { ascending: false }).limit(20),
      ]);
      return JSON.stringify({ since: iso, new_enquiries: enq.data ?? [], quotes_sent: sent.data ?? [], quotes_accepted: (accepted.data ?? []).map((a) => ({ project_id: a.id, title: a.title, accepted_at: a.accepted_at })) });
    }
  }
  return `Unknown tool ${name}`;
}

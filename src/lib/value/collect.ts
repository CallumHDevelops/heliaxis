import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseKv, toKv } from '@/lib/kv-json';
import { DEFAULTS, type Assumptions, type Counts, type MeasuredCosts } from './model';

const KEY = 'hap-value';

/** Defaults with whatever an admin has saved on top. */
export async function loadValueAssumptions(): Promise<Assumptions> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', KEY).maybeSingle();
    const s = parseKv<Assumptions>(data?.value);
    return {
      ...DEFAULTS,
      ...s,
      minutes: { ...DEFAULTS.minutes, ...(s.minutes ?? {}) },
      costs_gbp: { ...DEFAULTS.costs_gbp, ...(s.costs_gbp ?? {}) },
      replaced_tools_monthly_gbp: { ...DEFAULTS.replaced_tools_monthly_gbp, ...(s.replaced_tools_monthly_gbp ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export async function saveValueAssumptions(a: Assumptions) {
  const { error } = await createAdminClient().from('cms_kv').upsert({ key: KEY, value: toKv(a), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save: ${error.message}`);
}

type Count = number | null;

/** What happened in one month, counted from the live tables. A table that is not set up counts as null ("not measured"), never zero. */
export async function collectMonth(from: string, to: string): Promise<{ counts: Counts; measured: MeasuredCosts }> {
  const db = createAdminClient();
  const n = async (q: PromiseLike<{ count: number | null; error: unknown }>): Promise<Count> => {
    try {
      const r = await q;
      return r.error ? null : (r.count ?? 0);
    } catch {
      return null;
    }
  };
  const head = (table: string) => db.from(table).select('id', { count: 'exact', head: true });
  const sum = (...xs: Count[]): Count => (xs.every((x) => x == null) ? null : xs.reduce<number>((s, x) => s + (x ?? 0), 0));

  const [smart, auto, leads, bookings, reminders, emails, drafts, subA, subB, subC, packs, pos, returns, mentions, replies, templates] = await Promise.all([
    n(head('whatsapp_messages').eq('direction', 'out').is('sent_by', null).not('rule_id', 'is', null).neq('status', 'failed').gte('created_at', from).lt('created_at', to)),
    n(head('whatsapp_messages').eq('direction', 'out').is('sent_by', null).is('rule_id', null).neq('status', 'failed').gte('created_at', from).lt('created_at', to)),
    n(head('enquiries').gte('created_at', from).lt('created_at', to)),
    n(head('survey_bookings').eq('status', 'confirmed').in('source', ['link', 'website']).gte('confirmed_at', from).lt('confirmed_at', to)),
    n(head('survey_bookings').gte('reminded_at', from).lt('reminded_at', to)),
    n(head('crm_emails').gte('at', from).lt('at', to)),
    n(head('assistant_drafts').gte('created_at', from).lt('created_at', to)),
    n(head('subcontractor_nudges').gte('sent_at', from).lt('sent_at', to)),
    n(head('subcontractor_ntp_reminders').gte('sent_at', from).lt('sent_at', to)),
    n(head('subcontractor_reminders').gte('sent_at', from).lt('sent_at', to)),
    n(head('handover_packs').gte('built_at', from).lt('built_at', to)),
    n(head('purchase_orders').gte('created_at', from).lt('created_at', to)),
    n(head('site_returns').gte('created_at', from).lt('created_at', to)),
    n(head('social_mention').eq('is_synthetic', false).eq('author_is_own', false).gte('received_at', from).lt('received_at', to)),
    n(head('social_draft').in('status', ['copied', 'posted']).gte('copied_at', from).lt('copied_at', to)),
    n(head('whatsapp_messages').eq('direction', 'out').eq('kind', 'template').neq('status', 'failed').gte('created_at', from).lt('created_at', to)),
  ]);

  let socialAiUsd: number | null = null;
  try {
    const { data, error } = await db.from('social_usage').select('cost_usd').gte('at', from).lt('at', to);
    if (!error) socialAiUsd = (data ?? []).reduce((s, r) => s + Number(r.cost_usd), 0);
  } catch {
    // not set up
  }

  return {
    counts: {
      smart_replies: smart,
      auto_messages: auto,
      leads_captured: leads,
      online_bookings: bookings,
      booking_reminders: reminders,
      emails_logged: emails,
      metis_drafts: drafts,
      sub_chasers: sum(subA, subB, subC),
      handover_packs: packs,
      purchase_orders: pos,
      site_returns: returns,
      social_triage: mentions,
      social_replies: replies,
    },
    measured: { socialAiUsd, templateMessages: templates },
  };
}

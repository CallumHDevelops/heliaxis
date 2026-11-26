import 'server-only';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { PROJECT_STAGES } from '@/lib/crm/stages';

/**
 * Meta Conversions API: tell Meta when a lead becomes a booked survey or a sale, so the ads optimise
 * for real customers instead of form-fillers. Off until META_PIXEL_ID + META_CAPI_TOKEN are set.
 */

export const capiConfigured = () => !!(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);

export const sha = (v: string) => crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

/**
 * CRM stage → Meta event. Every stage from Won onwards is the sale, so a job loaded straight in at
 * Design or Install booked still reports it. Each event goes once per job (capi_sent).
 */
const EVENTS: Record<string, string> = {
  survey_booked: 'Schedule',
  quote_sent: 'SubmitApplication',
  ...Object.fromEntries(PROJECT_STAGES.map((s) => [s, 'Purchase'])),
};

export async function sendStageToMeta(projectId: string, stage: string) {
  const eventName = EVENTS[stage];
  if (!capiConfigured() || !eventName) return;
  const db = createAdminClient();
  const { data: p } = await db.from('crm_projects').select('id, enquiry_id, value, capi_sent').eq('id', projectId).maybeSingle();
  if (!p || (p.capi_sent as string[] | null)?.includes(eventName)) return;
  const { data: e } = await db.from('enquiries').select('*').eq('id', p.enquiry_id).maybeSingle();
  if (!e) return;
  const user: Record<string, unknown> = {};
  if (e.email) user.em = [sha(e.email)];
  if (e.wa_id) user.ph = [sha(String(e.wa_id))];
  if (e.meta_fbc) user.fbc = e.meta_fbc;
  if (e.meta_lead_id) user.lead_id = Number(e.meta_lead_id) || e.meta_lead_id;
  if (!Object.keys(user).length) return;
  const r = await fetch(
    `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/${process.env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN!)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [
          {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: `${projectId}-${eventName}`,
            action_source: 'system_generated',
            user_data: user,
            custom_data: {
              lead_event_source: 'Heliaxis CRM',
              event_source: 'crm',
              ...(eventName === 'Purchase' && p.value ? { currency: 'GBP', value: Number(p.value) } : {}),
            },
          },
        ],
      }),
      cache: 'no-store',
    }
  ).catch(() => null);
  if (r?.ok) await db.from('crm_projects').update({ capi_sent: [...((p.capi_sent as string[]) ?? []), eventName] }).eq('id', projectId);
}

/* ── Lead: a solar estimator quote request ───────────────────────────────────────── */

export type LeadEventInput = {
  /** The enquiry's id: the same string the browser Pixel sends as its eventID, so Meta counts one Lead, not two. */
  enquiryId: string;
  email: string;
  /** 447… (digits only). */
  phone?: string | null;
  postcode?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** The Pixel's _fbp cookie and the click id (fbc). */
  fbp?: string | null;
  fbc?: string | null;
  sourceUrl: string;
  /** Mid price (pounds) and the system, for Meta's reporting. */
  value?: number;
  kwp?: number;
  battery?: boolean;
  now?: number;
};

const digits = (v: string) => v.replace(/\D/g, '');

/** The Lead event in Meta's Conversions API shape: hashed email, phone and postcode; the rest as the browser sent it. Pure. */
export function buildLeadEvent(i: LeadEventInput) {
  const user: Record<string, unknown> = { em: [sha(i.email)], country: [sha('gb')], external_id: [sha(i.enquiryId)] };
  if (i.phone && digits(i.phone)) user.ph = [sha(digits(i.phone))];
  if (i.postcode) user.zp = [sha(i.postcode.replace(/\s+/g, ''))];
  if (i.ip) user.client_ip_address = i.ip;
  if (i.userAgent) user.client_user_agent = i.userAgent;
  if (i.fbp) user.fbp = i.fbp;
  if (i.fbc) user.fbc = i.fbc;
  return {
    event_name: 'Lead',
    event_time: Math.floor((i.now ?? Date.now()) / 1000),
    event_id: i.enquiryId,
    action_source: 'website',
    event_source_url: i.sourceUrl,
    user_data: user,
    custom_data: { content_name: 'solar-estimate', ...(i.value ? { currency: 'GBP', value: Math.round(i.value) } : {}), ...(i.kwp ? { kwp: Number(i.kwp.toFixed(2)) } : {}), battery: !!i.battery },
  };
}

/**
 * Tells Meta a visitor asked for their quote (a Lead), de-duplicated against the browser Pixel by event_id. The caller only calls it for a
 * visitor who accepted cookies. With META_TEST_EVENT_CODE set the event shows in Events Manager › Test events. Never throws; returns whether Meta accepted it.
 */
export async function sendLead(i: LeadEventInput): Promise<boolean> {
  if (!capiConfigured()) return false;
  try {
    const r = await fetch(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION || 'v23.0'}/${process.env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN!)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [buildLeadEvent(i)], ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {}) }),
      cache: 'no-store',
    });
    if (!r.ok) console.error('Meta CAPI Lead rejected:', r.status, await r.text().catch(() => ''));
    return r.ok;
  } catch (e) {
    console.error('Meta CAPI Lead failed', e);
    return false;
  }
}

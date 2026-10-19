import 'server-only';
import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { PROJECT_STAGES } from '@/lib/crm/stages';

/**
 * Meta Conversions API: tell Meta when a lead becomes a booked survey or a sale, so the ads optimise
 * for real customers instead of form-fillers. Off until META_PIXEL_ID + META_CAPI_TOKEN are set.
 */

export const capiConfigured = () => !!(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);

const sha = (v: string) => crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

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

import { after, NextResponse } from 'next/server';
import { validSignature } from '@/lib/whatsapp/api';
import { handleEcho, handleInboundMessage, handleStatus, processOutbox, type InboundMessage, type MessageEcho } from '@/lib/whatsapp/inbox';
import { ingestLead } from '@/lib/whatsapp/lead-ads';
import crypto from 'node:crypto';
import { normaliseMetaWebhook } from '@/lib/social/connectors/meta';
import { ingestMention, markProcessed, storeRaw } from '@/lib/social/ingest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One webhook for the Meta app (see WHATSAPP_SETUP.md):
 *  - object "page", field "leadgen": a Lead Ads form was submitted.
 *  - object "whatsapp_business_account", field "messages": WhatsApp messages and delivery statuses.
 *  - object "whatsapp_business_account", field "smb_message_echoes": messages you typed in the
 *    WhatsApp Business app on the same number (coexistence), so the Heliaxis chat stays complete.
 *  - object "page" field "feed" / object "instagram" field "comments": public comments, saved and scored
 *    by Social monitoring (src/lib/social). Read only: nothing is ever posted, hidden or deleted.
 */

// Meta's one-off check when you save the callback URL.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (token && u.searchParams.get('hub.mode') === 'subscribe' && u.searchParams.get('hub.verify_token') === token) {
    return new Response(u.searchParams.get('hub.challenge') || '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

type Change = { field: string; value: Record<string, unknown> };
type Payload = { object?: string; entry?: { changes?: Change[] }[] };

/** Instagram-login webhooks can be signed with the Instagram app secret instead of the Meta app secret. */
function validInstagramSignature(raw: string, header: string | null): boolean {
  const secret = process.env.META_IG_APP_SECRET;
  if (!secret || !header?.startsWith('sha256=')) return false;
  const want = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const got = header.slice(7);
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature-256');
  if (!validSignature(raw, sig) && !validInstagramSignature(raw, sig)) {
    return NextResponse.json({ error: 'Bad signature' }, { status: 401 });
  }
  let payload: Payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 });
  }

  // Thunks, run one at a time: two messages from a new number mustn't both create a lead.
  const jobs: (() => Promise<unknown>)[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value || {};
      if (payload.object === 'page' && change.field === 'leadgen' && v.leadgen_id) {
        jobs.push(() => ingestLead(String(v.leadgen_id)));
      }
      if (payload.object === 'whatsapp_business_account' && change.field === 'messages') {
        const contacts = (v.contacts as { wa_id?: string; profile?: { name?: string } }[]) ?? [];
        for (const m of (v.messages as InboundMessage[]) ?? []) {
          const name = contacts.find((c) => c.wa_id === m.from)?.profile?.name || '';
          jobs.push(() => handleInboundMessage(m, name));
        }
        for (const s of (v.statuses as Parameters<typeof handleStatus>[0][]) ?? []) jobs.push(() => handleStatus(s));
      }
      if (payload.object === 'whatsapp_business_account' && change.field === 'smb_message_echoes') {
        for (const m of (v.message_echoes as MessageEcho[]) ?? []) jobs.push(() => handleEcho(m));
      }
    }
  }

  // Public comments (Facebook Page feed, Instagram). Saved raw first, so nothing is lost if a step fails.
  const comments = payload.object === 'page' || payload.object === 'instagram' ? normaliseMetaWebhook(payload) : [];
  if (comments.length) {
    jobs.push(async () => {
      const eventId = await storeRaw('meta-webhook', payload);
      let failed = 0;
      for (const c of comments) {
        const r = await ingestMention(c).catch((e) => {
          console.error('Social ingest failed', e);
          return { action: 'error' as const };
        });
        if (r.action === 'error') failed++;
      }
      await markProcessed(eventId, failed ? `${failed} of ${comments.length} failed` : undefined);
    });
  }

  // Answer Meta fast (it retries slow webhooks); do the work straight after.
  after(async () => {
    for (const job of jobs) {
      try {
        await job();
      } catch (e) {
        console.error('Meta webhook job failed', e);
      }
    }
    await processOutbox().catch(() => {});
  });
  return NextResponse.json({ ok: true });
}

import { createHash } from 'node:crypto';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createImportedEnquiry, findExistingEnquiry, opportunityFor } from '@/lib/crm/import';
import { deletedBefore } from '@/lib/crm/delete-customer';
import { chatSides, dateRange, MAX_CHAT_CHARS, nameFromFileName, parseChatExport, type MediaType } from '@/lib/whatsapp/chat-export';
import { isUuid, json } from '@/lib/whatsapp/routes';
import { toWaId } from '@/lib/whatsapp/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Chats exported from the WhatsApp Business app (01633 965205) into a customer's WhatsApp thread,
 * with their original dates. Admins only. Nothing here messages the customer, notifies the team,
 * opens the 24-hour reply window (wa_last_inbound_at), marks the chat unread or queues a smart
 * reply or chaser: the messages are history, not new arrivals.
 */

const BATCH = 500;
const MAX_MESSAGES = 20_000;
const MAX_BODY = 10_000;
/** JSON escaping can grow the text a little; Vercel stops bodies over 4.5 MB before this anyway. */
const MAX_REQUEST = MAX_CHAT_CHARS + 512 * 1024;

/** Closest whatsapp_messages kind to a live message of the same sort (see describe() in inbox.ts). */
const MEDIA_KIND: Record<MediaType, string> = {
  photo: 'image',
  video: 'video',
  gif: 'video',
  audio: 'audio',
  voice: 'audio',
  document: 'document',
  sticker: 'other',
  contact: 'other',
  other: 'other',
};

async function admin() {
  const s = await requireApproved();
  return s?.profile.role === 'admin' ? s : null;
}

const COLS = 'id, name, phone, email, wa_id, whatsapp_opt_in, wa_last_message_at';
type Enquiry = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  wa_id: string | null;
  whatsapp_opt_in: boolean;
  wa_last_message_at: string | null;
};

/** The enquiry live WhatsApp from this number goes to: the latest chat, as enquiryForNumber in inbox.ts picks it. */
async function chatOn(wa: string): Promise<Enquiry | null> {
  const { data } = await createAdminClient()
    .from('enquiries')
    .select(COLS)
    .eq('wa_id', wa)
    .order('wa_last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as Enquiry | undefined) ?? null;
}

/** Whoever has this number: the enquiry its chat is on (so a chat always lands in the same place), else anyone with it as their phone. */
async function byNumber(wa: string): Promise<Enquiry | null> {
  const live = await chatOn(wa);
  if (live) return live;
  const hit = await findExistingEnquiry({ phone: wa });
  if (!hit) return null;
  const { data } = await createAdminClient().from('enquiries').select(COLS).eq('id', hit.id).maybeSingle();
  return (data as Enquiry | null) ?? null;
}

/**
 * ?q= → up to 10 customers by name, phone or email (the "which customer is this?" picker).
 * ?phone= → the customer already on that number, if any.
 */
export async function GET(req: Request) {
  if (!(await admin())) return json({ error: 'unauthorized' }, 401);
  const url = new URL(req.url);
  const db = createAdminClient();

  const phone = url.searchParams.get('phone');
  if (phone !== null) {
    const wa = phone.length <= 40 ? toWaId(phone) : null;
    return json({ match: wa ? await byNumber(wa) : null });
  }

  // Commas, brackets, quotes and colons would break the PostgREST filter; % and * are wildcards.
  const q = (url.searchParams.get('q') || '').slice(0, 80).replace(/[,()"'\\%*:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (q.length < 2) return json({ items: [] });
  const ors = [`name.ilike.%${q}%`, `email.ilike.%${q}%`];
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 6) {
    // Phones are stored as typed (07…, +44 …), so allow anything between the digits.
    const local = (toWaId(q) ?? digits).replace(/^44/, '');
    ors.push(`phone.ilike.%${local.split('').join('%')}%`, `wa_id.like.%${local}%`);
  }
  const { data, error } = await db
    .from('enquiries')
    .select(`${COLS}, postcode, created_at`)
    .or(ors.join(','))
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return json({ error: error.message, items: [] }, 500);
  return json({ items: data ?? [] });
}

/**
 * { fileName, text, us, customer, anyway? } → the chat saved to that customer.
 *   us: the author name that is Heliaxis, or null when only the customer wrote.
 *   customer: { enquiryId, phone? } for someone in the CRM, or { phone, name } to match by phone or add them.
 *   anyway: add them even though they were deleted from the CRM before (else { deletedBefore: true }).
 * Importing the same file again adds nothing, even onto another of their enquiries: each message
 * gets a fixed id from the customer's number, time, direction and text.
 */
export async function POST(req: Request) {
  const s = await admin();
  if (!s) return json({ error: 'unauthorized' }, 401);

  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_REQUEST) return json({ error: 'That chat is too big to import in one go.' }, 413);
  let b: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    b = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'bad request' }, 400);
  }

  const fileName = typeof b.fileName === 'string' ? b.fileName.slice(0, 255) : '';
  const text = b.text;
  if (typeof text !== 'string' || !text.trim()) return json({ error: 'The file is empty.' }, 400);
  if (text.length > MAX_CHAT_CHARS) return json({ error: 'That chat is too big to import in one go.' }, 413);
  if (b.us !== null && (typeof b.us !== 'string' || !b.us || b.us.length > 200)) {
    return json({ error: 'Choose which name in the chat is Heliaxis.' }, 400);
  }
  const us = b.us as string | null;

  const c = (b.customer && typeof b.customer === 'object' && !Array.isArray(b.customer) ? b.customer : {}) as Record<string, unknown>;
  if (c.enquiryId != null && (typeof c.enquiryId !== 'string' || !isUuid(c.enquiryId))) return json({ error: 'bad request' }, 400);
  if (c.phone != null && (typeof c.phone !== 'string' || c.phone.length > 40)) return json({ error: 'bad request' }, 400);
  if (c.name != null && (typeof c.name !== 'string' || c.name.length > 200)) return json({ error: 'bad request' }, 400);
  const enquiryId = (c.enquiryId as string | undefined) || null;
  const phone = ((c.phone as string | undefined) || '').trim() || null;
  const wa = toWaId(phone);
  if (phone && !wa) return json({ error: 'That mobile number doesn’t look right.' }, 400);
  if (!enquiryId && !wa) return json({ error: 'Choose the customer, or give their mobile number to add them.' }, 400);

  const chat = parseChatExport(text);
  if (!chat.messages.length) return json({ error: 'No messages found. Is this a chat exported from WhatsApp?' }, 400);
  if (us !== null && !chat.authors.some((a) => a.name === us)) return json({ error: `“${us}” isn’t in this chat.` }, 400);

  // One-to-one chats only (a stray name with a line or two is left out; see chatSides).
  const sides = chatSides(chat, us);
  const customerAuthor = sides.customer;
  if (sides.group) {
    if (us === null && sides.ignored.length === 1) {
      return json({ error: `This chat has messages from ${customerAuthor} and ${sides.ignored[0]}. Choose which one is Heliaxis.` }, 400);
    }
    const names = chat.authors.map((a) => a.name);
    return json(
      {
        error: `This looks like a group chat (${names.slice(0, -1).join(', ')} and ${names.at(-1)}). Only one-to-one chats can be imported.`,
      },
      400
    );
  }

  const soon = Date.now() + 86_400_000; // a phone with its clock wrong
  const keep = chat.messages.filter(
    (m) => (m.author === us || m.author === customerAuthor) && m.kind !== 'deleted' && m.body.trim() && new Date(m.at).getTime() < soon
  );
  const skipped = chat.messages.length - keep.length;
  if (!keep.length) return json({ error: 'There’s nothing in this chat to import.' }, 400);
  if (keep.length > MAX_MESSAGES) {
    return json({ error: `This chat has ${keep.length.toLocaleString('en-GB')} messages; the most in one go is ${MAX_MESSAGES.toLocaleString('en-GB')}.` }, 400);
  }
  const ours = keep.filter((m) => m.author === us);
  const theyWrote = ours.length < keep.length;

  const db = createAdminClient();
  // Imported messages are told apart from live ones by via (whatsapp-chasers.sql). Saved without
  // it they'd look live for good, as importing again skips messages that are already there.
  const { error: noVia } = await db.from('whatsapp_messages').select('via').limit(1);
  if (noVia) {
    return json({ error: /\bvia\b/.test(noVia.message) ? 'Run supabase/whatsapp-chasers.sql in Supabase first.' : noVia.message }, 500);
  }

  // Who it is: the customer picked, else whoever has this number, else a new lead dated to the chat.
  let enquiry: Enquiry | null = null;
  let created = false;
  let projectId: string | null | undefined;
  if (enquiryId) {
    const { data } = await db.from('enquiries').select(COLS).eq('id', enquiryId).maybeSingle();
    if (!data) return json({ error: 'That customer isn’t in the CRM any more.' }, 404);
    enquiry = data as Enquiry;
  } else {
    enquiry = wa ? await byNumber(wa) : null;
    if (!enquiry) {
      // Deleted from the CRM on purpose: an old chat doesn't bring them back unless asked to. (A new
      // WhatsApp from them still does; the live inbox doesn't look at the deleted list.)
      if (b.anyway !== true && (await deletedBefore({ phone }))) return json({ deletedBefore: true });
      const name = ((c.name as string | undefined) || '').trim() || customerAuthor || nameFromFileName(fileName) || `+${wa}`;
      try {
        const r = await createImportedEnquiry({
          name,
          phone,
          source: 'whatsapp-import',
          createdAt: keep[0].at,
          whatsappOptIn: theyWrote,
          status: ours.length ? 'contacted' : 'new',
          firstContactAt: ours[0]?.at ?? null,
          activity: 'Imported WhatsApp chat from the WhatsApp Business app (01633 965205)',
          byId: s.user.id,
        });
        enquiry = { id: r.id, name, phone, email: null, wa_id: wa, whatsapp_opt_in: theyWrote, wa_last_message_at: null };
        created = true;
        projectId = r.projectId;
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'Could not add the customer' }, 500);
      }
    }
  }
  const id = enquiry.id;

  // Same message (customer's number, time, direction, text) → same id, so a second import is a
  // no-op, whichever of their enquiries it goes to. Two identical messages in the same minute are
  // told apart by which one they are.
  const customerKey = wa ?? enquiry.wa_id ?? toWaId(enquiry.phone) ?? id;
  const seen = new Map<string, number>();
  const rows = keep.map((m) => {
    const direction = m.author === us ? 'out' : 'in';
    const body = m.body.slice(0, MAX_BODY);
    const key = JSON.stringify([customerKey, m.at, direction, body]);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    return {
      enquiry_id: id,
      wa_message_id: `import:${createHash('sha256').update(JSON.stringify([customerKey, m.at, direction, body, n])).digest('hex').slice(0, 32)}`,
      direction,
      kind: m.kind === 'media' ? MEDIA_KIND[m.media ?? 'other'] : 'text',
      body,
      // 'read' so opening the chat never tries to send Meta a read receipt for these.
      status: direction === 'in' ? 'read' : 'delivered',
      sent_by: null,
      via: 'import',
      created_at: m.at,
    };
  });

  let saved = 0;
  let imported = 0;
  let first = Infinity;
  let last = -Infinity;
  let failed: string | null = null;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { data, error } = await db
      .from('whatsapp_messages')
      .upsert(batch, { onConflict: 'wa_message_id', ignoreDuplicates: true })
      .select('created_at');
    if (error) {
      failed = error.message;
      break;
    }
    saved += batch.length;
    for (const r of data ?? []) {
      const t = new Date(r.created_at as string).getTime();
      first = Math.min(first, t);
      last = Math.max(last, t);
      imported++;
    }
  }

  // WhatsApp from the CRM goes to wa_id first, so the chat's number only goes on this customer when
  // it's theirs: the number they already have, or they have none and nobody else in the CRM has it.
  let number = enquiry.wa_id ?? toWaId(enquiry.phone);
  let note: string | null = null;
  if (!created && wa && !number) {
    const other = await byNumber(wa);
    if (other && other.id !== id) note = `The chat’s number wasn’t added to ${enquiry.name}, as ${other.name} already has it in the CRM.`;
    else number = wa;
  } else if (!created && wa && number !== wa) {
    note = `The chat’s number wasn’t added to ${enquiry.name}, as they have a different number in the CRM.`;
  }
  // If their live chat is on another of their enquiries it stays there: replies, chasers and smart
  // replies follow the latest wa_last_message_at, so moving this one forward would move the chat.
  const live = !created && number ? await chatOn(number) : null;
  const chatHere = !live || live.id === id || !live.wa_last_message_at;

  // Inbox order: the chat moves up only if these are newer than what's there. wa_last_inbound_at
  // stays as it is; it opens the free 24-hour reply window, and these are old.
  const newest = rows.slice(0, saved).reduce((max, r) => (r.created_at > max ? r.created_at : max), '');
  if (newest && chatHere) {
    await db
      .from('enquiries')
      .update({ wa_last_message_at: newest })
      .eq('id', id)
      .or(`wa_last_message_at.is.null,wa_last_message_at.lt."${newest}"`);
  }
  if (!created) {
    const patch: Record<string, unknown> = {};
    if (wa && wa === number) {
      if (chatHere && !enquiry.wa_id) patch.wa_id = wa; // their WhatsApp from now on lands on this customer
      if (phone && !enquiry.phone) patch.phone = phone;
    }
    if (theyWrote && saved && !enquiry.whatsapp_opt_in) patch.whatsapp_opt_in = true; // they messaged us
    if (Object.keys(patch).length) await db.from('enquiries').update(patch).eq('id', id);

    // They've been talking to us since the opportunity opened, so stop its "just following up"
    // sequence, as a live reply does (handleInboundMessage).
    const lastIn = rows.slice(0, saved).reduce((max, r) => (r.direction === 'in' && r.created_at > max ? r.created_at : max), '');
    if (lastIn) {
      await db
        .from('crm_projects')
        .update({ sequence_stopped_at: lastIn })
        .eq('enquiry_id', id)
        .is('sequence_stopped_at', null)
        .lte('created_at', lastIn)
        .then(
          () => null,
          () => null
        );
    }
  }
  if (imported) {
    await db.from('crm_activities').insert({
      enquiry_id: id,
      project_id: projectId !== undefined ? projectId : await opportunityFor(id),
      kind: 'system',
      body: `Imported ${imported.toLocaleString('en-GB')} WhatsApp message${imported === 1 ? '' : 's'} (${dateRange(
        new Date(first).toISOString(),
        new Date(last).toISOString()
      )}) from the WhatsApp Business app`,
      by_id: s.user.id,
    });
  }

  const result = { enquiryId: id, name: enquiry.name, created, imported, duplicates: saved - imported, skipped, note };
  if (failed) {
    return json({ ...result, error: `Saved ${saved.toLocaleString('en-GB')} of ${rows.length.toLocaleString('en-GB')} messages, then: ${failed}. Import it again to add the rest.` }, 500);
  }
  return json(result);
}

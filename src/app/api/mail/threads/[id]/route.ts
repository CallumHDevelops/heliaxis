import { NextResponse } from 'next/server';
import { createReplyDraft, messageText, moveToInbox, sendDraft } from '@/lib/mail/graph';
import { contextFor, dropOutlookDraft, fileThreadNow, noteThreadOnCrm, putOutlookDraft, replyHtml, signatureImages, writeDraft } from '@/lib/mail/sync';
import { mailSession } from '@/lib/mail/server';
import { addressOf, customerFolder, folderFor, threadState } from '@/lib/mail/shared';
import { canAccess } from '@/lib/portals';
import { requireApproved } from '@/lib/auth';
import { toWaId } from '@/lib/whatsapp/shared';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { 'Cache-Control': 'no-store' } });
const UUID = /^[0-9a-f-]{36}$/i;

const COLS = 'id, box_id, conversation_id, subject, who_name, who_address, enquiry_id, rule_id, last_in_at, last_out_at, last_in_graph_id, done_at, marketing, needs_reply, triaged_for, draft, prospect, priority, tone, opportunity, summary';

async function load(id: string) {
  const s = await mailSession();
  if (!s.ok) return { err: json({ error: s.error }, s.status) } as const;
  if (!s.box || !UUID.test(id)) return { err: json({ error: 'Not found' }, 404) } as const;
  const { data: t } = await s.db.from('mail_threads').select(COLS).eq('id', id).eq('box_id', s.box.id).maybeSingle();
  if (!t) return { err: json({ error: 'Not found' }, 404) } as const;
  return { s, box: s.box, t } as const;
}

/** The conversation: its emails (previews), the latest one from them in full, and the link to open it in Outlook. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await load(id);
  if ('err' in l) return l.err;
  const { s, box, t } = l;
  const { data: msgs } = await s.db.from('mail_messages').select('id, graph_id, direction, from_name, from_address, to_addresses, subject, preview, at, place').eq('box_id', box.id).eq('conversation_id', t.conversation_id).order('at').limit(50);
  let latest: { text: string; webLink: string | null } | null = null;
  if (t.last_in_graph_id) latest = await messageText(box.address, t.last_in_graph_id as string).catch(() => null);
  return json({ messages: msgs ?? [], latest, signature: box.signature });
}

/**
 * What you do with a conversation:
 *  send {text, all}: replies from your mailbox (with your signature) · outlook {text, all}: puts it in Outlook's Drafts
 *  save {text}: keeps your edit of the draft · redraft {steer}: the writing assistant tries again
 *  done / undone: no reply needed (or it is after all) · crm {name, phone, postcode}: adds them as a customer
 *  notMarketing: back to the inbox, and never treated as marketing again
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await load(id);
  if ('err' in l) return l.err;
  const { s, box, t } = l;
  const b = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const action = String(b.action || '');

  if (action === 'send' || action === 'outlook') {
    const text = String(b.text || '').trim();
    if (!text) return json({ error: 'Write the reply first.' }, 400);
    if (/\[[^\]\n]{1,40}\]/.test(text) && action === 'send' && !b.force) return json({ error: 'There’s still a [gap] to fill in.', gaps: true }, 400);
    if (!t.last_in_graph_id) return json({ error: 'There’s no email from them to reply to.' }, 400);
    try {
      if (action === 'send') {
        // Built as Outlook's own reply (quoted history, your signature and logo), then sent.
        const d = await createReplyDraft(box.address, t.last_in_graph_id as string, replyHtml(box, text), { all: !!b.all, images: signatureImages(box) });
        await sendDraft(box.address, d.id);
        await s.db.from('mail_threads').update({ last_out_at: now, state: 'replied', draft: text, updated_at: now }).eq('id', t.id);
        // The same reply waiting in Outlook's Drafts would be a second copy: it goes (unless you've edited it there).
        await dropOutlookDraft(s.db, box.address, t.id as string).catch(() => null);
        // A customer's conversation goes into their folder now (Inbox › Customers › Name (HX-…)).
        const filed = await fileThreadNow(s.db, box, t.conversation_id as string).catch(() => 0);
        return json({ ok: true, filed });
      }
      // In place of the app's earlier Outlook draft for this conversation.
      await s.db.from('mail_threads').update({ draft: text }).eq('id', t.id);
      const put = await putOutlookDraft(s.db, box, t.id as string, text, !!b.all);
      if (put.kept) return json({ error: 'There’s already a draft for this in Outlook that you’ve changed there, so it’s been left as it is. Finish it in Outlook.' }, 409);
      return json({ ok: true, link: put.link });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Microsoft 365 didn’t take it.' }, 502);
    }
  }

  if (action === 'save') {
    await s.db.from('mail_threads').update({ draft: String(b.text || '').slice(0, 8000) }).eq('id', t.id);
    return json({ ok: true });
  }

  if (action === 'redraft') {
    const ctx = await contextFor(s.db, box.id);
    if (!ctx) return json({ error: 'Not found' }, 404);
    const draft = await writeDraft(ctx, t as never, typeof b.steer === 'string' ? b.steer : undefined);
    if (!draft) return json({ error: 'The writing assistant couldn’t write this one. Try again, or write it yourself.' }, 502);
    return json({ ok: true, draft });
  }

  if (action === 'done' || action === 'undone') {
    const doneAt = action === 'done' ? now : null;
    const state = threadState({
      marketing: !!t.marketing,
      lastInAt: t.last_in_at as string | null,
      lastOutAt: t.last_out_at as string | null,
      doneAt,
      triagedFor: (t.triaged_for as string | null) ?? null,
      needsReply: action === 'undone' ? true : ((t.needs_reply as boolean | null) ?? null),
    });
    await s.db.from('mail_threads').update({ done_at: doneAt, state, ...(action === 'undone' ? { needs_reply: true } : {}), updated_at: now }).eq('id', t.id);
    let filed = 0;
    if (action === 'done') {
      await dropOutlookDraft(s.db, box.address, t.id as string).catch(() => null);
      // No reply needed: a customer's conversation goes into their folder now.
      filed = await fileThreadNow(s.db, box, t.conversation_id as string).catch(() => 0);
    }
    return json({ ok: true, state, filed });
  }

  if (action === 'crm') {
    const session = await requireApproved();
    if (!session || !canAccess(session.profile, 'crm')) return json({ error: 'Adding customers needs CRM access.' }, 403);
    const email = addressOf(t.who_address as string | null);
    const name = String(b.name || t.who_name || email).trim().slice(0, 120);
    if (!email || !name) return json({ error: 'They need a name and an email address.' }, 400);
    const phone = String(b.phone || '').trim() || null;
    const postcode = String(b.postcode || '').trim().toUpperCase() || null;
    // Already a customer under this address? Use them.
    const { data: found } = await s.db.from('enquiries').select('id, name, customer_ref').ilike('email', email).order('created_at', { ascending: false }).limit(1);
    let enquiryId = (found?.[0]?.id as string | undefined) ?? null;
    let ref = (found?.[0]?.customer_ref as string | null | undefined) ?? null;
    if (!enquiryId) {
      const { data, error } = await s.db
        .from('enquiries')
        .insert({ name, email, phone, postcode, wa_id: toWaId(phone), source: 'email', status: 'contacted' })
        .select('id, customer_ref')
        .single();
      if (error || !data) return json({ error: error?.message || 'Couldn’t add them.' }, 500);
      enquiryId = data.id as string;
      ref = (data.customer_ref as string | null) ?? null;
    }
    // Their own folder from now on, and this conversation filed under them.
    const label = String(found?.[0]?.name || name);
    const { data: rule } = await s.db
      .from('mail_rules')
      .upsert({ box_id: box.id, kind: 'address', match: email, label, folder: customerFolder(label, ref), status: 'on', source: 'crm', named: true, enquiry_id: enquiryId, action: 'file' }, { onConflict: 'box_id,kind,match' })
      .select('id')
      .single();
    if (rule) {
      await s.db.from('mail_messages').update({ rule_id: rule.id }).eq('box_id', box.id).eq('from_address', email);
      await s.db.from('mail_messages').update({ rule_id: rule.id }).eq('box_id', box.id).eq('conversation_id', t.conversation_id as string);
    }
    await s.db.from('mail_threads').update({ enquiry_id: enquiryId, rule_id: rule?.id ?? t.rule_id, prospect: null, updated_at: now }).eq('box_id', box.id).eq('who_address', email);
    await s.db.from('mail_threads').update({ enquiry_id: enquiryId, rule_id: rule?.id ?? t.rule_id, prospect: null, updated_at: now }).eq('id', t.id);
    // Their emails so far go on their new record (each of their conversations).
    const { data: theirs } = await s.db.from('mail_threads').select('conversation_id').eq('box_id', box.id).eq('who_address', email);
    for (const c of new Set([t.conversation_id as string, ...(theirs ?? []).map((x) => x.conversation_id as string)])) {
      await noteThreadOnCrm(s.db, box, c, enquiryId).catch(() => null);
    }
    return json({ ok: true, enquiryId, ref });
  }

  if (action === 'notMarketing') {
    const email = addressOf(t.who_address as string | null);
    if (!email) return json({ error: 'No sender.' }, 400);
    // Their own rule (so it wins over the company's), never marketing; filed with the company if it has a folder.
    const { data: company } = t.rule_id ? await s.db.from('mail_rules').select('label, folder, status').eq('id', t.rule_id).maybeSingle() : { data: null };
    const folder = company && company.folder !== 'Marketing' ? (company.folder as string) : folderFor('Other', String(t.who_name || email));
    const { data: rule } = await s.db
      .from('mail_rules')
      .upsert({ box_id: box.id, kind: 'address', match: email, label: String(t.who_name || company?.label || email), folder, status: company?.status === 'on' ? 'on' : 'suggested', source: 'you', named: true, never_marketing: true, action: 'file' }, { onConflict: 'box_id,kind,match' })
      .select('id')
      .single();
    const { data: moved } = await s.db.from('mail_messages').select('id, graph_id').eq('box_id', box.id).eq('conversation_id', t.conversation_id).eq('place', 'marketing');
    for (const m of moved ?? []) {
      await moveToInbox(box.address, m.graph_id as string).catch(() => null);
      await s.db.from('mail_messages').update({ place: 'inbox', filed_at: null }).eq('id', m.id);
    }
    await s.db.from('mail_messages').update({ marketing: false, rule_id: rule?.id ?? null }).eq('box_id', box.id).eq('from_address', email);
    await s.db.from('mail_threads').update({ marketing: false, state: 'new', rule_id: rule?.id ?? t.rule_id, triaged_for: null, updated_at: now }).eq('id', t.id);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
}

import { NextResponse } from 'next/server';
import { createReplyDraft, MAX_ATTACH_TOTAL, messageText, moveToInbox, sendDraft, type FileToAttach } from '@/lib/mail/graph';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCS_BUCKET, safeName } from '@/lib/crm/server';
import { clearAway, contextFor, dropOutlookDraft, fileThreadNow, noteThreadOnCrm, putBack, putOutlookDraft, replyHtml, signatureImages, writeDraft } from '@/lib/mail/sync';
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

/** Files you add from your device go here first (straight from the browser), then onto the email. Private. */
const ATTACH_BUCKET = 'mail-attachments';
let bucketReady = false;
async function ensureAttachBucket(db: ReturnType<typeof createAdminClient>) {
  if (bucketReady) return;
  const { data } = await db.storage.getBucket(ATTACH_BUCKET);
  if (!data) await db.storage.createBucket(ATTACH_BUCKET, { public: false, fileSizeLimit: MAX_ATTACH_TOTAL });
  bucketReady = true;
}

type Attach = { uploads?: { path: string; name: string; type?: string }[]; documentIds?: string[]; libraryIds?: string[] };

/**
 * The files for a reply: your uploads (only under this conversation's own folder), the customer's job documents and
 * the library. At most 25 MB in all. Returns the files, or what's wrong.
 */
async function gather(db: ReturnType<typeof createAdminClient>, boxId: string, threadId: string, enquiryId: string | null, a: Attach): Promise<{ files: FileToAttach[]; uploads: string[] } | { error: string }> {
  const files: FileToAttach[] = [];
  const uploads: string[] = [];
  let total = 0;
  const add = (name: string, type: string | null | undefined, bytes: Uint8Array) => {
    total += bytes.length;
    files.push({ name, contentType: type || 'application/octet-stream', bytes });
  };
  const prefix = `${boxId}/${threadId}/`;
  for (const u of (a.uploads ?? []).slice(0, 10)) {
    if (typeof u?.path !== 'string' || !u.path.startsWith(prefix) || u.path.includes('..')) return { error: 'That file can’t be attached.' };
    const { data: blob } = await db.storage.from(ATTACH_BUCKET).download(u.path);
    if (!blob) return { error: `Couldn’t fetch ${u.name}. Add it again.` };
    add(String(u.name || 'file').slice(0, 150), u.type || blob.type, new Uint8Array(await blob.arrayBuffer()));
    uploads.push(u.path);
  }
  const docIds = (a.documentIds ?? []).filter((x) => UUID.test(String(x))).slice(0, 10);
  const libIds = (a.libraryIds ?? []).filter((x) => UUID.test(String(x))).slice(0, 10);
  if (docIds.length && enquiryId) {
    // Only this customer's own documents.
    const { data: jobs } = await db.from('crm_projects').select('id').eq('enquiry_id', enquiryId);
    const { data: docs } = await db.from('crm_documents').select('name, storage_path, mime').in('id', docIds).in('project_id', (jobs ?? []).map((j) => j.id as string));
    for (const d of docs ?? []) {
      const { data: blob } = await db.storage.from(DOCS_BUCKET).download(d.storage_path as string);
      if (blob) add(withExt(d.name as string, d.storage_path as string), d.mime as string | null, new Uint8Array(await blob.arrayBuffer()));
    }
  }
  if (libIds.length) {
    const { data: libs } = await db.from('crm_library').select('name, storage_path, mime').in('id', libIds);
    for (const d of libs ?? []) {
      const { data: blob } = await db.storage.from(DOCS_BUCKET).download(d.storage_path as string);
      if (blob) add(withExt(d.name as string, d.storage_path as string), d.mime as string | null, new Uint8Array(await blob.arrayBuffer()));
    }
  }
  if (total > MAX_ATTACH_TOTAL) return { error: 'Those attachments come to more than 25 MB, Outlook’s limit. Leave one out.' };
  return { files, uploads };
}

const withExt = (name: string, path: string) => (name.includes('.') ? name : `${name}.${path.split('.').pop() || 'pdf'}`);

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
  // What can be attached in one tap: the customer's job documents, and the company library.
  let documents: { id: string; name: string; size: number | null; job: string | null }[] = [];
  if (t.enquiry_id) {
    const { data: jobs } = await s.db.from('crm_projects').select('id, title').eq('enquiry_id', t.enquiry_id);
    if (jobs?.length) {
      const { data: docs } = await s.db.from('crm_documents').select('id, name, size, project_id').in('project_id', jobs.map((j) => j.id as string)).order('created_at', { ascending: false }).limit(40);
      documents = (docs ?? []).map((d) => ({ id: d.id as string, name: d.name as string, size: (d.size as number | null) ?? null, job: (jobs.find((j) => j.id === d.project_id)?.title as string | null) ?? null }));
    }
  }
  const { data: library } = await s.db.from('crm_library').select('id, name, size').order('name').limit(60);
  return json({ messages: msgs ?? [], latest, signature: box.signature, documents, library: library ?? [] });
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

  // A file from your device: a one-off upload address, straight from the browser to storage.
  if (action === 'attach') {
    const size = Number(b.size) || 0;
    if (size > MAX_ATTACH_TOTAL) return json({ error: 'That file is over 25 MB, Outlook’s limit.' }, 400);
    await ensureAttachBucket(s.db).catch(() => null);
    const path = `${box.id}/${t.id}/${Date.now()}-${safeName(String(b.name || 'file'))}`;
    const { data, error } = await s.db.storage.from(ATTACH_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return json({ error: 'Couldn’t start the upload. Try again.' }, 500);
    return json({ bucket: ATTACH_BUCKET, path, token: data.token });
  }

  if (action === 'send' || action === 'outlook') {
    const text = String(b.text || '').trim();
    if (!text) return json({ error: 'Write the reply first.' }, 400);
    if (/\[[^\]\n]{1,40}\]/.test(text) && action === 'send' && !b.force) return json({ error: 'There’s still a [gap] to fill in.', gaps: true }, 400);
    if (!t.last_in_graph_id) return json({ error: 'There’s no email from them to reply to.' }, 400);
    const got = await gather(s.db, box.id, t.id as string, (t.enquiry_id as string | null) ?? null, b as Attach);
    if ('error' in got) return json({ error: got.error }, 400);
    const cleanUp = () => (got.uploads.length ? s.db.storage.from(ATTACH_BUCKET).remove(got.uploads).then(() => null, () => null) : null);
    try {
      if (action === 'send') {
        // Built as Outlook's own reply (quoted history, your signature and logo, your attachments), then sent.
        const d = await createReplyDraft(box.address, t.last_in_graph_id as string, replyHtml(box, text), { all: !!b.all, images: signatureImages(box), files: got.files });
        await cleanUp();
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
      const put = await putOutlookDraft(s.db, box, t.id as string, text, !!b.all, got.files);
      if (!put.kept) await cleanUp();
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
    if (action === 'done') {
      await dropOutlookDraft(s.db, box.address, t.id as string).catch(() => null);
      // No reply needed: stored out of the Inbox now (its folder, Marketing, or Inbox › Filed). Never deleted.
      const away = await clearAway(s.db, box, t.conversation_id as string).catch(() => ({ filed: 0, deleted: 0, folder: null }));
      return json({ ok: true, state, ...away });
    }
    return json({ ok: true, state });
  }

  // Delete: only when you choose it. To Deleted Items (Outlook keeps it there), and off To reply.
  if (action === 'delete') {
    await dropOutlookDraft(s.db, box.address, t.id as string).catch(() => null);
    const state = threadState({ marketing: !!t.marketing, lastInAt: t.last_in_at as string | null, lastOutAt: t.last_out_at as string | null, doneAt: now, triagedFor: (t.triaged_for as string | null) ?? null, needsReply: (t.needs_reply as boolean | null) ?? null });
    await s.db.from('mail_threads').update({ done_at: now, state, updated_at: now }).eq('id', t.id);
    const away = await clearAway(s.db, box, t.conversation_id as string, { delete: true }).catch(() => ({ filed: 0, deleted: 0, folder: null }));
    return json({ ok: true, state, ...away });
  }

  // Undo "No reply needed": back in the Inbox, and back on To reply.
  if (action === 'restore') {
    const back = await putBack(s.db, box, t.conversation_id as string).catch(() => 0);
    const state = threadState({ marketing: !!t.marketing, lastInAt: t.last_in_at as string | null, lastOutAt: t.last_out_at as string | null, doneAt: null, triagedFor: (t.triaged_for as string | null) ?? null, needsReply: (t.needs_reply as boolean | null) ?? true });
    await s.db.from('mail_threads').update({ done_at: null, state, updated_at: now }).eq('id', t.id);
    return json({ ok: true, back, state });
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

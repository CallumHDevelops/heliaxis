import { createHash, randomUUID } from 'node:crypto';
import { after } from 'next/server';
import { requireApproved } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { MAX_CHAT_CHARS, parseChatExport } from '@/lib/whatsapp/chat-export';
import {
  cleanChoices,
  isPendingId,
  PENDING_PREFIX,
  pendingKey,
  readEntry,
  shownChat,
  type PendingEntry,
} from '@/lib/whatsapp/import-pending';
import { json, NO_STORE } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Chats added on the import page and not imported yet, so they stay there (on any computer) until
 * they're imported or removed, with the choices made for them. Admins only, as /api/whatsapp/import.
 *   GET → { items }, oldest first. GET ?id= → that chat's text.
 *   POST { fileName, title, text } → { item, existing }: kept, or the same chat already there.
 *   PATCH { id, choices } → { item }: who Heliaxis is and who the customer is, as chosen so far.
 *   DELETE ?id= → gone, text and all (imported, or removed with ×).
 * Each chat is its own cms_kv row (src/lib/whatsapp/import-pending.ts) and its text a file in a
 * private bucket of its own. Importing is unchanged: the page sends the text to the import route.
 */

/** Not CRM_BUCKET: that only takes photos (ensureCrmBucket), and its folders are opportunities'. */
const BUCKET = 'whatsapp-import';
const MAX_TEXT_BYTES = 10 * 1024 * 1024;
/** As the import route: the text plus a little for JSON escaping. */
const MAX_REQUEST = MAX_CHAT_CHARS + 512 * 1024;
/** Far more than a backlog of chats; stops something running away with Storage. */
const MAX_PENDING = 500;

async function admin() {
  const s = await requireApproved();
  return s?.profile.role === 'admin' ? s : null;
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const store = createAdminClient().storage;
  const { data } = await store.getBucket(BUCKET);
  if (!data) {
    const { error } = await store.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_TEXT_BYTES, allowedMimeTypes: ['text/plain'] });
    if (error && !/already exists/i.test(error.message)) throw new Error(error.message); // or made just now by another request
  }
  bucketReady = true;
}

const oldestFirst = (a: PendingEntry, b: PendingEntry) => a.uploadedAt.localeCompare(b.uploadedAt) || a.id.localeCompare(b.id);

async function entries(): Promise<PendingEntry[]> {
  const { data, error } = await createAdminClient().from('cms_kv').select('key, value').like('key', `${PENDING_PREFIX}%`);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .flatMap((r) => {
      const e = readEntry(r.value);
      return e && r.key === pendingKey(e.id) ? [e] : [];
    })
    .sort(oldestFirst);
}

/** One chat, and when its row was last written (so a change only lands on the row it was read from). */
async function entry(id: string): Promise<{ e: PendingEntry; at: string } | null> {
  const { data, error } = await createAdminClient().from('cms_kv').select('value, updated_at').eq('key', pendingKey(id)).maybeSingle();
  if (error) throw new Error(error.message);
  const e = data ? readEntry(data.value) : null;
  return e && e.id === id ? { e, at: data!.updated_at as string } : null;
}

/** Text that no entry lists (an add cut off part way, a failed removal), cleared after an hour. */
async function sweep(listed: PendingEntry[]) {
  if (listed.length >= MAX_PENDING) return; // the list might not be all of them
  const store = createAdminClient().storage.from(BUCKET);
  const { data, error } = await store.list('pending', { limit: 1000 });
  if (error || !data) return;
  const kept = new Set(listed.map((e) => e.path));
  const before = Date.now() - 3_600_000;
  const stray = data
    .filter((o) => o.id && Date.parse(o.created_at ?? '') < before && !kept.has(`pending/${o.name}`))
    .map((o) => `pending/${o.name}`);
  if (stray.length) await store.remove(stray);
}

const failed = (e: unknown, fallback: string) => json({ error: e instanceof Error ? e.message : fallback }, 500);

export async function GET(req: Request) {
  if (!(await admin())) return json({ error: 'unauthorized' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  try {
    if (id !== null) {
      if (!isPendingId(id)) return json({ error: 'bad request' }, 400);
      const hit = await entry(id);
      if (!hit) return json({ error: 'That chat isn’t saved here any more.' }, 404);
      const { data, error } = await createAdminClient().storage.from(BUCKET).download(hit.e.path);
      if (error || !data) return json({ error: 'Couldn’t load that chat.' }, 500);
      return new Response(await data.text(), { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE } });
    }
    const list = await entries();
    after(() => sweep(list).catch(() => {}));
    return json({ items: list.map(shownChat) });
  } catch (e) {
    return failed(e, 'Couldn’t load the saved chats.');
  }
}

export async function POST(req: Request) {
  const s = await admin();
  if (!s) return json({ error: 'unauthorized' }, 401);

  const raw = await req.text().catch(() => '');
  if (raw.length > MAX_REQUEST) return json({ error: 'That chat is too big to keep here.' }, 413);
  let b: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    b = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'bad request' }, 400);
  }
  const text = b.text;
  if (typeof text !== 'string' || !text.trim()) return json({ error: 'The file is empty.' }, 400);
  if (text.length > MAX_CHAT_CHARS) return json({ error: 'That chat is too big to keep here.' }, 413);
  if (!parseChatExport(text).messages.length) return json({ error: 'No messages found. Is this a chat exported from WhatsApp?' }, 400);
  const fileName = typeof b.fileName === 'string' ? b.fileName.slice(0, 255) : '';
  const title = typeof b.title === 'string' && b.title.trim() ? b.title.trim().slice(0, 200) : null;

  const id = createHash('sha256').update(text, 'utf8').digest('hex');
  const db = createAdminClient();
  try {
    const there = await entry(id);
    if (there) return json({ item: shownChat(there.e), existing: true });
    const { count, error: countError } = await db.from('cms_kv').select('key', { count: 'exact', head: true }).like('key', `${PENDING_PREFIX}%`);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= MAX_PENDING) {
      return json({ error: `There are already ${MAX_PENDING} chats waiting here. Import or remove some first.` }, 400);
    }

    // The text first, so an entry always has its text; a file left without one is swept later.
    await ensureBucket();
    const path = `pending/${randomUUID()}.txt`;
    const body = Buffer.from(text, 'utf8');
    const up = await db.storage.from(BUCKET).upload(path, body, { contentType: 'text/plain', upsert: false });
    if (up.error) throw new Error(up.error.message);
    const now = new Date().toISOString();
    const e: PendingEntry = {
      id,
      path,
      fileName,
      title,
      size: body.byteLength,
      uploadedAt: now,
      uploadedBy: { id: s.user.id, name: s.profile.full_name || s.profile.email || null },
      choices: {},
    };
    // insert, not upsert: the same chat added somewhere else at the same moment keeps theirs.
    const { error } = await db.from('cms_kv').insert({ key: pendingKey(id), value: JSON.stringify(e), updated_at: now });
    if (error) {
      await db.storage.from(BUCKET).remove([path]);
      const other = error.code === '23505' ? await entry(id) : null;
      if (other) return json({ item: shownChat(other.e), existing: true });
      throw new Error(error.message);
    }
    return json({ item: shownChat(e), existing: false });
  } catch (e) {
    return failed(e, 'Couldn’t keep that chat.');
  }
}

export async function PATCH(req: Request) {
  if (!(await admin())) return json({ error: 'unauthorized' }, 401);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || !isPendingId(b.id)) return json({ error: 'bad request' }, 400);
  const id = b.id;
  const choices = cleanChoices(b.choices);
  const db = createAdminClient();
  try {
    // Written only over the row as it was read, so a chat removed or added again meanwhile isn't
    // brought back or pointed at the wrong text; a change from another computer just goes first.
    for (let i = 0; i < 3; i++) {
      const hit = await entry(id);
      if (!hit) return json({ error: 'That chat isn’t saved here any more.' }, 404);
      const e = { ...hit.e, choices };
      const { data, error } = await db
        .from('cms_kv')
        .update({ value: JSON.stringify(e), updated_at: new Date().toISOString() })
        .eq('key', pendingKey(id))
        .eq('updated_at', hit.at)
        .select('key');
      if (error) throw new Error(error.message);
      if (data?.length) return json({ item: shownChat(e) });
    }
    return json({ error: 'That chat is being changed somewhere else. Try again.' }, 409);
  } catch (e) {
    return failed(e, 'Couldn’t save that.');
  }
}

export async function DELETE(req: Request) {
  if (!(await admin())) return json({ error: 'unauthorized' }, 401);
  const id = new URL(req.url).searchParams.get('id');
  if (!isPendingId(id)) return json({ error: 'bad request' }, 400);
  const db = createAdminClient();
  try {
    const hit = await entry(id);
    if (!hit) return json({ ok: true }); // already gone: imported or removed somewhere else
    const { error } = await db.from('cms_kv').delete().eq('key', pendingKey(id));
    if (error) throw new Error(error.message);
    // After the entry, so a failure here leaves a file nothing lists (swept), never an entry without its text.
    await db.storage.from(BUCKET).remove([hit.e.path]);
    return json({ ok: true });
  } catch (e) {
    return failed(e, 'Couldn’t remove that chat.');
  }
}

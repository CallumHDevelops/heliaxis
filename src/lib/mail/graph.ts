import 'server-only';
import { graph, GraphError } from '@/lib/ms365';
import { insertAtTop, type Header } from './shared';

/**
 * My email: the Microsoft Graph calls for one person's own mailbox (src/lib/mail/sync.ts). It uses the app's own
 * Microsoft 365 sign-in (src/lib/ms365.ts), which can only reach the mailboxes in the "Heliaxis CRM mailboxes" scope
 * (Setup › Connect Microsoft 365 email). Every call asks for immutable ids, so a message keeps its id when it's moved.
 */

const IMMUTABLE = 'IdType="ImmutableId"';
const LIST_PREFER = `${IMMUTABLE}, outlook.body-content-type="text"`;
const box = (address: string) => `/users/${encodeURIComponent(address)}`;

export type GMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string | null;
  bodyPreview?: string;
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: { emailAddress?: { address?: string; name?: string } }[];
  ccRecipients?: { emailAddress?: { address?: string; name?: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isDraft?: boolean;
  internetMessageHeaders?: Header[];
  parentFolderId?: string;
};

const SELECT = 'id,internetMessageId,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isDraft,internetMessageHeaders,parentFolderId';

/** A page of one folder's emails, newest first: newer than `since` and/or older than `before`. */
export async function listFolder(
  address: string,
  folder: 'inbox' | 'sentitems',
  o: { before?: string | null; since?: string | null; top?: number }
): Promise<GMessage[]> {
  const field = folder === 'inbox' ? 'receivedDateTime' : 'sentDateTime';
  const filter = [o.since ? `${field} ge ${o.since}` : '', o.before ? `${field} lt ${o.before}` : ''].filter(Boolean).join(' and ');
  const q = new URLSearchParams({ $select: SELECT, $top: String(o.top ?? 50), $orderby: `${field} desc` });
  if (filter) q.set('$filter', filter);
  const r = await graph<{ value: GMessage[] }>(`${box(address)}/mailFolders/${folder}/messages?${q}`, { headers: { Prefer: LIST_PREFER } });
  return (r.value ?? []).filter((m) => !m.isDraft);
}

/** The inbox's own id, to tell whether a message is still in it. */
export async function inboxId(address: string): Promise<string> {
  const r = await graph<{ id: string }>(`${box(address)}/mailFolders/inbox?$select=id`, { headers: { Prefer: IMMUTABLE } });
  return r.id;
}

/** Whether the app can read this mailbox: ok, or the reason it can't, in words for the screen. */
export async function testMailbox(address: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await inboxId(address);
    return { ok: true };
  } catch (e) {
    if (e instanceof GraphError && (e.status === 403 || e.code === 'ErrorAccessDenied'))
      return { ok: false, error: `Microsoft 365 won’t let the app open ${address}. It has to be in the “Heliaxis CRM mailboxes” scope (Setup › Connect Microsoft 365 email, PowerShell line 4).` };
    if (e instanceof GraphError && e.status === 404) return { ok: false, error: `There’s no Microsoft 365 mailbox for ${address}.` };
    return { ok: false, error: e instanceof Error ? e.message : 'Couldn’t reach Microsoft 365.' };
  }
}

/** One email's own words (without the quoted history below it), as plain text. */
export async function messageText(address: string, id: string): Promise<{ text: string; webLink: string | null }> {
  const r = await graph<{ uniqueBody?: { content?: string }; body?: { content?: string }; webLink?: string }>(
    `${box(address)}/messages/${encodeURIComponent(id)}?$select=uniqueBody,body,webLink`,
    { headers: { Prefer: LIST_PREFER } }
  );
  const text = (r.uniqueBody?.content || r.body?.content || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { text, webLink: r.webLink ?? null };
}

/** The folder at "Suppliers/GoodWe" under the top of the mailbox, made if it isn't there. Returns its id. */
export async function ensureFolder(address: string, path: string, known: Map<string, string>): Promise<string> {
  const parts = path.split('/').filter(Boolean);
  let parent: string | null = null;
  let sofar = '';
  for (const name of parts) {
    sofar = sofar ? `${sofar}/${name}` : name;
    const cached = known.get(sofar);
    if (cached) {
      parent = cached;
      continue;
    }
    const base: string = parent ? `${box(address)}/mailFolders/${encodeURIComponent(parent)}/childFolders` : `${box(address)}/mailFolders`;
    const q = new URLSearchParams({ $filter: `displayName eq '${name.replace(/'/g, "''")}'`, $select: 'id,displayName', $top: '5' });
    const found = await graph<{ value: { id: string }[] }>(`${base}?${q}`, { headers: { Prefer: IMMUTABLE } });
    let id = found.value?.[0]?.id;
    if (!id) {
      const made = await graph<{ id: string }>(base, { method: 'POST', headers: { Prefer: IMMUTABLE }, body: JSON.stringify({ displayName: name }) });
      id = made.id;
    }
    known.set(sofar, id);
    parent = id;
  }
  if (!parent) throw new Error('No folder name');
  return parent;
}

/** The folder an email is in now. */
export async function getParentFolder(address: string, id: string): Promise<string | null> {
  const r = await graph<{ parentFolderId?: string }>(`${box(address)}/messages/${encodeURIComponent(id)}?$select=parentFolderId`, { headers: { Prefer: IMMUTABLE } });
  return r.parentFolderId ?? null;
}

/** Moves an email to a folder. Its id stays the same (immutable ids). */
export async function moveMessage(address: string, id: string, folderId: string): Promise<void> {
  await graph(`${box(address)}/messages/${encodeURIComponent(id)}/move`, { method: 'POST', headers: { Prefer: IMMUTABLE }, body: JSON.stringify({ destinationId: folderId }) });
}

/** Moves an email back to the inbox ("Not marketing"). */
export async function moveToInbox(address: string, id: string): Promise<void> {
  await moveMessage(address, id, 'inbox');
}

/* ── Highlighting in Outlook ─────────────────────────────────────────────── */

/** The app's own categories. Only these are ever added or taken off; your own categories are left alone. */
export const CAT_URGENT = 'Urgent';
export const CAT_REPLY = 'Needs reply';
const OURS = [CAT_URGENT, CAT_REPLY];

/**
 * Makes the two categories in the mailbox's list with their colours (Urgent red, Needs reply orange). Outlook
 * only lets the app do this with the MailboxSettings permission; without it the categories still work, just grey.
 * Returns whether it managed.
 */
export async function ensureCategories(address: string): Promise<boolean> {
  try {
    const have = await graph<{ value: { displayName: string }[] }>(`${box(address)}/outlook/masterCategories`);
    const names = new Set((have.value ?? []).map((c) => c.displayName));
    for (const [name, color] of [[CAT_URGENT, 'preset0'], [CAT_REPLY, 'preset1']] as const) {
      if (!names.has(name)) await graph(`${box(address)}/outlook/masterCategories`, { method: 'POST', body: JSON.stringify({ displayName: name, color }) });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Marks one email: `category` is added (the app's other one taken off), and it's flagged when `flag`. With no
 * category, the app's categories come off and, if the app flagged it (`unflag`), the flag too.
 */
export async function markMessage(address: string, id: string, o: { category: string | null; flag: boolean; unflag: boolean }): Promise<void> {
  const url = `${box(address)}/messages/${encodeURIComponent(id)}`;
  const cur = await graph<{ categories?: string[]; flag?: { flagStatus?: string } }>(`${url}?$select=categories,flag`, { headers: { Prefer: IMMUTABLE } });
  const categories = [...(cur.categories ?? []).filter((c) => !OURS.includes(c)), ...(o.category ? [o.category] : [])];
  const patch: Record<string, unknown> = { categories };
  if (o.flag && cur.flag?.flagStatus !== 'flagged') patch.flag = { flagStatus: 'flagged' };
  else if (!o.flag && o.unflag && cur.flag?.flagStatus === 'flagged') patch.flag = { flagStatus: 'notFlagged' };
  await graph(url, { method: 'PATCH', headers: { Prefer: IMMUTABLE }, body: JSON.stringify(patch) });
}

/* ── Drafts in Outlook ───────────────────────────────────────────────────── */

export type InlineImage = { contentId: string; name: string; contentType: string; contentBytes: string };

const HTML_PREFER = `${IMMUTABLE}, outlook.body-content-type="html"`;

/**
 * A reply to their email, left in Outlook's Drafts (threaded under their email, with the quoted history below):
 * Outlook makes the reply, then your words and signature go at the top, and the signature's pictures (your logo)
 * are attached to it the way Outlook does.
 */
export async function createReplyDraft(
  address: string,
  id: string,
  html: string,
  o: { all?: boolean; images?: InlineImage[] } = {}
): Promise<{ id: string; lastModifiedDateTime: string; webLink: string | null }> {
  const made = await graph<{ id: string; body?: { content?: string } }>(`${box(address)}/messages/${encodeURIComponent(id)}/${o.all ? 'createReplyAll' : 'createReply'}`, {
    method: 'POST',
    headers: { Prefer: HTML_PREFER },
    body: JSON.stringify({}),
  });
  const url = `${box(address)}/messages/${encodeURIComponent(made.id)}`;
  await graph(url, { method: 'PATCH', headers: { Prefer: IMMUTABLE }, body: JSON.stringify({ body: { contentType: 'HTML', content: insertAtTop(made.body?.content ?? '', html) } }) });
  for (const img of o.images ?? []) {
    await graph(`${url}/attachments`, {
      method: 'POST',
      headers: { Prefer: IMMUTABLE },
      body: JSON.stringify({ '@odata.type': '#microsoft.graph.fileAttachment', name: img.name, contentType: img.contentType, contentBytes: img.contentBytes, contentId: img.contentId, isInline: true }),
    });
  }
  const r = await graph<{ lastModifiedDateTime?: string; webLink?: string }>(`${url}?$select=lastModifiedDateTime,webLink`, { headers: { Prefer: IMMUTABLE } });
  return { id: made.id, lastModifiedDateTime: r.lastModifiedDateTime ?? new Date().toISOString(), webLink: r.webLink ?? null };
}

/** Sends a draft. */
export async function sendDraft(address: string, id: string): Promise<void> {
  await graph(`${box(address)}/messages/${encodeURIComponent(id)}/send`, { method: 'POST', headers: { Prefer: IMMUTABLE } });
}

/** Your latest sent emails' own words (not the quoted history), as HTML: where your signature is copied from. */
export async function recentSentHtml(address: string, top = 20): Promise<{ id: string; html: string }[]> {
  const q = new URLSearchParams({ $select: 'id,uniqueBody,isDraft', $top: String(top), $orderby: 'sentDateTime desc' });
  const r = await graph<{ value: { id: string; uniqueBody?: { content?: string } }[] }>(`${box(address)}/mailFolders/sentitems/messages?${q}`, { headers: { Prefer: HTML_PREFER } });
  return (r.value ?? []).map((m) => ({ id: m.id, html: m.uniqueBody?.content ?? '' }));
}

/** The pictures an email carries inside it (a signature's logo), up to 300 KB each. */
export async function inlineImages(address: string, id: string): Promise<InlineImage[]> {
  const r = await graph<{ value: { '@odata.type'?: string; name?: string; contentType?: string; contentBytes?: string; contentId?: string; isInline?: boolean; size?: number }[] }>(
    `${box(address)}/messages/${encodeURIComponent(id)}/attachments`,
    { headers: { Prefer: IMMUTABLE } }
  );
  return (r.value ?? [])
    .filter((a) => a.isInline && a.contentId && a.contentBytes && (a.size ?? 0) <= 300_000 && a['@odata.type'] === '#microsoft.graph.fileAttachment')
    .map((a) => ({ contentId: a.contentId!.replace(/^<|>$/g, ''), name: a.name || 'image', contentType: a.contentType || 'image/png', contentBytes: a.contentBytes! }));
}

/** A draft as it is now: still a draft, and when it was last changed. Null if it's gone. */
export async function draftState(address: string, id: string): Promise<{ isDraft: boolean; lastModifiedDateTime: string } | null> {
  try {
    const r = await graph<{ isDraft?: boolean; lastModifiedDateTime?: string }>(`${box(address)}/messages/${encodeURIComponent(id)}?$select=isDraft,lastModifiedDateTime`, { headers: { Prefer: IMMUTABLE } });
    return { isDraft: !!r.isDraft, lastModifiedDateTime: r.lastModifiedDateTime ?? '' };
  } catch (e) {
    if (e instanceof GraphError && e.status === 404) return null;
    throw e;
  }
}

/** Removes a draft (Outlook moves it to Deleted Items). Only ever used on the app's own, untouched drafts. */
export async function deleteDraft(address: string, id: string): Promise<void> {
  await graph(`${box(address)}/messages/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: IMMUTABLE } });
}

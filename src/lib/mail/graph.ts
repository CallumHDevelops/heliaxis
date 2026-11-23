import 'server-only';
import { graph, GraphError } from '@/lib/ms365';
import { insertAtTop, pathPart, type Header } from './shared';

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
  replyTo?: { emailAddress?: { address?: string; name?: string } }[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isDraft?: boolean;
  internetMessageHeaders?: Header[];
  parentFolderId?: string;
};

const SELECT = 'id,internetMessageId,conversationId,subject,bodyPreview,from,toRecipients,ccRecipients,replyTo,receivedDateTime,sentDateTime,isDraft,internetMessageHeaders,parentFolderId';

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

/**
 * The folder at "Suppliers/GoodWe" under the top of the mailbox (or "Inbox/Customers/Sarah Davies (HX-0069)" inside the
 * Inbox), made if it isn't there. Returns its id.
 */
export async function ensureFolder(address: string, path: string, known: Map<string, string>): Promise<string> {
  const parts = path.split('/').filter(Boolean);
  let parent: string | null = null;
  let sofar = '';
  // "Inbox/…": inside the Inbox itself (Outlook's well-known name for it), not a folder called Inbox at the top.
  if (parts[0]?.toLowerCase() === 'inbox' && parts.length > 1) {
    parent = 'inbox';
    sofar = 'Inbox';
    parts.shift();
  }
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

/** An email's Reply-To address (for emails sent through Xero and the like: the business behind it). */
export async function getReplyTo(address: string, id: string): Promise<string | null> {
  const r = await graph<{ replyTo?: { emailAddress?: { address?: string } }[] }>(`${box(address)}/messages/${encodeURIComponent(id)}?$select=replyTo`, { headers: { Prefer: IMMUTABLE } });
  return r.replyTo?.[0]?.emailAddress?.address ?? null;
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

/** To Deleted Items (Outlook keeps it there, so it can be got back). */
export async function moveToDeleted(address: string, id: string): Promise<void> {
  await moveMessage(address, id, 'deleteditems');
}

/** Moves an email back to the inbox ("Not marketing"). */
export async function moveToInbox(address: string, id: string): Promise<void> {
  await moveMessage(address, id, 'inbox');
}

/* ── Highlighting in Outlook ─────────────────────────────────────────────── */

/** The app's own categories. Only these are ever added or taken off; your own categories are left alone. */
export const CAT_URGENT = 'Urgent';
export const CAT_REPLY = 'Needs reply';
export const CAT_ACTION = 'Action needed';
const OURS = [CAT_URGENT, CAT_REPLY, CAT_ACTION];

/**
 * Makes the app's categories in the mailbox's list with their colours (Urgent red, Needs reply orange, Action needed yellow). Outlook
 * only lets the app do this with the MailboxSettings permission; without it the categories still work, just grey.
 * Returns whether it managed.
 */
export async function ensureCategories(address: string): Promise<boolean> {
  try {
    const have = await graph<{ value: { displayName: string }[] }>(`${box(address)}/outlook/masterCategories`);
    const names = new Set((have.value ?? []).map((c) => c.displayName));
    for (const [name, color] of [[CAT_URGENT, 'preset0'], [CAT_REPLY, 'preset1'], [CAT_ACTION, 'preset3']] as const) {
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

/** A document attached to a reply (from your device, the customer's job documents or the library). */
export type FileToAttach = { name: string; contentType: string; bytes: Uint8Array };

/** Outlook's own limit on one email's attachments, roughly. */
export const MAX_ATTACH_TOTAL = 25 * 1024 * 1024;
const SIMPLE_ATTACH = 3 * 1024 * 1024;

/**
 * Attaches a file to a draft: in one go up to 3 MB, otherwise through Outlook's upload session in chunks (a multiple
 * of 320 KB each, as Microsoft asks).
 */
export async function attachFile(address: string, draftId: string, f: FileToAttach): Promise<void> {
  const url = `${box(address)}/messages/${encodeURIComponent(draftId)}/attachments`;
  if (f.bytes.length <= SIMPLE_ATTACH) {
    await graph(url, {
      method: 'POST',
      headers: { Prefer: IMMUTABLE },
      body: JSON.stringify({ '@odata.type': '#microsoft.graph.fileAttachment', name: f.name, contentType: f.contentType, contentBytes: Buffer.from(f.bytes).toString('base64') }),
    });
    return;
  }
  const session = await graph<{ uploadUrl: string }>(`${url}/createUploadSession`, {
    method: 'POST',
    headers: { Prefer: IMMUTABLE },
    body: JSON.stringify({ AttachmentItem: { attachmentType: 'file', name: f.name, size: f.bytes.length, contentType: f.contentType } }),
  });
  const CHUNK = 320 * 1024 * 10; // 3.2 MB
  for (let start = 0; start < f.bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, f.bytes.length);
    // The upload URL carries its own permission: no sign-in header.
    const r = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Length': String(end - start), 'Content-Range': `bytes ${start}-${end - 1}/${f.bytes.length}`, 'Content-Type': 'application/octet-stream' },
      body: Buffer.from(f.bytes.subarray(start, end)),
    });
    if (!r.ok && r.status !== 202) throw new Error(`Microsoft didn’t take ${f.name} (${r.status}).`);
  }
}

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
  o: { all?: boolean; images?: InlineImage[]; files?: FileToAttach[] } = {}
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
  for (const f of o.files ?? []) await attachFile(address, made.id, f);
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

/** Inbox emails whose flag you've ticked complete in Outlook (up to 100): Hestia reads that as "dealt with". */
export async function completedInInbox(address: string): Promise<string[]> {
  const q = new URLSearchParams({ $filter: "flag/flagStatus eq 'complete'", $select: 'id', $top: '100' });
  const r = await graph<{ value: { id: string }[] }>(`${box(address)}/mailFolders/inbox/messages?${q}`, { headers: { Prefer: IMMUTABLE } });
  return (r.value ?? []).map((m) => m.id);
}

/** Removes a draft (Outlook moves it to Deleted Items). Only ever used on the app's own, untouched drafts. */
export async function deleteDraft(address: string, id: string): Promise<void> {
  await graph(`${box(address)}/messages/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: IMMUTABLE } });
}

/* ── Your own folders ─────────────────────────────────────────────────────── */

/**
 * The folders you already have, at the top of the mailbox and inside the Inbox, as paths ("Inbox/GoodWe", with a "/"
 * in a folder's own name kept as NAME_SLASH), so Hestia files into yours rather than making her own alongside.
 */
export async function listFolders(address: string): Promise<{ path: string; name: string; id: string }[]> {
  const q = new URLSearchParams({ $select: 'id,displayName', $top: '250' });
  const [top, inbox] = await Promise.all([
    graph<{ value: { id: string; displayName: string }[] }>(`${box(address)}/mailFolders?${q}`, { headers: { Prefer: IMMUTABLE } }),
    graph<{ value: { id: string; displayName: string }[] }>(`${box(address)}/mailFolders/inbox/childFolders?${q}`, { headers: { Prefer: IMMUTABLE } }),
  ]);
  return [
    ...(top.value ?? []).map((f) => ({ path: pathPart(f.displayName), name: f.displayName, id: f.id })),
    ...(inbox.value ?? []).map((f) => ({ path: `Inbox/${pathPart(f.displayName)}`, name: f.displayName, id: f.id })),
  ];
}

/** Removes a folder only if it's completely empty (no emails, no folders inside). True if it went. */
export async function deleteFolderIfEmpty(address: string, id: string): Promise<boolean> {
  try {
    const f = await graph<{ totalItemCount?: number; childFolderCount?: number }>(`${box(address)}/mailFolders/${encodeURIComponent(id)}?$select=totalItemCount,childFolderCount`, { headers: { Prefer: IMMUTABLE } });
    if ((f.totalItemCount ?? 1) !== 0 || (f.childFolderCount ?? 1) !== 0) return false;
    await graph(`${box(address)}/mailFolders/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Prefer: IMMUTABLE } });
    return true;
  } catch {
    return false;
  }
}

/** The files attached to an email (not the pictures inside it). */
export async function listAttachments(address: string, id: string): Promise<{ id: string; name: string; size: number; contentType: string }[]> {
  const r = await graph<{ value: { id: string; name?: string; size?: number; contentType?: string; isInline?: boolean }[] }>(
    `${box(address)}/messages/${encodeURIComponent(id)}/attachments?$select=id,name,size,contentType,isInline`,
    { headers: { Prefer: IMMUTABLE } }
  );
  return (r.value ?? []).filter((a) => !a.isInline).map((a) => ({ id: a.id, name: a.name || 'attachment', size: a.size ?? 0, contentType: a.contentType || 'application/octet-stream' }));
}

/** One attachment's file, to open from the app. */
export async function attachmentFile(address: string, id: string, attachmentId: string): Promise<{ name: string; contentType: string; bytes: Buffer } | null> {
  const r = await graph<{ name?: string; contentType?: string; contentBytes?: string }>(
    `${box(address)}/messages/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { Prefer: IMMUTABLE } }
  );
  if (!r.contentBytes) return null;
  return { name: r.name || 'attachment', contentType: r.contentType || 'application/octet-stream', bytes: Buffer.from(r.contentBytes, 'base64') };
}

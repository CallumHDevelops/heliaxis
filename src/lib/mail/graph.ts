import 'server-only';
import { graph, GraphError } from '@/lib/ms365';
import type { Header } from './shared';

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

/** Replies to their email (above the quoted history, the way Outlook does), from their mailbox. */
export async function sendReply(address: string, id: string, html: string, all: boolean): Promise<void> {
  await graph(`${box(address)}/messages/${encodeURIComponent(id)}/${all ? 'replyAll' : 'reply'}`, { method: 'POST', headers: { Prefer: IMMUTABLE }, body: JSON.stringify({ comment: html }) });
}

/** Puts the reply in Outlook's Drafts to finish there. Returns the link that opens it in Outlook on the web. */
export async function draftReply(address: string, id: string, html: string, all: boolean): Promise<string | null> {
  const d = await graph<{ id: string; webLink?: string }>(`${box(address)}/messages/${encodeURIComponent(id)}/${all ? 'createReplyAll' : 'createReply'}`, {
    method: 'POST',
    headers: { Prefer: IMMUTABLE },
    body: JSON.stringify({ comment: html }),
  });
  if (d.webLink) return d.webLink;
  const r = await graph<{ webLink?: string }>(`${box(address)}/messages/${encodeURIComponent(d.id)}?$select=webLink`, { headers: { Prefer: IMMUTABLE } });
  return r.webLink ?? null;
}

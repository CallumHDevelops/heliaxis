'use client';

import Link from 'next/link';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  chatSides,
  dateRange,
  looksLikePhone,
  MAX_CHAT_CHARS,
  nameFromFileName,
  parseChatExport,
  type ParsedChat,
} from '@/lib/whatsapp/chat-export';
import { readChatFile } from '@/lib/whatsapp/chat-zip';
import { chatHash, choicesOf, restoreChoices, savedLabel, type PendingChat } from '@/lib/whatsapp/import-pending';
import { toWaId } from '@/lib/whatsapp/shared';
import './wa-import.css';

/**
 * Chats exported from the WhatsApp Business app, one file per customer. Each file is read here in
 * the browser to show who it's with; the server reads it again before saving (/api/whatsapp/import).
 * Until it's imported or removed, each chat stays on this page, on any computer, with the choices
 * made for it (/api/whatsapp/import/pending).
 */

type Person = { id: string; name: string; phone: string | null; email: string | null; postcode?: string | null };
type Result = {
  enquiryId: string;
  name: string;
  created: boolean;
  imported: number;
  duplicates: number;
  skipped: number;
  /** e.g. why the chat's number wasn't added to them. */
  note?: string | null;
  /** The chat has messages from us, so they're at Contacted now (added there, or moved from Lead). */
  contacted?: boolean;
};

type Row = {
  key: number;
  fileName: string;
  state: 'reading' | 'ready' | 'error' | 'importing' | 'done';
  error?: string;
  text?: string;
  chat?: ParsedChat;
  /** The customer's name from the file name (null for a bare "_chat.txt"). */
  title: string | null;
  /** Select value once chosen: `a:<author>`, or NONE. Unset = the best guess. */
  us?: string;
  /** Someone already in the CRM, or null to search / add them. */
  match: (Person & { byPhone: boolean }) | null;
  /** The customer was chosen by hand, so it's kept with the chat (otherwise it's looked up again). */
  picked: boolean;
  adding: boolean;
  newName: string;
  newPhone: string;
  q: string;
  found: Person[] | null;
  searching: boolean;
  result?: Result;
  /** Skipped: no one in the CRM has this number, and the customer who had it was deleted on purpose. */
  deletedBefore?: boolean;
  /** SHA-256 of the text, so the same chat isn't on the list twice. */
  hash?: string | null;
  /** Kept on the server until it's imported or removed. */
  saved?: { id: string; at: string; by: string | null };
  /** Being kept: it can be used once that's done (or didn't work). */
  saving?: boolean;
  /** Why it isn't kept for next time, or its choices weren't saved. */
  keepError?: string;
  removing?: boolean;
};

/** "Heliaxis is: nobody here" (we never replied to this one). */
const NONE = 'none';
/** Vercel turns away request bodies over 4.5 MB. */
const MAX_REQUEST_BYTES = 4_400_000;
const PENDING = '/api/whatsapp/import/pending';
const NOT_KEPT = 'Couldn’t keep this chat here for next time, so it goes when you leave the page. You can still import it now.';
const CHOICES_NOT_KEPT = 'Couldn’t save the choices for this chat for next time.';
const GONE = 'This chat was imported or removed on another computer, so it goes when you leave the page.';
const STILL_KEPT = 'Imported, but it’s still on the list for next time. Remove it with × (importing it again adds nothing new).';

const authorValue = (name: string) => `a:${name}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

/**
 * Which author is Heliaxis, as a select value ('' = ask). The name in every chat that has two
 * people, then one with "Heliaxis" in it, then the side that isn't saved as a number.
 */
function guessUs(chat: ParsedChat, all: ParsedChat[]): string {
  const names = chat.authors.map((a) => a.name);
  const pairs = all.filter((c) => c.authors.length >= 2);
  if (pairs.length >= 2) {
    const everywhere = pairs[0].authors.map((a) => a.name).filter((n) => pairs.every((c) => c.authors.some((a) => a.name === n)));
    if (everywhere.length === 1) {
      if (names.includes(everywhere[0])) return authorValue(everywhere[0]);
      if (names.length === 1) return NONE;
    }
  }
  const named = names.filter((n) => /heliaxis/i.test(n));
  if (named.length === 1) return authorValue(named[0]);
  if (names.length === 2 && looksLikePhone(names[0]) !== looksLikePhone(names[1])) {
    return authorValue(names.find((n) => !looksLikePhone(n))!);
  }
  return '';
}

/** The author name that is Heliaxis, null for nobody, undefined while still to choose. */
function usOf(value: string): string | null | undefined {
  if (value === NONE) return null;
  return value.startsWith('a:') ? value.slice(2) : undefined;
}

/** The customer's number when the chat is saved under it rather than a name. */
function phoneIn(row: Row): string | null {
  if (looksLikePhone(row.title)) return row.title;
  return row.chat?.authors.find((a) => looksLikePhone(a.name))?.name ?? null;
}

const blankRow = (key: number, fileName: string, title: string | null): Row => ({
  key,
  fileName,
  state: 'reading',
  title,
  match: null,
  picked: false,
  adding: false,
  newName: '',
  newPhone: '',
  q: '',
  found: null,
  searching: false,
});

const savedOf = (c: PendingChat): Row['saved'] => ({ id: c.id, at: c.uploadedAt, by: c.uploadedBy.name });

/** Kept chats whose choices have changed since they were last saved. */
function unsaved(rows: Row[], sent: Map<string, string>) {
  return rows.flatMap((r) => {
    if (!r.saved || r.state === 'done') return [];
    const choices = choicesOf(r);
    const s = JSON.stringify(choices);
    return s === sent.get(r.saved.id) ? [] : [{ key: r.key, id: r.saved.id, choices, s }];
  });
}

export function WhatsAppImport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busyAll, setBusyAll] = useState(false);
  /** Files left out this time as they're already on the list. */
  const [already, setAlready] = useState<string[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const nextKey = useRef(1);
  /** Content hash → the row showing that chat, so each chat is only on the list once. */
  const claims = useRef(new Map<string, number>());
  /** Kept chat id → its choices as last saved, so only changes are sent. */
  const sent = useRef(new Map<string, string>());
  /** Kept chat id → its last save, so saves land in the order they were made. */
  const inFlight = useRef(new Map<string, Promise<void>>());

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  /** keepError from → to, only if it's `from` now, so a save that keeps failing doesn't keep retrying. */
  const warn = (key: number, from: string | undefined, to: string | undefined) =>
    setRows((rs) =>
      rs.some((r) => r.key === key && r.keepError === from) ? rs.map((r) => (r.key === key && r.keepError === from ? { ...r, keepError: to } : r)) : rs
    );
  const release = (key: number) => {
    for (const [hash, k] of claims.current) if (k === key) claims.current.delete(hash);
  };
  /** The same chat is on the list already, so this copy goes. */
  const drop = (key: number, fileName: string) => {
    release(key);
    setRows((rs) => rs.filter((r) => r.key !== key));
    setAlready((a) => [...a, fileName]);
  };

  const chats = rows.flatMap((r) => (r.chat ? [r.chat] : []));
  const usValue = (r: Row) => r.us ?? (r.chat ? guessUs(r.chat, chats) : '');
  const nameFor = (r: Row) => {
    const us = usOf(usValue(r));
    const side = r.chat ? chatSides(r.chat, us === undefined ? null : us).customer : null;
    return r.title || (us !== undefined && side) || 'Unknown';
  };
  /** What stops this row importing, or null when it's ready. */
  const blocker = (r: Row): string | null => {
    if (r.state !== 'ready' || !r.chat) return 'not ready';
    const us = usOf(usValue(r));
    if (us === undefined) return 'Choose which name is Heliaxis.';
    if (chatSides(r.chat, us).group) {
      return us === null && r.chat.authors.length === 2
        ? 'Choose which name is Heliaxis.'
        : 'This looks like a group chat. Only one-to-one chats can be imported.';
    }
    if (!r.match && !r.adding) return 'Choose the customer.';
    if (!r.match && !toWaId(r.newPhone)) return 'Enter their mobile number to add them.';
    return null;
  };
  const ready = rows.filter((r) => !blocker(r));
  // One import at a time, and nothing changes while it runs: Import all uses the rows as they are
  // when it's clicked, and two new leads with the same number would both be added.
  const busy = busyAll || rows.some((r) => r.state === 'importing');

  /** Chats kept from before: on the list straight away, then each one's text is fetched and read. */
  const openSaved = useEffectEvent(async (stopped: () => boolean) => {
    const d = await fetch(PENDING, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (stopped()) return;
    if (!Array.isArray(d?.items)) {
      setLoadFailed(true);
      return;
    }
    // Not one that's just been chosen again before the list came.
    const restored = (d.items as PendingChat[])
      .filter((c) => !claims.current.has(c.id))
      .map((c): Row => {
        const key = nextKey.current++;
        claims.current.set(c.id, key);
        sent.current.set(c.id, JSON.stringify(c.choices));
        return { ...blankRow(key, c.fileName, c.title), ...restoreChoices(c.choices), hash: c.id, saved: savedOf(c) };
      });
    if (!restored.length) return;
    setRows((rs) => [...restored, ...rs]);
    for (const row of restored) {
      if (stopped()) return;
      const res = await fetch(`${PENDING}?id=${row.hash}`, { cache: 'no-store' }).catch(() => null);
      if (res?.status === 404) {
        // Imported or removed on another computer since the list came.
        release(row.key);
        setRows((rs) => rs.filter((r) => r.key !== row.key));
        continue;
      }
      const text = res?.ok ? await res.text().catch(() => '') : '';
      const chat = text ? parseChatExport(text) : null;
      if (!chat?.messages.length) {
        patch(row.key, { state: 'error', error: 'Couldn’t load this saved chat. Refresh the page to try again.' });
        continue;
      }
      patch(row.key, { state: 'ready', text, chat });
      await findCustomer(row.key, { ...row, state: 'ready', text, chat });
    }
  });
  useEffect(() => {
    let stop = false;
    openSaved(() => stop);
    return () => {
      stop = true;
    };
  }, []);

  /** Sends choices that have changed. `leaving`: the page is going, so the request has to outlive it. */
  const saveChoices = useEffectEvent((leaving: boolean) => {
    for (const u of unsaved(rows, sent.current)) {
      sent.current.set(u.id, u.s);
      const send = () =>
        fetch(PENDING, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: u.id, choices: u.choices }),
          keepalive: leaving,
        });
      // After the one before (a page that's going can't wait, so it goes now).
      const done = (leaving ? send() : (inFlight.current.get(u.id) ?? Promise.resolve()).then(send))
        .then((res) => {
          if (res.ok) return warn(u.key, CHOICES_NOT_KEPT, undefined);
          if (res.status !== 404) throw new Error();
          sent.current.delete(u.id);
          setRows((rs) => rs.map((r) => (r.key === u.key && r.state !== 'done' && r.saved?.id === u.id ? { ...r, saved: undefined, keepError: GONE } : r)));
        })
        .catch(() => {
          if (sent.current.get(u.id) === u.s) sent.current.delete(u.id); // tried again after the next change
          warn(u.key, undefined, CHOICES_NOT_KEPT);
        });
      inFlight.current.set(u.id, done);
    }
  });
  // Choices are saved a moment after the last change, and straight away when the page is hidden or left.
  useEffect(() => {
    if (!unsaved(rows, sent.current).length) return;
    const t = setTimeout(() => saveChoices(false), 800);
    return () => clearTimeout(t);
  }, [rows]);
  useEffect(() => {
    const now = () => saveChoices(true);
    const hidden = () => {
      if (document.visibilityState === 'hidden') now();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', now);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', now);
      now();
    };
  }, []);

  async function addFiles(files: File[]) {
    setAlready([]);
    for (const file of files) {
      const key = nextKey.current++;
      const base = blankRow(key, file.name, nameFromFileName(file.name));
      setRows((rs) => [...rs, base]);
      let row: Row;
      let text: string;
      try {
        const read = await readChatFile(file);
        text = read.text;
        if (text.length > MAX_CHAT_CHARS) throw new Error('This chat is too big to import in one go.');
        const chat = parseChatExport(text);
        if (!chat.messages.length) throw new Error(chat.warnings[0] || 'No messages found in this file.');
        row = { ...base, text, chat, title: base.title ?? (read.inner ? nameFromFileName(read.inner) : null) };
      } catch (e) {
        patch(key, { state: 'error', error: e instanceof Error ? e.message : 'Couldn’t read this file.' });
        continue;
      }

      // The same chat twice (chosen again, or kept from before) stays as one.
      const hash = await chatHash(text);
      if (hash && claims.current.has(hash)) {
        drop(key, file.name);
        continue;
      }
      if (hash) claims.current.set(hash, key);
      patch(key, { ...row, saving: true, hash });
      const kept = await keep(row);
      if (kept && (claims.current.get(kept.item.id) ?? key) !== key) {
        drop(key, file.name);
        continue;
      }
      if (kept) {
        claims.current.set(kept.item.id, key);
        sent.current.set(kept.item.id, JSON.stringify(kept.item.choices));
        // Kept from another computer, with its choices.
        if (kept.existing) row = { ...row, ...restoreChoices(kept.item.choices) };
      }
      row = { ...row, state: 'ready', hash: kept?.item.id ?? hash, saved: kept ? savedOf(kept.item) : undefined, keepError: kept ? undefined : NOT_KEPT };
      patch(key, { ...row, saving: false });
      await findCustomer(key, row);
    }
  }

  /** Keeps a chat that's just been read until it's imported or removed; null if that didn't work. */
  async function keep(row: Row): Promise<{ item: PendingChat; existing: boolean } | null> {
    const body = JSON.stringify({ fileName: row.fileName, title: row.title, text: row.text });
    if (new Blob([body]).size > MAX_REQUEST_BYTES) return null;
    const d = await fetch(PENDING, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(60_000) : undefined,
    })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    return d?.item?.id ? { item: d.item as PendingChat, existing: !!d.existing } : null;
  }

  /** Takes a kept chat off the list. */
  async function forget(id: string): Promise<boolean> {
    const ok = await fetch(`${PENDING}?id=${id}`, { method: 'DELETE' })
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) sent.current.delete(id);
    return ok;
  }

  /**
   * Once a chat can be used, the customer chosen for it before; or, as for a new file, whoever has
   * the number it's saved under, else people with the same name.
   */
  async function findCustomer(key: number, row: Row) {
    if (row.picked) {
      if (!row.match && !row.adding) await search(key, row.q); // its suggestions again
      return;
    }
    const phone = phoneIn(row);
    if (phone) {
      const d = await fetch(`/api/whatsapp/import?phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => ({}));
      patch(key, d.match ? { match: { ...d.match, byPhone: true } } : { adding: true, newPhone: phone });
    } else if (row.title) {
      patch(key, { q: row.title });
      const found = await search(key, row.title);
      if (found && !found.length) patch(key, { adding: true });
    }
  }

  async function search(key: number, q: string): Promise<Person[] | null> {
    if (q.trim().length < 2) return null;
    patch(key, { searching: true });
    const d = await fetch(`/api/whatsapp/import?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
      .then((r) => r.json())
      .catch(() => null);
    const found: Person[] | null = Array.isArray(d?.items) ? d.items : null;
    patch(key, { searching: false, found: found ?? [] });
    return found;
  }

  /** `anyway`: they were deleted from the CRM before, and they're to be added back all the same. */
  async function importRow(r: Row, anyway = false) {
    if (blocker(r) || !r.text) return;
    const us = usOf(usValue(r)) ?? null;
    const customer = r.match
      ? { enquiryId: r.match.id, phone: phoneIn(r) ?? undefined }
      : { phone: r.newPhone.trim(), name: (r.newName.trim() || nameFor(r)).slice(0, 200) };
    const body = JSON.stringify({ fileName: r.fileName, text: r.text, us, customer, anyway });
    if (new Blob([body]).size > MAX_REQUEST_BYTES) {
      patch(r.key, { error: 'This chat is too big to import in one go.' });
      return;
    }
    patch(r.key, { state: 'importing', error: undefined, deletedBefore: false });
    try {
      const res = await fetch('/api/whatsapp/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        patch(r.key, { state: 'ready', error: d.error || 'That didn’t work. Try again.' });
        return;
      }
      if (d.deletedBefore) {
        patch(r.key, { state: 'done', deletedBefore: true });
        return;
      }
      patch(r.key, { state: 'done', result: d as Result, keepError: undefined });
    } catch {
      patch(r.key, { state: 'ready', error: 'Couldn’t reach the server. Check your connection and try again.' });
      return;
    }
    // In the CRM now (or it had nothing new), so it's off the list for next time.
    if (r.saved) patch(r.key, (await forget(r.saved.id)) ? { saved: undefined } : { keepError: STILL_KEPT });
  }

  async function importAll() {
    setBusyAll(true);
    for (const r of ready) await importRow(r);
    setBusyAll(false);
  }

  /** ×: off the list, this visit and next; one that hasn't been imported is checked first. */
  async function remove(r: Row) {
    const imported = r.state === 'done' && !r.deletedBefore;
    if ((r.chat || r.saved) && !imported && !window.confirm('Remove this chat from the list? It hasn’t been imported.')) return;
    if (r.saved) {
      patch(r.key, { removing: true, error: undefined });
      if (!(await forget(r.saved.id))) {
        patch(r.key, { removing: false, error: 'Couldn’t remove it. Try again.' });
        return;
      }
    }
    release(r.key);
    setRows((rs) => rs.filter((x) => x.key !== r.key));
  }

  return (
    <section className="imp-card wai">
      <h2>WhatsApp Business app chats</h2>
      <p>
        Bring in your chats from the WhatsApp Business app on 01633 965205. WhatsApp exports one chat at a time, so
        export each customer’s chat, then choose all the files here together. Messages keep their original dates, and
        nobody is messaged. Chats you add stay here, on any computer, until you import or remove them.
      </p>
      <div className="wai-how">
        <div>
          <h3>Android</h3>
          <ol className="imp-steps">
            <li>Open the chat in WhatsApp Business.</li>
            <li>Tap ⋮ → More → Export chat.</li>
            <li>Choose Without media.</li>
            <li>Save it to your phone or Drive, or email it to yourself.</li>
          </ol>
        </div>
        <div>
          <h3>iPhone</h3>
          <ol className="imp-steps">
            <li>Open the chat and tap the customer’s name at the top.</li>
            <li>Tap Export Chat.</li>
            <li>Choose Without Media.</li>
            <li>Save to Files. It’s a .zip; choose it as it is.</li>
          </ol>
        </div>
      </div>
      <p className="wai-note">
        Replies from the CRM go from 01633 965439, not the app’s number. Until a customer messages that number, the
        first message to them has to be an approved template.
      </p>

      <label className="imp-btn wai-pick">
        Choose chat files
        <input
          type="file"
          multiple
          accept=".txt,.zip,text/plain,application/zip"
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = ''; // so the same file can be chosen again
            addFiles(files);
          }}
        />
      </label>
      {loadFailed && <p className="wai-warn wai-msg">Couldn’t load the chats saved from before. Refresh the page to try again.</p>}
      {already.length > 0 && (
        <p className="wai-hint wai-msg">
          {already.length === 1
            ? `“${already[0]}” is already on the list.`
            : `Already on the list: ${already.map((f) => `“${f}”`).join(', ')}.`}
        </p>
      )}

      {rows.length > 0 && (
        <div className="wai-rows">
          {rows.map((r) => {
            const chat = r.chat;
            const value = usValue(r);
            const why = blocker(r);
            const name = nameFor(r);
            return (
              <div key={r.key} className={`wai-row${r.state === 'done' ? ' done' : ''}`}>
                <div className="wai-row-head">
                  <div>
                    <b>{name}</b>
                    <span className="wai-file">{r.fileName}</span>
                    {r.saved && <span className="wai-saved">{savedLabel(r.saved.at, r.saved.by)}</span>}
                  </div>
                  {!busy && r.state !== 'reading' && (
                    <button type="button" className="wai-x" aria-label={`Remove ${r.fileName}`} disabled={r.removing} onClick={() => remove(r)}>
                      ×
                    </button>
                  )}
                </div>

                {r.state === 'reading' && <p className="wai-stats">{r.saving ? 'Saving…' : 'Reading…'}</p>}
                {r.state === 'error' && <p className="imp-err">{r.error}</p>}

                {chat && (
                  <>
                    <p className="wai-stats">
                      {plural(chat.messages.length, 'message')} ·{' '}
                      {dateRange(chat.messages[0].at, chat.messages[chat.messages.length - 1].at)}
                    </p>
                    {chat.warnings.map((w) => (
                      <p key={w} className="wai-warn">
                        {w}
                      </p>
                    ))}
                  </>
                )}

                {r.keepError && r.state !== 'done' && <p className="wai-warn">{r.keepError}</p>}

                {chat && (r.state === 'ready' || r.state === 'importing') && (
                  <fieldset className="wai-lock" disabled={busy}>
                    <label className="wai-field">
                      <span>Heliaxis is</span>
                      <select className="wai-input" value={value} onChange={(e) => patch(r.key, { us: e.target.value })}>
                        <option value="" disabled>
                          Choose…
                        </option>
                        {chat.authors.map((a) => (
                          <option key={a.name} value={authorValue(a.name)}>
                            {a.name} ({plural(a.count, 'message')})
                          </option>
                        ))}
                        {chat.authors.length === 1 && <option value={NONE}>Nobody here (only the customer wrote)</option>}
                      </select>
                    </label>

                    <div className="wai-field">
                      <span>Customer</span>
                      {r.match ? (
                        <span className="wai-match">
                          <b>{r.match.name}</b>
                          {r.match.phone ? ` · ${r.match.phone}` : r.match.email ? ` · ${r.match.email}` : ''}
                          {r.match.byPhone ? ' (already in the CRM with this number)' : ''}{' '}
                          <button type="button" className="wai-link" onClick={() => patch(r.key, { match: null, picked: true })}>
                            Change
                          </button>
                        </span>
                      ) : r.adding ? (
                        <span className="wai-new">
                          <input
                            className="wai-input"
                            placeholder={`Name (${name})`}
                            maxLength={200}
                            value={r.newName}
                            onChange={(e) => patch(r.key, { newName: e.target.value, picked: true })}
                          />
                          <input
                            className="wai-input"
                            type="tel"
                            inputMode="tel"
                            placeholder="Mobile, e.g. 07700 900123"
                            maxLength={40}
                            value={r.newPhone}
                            onChange={(e) => patch(r.key, { newPhone: e.target.value, picked: true })}
                          />
                          <span className="wai-hint">
                            Added as a new lead, unless someone already has this number.{' '}
                            <button type="button" className="wai-link" onClick={() => patch(r.key, { adding: false, picked: true })}>
                              Find them in the CRM instead
                            </button>
                          </span>
                        </span>
                      ) : (
                        <span className="wai-new">
                          <form
                            className="wai-search"
                            onSubmit={(e) => {
                              e.preventDefault();
                              search(r.key, r.q);
                            }}
                          >
                            <input
                              className="wai-input"
                              type="search"
                              placeholder="Name, phone or email"
                              maxLength={80}
                              value={r.q}
                              onChange={(e) => patch(r.key, { q: e.target.value, picked: true })}
                            />
                            <button type="submit" className="imp-btn-ghost" disabled={r.searching || r.q.trim().length < 2}>
                              {r.searching ? 'Searching…' : 'Search'}
                            </button>
                          </form>
                          {r.found && (
                            <ul className="wai-found">
                              {r.found.length === 0 && <li className="wai-hint">Nobody found.</li>}
                              {r.found.map((p) => (
                                <li key={p.id}>
                                  <button type="button" onClick={() => patch(r.key, { match: { ...p, byPhone: false }, picked: true })}>
                                    <b>{p.name}</b>
                                    {[p.phone, p.email, p.postcode].filter(Boolean).map((x) => ` · ${x}`).join('')}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                          <span className="wai-hint">
                            Not in the CRM?{' '}
                            <button
                              type="button"
                              className="wai-link"
                              onClick={() => patch(r.key, { adding: true, newPhone: r.newPhone || phoneIn(r) || '', picked: true })}
                            >
                              Add them as a new lead
                            </button>
                          </span>
                        </span>
                      )}
                    </div>

                    <details className="wai-preview">
                      <summary>First messages</summary>
                      {chat.messages.slice(0, 4).map((m, i) => (
                        <p key={i}>
                          <b>{m.author === usOf(value) ? `${m.author} (Heliaxis)` : m.author}:</b>{' '}
                          {m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body}
                        </p>
                      ))}
                    </details>

                    <div className="wai-actions">
                      <button type="button" className="imp-btn" disabled={!!why} onClick={() => importRow(r)}>
                        {r.state === 'importing' ? 'Importing…' : 'Import'}
                      </button>
                      {why && r.state === 'ready' && <span className="wai-hint">{why}</span>}
                    </div>
                    {r.error && r.state === 'ready' && <p className="imp-err">{r.error}</p>}
                  </fieldset>
                )}

                {r.result && (
                  <p className="imp-ok">
                    {r.result.created
                      ? `Added ${r.result.name} ${r.result.contacted ? 'to the CRM at Contacted' : 'as a new lead'}`
                      : `Matched ${r.result.name}${r.result.contacted ? ', moved to Contacted' : ''}`}{' '}
                    ·{' '}
                    {plural(r.result.imported, 'message')} imported
                    {r.result.duplicates ? ` · ${plural(r.result.duplicates, 'was', 'were')} already there` : ''}
                    {r.result.skipped ? ` · ${r.result.skipped.toLocaleString('en-GB')} left out (deleted, or from someone else)` : ''}
                    {' · '}
                    <Link href={`/admin/enquiries/inbox/${r.result.enquiryId}`}>Open the chat</Link>
                  </p>
                )}
                {r.result?.note && <p className="wai-warn">{r.result.note}</p>}
                {r.deletedBefore && (
                  <p className="wai-warn">
                    Deleted before, skipped: you deleted this customer from the CRM, so their old chat doesn’t bring them
                    back.{' '}
                    <button type="button" className="wai-link" disabled={busy} onClick={() => importRow({ ...r, state: 'ready' }, true)}>
                      Import anyway
                    </button>
                  </p>
                )}
                {r.keepError && r.state === 'done' && <p className="wai-warn">{r.keepError}</p>}
                {r.error && r.state === 'done' && <p className="imp-err">{r.error}</p>}
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 1 && (
        <div className="wai-actions">
          <button type="button" className="imp-btn" disabled={busy || !ready.length} onClick={importAll}>
            {busyAll ? 'Importing…' : `Import all ready (${ready.length})`}
          </button>
        </div>
      )}
    </section>
  );
}

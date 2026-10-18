'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
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
import { toWaId } from '@/lib/whatsapp/shared';
import './wa-import.css';

/**
 * Chats exported from the WhatsApp Business app, one file per customer. Each file is read here in
 * the browser to show who it's with; the server reads it again before saving (/api/whatsapp/import).
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
  adding: boolean;
  newName: string;
  newPhone: string;
  q: string;
  found: Person[] | null;
  searching: boolean;
  result?: Result;
};

/** "Heliaxis is: nobody here" (we never replied to this one). */
const NONE = 'none';
/** Vercel turns away request bodies over 4.5 MB. */
const MAX_REQUEST_BYTES = 4_400_000;

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

export function WhatsAppImport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busyAll, setBusyAll] = useState(false);
  const nextKey = useRef(1);

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

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

  async function addFiles(files: File[]) {
    for (const file of files) {
      const key = nextKey.current++;
      const base: Row = {
        key,
        fileName: file.name,
        state: 'reading',
        title: nameFromFileName(file.name),
        match: null,
        adding: false,
        newName: '',
        newPhone: '',
        q: '',
        found: null,
        searching: false,
      };
      setRows((rs) => [...rs, base]);
      let row: Row;
      try {
        const { text, inner } = await readChatFile(file);
        if (text.length > MAX_CHAT_CHARS) throw new Error('This chat is too big to import in one go.');
        const chat = parseChatExport(text);
        if (!chat.messages.length) throw new Error(chat.warnings[0] || 'No messages found in this file.');
        row = { ...base, state: 'ready', text, chat, title: base.title ?? (inner ? nameFromFileName(inner) : null) };
      } catch (e) {
        patch(key, { state: 'error', error: e instanceof Error ? e.message : 'Couldn’t read this file.' });
        continue;
      }
      patch(key, row);

      // Saved under a number: look for whoever has it. Otherwise suggest people with the same name.
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

  async function importRow(r: Row) {
    if (blocker(r) || !r.text) return;
    const us = usOf(usValue(r)) ?? null;
    const customer = r.match
      ? { enquiryId: r.match.id, phone: phoneIn(r) ?? undefined }
      : { phone: r.newPhone.trim(), name: (r.newName.trim() || nameFor(r)).slice(0, 200) };
    const body = JSON.stringify({ fileName: r.fileName, text: r.text, us, customer });
    if (new Blob([body]).size > MAX_REQUEST_BYTES) {
      patch(r.key, { error: 'This chat is too big to import in one go.' });
      return;
    }
    patch(r.key, { state: 'importing', error: undefined });
    try {
      const res = await fetch('/api/whatsapp/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        patch(r.key, { state: 'ready', error: d.error || 'That didn’t work. Try again.' });
        return;
      }
      patch(r.key, { state: 'done', result: d as Result });
    } catch {
      patch(r.key, { state: 'ready', error: 'Couldn’t reach the server. Check your connection and try again.' });
    }
  }

  async function importAll() {
    setBusyAll(true);
    for (const r of ready) await importRow(r);
    setBusyAll(false);
  }

  return (
    <section className="imp-card wai">
      <h2>WhatsApp Business app chats</h2>
      <p>
        Bring in your chats from the WhatsApp Business app on 01633 965205. WhatsApp exports one chat at a time, so
        export each customer’s chat, then choose all the files here together. Messages keep their original dates, and
        nobody is messaged.
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
                  </div>
                  {!busy && (
                    <button
                      type="button"
                      className="wai-x"
                      aria-label={`Remove ${r.fileName}`}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    >
                      ×
                    </button>
                  )}
                </div>

                {r.state === 'reading' && <p className="wai-stats">Reading…</p>}
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

                {chat && r.state !== 'done' && (
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
                          <button type="button" className="wai-link" onClick={() => patch(r.key, { match: null })}>
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
                            onChange={(e) => patch(r.key, { newName: e.target.value })}
                          />
                          <input
                            className="wai-input"
                            type="tel"
                            inputMode="tel"
                            placeholder="Mobile, e.g. 07700 900123"
                            maxLength={40}
                            value={r.newPhone}
                            onChange={(e) => patch(r.key, { newPhone: e.target.value })}
                          />
                          <span className="wai-hint">
                            Added as a new lead, unless someone already has this number.{' '}
                            <button type="button" className="wai-link" onClick={() => patch(r.key, { adding: false })}>
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
                              onChange={(e) => patch(r.key, { q: e.target.value })}
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
                                  <button type="button" onClick={() => patch(r.key, { match: { ...p, byPhone: false } })}>
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
                              onClick={() => patch(r.key, { adding: true, newPhone: r.newPhone || phoneIn(r) || '' })}
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
                    {r.result.created ? `Added ${r.result.name} as a new lead` : `Matched ${r.result.name}`} ·{' '}
                    {plural(r.result.imported, 'message')} imported
                    {r.result.duplicates ? ` · ${plural(r.result.duplicates, 'was', 'were')} already there` : ''}
                    {r.result.skipped ? ` · ${r.result.skipped.toLocaleString('en-GB')} left out (deleted, or from someone else)` : ''}
                    {' · '}
                    <Link href={`/admin/enquiries/inbox/${r.result.enquiryId}`}>Open the chat</Link>
                  </p>
                )}
                {r.result?.note && <p className="wai-warn">{r.result.note}</p>}
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

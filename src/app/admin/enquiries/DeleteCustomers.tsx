'use client';

import { useEffect, useState } from 'react';

/**
 * Admins: the "Delete customers" confirmation on Enquiries. Asks the server what would go
 * (/api/enquiries/delete with preview), lists it, keeps anyone with a signed quote, paid deposit or
 * purchase order sent to a supplier unless ticked, and wants DELETE typed for more than 5 at once. One customer is deleted with
 * DELETE /api/enquiries/[id], more with the bulk POST, 200 at a time (src/lib/crm/delete-customer.ts).
 */

type Counts = { opportunities: number; tasks: number; photos: number; documents: number; signatures: number; messages: number; emails: number };
type Person = { id: string; name: string; signed: boolean; paid: boolean; ordered?: boolean; signed_off?: boolean };
type Preview = {
  customers: Person[];
  gone: number;
  counts: { all: Counts; withoutSigned: Counts };
  sameNumber: { name: string; other: string }[];
  importsSkip: boolean;
};
export type DeleteDone = { deleted: number; kept: number; errors: string[]; filesFailed: number; remembered: boolean };

const API = '/api/enquiries/delete';
const BATCH = 200;
const TYPE_OVER = 5;
const SHOW = 8; // names listed before "and n more"

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
const first = (name: string) => name.trim().split(/\s+/)[0] || name;
const list = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);
const what = (p: Person) =>
  list([p.signed && 'a signed quote', p.paid && 'a paid deposit', p.ordered && 'a purchase order sent to a supplier', p.signed_off && 'trade sign-offs and certificates'].filter((x): x is string => !!x));
/** Kept unless ticked: a signed quote, a paid deposit, kit ordered for them, or a trade's signed work on site. */
const isHeld = (p: Person) => p.signed || p.paid || !!p.ordered || !!p.signed_off;

async function send(url: string, init: RequestInit): Promise<{ ok: boolean; d: Record<string, unknown> }> {
  try {
    const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
    return { ok: r.ok, d: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, d: { error: 'Couldn’t reach the server. Check your connection and try again.' } };
  }
}

const sumCounts = (a: Counts, b: Counts): Counts => ({
  opportunities: a.opportunities + b.opportunities,
  tasks: a.tasks + b.tasks,
  photos: a.photos + b.photos,
  documents: a.documents + b.documents,
  signatures: a.signatures + b.signatures,
  messages: a.messages + b.messages,
  emails: a.emails + b.emails,
});

async function loadPreview(ids: string[]): Promise<Preview | string> {
  let out: Preview | null = null;
  for (let i = 0; i < ids.length; i += BATCH) {
    const { ok, d } = await send(API, { method: 'POST', body: JSON.stringify({ ids: ids.slice(i, i + BATCH), preview: true }) });
    if (!ok) return String(d.error || 'Couldn’t check what they have. Try again.');
    const p = d as unknown as Preview;
    out = out
      ? {
          customers: [...out.customers, ...p.customers],
          gone: out.gone + p.gone,
          counts: { all: sumCounts(out.counts.all, p.counts.all), withoutSigned: sumCounts(out.counts.withoutSigned, p.counts.withoutSigned) },
          sameNumber: [...out.sameNumber, ...p.sameNumber],
          importsSkip: out.importsSkip && p.importsSkip,
        }
      : p;
  }
  return out ?? 'Nothing to delete.';
}

/** "their details and timeline, their WhatsApp chat (12 messages), 2 opportunities, 3 photos and 1 signature" */
function removes(c: Counts, many: boolean) {
  return list(
    [
      'their details and timeline',
      c.messages ? `their WhatsApp ${many ? 'chats' : 'chat'} (${plural(c.messages, 'message')})` : '',
      c.emails ? plural(c.emails, 'email') : '',
      c.opportunities ? plural(c.opportunities, 'opportunity', 'opportunities') : '',
      c.tasks ? `${plural(c.tasks, 'task')} on ${c.opportunities === 1 ? 'it' : 'them'}` : '',
      c.photos ? plural(c.photos, 'photo') : '',
      c.documents ? plural(c.documents, 'document') : '',
      c.signatures ? plural(c.signatures, 'signature') : '',
    ].filter(Boolean)
  );
}

export function DeleteCustomers({
  ids,
  name,
  onClose,
  onDone,
}: {
  ids: string[];
  /** The customer's name while the details load (one customer). */
  name?: string;
  onClose: () => void;
  onDone: (r: DeleteDone) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [include, setInclude] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    loadPreview(ids).then((p) => {
      if (!live) return;
      if (typeof p === 'string') setLoadError(p);
      else setPreview(p);
    });
    return () => {
      live = false;
    };
  }, [ids]);

  const one = ids.length === 1;
  const people = preview?.customers ?? [];
  const held = people.filter(isHeld);
  const going = include ? people : people.filter((p) => !isHeld(p));
  // One customer: what goes with them, even before the tick. Several: only those that will go.
  const counts = preview ? (include || one ? preview.counts.all : preview.counts.withoutSigned) : null;
  const needType = going.length > TYPE_OVER;
  const typedOk = typed.trim().toUpperCase() === 'DELETE';
  const title = one
    ? `Delete ${people[0]?.name || name || 'this customer'}?`
    : `Delete ${plural(people.length || ids.length, 'customer')}?`;

  async function run() {
    if (!going.length || (needType && !typedOk)) return;
    setBusy(true);
    setError([]);
    const done: DeleteDone = { deleted: 0, kept: people.length - going.length, errors: [], filesFailed: 0, remembered: true };
    const add = (d: Record<string, unknown>) => {
      done.deleted += Number(d.deleted) || 0;
      done.filesFailed += Number((d.files as { failed?: number } | undefined)?.failed) || 0;
      if (d.remembered === false) done.remembered = false;
      for (const e of (d.errors as { name: string | null; error: string }[] | undefined) ?? []) {
        done.errors.push(e.name && !e.error.includes(e.name) ? `${e.name}: ${e.error}` : e.error);
      }
    };
    if (one) {
      const { ok, d } = await send(`/api/enquiries/${going[0].id}${include ? '?include_signed=1' : ''}`, { method: 'DELETE' });
      if (ok || Array.isArray(d.errors)) add(d);
      else done.errors.push(String(d.error || 'That didn’t work. Try again.'));
    } else {
      const goingIds = going.map((p) => p.id);
      for (let i = 0; i < goingIds.length; i += BATCH) {
        const { ok, d } = await send(API, { method: 'POST', body: JSON.stringify({ ids: goingIds.slice(i, i + BATCH), includeSigned: include }) });
        if (ok) add(d);
        else {
          done.errors.push(String(d.error || 'That didn’t work. Try again.'));
          break;
        }
      }
    }
    setBusy(false);
    // Nothing went: say why here, so they can try again.
    if (!done.deleted && done.errors.length) setError(done.errors);
    else onDone(done);
  }

  return (
    <div className="enq-modal" role="dialog" aria-modal="true" aria-labelledby="enq-del-title" onClick={() => !busy && onClose()}>
      <div className="enq-modalbox enq-del" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="enq-close" aria-label="Close" disabled={busy} onClick={onClose}>
          ×
        </button>
        <h2 id="enq-del-title">{title}</h2>

        {!preview && !loadError && <p className="enq-sub">Checking what they have…</p>}
        {loadError && <p className="enq-del-err">{loadError}</p>}

        {preview && (
          <>
            {!one && people.length > 0 && (
              <p className="enq-del-names">
                {people
                  .slice(0, SHOW)
                  .map((p) => p.name)
                  .join(', ')}
                {people.length > SHOW ? ` and ${plural(people.length - SHOW, 'other')}` : ''}
              </p>
            )}
            {preview.gone > 0 && (
              <p className="enq-sub">
                {one ? 'They’ve already been deleted.' : `${plural(preview.gone, 'customer has', 'customers have')} already been deleted.`}
              </p>
            )}

            {counts && people.length > 0 && (one || going.length > 0) && (
              <p className="enq-del-what">
                This removes {removes(counts, !one && going.length > 1)}. <b>This can’t be undone.</b>
              </p>
            )}

            {held.length > 0 && (
              <div className="enq-del-warn">
                {held.slice(0, SHOW).map((p) => (
                  <p key={p.id}>
                    <b>{first(p.name)}</b> has {what(p)}: you may need to keep these records.
                  </p>
                ))}
                {held.length > SHOW && <p>And {plural(held.length - SHOW, 'other')}.</p>}
                <label className="enq-del-tick">
                  <input type="checkbox" checked={include} disabled={busy} onChange={(e) => setInclude(e.target.checked)} />
                  {one ? `Delete ${first(held[0].name)} anyway` : `Delete ${held.length === 1 ? first(held[0].name) : `these ${held.length}`} too`}
                </label>
                {!one && !include && <p className="enq-del-hint">Unticked, they’re kept and only the others are deleted.</p>}
              </div>
            )}

            {preview.sameNumber.map((s) => (
              <p key={`${s.name}-${s.other}`} className="enq-sub">
                {s.name} has the same WhatsApp number as {s.other}, who isn’t being deleted. WhatsApp messages and emails
                saved on {s.name}’s record go with it; {s.other}’s stay.
              </p>
            ))}

            {!preview.importsSkip && going.length > 0 && (
              <p className="enq-del-note">
                Imports can’t skip deleted people yet: run <b>deleted-customers.sql</b> in Supabase (it’s on your From
                Claude list). Until then, importing from Meta or WhatsApp again could bring them back.
              </p>
            )}

            {needType && (
              <label className="enq-del-type">
                <span>
                  Type <b>DELETE</b> to confirm
                </span>
                <input
                  value={typed}
                  disabled={busy}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setTyped(e.target.value)}
                />
              </label>
            )}
          </>
        )}

        {error.length > 0 && (
          <ul className="enq-del-err">
            {error.slice(0, 5).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <div className="enq-actions">
          <button type="button" className="enq-btn" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="enq-btn enq-btn-danger"
            disabled={busy || !going.length || (needType && !typedOk)}
            onClick={run}
          >
            {busy ? 'Deleting…' : one ? 'Delete customer' : `Delete ${plural(preview ? going.length : ids.length, 'customer')}`}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import '../crm.css';

type Customer = {
  id: string;
  name: string;
  phone: string;
  postcode: string | null;
  email: boolean;
  job: { id: string; title: string | null; stage: string; created_at: string };
};
type Settings = { requireOptIn: boolean; changedAt: string | null; changedBy: string | null };
/** count: still to check (the list); affected: open-job customers the rule would stop, including those marked Not asked. */
type Data = { ready: boolean; settings: Settings; customers: Customer[]; count: number; affected: number; email: boolean; isAdmin: boolean };

const CSS = `
.wap-list{list-style:none;margin:.4rem 0 0;padding:0}
.wap-row{display:flex;justify-content:space-between;align-items:center;gap:.8rem;padding:.75rem 0;border-top:1px solid var(--border)}
.wap-who{display:flex;flex-direction:column;gap:2px;min-width:0}
.wap-who b{font-size:1rem}
.wap-who span,.wap-who a{font-size:.82rem;color:var(--muted);overflow-wrap:anywhere}
.wap-who a{color:var(--accent-text);font-weight:600;text-decoration:none}
.wap-btns{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;flex:0 0 auto}
.wap-btns .crm-btn,.wap-rule .crm-btn,.wap-toast .crm-btn{min-height:48px}
.wap-rule-state{display:inline-block;font-weight:800;font-size:.8rem;letter-spacing:.04em;text-transform:uppercase;padding:.15rem .5rem;border-radius:999px;background:rgb(var(--fg-rgb) / .08);margin-left:.4rem;vertical-align:middle}
.wap-rule-state.on{background:rgb(var(--ok-rgb) / .15);color:var(--ok)}
.wap-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.7rem}
.wap-toast{position:sticky;bottom:calc(76px + env(safe-area-inset-bottom));display:flex;align-items:center;justify-content:space-between;gap:.6rem;background:var(--moment);color:var(--moment-text);border-radius:10px;padding:.5rem .6rem .5rem .9rem;margin-top:1rem;font-size:.9rem;z-index:5}
.wap-toast .crm-btn{background:transparent;border-color:var(--accent);color:var(--accent)}
@media(max-width:640px){
  .wap-row{flex-direction:column;align-items:stretch}
  .wap-btns{width:100%}
}
/* The undo toast stays ink on dark too, edged so it stands off the page. */
@media screen{
  :root[data-theme='dark'] .wap-toast{box-shadow:0 0 0 1px var(--border),var(--shadow)}
}
`;

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
const people = (n: number) => `${n} customer${n === 1 ? '' : 's'}`;

export function WaPermissionView({ isAdmin, ready }: { isAdmin: boolean; ready: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRule, setConfirmRule] = useState(false);
  const [undo, setUndo] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch('/api/crm/whatsapp-permission', { cache: 'no-store' }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    if (!r?.ok || !d) {
      setErr(d?.error || 'Couldn’t load the list. Check your signal and try again.');
      return;
    }
    setErr('');
    setData(d as Data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch('/api/crm/whatsapp-permission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) throw new Error(d.error || 'Not saved. Check your signal and try again.');
    return d;
  }

  async function record(c: Customer, action: 'agreed' | 'not_asked') {
    setBusy(c.id);
    setErr('');
    try {
      await post({ action, enquiryId: c.id });
      setData((cur) =>
        cur
          ? {
              ...cur,
              customers: cur.customers.filter((x) => x.id !== c.id),
              count: Math.max(0, cur.count - 1),
              // Not asked takes them off the list, but the rule would still stop them.
              affected: action === 'agreed' ? Math.max(0, cur.affected - 1) : cur.affected,
            }
          : cur
      );
      setUndo({ id: c.id, text: action === 'agreed' ? `${c.name}: agreed` : `${c.name}: not asked yet` });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(null);
    }
  }

  async function undoLast() {
    if (!undo) return;
    setBusy(undo.id);
    try {
      await post({ action: 'undo', enquiryId: undo.id });
      setUndo(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Couldn’t undo');
    } finally {
      setBusy(null);
    }
  }

  async function setRule(on: boolean) {
    setBusy('rule');
    setErr('');
    try {
      const d = await post({ action: 'rule', requireOptIn: on });
      setData((cur) => (cur ? { ...cur, settings: d.settings as Settings } : cur));
      setConfirmRule(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(null);
    }
  }

  const on = !!data?.settings.requireOptIn;
  // Off the list but still not agreed (everyone the rule would stop who isn't on the list).
  const notAsked = data ? Math.max(0, data.affected - data.count) : 0;
  const notAskedNote = notAsked ? ` (${notAsked} of them marked Not asked)` : '';
  // What happens instead of WhatsApp (automation.ts sends the same message by email when it can).
  const wouldEmail = data?.email ? 'they’d get an email instead, if we have their email address' : 'they’d get email once Microsoft 365 is connected';
  const willEmail = data?.email ? 'they get an email instead, if we have their email address' : 'they’ll get email once Microsoft 365 is connected';

  return (
    <div className="crm" style={{ maxWidth: 760 }}>
      <style>{CSS}</style>
      <Link href="/admin/crm" className="crm-back">
        ← CRM
      </Link>
      <div className="crm-head">
        <div>
          <h1>WhatsApp permission</h1>
          <p>Who’s agreed to automatic WhatsApp messages from us (reminders, follow-ups, quick replies).</p>
        </div>
      </div>

      {!ready && (
        <p className="crm-banner">
          Run <b>crm-v3.sql</b> in Supabase first (it’s on your to-do list). This page works once it’s done.
        </p>
      )}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}

      {!data ? (
        !err && <p className="crm-muted">Loading…</p>
      ) : (
        <>
          <section className="crm-set wap-rule">
            <h2>
              Only send automatic WhatsApps to customers who’ve agreed
              <span className={on ? 'wap-rule-state on' : 'wap-rule-state'}>{on ? 'On' : 'Off'}</span>
            </h2>
            {on ? (
              <p className="crm-muted">
                Customers who haven’t agreed get no automatic WhatsApps; {willEmail}. You can still message anyone by hand.
              </p>
            ) : !data.ready ? (
              <p className="crm-muted">Once crm-v3.sql is run, this shows how many customers with open jobs would stop getting reminders by WhatsApp.</p>
            ) : data.affected > 0 ? (
              <p className="crm-muted">
                Right now {people(data.affected)} with open jobs {data.affected === 1 ? 'hasn’t' : 'haven’t'} agreed to WhatsApp
                messages{notAskedNote}. If you switch this on, they’d stop getting reminders by WhatsApp ({wouldEmail}). Check the
                list below first.
              </p>
            ) : (
              <p className="crm-muted">Everyone with an open job has agreed to WhatsApp messages, so switching this on wouldn’t stop anyone’s reminders.</p>
            )}
            <p className="crm-muted crm-small">
              Anyone who replies STOP never gets automatic WhatsApps, whether this is on or off. START turns them back on.
              {data.settings.changedAt && data.settings.changedBy ? ` Last changed by ${data.settings.changedBy} on ${day(data.settings.changedAt)}.` : ''}
            </p>
            {data.isAdmin && isAdmin && data.ready ? (
              confirmRule ? (
                <div className="wap-actions">
                  <button type="button" className="crm-btn crm-btn--solar" disabled={busy === 'rule'} onClick={() => setRule(!on)}>
                    {on ? 'Yes, switch it off' : 'Yes, switch it on'}
                  </button>
                  <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setConfirmRule(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="wap-actions">
                  <button type="button" className="crm-btn" onClick={() => setConfirmRule(true)}>
                    {on ? 'Switch off' : 'Switch on'}
                  </button>
                </div>
              )
            ) : (
              <p className="crm-muted crm-small">Only admins can change this.</p>
            )}
            {confirmRule && !on && data.affected > 0 && (
              <p className="crm-banner">
                {people(data.affected)} would stop getting automatic WhatsApps until they agree{notAskedNote}.
              </p>
            )}
          </section>

          {data.ready && (
            <section className="crm-set">
              <h2>Open jobs to check ({data.count})</h2>
              <p className="crm-muted crm-small">
                Tap <b>They agreed</b> if they messaged you first, ticked the box on the website, or said yes on the phone.{' '}
                <b>Not asked</b> takes them off this list without giving permission: with the rule on, they still get no automatic
                WhatsApps until they agree.
              </p>
              {data.customers.length === 0 ? (
                <div className="crm-emptystate">
                  <b>Nothing to check</b>
                  <p>
                    You’ve been through everyone with an open job.
                    {notAsked ? ` ${people(notAsked)} marked Not asked still ${notAsked === 1 ? 'hasn’t' : 'haven’t'} agreed.` : ''}
                  </p>
                </div>
              ) : (
                <ul className="wap-list">
                  {data.customers.map((c) => (
                    <li key={c.id} className="wap-row">
                      <div className="wap-who">
                        <b>{c.name}</b>
                        <span>
                          {c.phone}
                          {c.postcode ? ` · ${c.postcode}` : ''}
                          {c.email ? '' : ' · no email address'}
                        </span>
                        <Link href={`/admin/crm/${c.job.id}`}>
                          {c.job.title || 'Job'} · {c.job.stage} · {day(c.job.created_at)}
                        </Link>
                      </div>
                      <div className="wap-btns">
                        <button type="button" className="crm-btn crm-btn--solar" disabled={busy === c.id} onClick={() => record(c, 'agreed')}>
                          They agreed
                        </button>
                        <button type="button" className="crm-btn crm-btn--ghost" disabled={busy === c.id} onClick={() => record(c, 'not_asked')}>
                          Not asked
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {data.count > data.customers.length && (
                <p className="crm-muted crm-small">Showing the newest {data.customers.length}. The rest appear as you go.</p>
              )}
            </section>
          )}

          {undo && (
            <div className="wap-toast hx-moment" role="status">
              <span>{undo.text}</span>
              <button type="button" className="crm-btn crm-btn--small" disabled={busy === undo.id} onClick={undoLast}>
                Undo
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

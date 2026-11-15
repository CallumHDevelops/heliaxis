'use client';

import { useEffect, useState } from 'react';
import { googleReviewFromPlaceId, type ReviewRequestRow, type ReviewSettings } from '@/lib/reviews/shared';
import '../crm/crm.css';
import './reviews.css';

type Row = ReviewRequestRow & { customer: string };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' }) : '');
const CHANNEL: Record<string, string> = { email: 'Email', sms: 'Text', whatsapp: 'WhatsApp', link: 'Link' };

/** CRM › Reviews. */
export function ReviewsAdmin({ admin }: { admin: boolean }) {
  const [s, setS] = useState<ReviewSettings | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [place, setPlace] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [now] = useState(() => Date.now());

  useEffect(() => {
    void fetch('/api/crm/reviews/settings', { cache: 'no-store' }).then((r) => r.json()).then(setS).catch(() => null);
    void fetch('/api/crm/reviews', { cache: 'no-store' })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => (ok ? setRows((d.requests ?? []) as Row[]) : setErr(d.missing ? 'Reviews aren’t set up yet (supabase/review-requests.sql).' : d.error || 'Couldn’t load the requests.')));
  }, []);

  async function save() {
    if (!s) return;
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/crm/reviews/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) {
      setS(d as ReviewSettings);
      setMsg('Saved.');
    } else setMsg(d.error || 'Not saved.');
  }

  const recent = (rows ?? []).filter((r) => now - Date.parse(r.sent_at) < 90 * 86_400_000);
  const count = (f: (r: Row) => unknown) => recent.filter(f).length;
  const set = (k: keyof ReviewSettings, v: string) => setS((x) => (x ? { ...x, [k]: v } : x));

  return (
    <div className="rvw-page">
      <header>
        <h1>Reviews</h1>
        <p className="crm-muted">Ask customers for a review by email, text or WhatsApp from their record (the + button, “Ask for a review”). Everyone gets the same link and the same choices: Google, Trustpilot or private feedback.</p>
      </header>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}

      <section className="rvw-card">
        <h2>Your review links</h2>
        {!s ? (
          <p className="crm-muted">Loading…</p>
        ) : (
          <>
            <div className="rvw-field">
              <label htmlFor="rv-g">Google review link</label>
              <input id="rv-g" className="crm-input" disabled={!admin} value={s.googleUrl} onChange={(e) => set('googleUrl', e.target.value)} placeholder="https://g.page/r/…/review" />
              <small className="crm-muted">In your Google Business Profile choose “Ask for reviews” and copy the link. Or paste your Place ID here and use it:</small>
              <div className="rvw-inline">
                <input className="crm-input" disabled={!admin} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place ID, e.g. ChIJ…" aria-label="Google Place ID" />
                <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!admin || !place.trim()} onClick={() => { set('googleUrl', googleReviewFromPlaceId(place)); setPlace(''); }}>
                  Make the link
                </button>
              </div>
            </div>
            <div className="rvw-field">
              <label htmlFor="rv-t">Trustpilot review link</label>
              <input id="rv-t" className="crm-input" disabled={!admin} value={s.trustpilotUrl} onChange={(e) => set('trustpilotUrl', e.target.value)} placeholder="https://www.trustpilot.com/evaluate/heliaxis.co.uk" />
              <small className="crm-muted">It is usually https://www.trustpilot.com/evaluate/ followed by your website address.</small>
            </div>
            <div className="rvw-field">
              <label htmlFor="rv-es">Email subject</label>
              <input id="rv-es" className="crm-input" disabled={!admin} value={s.emailSubject} onChange={(e) => set('emailSubject', e.target.value)} />
            </div>
            <div className="rvw-field">
              <label htmlFor="rv-eb">Email wording</label>
              <textarea id="rv-eb" className="crm-input" rows={6} disabled={!admin} value={s.emailBody} onChange={(e) => set('emailBody', e.target.value)} />
              <small className="crm-muted">The button with their link is added under it. Use {'{first}'} for their first name.</small>
            </div>
            <div className="rvw-field">
              <label htmlFor="rv-sms">Text and WhatsApp wording</label>
              <textarea id="rv-sms" className="crm-input" rows={3} disabled={!admin} value={s.smsText} onChange={(e) => set('smsText', e.target.value)} />
              <small className="crm-muted">Keep {'{link}'} in it. Use {'{first}'} for their first name.</small>
            </div>
            <div className="rvw-rules">
              <b>Keep to these so reviews stay valid</b>
              <ul>
                <li>Ask everyone, not just customers you expect to be happy, and don’t ask “if you’re happy”.</li>
                <li>Don’t offer a gift or discount for a Google or Trustpilot review. Both platforms forbid it.</li>
                <li>Reply to every review, good or bad, politely and specifically.</li>
              </ul>
            </div>
            {admin ? (
              <div className="crm-actions">
                <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={() => void save()}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
                {msg && <span className="crm-small">{msg}</span>}
              </div>
            ) : (
              <small className="crm-muted">Only an admin can change these.</small>
            )}
          </>
        )}
      </section>

      <section className="rvw-card">
        <h2>Requests</h2>
        {rows && (
          <div className="rvw-stats">
            <div><b>{recent.length}</b><span>sent, last 90 days</span></div>
            <div><b>{count((r) => r.opened_at)}</b><span>opened</span></div>
            <div><b>{count((r) => r.clicked_google_at)}</b><span>pressed Google</span></div>
            <div><b>{count((r) => r.clicked_trustpilot_at)}</b><span>pressed Trustpilot</span></div>
            <div><b>{count((r) => r.feedback)}</b><span>private feedback</span></div>
          </div>
        )}
        <p className="crm-muted crm-small" style={{ margin: 0 }}>“Pressed” means they went on to the site. We can’t see whether they then posted a review: your Google and Trustpilot pages show that.</p>
        {rows && rows.length === 0 && <p className="crm-muted">No requests yet.</p>}
        {rows && rows.length > 0 && (
          <ul className="rvw-list">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="rvw-row">
                  <b>{r.customer || 'Customer'}</b>
                  <span className="crm-muted">{CHANNEL[r.channel]} · {when(r.sent_at)}</span>
                  <span className="rvw-chips">
                    {r.opened_at && <i>Opened</i>}
                    {r.clicked_google_at && <i>Google</i>}
                    {r.clicked_trustpilot_at && <i>Trustpilot</i>}
                    {r.feedback && <i className="is-fb">Feedback</i>}
                  </span>
                </div>
                {r.feedback && <p className="rvw-fb">{r.feedback}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

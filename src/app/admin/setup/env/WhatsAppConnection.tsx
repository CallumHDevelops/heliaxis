'use client';

import { useCallback, useEffect, useState } from 'react';
import { CopyButton } from '@/components/admin/CopyButton';
import type { ConnectionReport, PhoneInfo } from '@/lib/whatsapp/connection';

type Tone = 'ok' | 'warn' | 'bad';
type Action = 'register' | 'subscribe';

/**
 * Plain-English status for the number. platform_type says whether it's on the Cloud API at all
 * (WhatsApp Manager shows an unregistered number as "Offline"); the status text alone can mislead.
 */
function verdict(p: PhoneInfo): { tone: Tone; text: string } {
  const s = (p.status || '').toUpperCase();
  if (s === 'CONNECTED') return { tone: 'ok', text: 'Connected. Ready to send and receive.' };
  if (p.platform === 'NOT_APPLICABLE' || s === 'OFFLINE' || s === 'DISCONNECTED')
    return { tone: 'bad', text: 'Not on the WhatsApp API yet (WhatsApp Manager shows this as “Offline”).' };
  if (s === 'PENDING')
    return p.platform === 'CLOUD_API'
      ? { tone: 'warn', text: 'Pending. It’s registered and Meta is finishing setup, so check again in a few minutes.' }
      : { tone: 'warn', text: 'Pending. Not on the API yet, or Meta is finishing setup if you’ve just connected it.' };
  if (s === 'FLAGGED' || s === 'RESTRICTED' || s === 'BANNED')
    return { tone: 'bad', text: `${p.status}. Check WhatsApp Manager → Phone numbers for Meta’s message.` };
  return { tone: 'warn', text: p.status ? `Meta says: ${p.status}` : 'Meta didn’t give a status.' };
}

export function WhatsAppConnection() {
  const [r, setR] = useState<ConnectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [notOnPhone, setNotOnPhone] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [msg, setMsg] = useState<{ action: Action; tone: 'ok' | 'bad'; text: string } | null>(null);

  // State is only set once the request comes back (the first load starts as loading).
  const fetchReport = useCallback(
    () =>
      fetch('/api/setup/whatsapp', { cache: 'no-store' })
        .then((res) => res.json().then((d) => (res.ok ? (setR(d), setError('')) : setError(d.error || 'Couldn’t check'))))
        .catch(() => setError('Couldn’t reach the server'))
        .finally(() => setLoading(false)),
    []
  );
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);
  const load = () => {
    setLoading(true);
    setMsg(null);
    return fetchReport();
  };

  async function act(action: Action) {
    setBusy(action);
    setMsg(null);
    const res = await fetch('/api/setup/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'register' ? { action, pin, notOnPhone } : { action }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : null;
    setBusy(null);
    if (!res) return setMsg({ action, tone: 'bad', text: 'Couldn’t reach the server. Check your connection.' });
    if (res.ok) {
      setPin('');
      setLoading(true);
      await fetchReport();
      setMsg({ action, tone: 'ok', text: action === 'register' ? 'Registered. Keep that PIN safe.' : 'Done. The app is subscribed to this account.' });
    } else setMsg({ action, tone: 'bad', text: d?.error || 'Meta didn’t accept that.' });
  }

  const note = (action: Action) =>
    msg?.action === action ? (
      <p role="status" className={msg.tone === 'ok' ? 'wa-c-ok' : 'wa-c-bad'}>
        {msg.text}
      </p>
    ) : null;

  if (loading && !r) return <p className="su-muted">Checking with Meta…</p>;
  if (error && !r) return <p className="wa-c-bad">{error}</p>;
  if (!r) return null;
  if (!r.env.token) return <p className="su-muted">Add WHATSAPP_TOKEN in Vercel (and redeploy) to check the connection.</p>;

  const v = r.phone ? verdict(r.phone) : null;
  const connected = (r.phone?.status || '').toUpperCase() === 'CONNECTED';
  const disabled = busy !== null || loading;
  const apps = r.subscribedApps;
  const registerHint = !notOnPhone ? 'Tick the box above first.' : pin.length !== 6 ? 'Enter a 6-digit PIN.' : '';

  return (
    <div className="wa-c">
      <h3>Live check with Meta</h3>

      {!r.env.phoneId ? (
        <p className="su-muted">No WHATSAPP_PHONE_NUMBER_ID yet. Copy it from the numbers below.</p>
      ) : r.phone ? (
        <div className={`wa-c-card is-${v!.tone}`}>
          <b>
            {r.phone.display || r.env.phoneId} {r.phone.name ? `· ${r.phone.name}` : ''}
          </b>
          <span>{v!.text}</span>
          {r.phone.nameStatus && r.phone.nameStatus !== 'APPROVED' && (
            <small>Display name: {r.phone.nameStatus.replace(/_/g, ' ').toLowerCase()}</small>
          )}
        </div>
      ) : (
        <p className="wa-c-bad">Meta couldn’t find WHATSAPP_PHONE_NUMBER_ID ({r.env.phoneId}): {r.phoneError}</p>
      )}

      {r.env.wabaId && (
        <div className="wa-c-sub">
          {apps === null ? (
            <p className="wa-c-bad">Couldn’t check the account’s webhooks ({r.env.wabaId}): {r.subscribedError}</p>
          ) : apps.length ? (
            <p>
              Apps receiving this account’s messages: <b>{apps.map((a) => a.name || a.id || 'unnamed app').join(', ')}</b>.
              {connected ? '' : ' Messages only flow once the number is connected.'}
            </p>
          ) : (
            <p>
              <b>No app receives this account’s messages yet.</b> Connect it so incoming WhatsApps reach Heliaxis.
            </p>
          )}
          <button type="button" className="su-btn" disabled={disabled} onClick={() => act('subscribe')}>
            {busy === 'subscribe' ? 'Connecting…' : apps?.length ? 'Connect Heliaxis CRM again' : 'Connect to app'}
          </button>
          {note('subscribe')}
        </div>
      )}

      {r.phone && !connected && (
        <div className="wa-c-fix">
          <p className="wa-c-warnline">
            <b>Using this number in the WhatsApp Business app on a phone?</b> Don’t register it here. That moves it off the phone
            for good. Connect it with Meta’s “coexistence” option instead, which keeps the app working. Ask Claude for the steps.
          </p>
          <p>
            <b>Only if the number isn’t on a phone:</b> register it on the WhatsApp API with a 6-digit PIN. The PIN becomes its
            two-step verification PIN, so write it down. If it already has a PIN, use that one.
          </p>
          <label className="wa-c-check">
            <input type="checkbox" checked={notOnPhone} onChange={(e) => setNotOnPhone(e.target.checked)} />
            <span>
              This number <b>isn’t</b> used in the WhatsApp or WhatsApp Business app on any phone, and I’m happy for it to work
              only through Heliaxis.
            </span>
          </label>
          <div className="wa-c-row">
            <input
              className="wa-c-pin"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              aria-label="6-digit PIN"
            />
            <button
              type="button"
              className="su-btn su-btn--primary"
              disabled={disabled || !notOnPhone || pin.length !== 6}
              onClick={() => act('register')}
            >
              {busy === 'register' ? 'Registering…' : 'Register number'}
            </button>
          </div>
          {busy === null && registerHint && <small className="su-muted">{registerHint}</small>}
          {note('register')}
        </div>
      )}
      {connected && note('register')}

      <h3>Numbers this token can see</h3>
      {r.found.length === 0 ? (
        <p className="su-muted">
          {r.foundError
            ? `Meta didn’t list them (${r.foundError}). Get the IDs from Business Settings → WhatsApp accounts instead.`
            : 'None found. Get the IDs from Business Settings → WhatsApp accounts.'}
        </p>
      ) : (
        <ul className="wa-c-list">
          {r.found.map((a) => (
            <li key={a.id}>
              <div className="wa-c-acc">
                <b>{a.name || 'WhatsApp account'}</b>
                <span>
                  Account ID <code>{a.id}</code> <CopyButton value={a.id} className="wa-c-copy" />
                  {r.env.wabaId === a.id && <em> · in Vercel</em>}
                </span>
              </div>
              {a.numbers.length === 0 ? (
                <small className="su-muted">No numbers in this account.</small>
              ) : (
                a.numbers.map((n) => (
                  <div key={n.id} className="wa-c-num">
                    <span>
                      {n.display || 'Number'} {n.status ? `· ${n.status.toLowerCase()}` : ''}
                    </span>
                    <span>
                      Phone number ID <code>{n.id}</code> <CopyButton value={n.id} className="wa-c-copy" />
                      {r.env.phoneId === n.id && <em> · in Vercel</em>}
                    </span>
                  </div>
                ))
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="wa-c-bad">{error}</p>}
      <button type="button" className="su-btn" onClick={() => load()} disabled={disabled}>
        {loading ? 'Checking…' : 'Check again'}
      </button>
    </div>
  );
}

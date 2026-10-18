'use client';

import { useCallback, useEffect, useState } from 'react';
import { CopyButton } from '@/components/admin/CopyButton';
import type { ConnectionReport, PhoneInfo } from '@/lib/whatsapp/connection';

/** Plain-English status for the number Meta reports. */
function verdict(p: PhoneInfo) {
  const s = (p.status || '').toUpperCase();
  if (s === 'CONNECTED') return { tone: 'ok', text: 'Connected. Ready to send and receive.' };
  if (s === 'PENDING') return { tone: 'warn', text: 'Pending. Meta is still setting it up; check again in a few minutes.' };
  if (s === 'FLAGGED' || s === 'RESTRICTED') return { tone: 'bad', text: `${p.status}. Check WhatsApp Manager → Phone numbers for Meta’s message.` };
  if (s === 'OFFLINE' || p.platform === 'NOT_APPLICABLE')
    return { tone: 'bad', text: 'Offline. It isn’t registered on the WhatsApp API yet. Register it below.' };
  return { tone: 'warn', text: p.status ? `Meta says: ${p.status}` : 'Meta didn’t give a status.' };
}

export function WhatsAppConnection() {
  const [r, setR] = useState<ConnectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [notOnPhone, setNotOnPhone] = useState(false);
  const [busy, setBusy] = useState<'register' | 'subscribe' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

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
    return fetchReport();
  };

  async function act(action: 'register' | 'subscribe') {
    setBusy(action);
    setMsg(null);
    const res = await fetch('/api/setup/whatsapp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'register' ? { action, pin, notOnPhone } : { action }),
    }).catch(() => null);
    const d = await res?.json().catch(() => ({}));
    setBusy(null);
    if (res?.ok) {
      setMsg({ tone: 'ok', text: action === 'register' ? 'Registered. Keep that PIN safe.' : 'Connected to the app.' });
      setPin('');
      load();
    } else setMsg({ tone: 'bad', text: d?.error || 'Meta didn’t accept that.' });
  }

  if (loading && !r) return <p className="su-muted">Checking with Meta…</p>;
  if (error) return <p className="wa-c-bad">{error}</p>;
  if (!r) return null;
  if (!r.env.token) return <p className="su-muted">Add WHATSAPP_TOKEN in Vercel (and redeploy) to check the connection.</p>;

  const v = r.phone ? verdict(r.phone) : null;
  const registered = r.phone && (r.phone.status || '').toUpperCase() === 'CONNECTED';

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

      {r.env.wabaId &&
        (r.subscribed === true ? (
          <p className="wa-c-ok">✓ The account is connected to the app, so incoming messages reach Heliaxis.</p>
        ) : r.subscribed === false ? (
          <div className="wa-c-fix">
            <p>
              <b>Incoming messages aren’t connected.</b> The account isn’t subscribed to the app’s webhooks yet.
            </p>
            <button type="button" className="su-btn su-btn--primary" disabled={busy !== null} onClick={() => act('subscribe')}>
              {busy === 'subscribe' ? 'Connecting…' : 'Connect to app'}
            </button>
          </div>
        ) : (
          <p className="wa-c-bad">Couldn’t check the account ({r.env.wabaId}): {r.subscribedError}</p>
        ))}

      {r.phone && !registered && (
        <div className="wa-c-fix">
          <p>
            <b>Register the number on the WhatsApp API.</b> Choose a 6-digit PIN. It becomes the number’s two-step verification
            PIN, so write it down. If the number already has a PIN, use that one.
          </p>
          <label className="wa-c-check">
            <input type="checkbox" checked={notOnPhone} onChange={(e) => setNotOnPhone(e.target.checked)} />
            <span>
              This number <b>isn’t</b> in use in the WhatsApp or WhatsApp Business app on a phone. Registering moves it off the
              phone app for good. To keep using the app as well, connect it with Meta’s “coexistence” option instead.
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
              disabled={busy !== null || !notOnPhone || pin.length !== 6}
              onClick={() => act('register')}
            >
              {busy === 'register' ? 'Registering…' : 'Register number'}
            </button>
          </div>
        </div>
      )}

      {msg && <p className={msg.tone === 'ok' ? 'wa-c-ok' : 'wa-c-bad'}>{msg.text}</p>}

      <h3>Numbers this token can see</h3>
      {r.found.length === 0 ? (
        <p className="su-muted">
          {r.foundError
            ? `Meta didn’t list them (${r.foundError}). Get the IDs from the Meta app → WhatsApp → API setup instead.`
            : 'None found. Get the IDs from the Meta app → WhatsApp → API setup.'}
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
      <button type="button" className="su-btn" onClick={() => load()} disabled={loading}>
        {loading ? 'Checking…' : 'Check again'}
      </button>
    </div>
  );
}

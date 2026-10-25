'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { blankLabels } from '@/components/admin/TemplateSend';
import { relativeTime } from '@/lib/enquiries';
import { delayWords, type FirstMessages as First } from '@/lib/whatsapp/first-messages-shared';
import { customerSendable, jobProblem, JOBS, SAMPLE_TEMPLATE, type WaTemplate } from '@/lib/whatsapp/templates-shared';

/**
 * WhatsApp templates → First messages: the first WhatsApp to a new Meta lead, by the ad (video) they
 * came from. Whether it goes by itself and how long after they come in, then each ad that's brought
 * leads lately with the template its leads get (else the general first message), and a shortcut to
 * write a new one for it. Everyone with Enquiries can look; the server only lets admins change it.
 */

const FIRST_API = '/api/whatsapp/templates/first';
const FIRST_JOB = JOBS.find((j) => j.key === 'firstContact')!;

type Ad = { name: string; was: string[]; ids: string[]; leads: number; lastAt: string | null; template: string };
type Data = { isAdmin: boolean; first: First; inVercel: boolean; quietHold: boolean; general: string; ads: Ad[] };

async function put(body: unknown): Promise<Pick<Data, 'first' | 'ads'>> {
  const r = await fetch(FIRST_API, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'That didn’t work. Try again.');
  return d;
}

/** When an ad's newest lead came in, to follow "the newest": "2h ago", "yesterday", "on 12 Oct". */
const newestWords = (iso: string) => {
  const r = relativeTime(iso);
  return /ago$/.test(r) ? r : /^(Yesterday|Just now)$/.test(r) ? r.toLowerCase() : `on ${r}`;
};

/** "Hi [Customer’s first name], thanks…": a template's words with what fills each blank. */
const wording = (t: WaTemplate) => {
  const labels = blankLabels(t);
  return t.body.replace(/\{\{(\d+)\}\}/g, (all, n: string) => (labels[Number(n) - 1] ? `[${labels[Number(n) - 1]}]` : all));
};

export function FirstMessages({ items, lang, onWrite }: { items: WaTemplate[]; lang: string; onWrite: (adName: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msgs, setMsgs] = useState<Record<string, { text: string; bad: boolean }>>({});
  const [times, setTimes] = useState<{ min: string; max: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(FIRST_API, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load the first messages');
      setData(d);
      setTimes({ min: String(d.first.minMinutes), max: String(d.first.maxMinutes) });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the first messages');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** One change: saved, then its result shown where it was made. */
  async function save(key: string, body: unknown, done: string) {
    setBusy(key);
    setMsgs((m) => ({ ...m, [key]: { text: '', bad: false } }));
    try {
      const d = await put(body);
      setData((x) => x && { ...x, ...d });
      setTimes({ min: String(d.first.minMinutes), max: String(d.first.maxMinutes) });
      setMsgs((m) => ({ ...m, [key]: { text: done, bad: false } }));
    } catch (e) {
      setMsgs((m) => ({ ...m, [key]: { text: e instanceof Error ? e.message : 'Not saved', bad: true } }));
    } finally {
      setBusy('');
    }
  }

  if (error) return <p className="wa-banner wa-banner--err">{error}</p>;
  if (!data || !times) return <p className="wa-muted">Loading…</p>;
  const { isAdmin, first, inVercel, quietHold, general } = data;
  const on = first.auto || inVercel;
  // The templates that can be a first message: approved, in the language automatic messages use, blanks the app can fill.
  const usable = customerSendable(items).filter((t) => t.language === lang && t.name !== SAMPLE_TEMPLATE && !jobProblem(FIRST_JOB, t, lang));
  const byName = new Map(items.filter((t) => t.language === lang).map((t) => [t.name, t]));
  const note = (key: string) => msgs[key]?.text && <p className={`wat-note ${msgs[key].bad ? 'bad' : 'good'}`}>{msgs[key].text}</p>;

  return (
    <>
      <section className="wa-card wat-card wat-first">
        <h2 className="wat-h2">First message to new Meta leads</h2>
        <p className="wa-muted">
          When someone fills in a Meta lead form and says yes to WhatsApp, the app writes their first message: the template chosen below for the video
          (ad) they came from, or the general first message. It waits in their chat with <b>Send now</b> and <b>Cancel</b>, and goes by itself when
          it’s due. With sending switched off, that template is the one their chat offers first, ready for someone to press Send.
        </p>
        <label className="wa-check">
          <input
            type="checkbox"
            checked={on}
            disabled={!isAdmin || inVercel || !!busy}
            onChange={(e) => save('auto', { auto: e.target.checked }, e.target.checked ? 'First messages now go by themselves ✓' : 'First messages no longer go by themselves.')}
          />
          <span>Send it by itself, {delayWords(first)} after they come in</span>
        </label>
        {inVercel && (
          <p className="wat-note wa-muted">Switched on in Vercel (WHATSAPP_AUTO_FIRST_MESSAGE is “true”), so it can’t be switched off here.</p>
        )}
        {note('auto')}
        <div className="wat-times">
          <label>
            Between{' '}
            <input
              className="wa-input wa-time"
              type="number"
              min={0}
              max={120}
              aria-label="Fewest minutes after they come in"
              disabled={!isAdmin}
              value={times.min}
              onChange={(e) => setTimes({ ...times, min: e.target.value })}
            />
          </label>{' '}
          <label>
            and{' '}
            <input
              className="wa-input wa-time"
              type="number"
              min={0}
              max={120}
              aria-label="Most minutes after they come in"
              disabled={!isAdmin}
              value={times.max}
              onChange={(e) => setTimes({ ...times, max: e.target.value })}
            />
          </label>{' '}
          <span>minutes after they come in, at random</span>
          {isAdmin && (
            <button
              type="button"
              className="wat-btn ghost"
              disabled={!!busy || (times.min === String(first.minMinutes) && times.max === String(first.maxMinutes))}
              onClick={() => save('times', { minMinutes: times.min, maxMinutes: times.max }, 'Saved ✓')}
            >
              Save
            </button>
          )}
        </div>
        {note('times')}
        <p className="wat-note wa-muted">
          {quietHold
            ? 'Someone who enquires in quiet hours gets it in the morning instead. '
            : 'It goes at any hour: holding it overnight is switched off. '}
          <Link href="/admin/enquiries/smart-replies" className="wa-link">
            Quiet hours are on Smart replies &amp; chasers
          </Link>
          .
        </p>
      </section>

      <section className="wa-card wat-card">
        <h2 className="wat-h2">By video</h2>
        <p className="wa-muted">
          The ads that have brought leads in the last 90 days, under their names now. Choose the template each one’s leads get. Any ad without one, and
          any lead whose ad isn’t known, gets the general first message: <b>{general || 'none set yet'}</b>.
        </p>
        {!usable.length && (
          <p className="wat-note wa-muted">
            None of your templates can be a first message yet: it needs to be approved, in {lang}, and only ask for the customer’s first name or what
            they asked about.
          </p>
        )}
        {!data.ads.length && <p className="wa-muted">No Meta ad has brought a lead in the last 90 days.</p>}
        {data.ads.map((ad) => {
          const key = `ad:${ad.name}`;
          const chosen = ad.template ? byName.get(ad.template) : undefined;
          const gone = !!ad.template && !usable.some((t) => t.name === ad.template);
          return (
            <div key={key} className="wat-job wat-ad">
              <div>
                <span className="wat-ad-name">{ad.name}</span>
                <small>
                  {[
                    ad.was.length ? `was ${ad.was.join(', ')}` : '',
                    ad.leads ? `${ad.leads} lead${ad.leads === 1 ? '' : 's'}${ad.lastAt ? `, the newest ${newestWords(ad.lastAt)}` : ''}` : 'No leads lately',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
                <select
                  className="wa-input"
                  aria-label={`First message for ${ad.name}`}
                  disabled={!isAdmin || !!busy}
                  value={ad.template}
                  onChange={(e) =>
                    save(
                      key,
                      { ad: { name: ad.name, was: ad.was, ids: ad.ids, template: e.target.value } },
                      e.target.value ? `Its leads get “${e.target.value}” ✓` : 'Its leads get the general first message.'
                    )
                  }
                >
                  <option value="">The general first message{general ? ` (${general})` : ''}</option>
                  {gone && <option value={ad.template}>{ad.template} (can’t be used now)</option>}
                  {usable.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {chosen && <small className="wat-ad-words">{wording(chosen)}</small>}
                {gone && <small className="why">“{ad.template}” isn’t approved or can’t be filled in now, so these leads’ first message won’t go. Choose another.</small>}
                {note(key)}
              </div>
              {isAdmin && (
                <button type="button" className="wat-btn ghost" onClick={() => onWrite(ad.name)}>
                  Write one for this video
                </button>
              )}
            </div>
          );
        })}
      </section>
    </>
  );
}

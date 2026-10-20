'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { matchRule, type SmartRule } from '@/lib/whatsapp/shared';
import { chaseView, chaseWhen } from '@/lib/whatsapp/schedule';
import { DEFAULT_SETTINGS, fromHhmm, hhmm, type WaSettings } from '@/lib/whatsapp/settings-shared';
import '../whatsapp.css';

type Rule = SmartRule & { id: string; follow_up_hours: number | null; follow_up_text: string | null };
type Draft = Omit<Rule, 'id' | 'keywords'> & { id?: string; keywords: string };

const BLANK: Draft = {
  name: '',
  keywords: '',
  reply: '',
  enabled: true,
  delay_min_seconds: 240,
  delay_max_seconds: 300,
  priority: 0,
  follow_up_hours: null,
  follow_up_text: null,
};

const mins = (s: number) => Math.round((s / 60) * 10) / 10;

/** Two worked examples of when a chaser goes with these settings, on a winter Tuesday (UK time = GMT). */
function example(s: WaSettings) {
  const h = s.chaseAfterHours;
  const when = (iso: string) =>
    chaseWhen({ now: new Date(iso), hours: h, lastInboundAt: new Date(Date.parse(iso) - 30 * 60_000).toISOString(), view: chaseView(s) });
  return `So with chasers after ${h}h: ask at 14:00 and it goes ${when('2026-01-13T14:00:00Z')}; ask at 20:34 and it goes ${when('2026-01-13T20:34:00Z')}.`;
}

export function SmartReplies() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [test, setTest] = useState('Do you do air source heat pumps?');
  const [settings, setSettings] = useState<WaSettings | null>(null);
  const [savedNote, setSavedNote] = useState('');

  useEffect(() => {
    fetch('/api/whatsapp/settings', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setSettings(d.settings || DEFAULT_SETTINGS))
      .catch(() => setSettings(DEFAULT_SETTINGS));
  }, []);

  async function saveSettings() {
    if (!settings) return;
    setSavedNote('');
    const r = await fetch('/api/whatsapp/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || 'Settings not saved');
    setSettings(d.settings);
    setSavedNote('Saved');
  }
  const set = <K extends keyof WaSettings>(k: K, v: WaSettings[K]) => settings && setSettings({ ...settings, [k]: v });
  /** A time box ("08:45"): kept as minutes after midnight; a half-typed time is left alone. */
  const setTime = (k: 'quietFromMin' | 'quietToMin' | 'eveningFromMin' | 'eveningNotBeforeMin', v: string) => {
    const m = fromHhmm(v);
    if (m !== null) set(k, m);
  };

  const load = useCallback(
    () =>
      fetch('/api/whatsapp/rules', { cache: 'no-store' })
        .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
        .then(({ ok, d }) => {
          if (!ok) setError(d.error || 'Could not load smart replies');
          setRules(d.items || []);
        }),
    []
  );
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!draft) return;
    setError('');
    const body = {
      ...draft,
      keywords: draft.keywords.split(','),
      delay_min_seconds: Math.round(Number(draft.delay_min_seconds)),
      delay_max_seconds: Math.round(Number(draft.delay_max_seconds)),
    };
    const r = await fetch(draft.id ? `/api/whatsapp/rules/${draft.id}` : '/api/whatsapp/rules', {
      method: draft.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setError(d.error || 'Not saved');
    setDraft(null);
    load();
  }

  async function toggle(rule: Rule) {
    setRules((rs) => rs?.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)) ?? null);
    await fetch(`/api/whatsapp/rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
  }

  async function remove(rule: Rule) {
    if (!confirm(`Delete “${rule.name}”?`)) return;
    await fetch(`/api/whatsapp/rules/${rule.id}`, { method: 'DELETE' });
    load();
  }

  const hit = rules ? matchRule(test, rules) : null;

  return (
    <div className="wa-page">
      <div className="wa-top">
        <Link href="/admin/enquiries/inbox" className="wa-back">← WhatsApp</Link>
        <button type="button" className="wa-link" onClick={() => setDraft({ ...BLANK })}>
          + New reply
        </button>
      </div>
      <h1 className="wa-h1">Smart replies</h1>
      <p className="wa-muted">
        When a WhatsApp message contains one of the keywords, the reply is queued and sent after a random
        delay in the range you set (4–5 minutes by default), with a read receipt and “typing…” just before.
        You get a notification straight away and can edit, send early or cancel it from the chat. Smart
        replies stay quiet on a chat for 2 hours after anyone replies by hand, never repeat the same answer
        within a day, and can be switched off per chat. Use <code>{'{first_name}'}</code> to insert their name.
      </p>

      <div className="wa-card">
        <label className="wa-label">Try a message</label>
        <input className="wa-input" value={test} onChange={(e) => setTest(e.target.value)} />
        <p className="wa-muted">{hit ? <>Would send <b>“{hit.name}”</b></> : 'No smart reply would be sent.'}</p>
      </div>

      {error && <p className="wa-banner wa-banner--err">{error}</p>}

      {draft && (
        <div className="wa-card wa-edit">
          <label className="wa-label">Name</label>
          <input className="wa-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Battery storage" />
          <label className="wa-label">Keywords (comma separated — plurals match too)</label>
          <input className="wa-input" value={draft.keywords} onChange={(e) => setDraft({ ...draft, keywords: e.target.value })} placeholder="battery, batteries, storage" />
          <label className="wa-label">Reply</label>
          <textarea className="wa-input" rows={6} value={draft.reply} onChange={(e) => setDraft({ ...draft, reply: e.target.value })} />
          <div className="wa-grid3">
            <div>
              <label className="wa-label">Wait at least (min)</label>
              <input
                className="wa-input"
                type="number"
                min={0}
                step={0.5}
                value={mins(draft.delay_min_seconds)}
                onChange={(e) => setDraft({ ...draft, delay_min_seconds: Number(e.target.value) * 60 })}
              />
            </div>
            <div>
              <label className="wa-label">At most (min)</label>
              <input
                className="wa-input"
                type="number"
                min={0}
                step={0.5}
                value={mins(draft.delay_max_seconds)}
                onChange={(e) => setDraft({ ...draft, delay_max_seconds: Number(e.target.value) * 60 })}
              />
            </div>
            <div>
              <label className="wa-label">Priority</label>
              <input className="wa-input" type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} />
            </div>
          </div>
          <label className="wa-label">Chase if they don’t reply after (hours, blank = no chase)</label>
          <input
            className="wa-input"
            type="number"
            min={0.25}
            step={0.5}
            value={draft.follow_up_hours ?? ''}
            onChange={(e) => setDraft({ ...draft, follow_up_hours: e.target.value === '' ? null : Number(e.target.value) })}
            placeholder="e.g. 12"
          />
          {draft.follow_up_hours ? (
            <>
              <label className="wa-label">Chase message (blank = the default chaser below)</label>
              <textarea
                className="wa-input"
                rows={3}
                value={draft.follow_up_text ?? ''}
                onChange={(e) => setDraft({ ...draft, follow_up_text: e.target.value })}
                placeholder="Hi {first_name}, did you manage to grab a photo of the land?"
              />
            </>
          ) : null}
          <div className="wa-queued-actions">
            <button type="button" onClick={save}>Save</button>
            <button type="button" className="ghost" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}

      {rules === null ? (
        <p className="wa-muted">Loading…</p>
      ) : rules.length === 0 ? (
        <p className="wa-muted">No smart replies yet. (Run supabase/whatsapp.sql if this page shows an error.)</p>
      ) : (
        rules.map((r) => (
          <div key={r.id} className={`wa-card wa-rule${r.enabled ? '' : ' off'}`}>
            <div className="wa-rule-head">
              <b>{r.name}</b>
              <span className="wa-muted">
                {mins(r.delay_min_seconds)}–{mins(r.delay_max_seconds)} min{r.priority ? ` · priority ${r.priority}` : ''}
                {r.follow_up_hours ? ` · chases after ${r.follow_up_hours}h` : ''}
              </span>
            </div>
            <div className="wa-kws">
              {r.keywords.map((k) => (
                <span key={k} className="wa-chip">{k}</span>
              ))}
            </div>
            <p className="wa-rule-reply">{r.reply}</p>
            <div className="wa-queued-actions">
              <button type="button" className="ghost" onClick={() => toggle(r)}>{r.enabled ? 'Turn off' : 'Turn on'}</button>
              <button type="button" className="ghost" onClick={() => setDraft({ ...r, keywords: r.keywords.join(', ') })}>Edit</button>
              <button type="button" className="ghost" onClick={() => remove(r)}>Delete</button>
            </div>
          </div>
        ))
      )}

      <h2 className="wa-h2">Chasers</h2>
      <p className="wa-muted">
        When you ask something (“can you send us a photo of the land?”) and they go quiet, a chaser goes out
        automatically. It’s free while you’re inside the 24h window after their last message; after that
        WhatsApp only allows a template (~1.6p utility / ~4p marketing). A reply from them cancels it.
      </p>
      {settings && (
        <div className="wa-card wa-edit">
          <label className="wa-check">
            <input type="checkbox" checked={settings.chaseQuestions} onChange={(e) => set('chaseQuestions', e.target.checked)} />
            <span>Chase automatically when a message asks a question (has a “?”) — from Heliaxis or the WhatsApp Business app</span>
          </label>
          <label className="wa-label">Chase after (hours — then moved out of quiet hours, and by the evening rule below)</label>
          <input className="wa-input" type="number" min={0.25} step={0.5} value={settings.chaseAfterHours} onChange={(e) => set('chaseAfterHours', Number(e.target.value))} />
          <label className="wa-label">Default chase message ({'{first_name}'} works)</label>
          <textarea className="wa-input" rows={3} value={settings.chaseText} onChange={(e) => set('chaseText', e.target.value)} />
          <label className="wa-check">
            <input type="checkbox" checked={settings.keepChasesFree} onChange={(e) => set('keepChasesFree', e.target.checked)} />
            <span>Keep chasers free: if the chase time would miss the 24h window, send it about an hour before the window closes instead (never sooner than 4h after your message)</span>
          </label>
          <label className="wa-label">Final nudge after the chaser (hours, 0 = off — usually a paid template)</label>
          <input className="wa-input" type="number" min={0} step={1} value={settings.finalNudgeHours} onChange={(e) => set('finalNudgeHours', Number(e.target.value))} />
          <label className="wa-label">Template for chasers outside the free window ({'{{1}}'} = first name; blank = default template)</label>
          <input className="wa-input" value={settings.chaseTemplate} onChange={(e) => set('chaseTemplate', e.target.value)} placeholder="e.g. enquiry_follow_up" />
          <p className="wa-muted">
            <Link href="/admin/enquiries/templates" className="wa-link">WhatsApp templates →</Link> Send ready-made templates to Meta in one tap, and choose which one chasers and first messages to new leads use.
          </p>
          <label className="wa-label">Quiet hours (UK time)</label>
          <div className="wa-times">
            <input className="wa-input wa-time" type="time" step={60} aria-label="Quiet from" value={hhmm(settings.quietFromMin)} onChange={(e) => setTime('quietFromMin', e.target.value)} />
            <span>to</span>
            <input className="wa-input wa-time" type="time" step={60} aria-label="Quiet until" value={hhmm(settings.quietToMin)} onChange={(e) => setTime('quietToMin', e.target.value)} />
          </div>
          <p className="wa-muted">
            Nothing automatic goes out in quiet hours. Chasers and final nudges wait until they end, then go a few minutes
            after, at random, so they don’t look automated; reminders wait too. A message you type, or <b>Send now</b>, always goes.
          </p>
          <div className="wa-check wa-check--times">
            <input type="checkbox" aria-label="Evening rule" checked={settings.eveningRule} onChange={(e) => set('eveningRule', e.target.checked)} />
            <span>
              <span>
                If we message after{' '}
                <input className="wa-input wa-time" type="time" step={60} aria-label="If we message after" disabled={!settings.eveningRule} value={hhmm(settings.eveningFromMin)} onChange={(e) => setTime('eveningFromMin', e.target.value)} />,
              </span>{' '}
              <span>
                don’t chase before{' '}
                <input className="wa-input wa-time" type="time" step={60} aria-label="Don’t chase before" disabled={!settings.eveningRule} value={hhmm(settings.eveningNotBeforeMin)} onChange={(e) => setTime('eveningNotBeforeMin', e.target.value)} />
              </span>{' '}
              <span>the next morning</span>
            </span>
          </div>
          <p className="wa-muted">
            Gives them a chance to wake up. It counts any message we send after that time or in quiet hours, by hand or
            automatically, and the chaser waits even if that means it’s no longer free. {example(settings)}
          </p>
          <label className="wa-label">Remind me after (min, 0 = off)</label>
          <input className="wa-input" type="number" min={0} value={settings.remindUnansweredMinutes} onChange={(e) => set('remindUnansweredMinutes', Number(e.target.value))} />
          <p className="wa-muted">“Remind me” pushes the team when a customer’s message has had no answer (not in quiet hours).</p>
          <label className="wa-check">
            <input type="checkbox" checked={settings.smartRepliesQuietHours} onChange={(e) => set('smartRepliesQuietHours', e.target.checked)} />
            <span>Hold smart replies to messages that arrive in quiet hours until the morning (a reply at 3am looks automated)</span>
          </label>
          <label className="wa-check">
            <input type="checkbox" checked={settings.firstContactQuietHours} onChange={(e) => set('firstContactQuietHours', e.target.checked)} />
            <span>Hold the first message to new leads who enquire in quiet hours until the morning (otherwise it goes 3–6 minutes after they enquire, whatever the time)</span>
          </label>
          <div className="wa-queued-actions">
            <button type="button" onClick={saveSettings}>Save chaser settings</button>
            {savedNote && <span className="wa-muted">{savedNote}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

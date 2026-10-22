'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { blankLabels, WaTemplatePreview } from '@/components/admin/TemplateSend';
import {
  CATEGORIES,
  categoryLabel,
  checkTemplate,
  compileBody,
  FIELDS,
  INSERTABLE,
  JOBS,
  jobProblem,
  MAX_BODY,
  MAX_BUTTON_TEXT,
  MAX_BUTTONS,
  READY_MADE,
  readyMade,
  rejectionText,
  SAMPLE_TEMPLATE,
  statusInfo,
  toTemplateName,
  WHATSAPP_MANAGER_URL,
  type Blank,
  type FieldKey,
  type Job,
  type JobKey,
  type ReadyTemplate,
  type TemplateCategory,
  type WaTemplate,
} from '@/lib/whatsapp/templates-shared';
import '../whatsapp.css';
import './templates.css';

/**
 * WhatsApp templates: everything on the WhatsApp Business Account with its status, Heliaxis's
 * ready-made templates (one tap sends one to Meta), a New template form, what fills each blank,
 * and which template each automatic message uses. Everyone with Enquiries can look; the server
 * only lets admins change anything.
 */

const MANAGE = '/api/whatsapp/templates/manage';

type Data = {
  isAdmin: boolean;
  items: WaTemplate[];
  problem: { kind: 'not-connected' | 'no-account' | 'permission' | 'other'; message: string } | null;
  /** The language automatic messages go out in. */
  lang: string;
  autoFirst: boolean;
  usage: Record<JobKey, { name: string; fallback: string }>;
};
type Tab = 'yours' | 'ready' | 'new';
type Say = (key: string, text: string, bad?: boolean) => void;

const LANGS: Record<string, string> = { en_GB: 'English (UK)', en: 'English', en_US: 'English (US)' };
const langLabel = (l: string) => LANGS[l] || l;
const keyOf = (t: { name: string; language: string }) => `${t.name}|${t.language}`;
/** The template a job sends now: the one picked here, else its default. */
const inUse = (d: Data, job: Job) => d.usage[job.key].name || d.usage[job.key].fallback;

async function api(url: string, method: string, body?: unknown) {
  const r = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'That didn’t work. Try again.');
  return d;
}

export function TemplatesManager() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [msgs, setMsgs] = useState<Record<string, { text: string; bad: boolean }>>({});
  const [open, setOpen] = useState<{ key: string; panel: 'use' | 'blanks' } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(MANAGE, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load the templates');
      setData(d);
      setLoadError('');
      // First visit: straight to the ready-made ones while the account only has Meta's sample.
      setTab((t) => t ?? ((d.items as WaTemplate[]).some((x) => x.name !== SAMPLE_TEMPLATE) ? 'yours' : 'ready'));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the templates');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live status while Meta is reviewing something.
  const waiting = !!data?.items.some((t) => t.status === 'PENDING' || t.status === 'IN_APPEAL');
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 20_000);
    return () => clearInterval(t);
  }, [waiting, load]);

  const say: Say = (key, text, bad = false) => setMsgs((m) => ({ ...m, [key]: { text, bad } }));

  /** Runs one change, shows its result on the card it came from, then reloads. */
  async function run(key: string, fn: () => Promise<string>) {
    setBusy(key);
    say(key, '');
    try {
      say(key, await fn());
      await load();
    } catch (e) {
      say(key, e instanceof Error ? e.message : 'That didn’t work. Try again.', true);
    } finally {
      setBusy('');
    }
  }

  const sendReady = (r: ReadyTemplate) =>
    run(`ready:${r.name}`, async () => {
      const d = await api(MANAGE, 'POST', { ready: r.name });
      const moved = d.category && d.category !== r.category ? ` Meta has made it ${categoryLabel(d.category)}.` : '';
      return d.status === 'APPROVED' ? `Approved straight away ✓${moved}` : `Sent to Meta ✓ It usually takes a few minutes, and this page updates by itself.${moved}`;
    });

  const setJob = (job: Job, name: string, key: string) =>
    run(key, async () => {
      await api(job.where === 'crm' ? '/api/crm/settings' : '/api/whatsapp/settings', 'PUT', { [job.setting]: name });
      return name ? `Used for “${job.label}” ✓` : `No longer used for “${job.label}”.`;
    });

  const saveBlanks = (t: WaTemplate, blanks: Blank[]) =>
    run(keyOf(t), async () => {
      await api(MANAGE, 'PUT', { name: t.name, blanks });
      setOpen(null);
      return 'Saved ✓';
    });

  async function remove(t: WaTemplate) {
    if (!window.confirm(`Delete “${t.name}” (${langLabel(t.language)})? Nobody can send it any more, and Meta won’t let you reuse the name for about 4 weeks.`)) return;
    setBusy(keyOf(t));
    try {
      await api(`${MANAGE}?${new URLSearchParams({ name: t.name, ...(t.id ? { id: t.id } : {}) })}`, 'DELETE');
      setNote(`Deleted “${t.name}”.`);
      await load();
    } catch (e) {
      say(keyOf(t), e instanceof Error ? e.message : 'Not deleted', true);
    } finally {
      setBusy('');
    }
  }

  function created(name: string, status: string) {
    setNote(status === 'APPROVED' ? `“${name}” is approved ✓` : `“${name}” sent to Meta ✓ It usually takes a few minutes, and this page updates by itself.`);
    setTab('yours');
    window.scrollTo({ top: 0 });
    load();
  }

  const yours = data?.items ?? [];
  const isAdmin = !!data?.isAdmin;

  return (
    <div className="wa-page">
      <div className="wa-top">
        <Link href="/admin/enquiries/inbox" className="wa-back">
          ← WhatsApp
        </Link>
        <Link href="/admin/enquiries/smart-replies" className="wa-link">
          Smart replies & chasers
        </Link>
      </div>
      <h1 className="wa-h1">WhatsApp templates</h1>
      <p className="wa-muted">
        Once 24 hours have passed since a customer last messaged you, WhatsApp only lets you send a message Meta has approved in advance: a template. Send
        Heliaxis’s ready-made ones to Meta with one tap, make your own, and choose which one each automatic message uses.
        {!isAdmin && data ? ' Only admins can add, delete or change them.' : ''}
      </p>

      {loadError && <p className="wa-banner wa-banner--err">{loadError}</p>}
      {data?.problem && <Problem problem={data.problem} isAdmin={isAdmin} />}

      {data && tab && (
        <div className="wa-filters wat-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'yours'} className={tab === 'yours' ? 'on' : ''} onClick={() => setTab('yours')}>
            Your templates <span>{yours.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'ready'} className={tab === 'ready' ? 'on' : ''} onClick={() => setTab('ready')}>
            Ready-made <span>{READY_MADE.length}</span>
          </button>
          {isAdmin && (
            <button type="button" role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>
              + New template
            </button>
          )}
        </div>
      )}
      {note && tab !== 'new' && <p className="wa-banner">{note}</p>}

      {!data && !loadError && <p className="wa-muted">Loading…</p>}

      {data && tab === 'yours' && (
        <>
          {!yours.length && !data.problem && (
            <p className="wa-muted">
              No templates on your WhatsApp account yet.{' '}
              <button type="button" className="wa-link" onClick={() => setTab('ready')}>
                Start with a ready-made one →
              </button>
            </p>
          )}
          <div className="wat-grid">
            {yours.map((t) => (
              <TemplateCard
                key={keyOf(t)}
                t={t}
                data={data}
                busy={busy === keyOf(t)}
                msg={msgs[keyOf(t)]}
                open={open?.key === keyOf(t) ? open.panel : null}
                onOpen={(panel) => setOpen(panel && { key: keyOf(t), panel })}
                onJob={(job, name) => setJob(job, name, keyOf(t))}
                onBlanks={(b) => saveBlanks(t, b)}
                onDelete={() => remove(t)}
              />
            ))}
          </div>
        </>
      )}

      {data && tab === 'ready' && (
        <div className="wat-grid">
          {READY_MADE.map((r) => (
            <ReadyCard
              key={r.name}
              r={r}
              data={data}
              busy={busy === `ready:${r.name}`}
              msg={msgs[`ready:${r.name}`]}
              onSend={() => sendReady(r)}
              onJob={(job, name) => setJob(job, name, `ready:${r.name}`)}
            />
          ))}
        </div>
      )}

      {data && tab === 'new' && isAdmin && <NewTemplate taken={new Set(yours.map((t) => t.name))} disabled={!!data.problem} onCreated={created} />}

      <CategoryGuide />
    </div>
  );
}

function Problem({ problem, isAdmin }: { problem: NonNullable<Data['problem']>; isAdmin: boolean }) {
  return (
    <div className="wa-banner wa-banner--err">
      <p className="wat-note">
        <b>Heliaxis can’t see your templates yet.</b> {problem.message}
      </p>
      <p className="wat-note">
        {isAdmin && problem.kind !== 'other' ? (
          <>
            <Link href="/admin/setup/env" className="wa-link">
              Check the WhatsApp connection →
            </Link>{' '}
          </>
        ) : null}
        <Link href="/admin/setup/guide/whatsapp" className="wa-link">
          WhatsApp setup guide
        </Link>
      </p>
    </div>
  );
}

function Badge({ status }: { status: string }) {
  const s = statusInfo(status);
  return <span className={`wat-badge ${s.tone}`}>{s.label}</span>;
}

/** Under the badge: Meta's reason when rejected, or what the status means. */
function StatusNote({ t }: { t: WaTemplate }) {
  const s = statusInfo(t.status);
  const why = t.status === 'REJECTED' ? rejectionText(t.rejected) : null;
  if (!why && !s.help && t.status !== 'REJECTED') return null;
  return (
    <p className={`wat-note${s.tone === 'bad' ? ' bad' : ''}`}>
      {why || s.help || 'Meta didn’t give a reason.'}
      {t.status === 'REJECTED' && (
        <>
          {' '}
          You can change it and ask again in{' '}
          <a href={WHATSAPP_MANAGER_URL} target="_blank" rel="noreferrer" className="wa-link">
            WhatsApp Manager
          </a>
          , or delete it and make a new one with another name.
        </>
      )}
    </p>
  );
}

function TemplateCard({
  t,
  data,
  busy,
  msg,
  open,
  onOpen,
  onJob,
  onBlanks,
  onDelete,
}: {
  t: WaTemplate;
  data: Data;
  busy: boolean;
  msg?: { text: string; bad: boolean };
  open: 'use' | 'blanks' | null;
  onOpen: (panel: 'use' | 'blanks' | null) => void;
  onJob: (job: Job, name: string) => void;
  onBlanks: (b: Blank[]) => void;
  onDelete: () => void;
}) {
  const r = readyMade(t.name);
  const usedFor = JOBS.filter((j) => inUse(data, j) === t.name && t.language === data.lang);
  const usable = t.status === 'APPROVED' && t.sendable && t.name !== SAMPLE_TEMPLATE;
  return (
    <article className="wa-card wat-card">
      <div className="wat-head">
        <div className="wat-title">
          <b>{r?.title ?? t.name}</b>
          {r && <code>{t.name}</code>}
        </div>
        <Badge status={t.status} />
      </div>
      <div className="wat-meta">
        {t.category && <span className="wa-chip">{categoryLabel(t.category)}</span>}
        <span>{langLabel(t.language)}</span>
        {(t.quality === 'RED' || t.quality === 'YELLOW') && <span className="wa-err">People are blocking or reporting this one</span>}
      </div>
      <StatusNote t={t} />
      <WaTemplatePreview header={t.header} body={t.body} footer={t.footer} buttons={t.buttons} labels={blankLabels(t)} />
      {t.name === SAMPLE_TEMPLATE && <p className="wat-note wa-muted">Meta’s sample. It’s never offered when sending.</p>}
      {!t.sendable && <p className="wat-note wa-muted">Heliaxis can’t send this one: it has a picture or a button that needs filling in. Send it from WhatsApp Manager.</p>}
      {usedFor.length > 0 && (
        <div className="wat-meta">
          Used for:
          {usedFor.map((j) => (
            <span key={j.key} className="wa-chip wat-chip-job">
              {j.label}
            </span>
          ))}
        </div>
      )}
      {data.isAdmin && (
        <div className="wat-actions">
          {usable && (
            <button type="button" className="wat-btn" onClick={() => onOpen(open === 'use' ? null : 'use')} aria-expanded={open === 'use'}>
              Use for…
            </button>
          )}
          {t.params > 0 && t.name !== SAMPLE_TEMPLATE && (
            <button type="button" className="wat-btn ghost" onClick={() => onOpen(open === 'blanks' ? null : 'blanks')} aria-expanded={open === 'blanks'}>
              {t.blanks ? 'Change what fills the blanks' : 'Say what fills the blanks'}
            </button>
          )}
          <button type="button" className="wat-btn danger" disabled={busy} onClick={onDelete}>
            Delete
          </button>
        </div>
      )}
      {open === 'use' && <UseFor t={t} data={data} busy={busy} onJob={onJob} />}
      {open === 'blanks' && <BlanksEditor t={t} busy={busy} onSave={onBlanks} onCancel={() => onOpen(null)} />}
      {msg?.text && <p className={`wat-note ${msg.bad ? 'bad' : 'good'}`}>{msg.text}</p>}
    </article>
  );
}

/** Which automatic message this template is used for: one row per job, saved through its settings. */
function UseFor({ t, data, busy, onJob }: { t: WaTemplate; data: Data; busy: boolean; onJob: (job: Job, name: string) => void }) {
  return (
    <div className="wat-panel">
      <b>Use “{t.name}” for…</b>
      {JOBS.map((job) => {
        const u = data.usage[job.key];
        const here = inUse(data, job) === t.name && t.language === data.lang;
        const problem = here ? null : jobProblem(job, t, data.lang);
        const from = !u.name && u.fallback ? (job.key === 'firstContact' ? ' (set in Vercel)' : ' (the default)') : '';
        return (
          <div key={job.key} className="wat-job">
            <div>
              <span>{job.label}</span>
              <small>{here ? `Using this one${from}` : inUse(data, job) ? `Now: ${inUse(data, job)}${from}` : 'Nothing set yet'}</small>
              {problem && <small className="why">{problem}</small>}
              {job.key === 'firstContact' && !data.autoFirst && (
                <small>Automatic first messages are off (WHATSAPP_AUTO_FIRST_MESSAGE in Vercel isn’t “true”). It’s still the one offered first in a new chat.</small>
              )}
            </div>
            {here && u.name ? (
              <button type="button" className="wat-btn ghost" disabled={busy} onClick={() => onJob(job, '')}>
                Stop using
              </button>
            ) : !here ? (
              <button type="button" className="wat-btn" disabled={busy || !!problem} onClick={() => onJob(job, t.name)}>
                Use this
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function BlanksEditor({ t, busy, onSave, onCancel }: { t: WaTemplate; busy: boolean; onSave: (b: Blank[]) => void; onCancel: () => void }) {
  const [rows, setRows] = useState<Blank[]>(() =>
    Array.from({ length: t.params }, (_, i) => t.blanks?.[i] ?? (i === 0 ? { field: 'first_name' } : { field: 'custom', label: '' }))
  );
  const set = (i: number, b: Blank) => setRows(rows.map((x, j) => (j === i ? b : x)));
  return (
    <div className="wat-panel">
      <b>What fills each blank</b>
      <p className="wat-note wa-muted">Then the blanks fill themselves when someone sends it, and automatic messages know what to put in.</p>
      {rows.map((b, i) => (
        <div key={i}>
          <label className="wa-label" htmlFor={`blank-${t.id}-${i}`}>
            Blank {i + 1}
          </label>
          <select
            id={`blank-${t.id}-${i}`}
            className="wa-input"
            value={b.field}
            onChange={(e) => set(i, e.target.value === 'custom' ? { field: 'custom', label: '' } : { field: e.target.value as FieldKey })}
          >
            {(Object.keys(FIELDS) as FieldKey[])
              .filter((k) => !FIELDS[k].auto || b.field === k)
              .map((k) => (
                <option key={k} value={k}>
                  {FIELDS[k].label}
                </option>
              ))}
            <option value="custom">Something else (typed in when sending)</option>
          </select>
          {b.field === 'custom' && (
            <input
              className="wa-input"
              style={{ marginTop: '0.35rem' }}
              placeholder="What is it? e.g. Their postcode"
              maxLength={60}
              value={b.label}
              onChange={(e) => set(i, { field: 'custom', label: e.target.value })}
            />
          )}
        </div>
      ))}
      <div className="wat-actions">
        <button type="button" className="wat-btn" disabled={busy || rows.some((r) => r.field === 'custom' && !r.label.trim())} onClick={() => onSave(rows)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="wat-btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReadyCard({
  r,
  data,
  busy,
  msg,
  onSend,
  onJob,
}: {
  r: ReadyTemplate;
  data: Data;
  busy: boolean;
  msg?: { text: string; bad: boolean };
  onSend: () => void;
  onJob: (job: Job, name: string) => void;
}) {
  const live = data.items.filter((t) => t.name === r.name);
  const t = live.find((x) => x.language === 'en_GB') ?? live[0];
  const job = JOBS.find((j) => j.key === r.job);
  const labels = r.fields.map((f) => FIELDS[f].label);
  const jobIssue = job && t ? jobProblem(job, t, data.lang) : null;
  return (
    <article className="wa-card wat-card">
      <div className="wat-head">
        <div className="wat-title">
          <b>{r.title}</b>
          <code>{r.name}</code>
        </div>
        {t ? <Badge status={t.status} /> : <span className="wat-badge off">Not sent yet</span>}
      </div>
      <div className="wat-meta">
        <span className="wa-chip">{CATEGORIES[r.category].label}</span>
        <span>{CATEGORIES[r.category].cost}</span>
      </div>
      <p className="wat-note">{r.use}</p>
      <WaTemplatePreview body={r.body} buttons={r.buttons} labels={labels} />
      {t && <StatusNote t={t} />}
      {!t &&
        (data.isAdmin ? (
          <div className="wat-actions">
            <button type="button" className="wat-btn wa" disabled={busy || !!data.problem} onClick={onSend}>
              {busy ? 'Sending…' : 'Send to Meta for approval'}
            </button>
          </div>
        ) : (
          <p className="wat-note wa-muted">Not sent to Meta yet. An admin can send it with one tap.</p>
        ))}
      {t?.status === 'APPROVED' && job && data.isAdmin && (
        <div className="wat-actions">
          {inUse(data, job) === r.name ? (
            <span className="wat-note good">✓ Used for “{job.label}”</span>
          ) : (
            <button type="button" className="wat-btn" disabled={busy || !!jobIssue} onClick={() => onJob(job, r.name)}>
              Use for “{job.label}”
            </button>
          )}
        </div>
      )}
      {jobIssue && t?.status === 'APPROVED' && <p className="wat-note bad">{jobIssue}</p>}
      {msg?.text && <p className={`wat-note ${msg.bad ? 'bad' : 'good'}`}>{msg.text}</p>}
    </article>
  );
}

const START = 'Hi {first_name}, ';
/** Template names as they're typed: lowercase, anything else becomes _. */
const typedName = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 60);

function NewTemplate({ taken, disabled, onCreated }: { taken: Set<string>; disabled: boolean; onCreated: (name: string, status: string) => void }) {
  const [title, setTitle] = useState('');
  const [typed, setTyped] = useState<string | null>(null);
  const [category, setCategory] = useState<TemplateCategory>('UTILITY');
  const [text, setText] = useState(START);
  const [examples, setExamples] = useState<Partial<Record<FieldKey, string>>>({});
  const [buttons, setButtons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const area = useRef<HTMLTextAreaElement>(null);

  const name = (typed ?? toTemplateName(title)).replace(/^_+|_+$/g, '');
  const compiled = compileBody(text);
  const used = [...new Set(compiled.fields)];
  const exampleList = compiled.fields.map((f) => examples[f] ?? FIELDS[f].example);
  const problems = [
    ...(compiled.unknown.includes('{{…}}') ? ['Use the buttons above the message to add blanks, rather than typing {{1}}.'] : []),
    ...compiled.unknown.filter((u) => u !== '{{…}}').map((u) => `${u} isn’t one of the fields. Use the buttons above the message to add one.`),
    ...(taken.has(name) ? [`There’s already a template called “${name}”. Choose another name.`] : []),
    ...(readyMade(name) ? [`“${name}” is kept for a ready-made template. Send that one from the Ready-made tab.`] : []),
    ...checkTemplate({ name, category, body: compiled.body, examples: exampleList, buttons }),
  ];
  const touched = !!title || text !== START;

  function insert(f: FieldKey) {
    const tok = `{${FIELDS[f].token}}`;
    const el = area.current;
    const from = el?.selectionStart ?? text.length;
    const to = el?.selectionEnd ?? text.length;
    setText(text.slice(0, from) + tok + text.slice(to));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(from + tok.length, from + tok.length);
    });
  }

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      const d = await api(MANAGE, 'POST', {
        name,
        category,
        body: compiled.body,
        examples: exampleList,
        buttons,
        blanks: compiled.fields.map((field) => ({ field })),
      });
      onCreated(name, d.status);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not sent');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wa-card wa-edit">
      <label className="wa-label" htmlFor="tpl-title">
        What’s it for?
      </label>
      <input id="tpl-title" className="wa-input" placeholder="e.g. Survey follow-up" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="wa-label" htmlFor="tpl-name">
        Name (made for you; customers never see it)
      </label>
      <input id="tpl-name" className="wa-input" placeholder="survey_follow_up" value={typed ?? name} onChange={(e) => setTyped(typedName(e.target.value))} />

      <span className="wa-label">Type</span>
      <div className="wat-cats" role="radiogroup">
        {(Object.keys(CATEGORIES) as TemplateCategory[]).map((c) => (
          <label key={c} className={`wat-cat${category === c ? ' on' : ''}`}>
            <input type="radio" name="tpl-category" checked={category === c} onChange={() => setCategory(c)} />
            <span>
              <b>{CATEGORIES[c].label}</b>
              <small>{CATEGORIES[c].when}</small>
              <small>{CATEGORIES[c].cost}</small>
            </span>
          </label>
        ))}
      </div>

      <label className="wa-label" htmlFor="tpl-body">
        Message
      </label>
      <div className="wat-chips" aria-label="Insert">
        {INSERTABLE.map((f) => (
          <button key={f} type="button" onClick={() => insert(f)}>
            + {FIELDS[f].label}
          </button>
        ))}
      </div>
      <textarea id="tpl-body" ref={area} className="wa-input" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      <p className="wat-note wa-muted">
        The buttons add a blank that’s filled in when it’s sent, e.g. {'{first_name}'}. Don’t start or end with one, and keep two apart with some words. {compiled.body.length}/{MAX_BODY}
      </p>

      {used.length > 0 && (
        <>
          <span className="wa-label">Examples for Meta (they check these)</span>
          {used.map((f) => (
            <div key={f}>
              <label className="wat-sub" htmlFor={`tpl-ex-${f}`}>
                {FIELDS[f].label}
              </label>
              <input
                id={`tpl-ex-${f}`}
                className="wa-input"
                value={examples[f] ?? FIELDS[f].example}
                onChange={(e) => setExamples({ ...examples, [f]: e.target.value })}
              />
            </div>
          ))}
        </>
      )}

      <span className="wa-label">Quick replies (optional, up to {MAX_BUTTONS})</span>
      {buttons.map((b, i) => (
        <div key={i} className="wat-row">
          <input
            className="wa-input"
            aria-label={`Quick reply ${i + 1}`}
            maxLength={MAX_BUTTON_TEXT}
            placeholder="e.g. Call me today"
            value={b}
            onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <span className="wat-count">
            {b.length}/{MAX_BUTTON_TEXT}
          </span>
          <button type="button" className="wat-x" aria-label="Remove" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>
            ×
          </button>
        </div>
      ))}
      {buttons.length < MAX_BUTTONS && (
        <div>
          <button type="button" className="wat-btn ghost" onClick={() => setButtons([...buttons, ''])}>
            + Add a quick reply
          </button>
        </div>
      )}

      <span className="wa-label">How it looks</span>
      <WaTemplatePreview body={compiled.body} buttons={buttons.filter((b) => b.trim())} values={exampleList} />

      {touched && problems.length > 0 && (
        <ul className="wat-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {err && <p className="wa-banner wa-banner--err">{err}</p>}
      <div className="wat-actions">
        <button type="button" className="wat-btn wa" disabled={busy || disabled || problems.length > 0} onClick={submit}>
          {busy ? 'Sending…' : 'Send to Meta for approval'}
        </button>
      </div>
      <p className="wat-note wa-muted">It goes in English (UK). Meta may move it to Marketing if it reads as selling.</p>
    </div>
  );
}

function CategoryGuide() {
  return (
    <details className="wa-card wat-guide">
      <summary>Utility or Marketing? What each costs</summary>
      {(Object.keys(CATEGORIES) as TemplateCategory[]).map((c) => (
        <div key={c}>
          <h3>{CATEGORIES[c].label}</h3>
          <p className="wa-muted">{CATEGORIES[c].when}</p>
          <p className="wa-muted">{CATEGORIES[c].cost}</p>
        </div>
      ))}
      <p className="wa-muted">
        Replies inside the 24 hours after their last message are free and don’t need a template. Meta’s prices change now and then; WHATSAPP_SETUP.md has
        the current guide.
      </p>
    </details>
  );
}

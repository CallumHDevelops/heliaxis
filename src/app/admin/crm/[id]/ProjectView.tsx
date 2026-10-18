'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addPhotos, queued, QUEUE_CHANGED, uploadQueued, watchQueue } from '@/lib/crm/photo-queue';
import {
  ACTIVITY_LABEL,
  PHOTO_CATEGORIES,
  photoLabel,
  PRODUCTS,
  STAGES,
  stageLabel,
} from '@/lib/crm/stages';
import '../crm.css';

type Project = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  products: string[];
  value: number | null;
  owner_id: string | null;
  address: string | null;
  postcode: string | null;
  survey_at: string | null;
  install_at: string | null;
  simpliheat_url: string | null;
  opensolar_url: string | null;
  lost_reason: string | null;
  notes: string | null;
  next_step: string | null;
  next_step_at: string | null;
  created_at: string;
  updated_at: string;
};
type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  postcode: string | null;
  interest: string | null;
  source: string;
  wa_id: string | null;
  wa_unread: number;
};
type Entry = { id: string; kind: string; body: string | null; meta: Record<string, unknown> | null; by: string | null; at: string };
type CrmTask = {
  id: string;
  title: string;
  due_date: string | null;
  priority: string;
  status: string;
  assignee_id: string | null;
  assignee: string;
};
type Photo = { id: string; category: string; caption: string | null; url: string | null; thumb: string | null; by: string; created_at: string };

const ICON: Record<string, string> = {
  note: '📝',
  call: '📞',
  visit: '🏠',
  email: '✉️',
  stage: '➜',
  photo: '📷',
  system: '•',
  whatsapp: '💬',
};

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })} ${time}`;
}
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

type WaInfo = {
  configured: boolean;
  number: string | null;
  threadId: string | null;
  windowOpen: boolean;
  unread: number;
  unreadIds: string[];
  messages: number;
  chaseHours: number;
};
type Sheet = null | 'menu' | 'task' | 'next' | 'whatsapp' | 'note' | 'call' | 'visit' | 'email' | 'photo' | 'stage';

/** Wide screens show details beside the activity (HubSpot-style); phones use a tab. */
function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 1000px)');
    const on = () => setWide(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export function ProjectView({ id, isAdmin }: { id: string; isAdmin: boolean }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [timeline, setTimeline] = useState<Entry[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [wa, setWa] = useState<WaInfo | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'activity' | 'photos' | 'details'>('activity');
  const [sheet, setSheet] = useState<Sheet>(null);
  const wide = useWide();

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/projects/${id}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load this project');
      setProject(d.project);
      setCustomer(d.customer);
      setTimeline(d.timeline);
      setPhotos(d.photos);
      setTeam(d.team);
      setTasks(d.tasks ?? []);
      setWa(d.whatsapp);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this project');
    }
  }, [id]);

  useEffect(() => {
    load();
    // New WhatsApp messages show up while you're looking.
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  // Reading the feed counts as reading their WhatsApp (blue ticks, badge cleared).
  useEffect(() => {
    if (tab !== 'activity' || !wa?.unreadIds.length) return;
    for (const eid of wa.unreadIds) {
      fetch(`/api/whatsapp/conversations/${eid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      }).catch(() => {});
    }
  }, [tab, wa?.unreadIds]);

  async function patch(body: Partial<Project>) {
    setError('');
    const r = await fetch(`/api/crm/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(d.error || 'Not saved');
      return false;
    }
    await load();
    return true;
  }

  if (!project || !customer) {
    return (
      <div className="crm">
        <Link href="/admin/crm" className="crm-back">
          ← Opportunities
        </Link>
        <p className={error ? 'crm-banner crm-banner--err' : 'crm-muted'}>{error || 'Loading…'}</p>
      </div>
    );
  }

  const postcode = project.postcode || customer.postcode;
  const done = async () => {
    setSheet(null);
    await load();
  };

  return (
    <div className="crm crm-project">
      <div className="crm-phead">
        <Link href="/admin/crm" className="crm-back" aria-label="Back to opportunities">
          ←
        </Link>
        <div className="crm-phead-main">
          <h1>{customer.name}</h1>
          <p>
            {postcode || 'No postcode'}
            {project.title !== customer.name && project.title !== `${customer.name} · ${postcode}` ? ` · ${project.title}` : ''}
          </p>
        </div>
        <button type="button" className={`crm-stage crm-stage--btn st-${project.stage}`} onClick={() => setSheet('stage')}>
          {stageLabel(project.stage)} ▾
        </button>
      </div>

      <NextStepBar
        project={project}
        onEdit={() => setSheet('next')}
        onDone={() => patch({ complete_next_step: true } as unknown as Partial<Project>)}
      />
      <TaskList tasks={tasks} onAdd={() => setSheet('task')} onChanged={load} />

      <div className={wide ? 'crm-split' : ''}>
      <div className="crm-split-main">
      <div className="crm-tabs crm-tabs--slim" role="tablist">
        {(
          [
            ['activity', `Activity${wa?.unread ? ` · ${wa.unread} new` : ''}`],
            ['photos', `Photos${photos.length ? ` (${photos.length})` : ''}`],
            ...(wide ? [] : ([['details', 'Details']] as const)),
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="crm-banner crm-banner--err">{error}</p>}

      {(tab === 'activity' || (wide && tab === 'details')) && <Feed entries={timeline} customerName={customer.name} />}
      {tab === 'photos' && <Photos id={id} photos={photos} onChanged={load} />}
      </div>
      {(wide || tab === 'details') && (
        <aside className={wide ? 'crm-split-side' : ''}>
        <Details
          key={project.id}
          project={project}
          customer={customer}
          wa={wa}
          team={team}
          onSave={patch}
          onCustomerSaved={load}
          isAdmin={isAdmin}
          onDelete={async () => {
            if (!confirm('Delete this opportunity, its timeline entries, tasks and photos? This can’t be undone.')) return;
            const r = await fetch(`/api/crm/projects/${id}`, { method: 'DELETE' });
            if (r.ok) router.push('/admin/crm');
            else setError((await r.json().catch(() => ({}))).error || 'Not deleted');
          }}
        />
        </aside>
      )}
      </div>

      {(wide || tab !== 'details') && (
        <button type="button" className="crm-fab" aria-label="Add" onClick={() => setSheet('menu')}>
          +
        </button>
      )}

      {sheet && (
        <div className="crm-sheet" role="dialog" aria-modal="true" onClick={() => setSheet(null)}>
          <div className="crm-sheet-box" onClick={(e) => e.stopPropagation()}>
            {sheet === 'menu' && <ActionMenu customer={customer} wa={wa} onPick={setSheet} />}
            {sheet === 'task' && (
              <TaskEditor
                id={id}
                team={team}
                defaultAssignee={project.owner_id}
                onSaved={async () => {
                  setSheet(null);
                  await load();
                }}
              />
            )}
            {sheet === 'next' && (
              <NextStepEditor
                project={project}
                onSave={async (next_step, next_step_at) => {
                  setSheet(null);
                  await patch({ next_step, next_step_at } as Partial<Project>);
                }}
              />
            )}
            {sheet === 'whatsapp' && <WhatsAppComposer customer={customer} wa={wa} onSent={done} />}
            {(sheet === 'note' || sheet === 'call' || sheet === 'visit') && (
              <LogComposer id={id} kind={sheet} phone={customer.phone} onSaved={done} />
            )}
            {sheet === 'email' && <EmailComposer id={id} customer={customer} onSaved={done} />}
            {sheet === 'photo' && <PhotoQuick id={id} onDone={done} />}
            {sheet === 'stage' && (
              <div>
                <h2>Move stage</h2>
                <div className="crm-stage-list">
                  {STAGES.map((st) => (
                    <button
                      key={st.key}
                      type="button"
                      className={project.stage === st.key ? 'on' : ''}
                      onClick={async () => {
                        setSheet(null);
                        if (st.key !== project.stage) await patch({ stage: st.key });
                      }}
                    >
                      <span className={`crm-stage st-${st.key}`}>{st.label}</span>
                      {project.stage === st.key ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Everything with the customer, oldest first like a chat — WhatsApp as bubbles, the rest as cards. */
function Feed({ entries, customerName }: { entries: Entry[]; customerName: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  // Oldest first, each flagged when it starts a new day.
  const items = useMemo(() => {
    const out: (Entry & { day: string; showDay: boolean })[] = [];
    for (const e of [...entries].reverse()) {
      const day = new Date(e.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      out.push({ ...e, day, showDay: day !== out[out.length - 1]?.day });
    }
    return out;
  }, [entries]);
  const last = items[items.length - 1]?.id;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [last]);
  if (!items.length) {
    return <p className="crm-muted crm-empty">Nothing yet with {customerName}. Tap + to message them, log a call or add a note.</p>;
  }
  return (
    <div className="crm-feed">
      {items.map((e) => {
        const time = new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        const sep = e.showDay ? <div className="crm-feed-day">{e.day}</div> : null;
        if (e.kind === 'whatsapp') {
          const inbound = e.meta?.direction === 'in';
          const status = String(e.meta?.status || '');
          return (
            <div key={e.id}>
              {sep}
              <div className={`crm-bubble ${inbound ? 'in' : 'out'}`}>
                {!inbound && e.by && <span className="crm-bubble-by">{e.by}</span>}
                <span className="crm-bubble-text">{e.body}</span>
                <span className="crm-bubble-meta">
                  💬 {time}
                  {!inbound && <span className={`crm-tick ${status}`}>{status === 'read' || status === 'delivered' ? ' ✓✓' : status === 'failed' ? ' !' : ' ✓'}</span>}
                </span>
              </div>
            </div>
          );
        }
        return (
          <div key={e.id}>
            {sep}
            <div className={`crm-event k-${e.kind}`}>
              <span className="crm-event-icon" aria-hidden="true">
                {ICON[e.kind] || '•'}
              </span>
              <div className="crm-event-body">
                <div className="crm-event-meta">
                  <b>{ACTIVITY_LABEL[e.kind] || e.kind}</b>
                  {e.by ? ` · ${e.by}` : ''} · {time}
                </div>
                {e.body && <p>{e.body}</p>}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

function ActionMenu({ customer, wa, onPick }: { customer: Customer; wa: WaInfo | null; onPick: (s: Sheet) => void }) {
  // Online first: the team messages customers rather than ringing them.
  const items: [Sheet, string, string, string?][] = [
    ['whatsapp', '💬', 'WhatsApp', !wa?.number ? 'Add their mobile first' : wa.windowOpen ? 'Reply' : 'Template (paid)'],
    ['email', '✉️', 'Email', customer.email ? undefined : 'No email'],
    ['task', '✅', 'Task', 'Assign + due date'],
    ['note', '📝', 'Note'],
    ['next', '⏰', 'Next step', 'Follow-up reminder'],
    ['photo', '📷', 'Photos'],
    ['visit', '🏠', 'Site visit'],
    ['stage', '➜', 'Move stage'],
    ['call', '📞', 'Log a call'],
  ];
  return (
    <div>
      <h2>Add to {customer.name}</h2>
      <div className="crm-menu">
        {items.map(([k, icon, label, hint]) => (
          <button key={k} type="button" onClick={() => onPick(k)}>
            <span className="crm-menu-icon">{icon}</span>
            <span>{label}</span>
            {hint && <small>{hint}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

type Template = { name: string; language: string; body: string; params: number };

function WhatsAppComposer({ customer, wa, onSent }: { customer: Customer; wa: WaInfo | null; onSent: () => Promise<void> }) {
  const [text, setText] = useState('');
  const [chase, setChase] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [tpl, setTpl] = useState<{ name: string; lang: string; params: string[] } | null>(null);
  const first = customer.name.split(/\s+/)[0] || '';

  useEffect(() => {
    if (!wa?.number || wa.windowOpen || !wa.configured) return;
    fetch('/api/whatsapp/templates', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        const list: Template[] = d.items || [];
        setTemplates(list);
        if (list[0]) setTpl({ name: list[0].name, lang: list[0].language, params: Array.from({ length: list[0].params }, (_, i) => (i === 0 ? first : '')) });
      })
      .catch(() => setTemplates([]));
  }, [wa?.number, wa?.windowOpen, wa?.configured, first]);

  if (!wa?.configured) return <ComposerNote title="WhatsApp" body="WhatsApp isn’t connected yet — finish the Meta setup (WHATSAPP_SETUP.md)." />;
  if (!wa.number || !wa.threadId) return <ComposerNote title="WhatsApp" body="Add the customer’s mobile in Details first — any WhatsApp chat on that number then links here." />;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/whatsapp/conversations/${wa!.threadId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not sent');
    await onSent();
  }
  const asks = text.includes('?');

  return (
    <div>
      <h2>WhatsApp {customer.name}</h2>
      <p className="crm-muted crm-small">
        +{wa.number} · {wa.windowOpen ? 'free to reply (inside 24h)' : 'outside 24h — an approved template is needed (~2–5p)'} ·{' '}
        <Link href={`/admin/enquiries/inbox/${wa.threadId}`} className="crm-link">
          Full chat
        </Link>
      </p>
      {wa.windowOpen ? (
        <>
          <textarea className="crm-input" rows={4} autoFocus placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
          {asks && wa.chaseHours > 0 && (
            <label className="crm-check">
              <input type="checkbox" checked={chase} onChange={(e) => setChase(e.target.checked)} /> Chase if no reply in {wa.chaseHours}h
            </label>
          )}
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button
              type="button"
              className="crm-btn crm-btn--wa"
              disabled={busy || !text.trim()}
              onClick={() => send({ text: text.trim(), chaseHours: asks && chase ? wa.chaseHours : 0 })}
            >
              {busy ? 'Sending…' : 'Send WhatsApp'}
            </button>
          </div>
        </>
      ) : templates === null ? (
        <p className="crm-muted">Loading templates…</p>
      ) : !templates.length || !tpl ? (
        <p className="crm-muted">No approved templates yet — create one in WhatsApp Manager.</p>
      ) : (
        <>
          <select
            className="crm-input"
            value={`${tpl.name}|${tpl.lang}`}
            onChange={(e) => {
              const [name, lang] = e.target.value.split('|');
              const t = templates.find((x) => x.name === name && x.language === lang);
              setTpl({ name, lang, params: Array.from({ length: t?.params ?? 0 }, (_, i) => (i === 0 ? first : '')) });
            }}
          >
            {templates.map((t) => (
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.name}
              </option>
            ))}
          </select>
          {templates.find((t) => t.name === tpl.name)?.body && (
            <p className="crm-tpl">{templates.find((t) => t.name === tpl.name)?.body}</p>
          )}
          {tpl.params.map((p, i) => (
            <input
              key={i}
              className="crm-input"
              placeholder={`{{${i + 1}}}`}
              value={p}
              onChange={(e) => setTpl({ ...tpl, params: tpl.params.map((x, j) => (j === i ? e.target.value : x)) })}
            />
          ))}
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button
              type="button"
              className="crm-btn crm-btn--wa"
              disabled={busy || tpl.params.some((x) => !x.trim())}
              onClick={() => send({ template: tpl.name, lang: tpl.lang, params: tpl.params })}
            >
              {busy ? 'Sending…' : 'Send template'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ComposerNote({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <h2>{title}</h2>
      <p className="crm-muted">{body}</p>
    </div>
  );
}

function LogComposer({ id, kind, phone, onSaved }: { id: string; kind: 'note' | 'call' | 'visit'; phone: string | null; onSaved: () => Promise<void> }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const title = { note: 'Add a note', call: 'Log a call', visit: 'Log a site visit' }[kind];
  const placeholder = { note: 'Anything worth remembering…', call: 'What was said?', visit: 'How did the visit go?' }[kind];
  async function save() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, body }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not saved');
    await onSaved();
  }
  return (
    <div>
      <h2>{title}</h2>
      {kind === 'call' && phone && (
        <a className="crm-btn crm-btn--ghost crm-callbtn" href={`tel:${phone.replace(/\s/g, '')}`}>
          📞 Call {phone}
        </a>
      )}
      <textarea className="crm-input" rows={5} autoFocus placeholder={placeholder} value={body} onChange={(e) => setBody(e.target.value)} />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !body.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/** Until Microsoft 365 is connected: write it here, it opens in your email app and is logged on the timeline. */
function EmailComposer({ id, customer, onSaved }: { id: string; customer: Customer; onSaved: () => Promise<void> }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(`Hi ${customer.name.split(/\s+/)[0] || ''},\n\n`);
  const [busy, setBusy] = useState(false);
  if (!customer.email) return <ComposerNote title="Email" body="No email address for this customer — add one in Details." />;
  async function go() {
    setBusy(true);
    window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await fetch(`/api/crm/projects/${id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'email', body: `To ${customer.email}${subject ? ` — ${subject}` : ''}\n\n${body.trim()}` }),
    }).catch(() => {});
    setBusy(false);
    await onSaved();
  }
  return (
    <div>
      <h2>Email {customer.name}</h2>
      <p className="crm-muted crm-small">To {customer.email} · opens in your email app and is saved to the timeline.</p>
      <input className="crm-input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className="crm-input" rows={7} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !body.trim()} onClick={go}>
          Write email
        </button>
      </div>
    </div>
  );
}

function PhotoQuick({ id, onDone }: { id: string; onDone: () => Promise<void> }) {
  const [cat, setCat] = useState('site');
  const [busy, setBusy] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    await addPhotos(id, cat, files).catch(() => 0);
    setBusy(false);
    await onDone();
  }
  return (
    <div>
      <h2>Photos</h2>
      <div className="crm-checks">
        {PHOTO_CATEGORIES.map((c) => (
          <label key={c.key} className={cat === c.key ? 'on' : ''}>
            <input type="radio" name="cat" checked={cat === c.key} onChange={() => setCat(c.key)} />
            {c.label}
          </label>
        ))}
      </div>
      <div className="crm-photo-actions" style={{ marginTop: '0.8rem' }}>
        <button type="button" className="crm-btn crm-btn--solar crm-btn--big" disabled={busy} onClick={() => cam.current?.click()}>
          {busy ? 'Preparing…' : `📷 Take ${photoLabel(cat).toLowerCase()} photo`}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => pick.current?.click()}>
          🖼 Gallery
        </button>
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files)} />
      <input ref={pick} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
    </div>
  );
}

function TaskList({ tasks, onAdd, onChanged }: { tasks: CrmTask[]; onAdd: () => void; onChanged: () => Promise<void> }) {
  const [showDone, setShowDone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('en-CA');
  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');
  async function toggle(t: CrmTask) {
    setBusy(t.id);
    await fetch(`/api/crm/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: t.status === 'done' ? 'todo' : 'done' }),
    }).catch(() => null);
    setBusy(null);
    await onChanged();
  }
  const row = (t: CrmTask) => {
    const late = t.status !== 'done' && t.due_date && t.due_date < today;
    const isToday = t.due_date === today;
    return (
      <li key={t.id} className={t.status === 'done' ? 'done' : ''}>
        <button type="button" className="crm-tick" disabled={busy === t.id} aria-label={t.status === 'done' ? 'Reopen' : 'Mark done'} onClick={() => toggle(t)}>
          {t.status === 'done' ? '✓' : ''}
        </button>
        <span className="crm-task-main">
          <b>{t.title}</b>
          <small>
            {[t.assignee, t.priority === 'high' ? 'High priority' : ''].filter(Boolean).join(' · ')}
          </small>
        </span>
        {t.due_date && (
          <span className={`crm-task-due${late ? ' late' : isToday ? ' today' : ''}`}>
            {isToday
              ? 'Today'
              : new Date(`${t.due_date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        )}
      </li>
    );
  };
  return (
    <div className="crm-tasks">
      <div className="crm-tasks-head">
        <b>Tasks{open.length ? ` (${open.length})` : ''}</b>
        <button type="button" className="crm-link" onClick={onAdd}>
          + Add task
        </button>
      </div>
      {open.length > 0 && <ul>{open.map(row)}</ul>}
      {done.length > 0 && (
        <>
          <button type="button" className="crm-link crm-tasks-done" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide' : 'Show'} {done.length} done
          </button>
          {showDone && <ul>{done.map(row)}</ul>}
        </>
      )}
    </div>
  );
}

function TaskEditor({
  id,
  team,
  defaultAssignee,
  onSaved,
}: {
  id: string;
  team: { id: string; name: string }[];
  defaultAssignee: string | null;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState(defaultAssignee || '');
  const [high, setHigh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const iso = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toLocaleDateString('en-CA');
  };
  async function save() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${id}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, due_date: due || null, assignee_id: assignee || null, priority: high ? 'high' : 'normal' }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not saved');
    await onSaved();
  }
  const ideas = ['Send quote', 'Send invoice', 'Send EV guide', 'Chase for photos', 'Book survey', 'Check funding', 'Order kit'];
  return (
    <div>
      <h2>New task</h2>
      <input className="crm-input" autoFocus placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="crm-quickpicks">
        {ideas.map((i) => (
          <button key={i} type="button" onClick={() => setTitle(i)}>
            {i}
          </button>
        ))}
      </div>
      <div className="crm-grid2">
        <div>
          <label className="crm-label">Who</label>
          <select className="crm-input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="crm-label">Due</label>
          <input className="crm-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <div className="crm-quickpicks">
        <button type="button" onClick={() => setDue(iso(0))}>Today</button>
        <button type="button" onClick={() => setDue(iso(1))}>Tomorrow</button>
        <button type="button" onClick={() => setDue(iso(7))}>Next week</button>
        <label className="crm-check" style={{ marginTop: 0 }}>
          <input type="checkbox" checked={high} onChange={(e) => setHigh(e.target.checked)} /> High priority
        </label>
      </div>
      <p className="crm-muted crm-small">
        They get a notification, and it shows in their My day and on the Tasks page. Anyone with CRM or Tasks access can be picked.
      </p>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !title.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Add task'}
        </button>
      </div>
    </div>
  );
}

/** The current time, refreshed each minute (so "overdue" flips without a reload). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function NextStepBar({ project, onEdit, onDone }: { project: Project; onEdit: () => void; onDone: () => void }) {
  const now = useNow();
  if (project.stage === 'complete' || project.stage === 'lost') return null;
  if (!project.next_step) {
    return (
      <button type="button" className="crm-nextbar empty" onClick={onEdit}>
        ⏰ <span>No next step — add one so this doesn’t go quiet</span>
      </button>
    );
  }
  const at = project.next_step_at ? new Date(project.next_step_at) : null;
  const late = at && at.getTime() < now;
  const today = at && at.toDateString() === new Date(now).toDateString();
  return (
    <div className={`crm-nextbar${late ? ' late' : today ? ' today' : ''}`}>
      <button type="button" className="crm-nextbar-main" onClick={onEdit}>
        <small>Next step{at ? ` · ${late ? 'overdue · ' : ''}${when(at.toISOString())}` : ''}</small>
        <span>{project.next_step}</span>
      </button>
      <button type="button" className="crm-nextbar-done" onClick={onDone} aria-label="Mark done">
        ✓ Done
      </button>
    </div>
  );
}

function NextStepEditor({ project, onSave }: { project: Project; onSave: (text: string | null, at: string | null) => Promise<void> }) {
  const [text, setText] = useState(project.next_step || '');
  const [at, setAt] = useState(toLocalInput(project.next_step_at));
  const quick = (label: string, d: Date) => (
    <button type="button" onClick={() => setAt(toLocalInput(d.toISOString()))}>
      {label}
    </button>
  );
  const day = (offset: number, h: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const nextMonday = () => {
    const d = day(((8 - new Date().getDay()) % 7) || 7, 9);
    return d;
  };
  const ideas = ['Call back', 'Chase survey photos', 'Book survey', 'Send quote', 'Chase quote', 'Book install'];
  return (
    <div>
      <h2>Next step</h2>
      <input className="crm-input" autoFocus placeholder="e.g. Chase quote" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="crm-quickpicks">
        {ideas.map((i) => (
          <button key={i} type="button" onClick={() => setText(i)}>
            {i}
          </button>
        ))}
      </div>
      <label className="crm-label">When</label>
      <div className="crm-quickpicks">
        {quick('Later today', day(0, Math.min(17, new Date().getHours() + 2)))}
        {quick('Tomorrow 9am', day(1, 9))}
        {quick('In 3 days', day(3, 9))}
        {quick('Next Monday', nextMonday())}
      </div>
      <input className="crm-input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
      <p className="crm-muted crm-small">You’ll get a notification when it’s due.</p>
      <div className="crm-actions">
        <button
          type="button"
          className="crm-btn crm-btn--solar"
          disabled={!text.trim()}
          onClick={() => onSave(text.trim(), at ? new Date(at).toISOString() : null)}
        >
          Save
        </button>
        {project.next_step && (
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => onSave(null, null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function Photos({ id, photos, onChanged }: { id: string; photos: Photo[]; onChanged: () => Promise<void> }) {
  const [cat, setCat] = useState<string>('all');
  const [waiting, setWaiting] = useState(0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Photo | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const target = cat === 'all' ? 'site' : cat;

  const refreshQueue = useCallback(async () => {
    const q = await queued().catch(() => []);
    setWaiting(q.filter((p) => p.projectId === id).length);
  }, [id]);

  useEffect(() => {
    const stop = watchQueue();
    let before = -1;
    const onQ = async () => {
      const q = await queued().catch(() => []);
      const n = q.filter((p) => p.projectId === id).length;
      setWaiting(n);
      if (before > n) void onChanged(); // something finished uploading
      before = n;
    };
    window.addEventListener(QUEUE_CHANGED, onQ);
    void onQ();
    return () => {
      stop();
      window.removeEventListener(QUEUE_CHANGED, onQ);
    };
  }, [id, onChanged]);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      await addPhotos(id, target, files);
    } finally {
      setBusy(false);
      await refreshQueue();
      await onChanged();
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of photos) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [photos]);
  const shown = cat === 'all' ? photos : photos.filter((p) => p.category === cat);

  return (
    <div>
      <div className="crm-stages crm-stages--tight">
        <button type="button" className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>
          All <span>{photos.length}</span>
        </button>
        {PHOTO_CATEGORIES.map((c) => (
          <button key={c.key} type="button" className={cat === c.key ? 'on' : ''} onClick={() => setCat(c.key)}>
            {c.label} <span>{counts[c.key] || 0}</span>
          </button>
        ))}
      </div>

      <div className="crm-photo-actions">
        <button type="button" className="crm-btn crm-btn--solar crm-btn--big" disabled={busy} onClick={() => cameraRef.current?.click()}>
          📷 Take {photoLabel(target).toLowerCase()} photo
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => pickRef.current?.click()}>
          🖼 From gallery
        </button>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ''))} />
        <input ref={pickRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ''))} />
      </div>
      {cat === 'all' && <p className="crm-muted crm-small">Pick a type above first — photos taken from “All” are filed under Site.</p>}
      {(busy || waiting > 0) && (
        <p className="crm-banner">
          {busy ? 'Preparing photos…' : `${waiting} photo${waiting === 1 ? '' : 's'} waiting to upload`}
          {!busy && (typeof navigator !== 'undefined' && !navigator.onLine ? ' — no signal, they’ll go up when it’s back.' : '…')}
          {!busy && (
            <button type="button" className="crm-link" onClick={() => void uploadQueued()}>
              Retry now
            </button>
          )}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="crm-muted">No {cat === 'all' ? '' : `${photoLabel(cat).toLowerCase()} `}photos yet.</p>
      ) : (
        <div className="crm-photos">
          {shown.map((p) => (
            <button key={p.id} type="button" className="crm-photo" onClick={() => setOpen(p)}>
              {/* Signed storage links — next/image can't optimise them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {p.thumb ? <img src={p.thumb} alt={p.caption || photoLabel(p.category)} loading="lazy" /> : <span>📷</span>}
              {cat === 'all' && <span className="crm-photo-tag">{photoLabel(p.category)}</span>}
            </button>
          ))}
        </div>
      )}

      {open && (
        <PhotoViewer
          photo={open}
          onClose={() => setOpen(null)}
          onChanged={async () => {
            setOpen(null);
            await onChanged();
          }}
        />
      )}
    </div>
  );
}

function PhotoViewer({ photo, onClose, onChanged }: { photo: Photo; onClose: () => void; onChanged: () => Promise<void> }) {
  const [caption, setCaption] = useState(photo.caption || '');
  const [category, setCategory] = useState(photo.category);
  const dirty = caption !== (photo.caption || '') || category !== photo.category;
  async function save() {
    await fetch(`/api/crm/photos/${photo.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caption, category }),
    });
    await onChanged();
  }
  async function remove() {
    if (!confirm('Delete this photo?')) return;
    await fetch(`/api/crm/photos/${photo.id}`, { method: 'DELETE' });
    await onChanged();
  }
  return (
    <div className="crm-viewer" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="crm-viewer-box" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo.url ? <img src={photo.url} alt={photo.caption || ''} /> : <p className="crm-muted">Image unavailable</p>}
        <div className="crm-viewer-meta">
          <span className="crm-muted crm-small">
            {photo.by ? `${photo.by} · ` : ''}
            {when(photo.created_at)}
          </span>
          <input className="crm-input" placeholder="Caption (e.g. consumer unit, roof south face)" value={caption} onChange={(e) => setCaption(e.target.value)} />
          <select className="crm-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {PHOTO_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <div className="crm-actions">
            {dirty && (
              <button type="button" className="crm-btn crm-btn--solar" onClick={save}>
                Save
              </button>
            )}
            {photo.url && (
              <a className="crm-btn crm-btn--ghost" href={photo.url} target="_blank" rel="noreferrer">
                Full size
              </a>
            )}
            <button type="button" className="crm-btn crm-btn--ghost" onClick={remove}>
              Delete
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CustomerEditor({ customer, wa, onSaved }: { customer: Customer; wa: WaInfo | null; onSaved: () => Promise<void> }) {
  const init = { name: customer.name, phone: customer.phone || '', email: customer.email || '', postcode: customer.postcode || '' };
  const [c, setC] = useState(init);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const dirty = JSON.stringify(c) !== JSON.stringify(init);
  const set = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value });
  async function save() {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(c),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || 'Not saved');
    await onSaved();
  }
  return (
    <div className="crm-customer">
      <h3>Contact</h3>
      <label className="crm-label">Name</label>
      <input className="crm-input" value={c.name} onChange={set('name')} />
      <div className="crm-grid2">
        <div>
          <label className="crm-label">Mobile</label>
          <input className="crm-input" type="tel" value={c.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="crm-label">Postcode</label>
          <input className="crm-input" value={c.postcode} onChange={set('postcode')} />
        </div>
      </div>
      <label className="crm-label">Email</label>
      <input className="crm-input" type="email" value={c.email} onChange={set('email')} />
      <p className="crm-muted crm-small">
        {wa?.number
          ? wa.messages
            ? `💬 WhatsApp linked on +${wa.number} — ${wa.messages} message${wa.messages === 1 ? '' : 's'} on the timeline.`
            : `💬 No WhatsApp chat on +${wa.number} yet — any chat on this number links here automatically.`
          : 'Add a mobile and any WhatsApp chat on that number links here automatically.'}
        {' · Source: '}
        {customer.source}
      </p>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      {dirty && (
        <div className="crm-actions">
          <button type="button" className="crm-btn crm-btn--solar" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save contact'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setC(init)}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

function Details({
  project,
  customer,
  wa,
  team,
  onSave,
  onCustomerSaved,
  isAdmin,
  onDelete,
}: {
  project: Project;
  customer: Customer;
  wa: WaInfo | null;
  team: { id: string; name: string }[];
  onSave: (b: Partial<Project>) => Promise<boolean>;
  onCustomerSaved: () => Promise<void>;
  isAdmin: boolean;
  onDelete: () => void;
}) {
  const initial = useMemo(
    () => ({
      title: project.title,
      products: project.products,
      value: project.value == null ? '' : String(project.value),
      owner_id: project.owner_id || '',
      address: project.address || '',
      postcode: project.postcode || '',
      survey_at: toLocalInput(project.survey_at),
      install_at: toLocalInput(project.install_at),
      simpliheat_url: project.simpliheat_url || '',
      opensolar_url: project.opensolar_url || '',
      lost_reason: project.lost_reason || '',
      notes: project.notes || '',
    }),
    [project]
  );
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setSaved(false);
    setF({ ...f, [k]: e.target.value });
  };

  async function save() {
    setSaving(true);
    const ok = await onSave({
      ...f,
      value: f.value === '' ? null : Number(f.value),
      owner_id: f.owner_id || null,
      survey_at: f.survey_at ? new Date(f.survey_at).toISOString() : null,
      install_at: f.install_at ? new Date(f.install_at).toISOString() : null,
    } as unknown as Partial<Project>);
    setSaving(false);
    setSaved(ok);
  }

  return (
    <div className="crm-details">
      <CustomerEditor key={`${customer.id}-${customer.phone}-${customer.name}`} customer={customer} wa={wa} onSaved={onCustomerSaved} />

      <h3 className="crm-h3">Opportunity</h3>
      <label className="crm-label">Opportunity name</label>
      <input className="crm-input" value={f.title} onChange={set('title')} />

      <label className="crm-label">Products</label>
      <div className="crm-checks">
        {PRODUCTS.map((p) => (
          <label key={p.key} className={f.products.includes(p.key) ? 'on' : ''}>
            <input
              type="checkbox"
              checked={f.products.includes(p.key)}
              onChange={(e) => {
                setSaved(false);
                setF({ ...f, products: e.target.checked ? [...f.products, p.key] : f.products.filter((x) => x !== p.key) });
              }}
            />
            {p.label}
          </label>
        ))}
      </div>

      <div className="crm-grid2">
        <div>
          <label className="crm-label">Value £ (inc. VAT)</label>
          <input className="crm-input" inputMode="decimal" value={f.value} onChange={set('value')} />
        </div>
        <div>
          <label className="crm-label">Owner</label>
          <select className="crm-input" value={f.owner_id} onChange={set('owner_id')}>
            <option value="">—</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="crm-label">Site address</label>
      <input className="crm-input" value={f.address} onChange={set('address')} placeholder="If different from the customer’s" />
      <div className="crm-grid2">
        <div>
          <label className="crm-label">Postcode</label>
          <input className="crm-input" value={f.postcode} onChange={set('postcode')} />
        </div>
        <div />
      </div>

      <div className="crm-grid2">
        <div>
          <label className="crm-label">Survey</label>
          <input className="crm-input" type="datetime-local" value={f.survey_at} onChange={set('survey_at')} />
        </div>
        <div>
          <label className="crm-label">Install</label>
          <input className="crm-input" type="datetime-local" value={f.install_at} onChange={set('install_at')} />
        </div>
      </div>

      <label className="crm-label">SimpliHeat project link</label>
      <div className="crm-linkrow">
        <input className="crm-input" type="url" value={f.simpliheat_url} onChange={set('simpliheat_url')} placeholder="https://…" />
        {initial.simpliheat_url && (
          <a className="crm-btn crm-btn--ghost" href={initial.simpliheat_url} target="_blank" rel="noreferrer">
            Open
          </a>
        )}
      </div>
      <label className="crm-label">OpenSolar project link</label>
      <div className="crm-linkrow">
        <input className="crm-input" type="url" value={f.opensolar_url} onChange={set('opensolar_url')} placeholder="https://…" />
        {initial.opensolar_url && (
          <a className="crm-btn crm-btn--ghost" href={initial.opensolar_url} target="_blank" rel="noreferrer">
            Open
          </a>
        )}
      </div>

      {project.stage === 'lost' && (
        <>
          <label className="crm-label">Why was it lost?</label>
          <input className="crm-input" value={f.lost_reason} onChange={set('lost_reason')} placeholder="Price, timing, went elsewhere…" />
        </>
      )}

      <label className="crm-label">Notes</label>
      <textarea className="crm-input" rows={5} value={f.notes} onChange={set('notes')} />

      <div className="crm-savebar">
        <button type="button" className="crm-btn crm-btn--solar" disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : saved && !dirty ? 'Saved ✓' : 'Save changes'}
        </button>
        {dirty && (
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => setF(initial)}>
            Undo
          </button>
        )}
      </div>

      {isAdmin && (
        <button type="button" className="crm-link crm-danger" onClick={onDelete}>
          Delete opportunity
        </button>
      )}
      <p className="crm-muted crm-small">Created {when(project.created_at)} · stage {stageLabel(project.stage)}</p>
    </div>
  );
}

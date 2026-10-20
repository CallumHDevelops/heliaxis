'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { addPhotos } from '@/lib/crm/photo-queue';
import { PHOTO_CATEGORIES, photoLabel, STAGES } from '@/lib/crm/stages';
import type { PrimaryAction } from '@/lib/projects/primary-action';
import { plusDays } from '@/lib/projects/feed';
import type { TeamMember } from '@/lib/projects/server';
import { TemplateSendFields, useTemplateSend } from '@/components/admin/TemplateSend';
import { Sheet, StageChip } from '../CrmUi';
import { firstName, londonIso, nextWeekday, ukDayOf, ukTime } from '../crm-shared';
import { SnippetPicker, WhatsAppDocSend, type CrmDoc } from './ProjectExtras';
import { copyText, send, type Area, type Customer, type Project, type WaInfo } from './record-shared';

/** What the + sheet can open. */
export type SheetKey = null | 'menu' | 'task' | 'next' | 'whatsapp' | 'note' | 'call' | 'visit' | 'email' | 'photo' | 'stage' | 'delete' | 'link' | 'newproject';

/** "Add to Jane": the + button's sheet. WhatsApp has its own green button now; the stage's own action is the last tile. */
export function ActionMenu({ customer, tile, onPick, onTile }: { customer: Customer; tile: PrimaryAction['tile']; onPick: (s: SheetKey) => void; onTile: () => void }) {
  const items: [SheetKey, string, string, string?][] = [
    ['task', '✓', 'Task', 'Who and when'],
    ['note', '✎', 'Note'],
    ['call', '☎', 'Log a call'],
    ['next', '⏰', 'Next step', 'Follow-up reminder'],
    ['photo', '📷', 'Photos'],
    ['visit', '⌂', 'Site visit'],
    ['email', '✉', 'Email', customer.email ? undefined : 'No email yet'],
    ['stage', '➜', 'Move stage'],
  ];
  return (
    <Sheet title={`Add to ${customer.name}`} onClose={() => onPick(null)}>
      <div className="crm-menu">
        {items.map(([k, icon, label, hint]) => (
          <button key={k} type="button" onClick={() => onPick(k)}>
            <span className="crm-menu-icon" aria-hidden="true">
              {icon}
            </span>
            <span>{label}</span>
            {hint && <small>{hint}</small>}
          </button>
        ))}
        {tile && (
          <button type="button" className="crmr-menu-tile" onClick={onTile}>
            <span className="crm-menu-icon" aria-hidden="true">
              ★
            </span>
            <span>{tile.label}</span>
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** The stages, grouped Sales / Delivery / Done; the stage's own move first. */
export function StageSheet({
  stage,
  primary,
  onPick,
  onPrimary,
  onClose,
}: {
  stage: string;
  primary: PrimaryAction | null;
  onPick: (stage: string) => void;
  onPrimary: () => void;
  onClose: () => void;
}) {
  const groups: [string, string][] = [
    ['sales', 'Sales'],
    ['delivery', 'Delivery'],
    ['done', 'Done'],
  ];
  return (
    <Sheet title="Move stage" onClose={onClose}>
      {primary && primary.action === 'move_next' && (
        <button type="button" className="crm-btn crmr-stagego" onClick={onPrimary}>
          {primary.label}
        </button>
      )}
      {groups.map(([g, label]) => (
        <div key={g} className="crmr-stagegroup">
          <h3 className="crm-h3">{label}</h3>
          <div className="crm-stage-list">
            {STAGES.filter((s) => s.group === g).map((s) => (
              <button key={s.key} type="button" className={stage === s.key ? 'on' : ''} disabled={stage === s.key} onClick={() => onPick(s.key)}>
                <StageChip stage={s.key} />
                {stage === s.key ? ' ✓ now' : ''}
              </button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  );
}

/** The job a sheet saves to, or (from a WhatsApp chat) how to find or open it when Save is pressed. */
export type JobId = string | (() => Promise<string>);
const jobIdOf = (id: JobId) => (typeof id === 'string' ? Promise.resolve(id) : id());

export function LogComposer({
  id,
  kind,
  phone,
  initial = '',
  children,
  onSaved,
  onClose,
}: {
  id: JobId;
  kind: 'note' | 'call' | 'visit';
  phone: string | null;
  /** What the box starts with (a chat's quoted message), the cursor after it. */
  initial?: string;
  /** Above the box (a chat says which job it goes on). */
  children?: ReactNode;
  onSaved: (body: string) => void;
  onClose: () => void;
}) {
  const [body, setBody] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (initial) box.current?.setSelectionRange(initial.length, initial.length);
  }, [initial]);
  const title = { note: 'Add a note', call: 'Log a call', visit: 'Log a site visit' }[kind];
  const placeholder = { note: 'Anything worth remembering…', call: 'What was said?', visit: 'How did the visit go?' }[kind];
  async function save() {
    setBusy(true);
    setErr('');
    try {
      await send(`/api/crm/projects/${await jobIdOf(id)}/activities`, 'POST', { kind, body });
      onSaved(body.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={title} onClose={onClose}>
      {children}
      {kind === 'call' && phone && (
        <a className="crm-btn crm-btn--ghost crm-callbtn" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
          ☎ Call {phone}
        </a>
      )}
      <textarea ref={box} className="crm-input" rows={5} autoFocus placeholder={placeholder} value={body} onChange={(e) => setBody(e.target.value)} />
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !body.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  );
}

export function PhotoQuick({ id, initialCat, onDone, onClose }: { id: string; initialCat?: string; onDone: () => void; onClose: () => void }) {
  const [cat, setCat] = useState(initialCat || 'site');
  const [busy, setBusy] = useState(false);
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    await addPhotos(id, cat, files).catch(() => 0);
    setBusy(false);
    onDone();
  }
  return (
    <Sheet title="Photos" onClose={onClose}>
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
    </Sheet>
  );
}

/** A task as saved, for whoever opened the sheet ("Task added for Esther, due today"). */
export type SavedTask = { title: string; due_date: string | null; assignee_id: string | null };

export function TaskEditor({
  id,
  team,
  today,
  defaultAssignee,
  initial,
  children,
  onSaved,
  onClose,
}: {
  id: JobId;
  team: TeamMember[];
  today: string;
  defaultAssignee: string | null;
  /** What it starts with (a WhatsApp chat's suggestion); with `notes` there's a Notes box too. */
  initial?: { title?: string; due?: string; notes?: string };
  /** Above the fields (a chat says which job it goes on). */
  children?: ReactNode;
  onSaved: (task: SavedTask) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [due, setDue] = useState(initial?.due ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const withNotes = initial?.notes !== undefined;
  const [assignee, setAssignee] = useState(defaultAssignee || '');
  const [high, setHigh] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function save() {
    setBusy(true);
    setErr('');
    try {
      const body = { title, due_date: due || null, assignee_id: assignee || null, priority: high ? 'high' : 'normal', ...(withNotes ? { notes } : {}) };
      const d = await send<{ task?: SavedTask }>(`/api/crm/projects/${await jobIdOf(id)}/tasks`, 'POST', body);
      onSaved(d.task ?? { title, due_date: body.due_date, assignee_id: body.assignee_id });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  }
  const ideas = ['Send quote', 'Send invoice', 'Send EV guide', 'Chase for photos', 'Book survey', 'Check funding', 'Order kit'];
  return (
    <Sheet title="New task" onClose={onClose}>
      {children}
      <input className="crm-input" autoFocus placeholder="What needs doing?" aria-label="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="crm-quickpicks">
        {ideas.map((i) => (
          <button key={i} type="button" onClick={() => setTitle(i)}>
            {i}
          </button>
        ))}
      </div>
      <div className="crm-grid2">
        <div>
          <label className="crm-label" htmlFor="rec-t-who">
            Who
          </label>
          <select id="rec-t-who" className="crm-input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="crm-label" htmlFor="rec-t-due">
            Due
          </label>
          <input id="rec-t-due" className="crm-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      {today && (
        <div className="crm-quickpicks">
          <button type="button" onClick={() => setDue(today)}>
            Today
          </button>
          <button type="button" onClick={() => setDue(plusDays(today, 1))}>
            Tomorrow
          </button>
          <button type="button" onClick={() => setDue(plusDays(today, 7))}>
            Next week
          </button>
          <label className="crm-check" style={{ marginTop: 0 }}>
            <input type="checkbox" checked={high} onChange={(e) => setHigh(e.target.checked)} /> High priority
          </label>
        </div>
      )}
      {withNotes && (
        <>
          <label className="crm-label" htmlFor="rec-t-notes">
            Notes
          </label>
          <textarea id="rec-t-notes" className="crm-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </>
      )}
      <p className="crm-muted crm-small">They get a notification, and it shows in their My work and on the Tasks page. Anyone with CRM or Tasks access can be picked.</p>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !title.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Add task'}
        </button>
      </div>
    </Sheet>
  );
}

/** The next step's quick times (UK): later today, tomorrow 9am, in 3 days, next Monday. */
export function nextStepTimes(now: number): [string, string][] {
  if (!now) return [];
  const today = ukDayOf(now);
  const hour = Number(ukTime(now).slice(0, 2));
  const later = Math.min(17, hour + 2);
  return [
    ...(hour < 17 ? ([['Later today', londonIso(today, `${String(later).padStart(2, '0')}:00`)]] as [string, string][]) : []),
    ['Tomorrow 9am', londonIso(plusDays(today, 1), '09:00')],
    ['In 3 days', londonIso(plusDays(today, 3), '09:00')],
    ['Next Monday', londonIso(nextWeekday(plusDays(today, 1), 1), '09:00')],
  ];
}

export function NextStepEditor({
  project,
  initial,
  now,
  title = 'Next step',
  hint = 'You’ll get a notification when it’s due.',
  children,
  extra,
  onSave,
  onClose,
}: {
  /** The job's next step as it is (Clear shows when it has one); null when the sheet starts from `initial`. */
  project: Pick<Project, 'next_step' | 'next_step_at'> | null;
  /** What it starts with instead (a WhatsApp chat's call-back reminder). */
  initial?: { text: string; at: string | null };
  now: number;
  title?: string;
  /** Who hears when it's due. */
  hint?: ReactNode;
  /** Above the fields (a chat says which job it goes on). */
  children?: ReactNode;
  /** Under the time (a chat's note for the timeline). */
  extra?: ReactNode;
  /** A promise (the chat's save) shows "Saving…", and its error in the sheet. */
  onSave: (text: string | null, at: string | null) => void | Promise<unknown>;
  onClose: () => void;
}) {
  const startAt = initial ? initial.at : (project?.next_step_at ?? null);
  const [text, setText] = useState(initial ? initial.text : project?.next_step || '');
  const [at, setAt] = useState(startAt ? `${ukDayOf(startAt)}T${ukTime(startAt)}` : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ideas = ['Call back', 'Chase survey photos', 'Book survey', 'Send quote', 'Chase quote', 'Book install'];
  const atIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at) ? londonIso(at.slice(0, 10), at.slice(11, 16)) : null;
  async function save(t: string | null, a: string | null) {
    setBusy(true);
    setErr('');
    try {
      await onSave(t, a);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet title={title} onClose={onClose}>
      {children}
      <input className="crm-input" autoFocus placeholder="e.g. Chase quote" aria-label="What’s next" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="crm-quickpicks">
        {ideas.map((i) => (
          <button key={i} type="button" onClick={() => setText(i)}>
            {i}
          </button>
        ))}
      </div>
      <span className="crm-label">When</span>
      <div className="crm-quickpicks">
        {nextStepTimes(now).map(([label, iso]) => (
          <button key={label} type="button" onClick={() => setAt(`${ukDayOf(iso)}T${ukTime(iso)}`)}>
            {label}
          </button>
        ))}
      </div>
      <input className="crm-input" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="When" />
      {atIso && now > 0 && Date.parse(atIso) < now && <p className="crm-banner">That time has gone, so the reminder will go off straight away. Pick a later time if you meant another day.</p>}
      <p className="crm-muted crm-small">{hint}</p>
      {extra}
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !text.trim()} onClick={() => void save(text.trim(), atIso)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {project?.next_step && (
          <button type="button" className="crm-btn crm-btn--ghost" disabled={busy} onClick={() => void save(null, null)}>
            Clear
          </button>
        )}
      </div>
    </Sheet>
  );
}

/**
 * The WhatsApp sheet: only where there's no WhatsApp panel (before it was built, or for staff it
 * doesn't show for). Free replies inside 24 hours, an approved template outside them.
 */
export function WhatsAppComposer({
  projectId,
  docs,
  initialText = '',
  customer,
  wa,
  onSent,
  onClose,
}: {
  projectId: string;
  docs: CrmDoc[];
  initialText?: string;
  customer: Customer;
  wa: WaInfo | null;
  onSent: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [chase, setChase] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Outside the 24h window only a template can go: pre-filled from what the CRM knows.
  const tplSend = useTemplateSend(customer.id, !!wa?.number && !wa.windowOpen && !!wa.configured);
  const { templates, pick: tpl } = tplSend;
  const title = `WhatsApp ${customer.name}`;

  if (!wa?.configured)
    return (
      <Sheet title={title} onClose={onClose}>
        <p className="crm-muted">WhatsApp isn’t connected yet, so sending is off until the Meta keys are added.</p>
      </Sheet>
    );
  if (!wa.number || !wa.threadId)
    return (
      <Sheet title={title} onClose={onClose}>
        <p className="crm-muted">Add their mobile to message them on WhatsApp. Any chat on that number then links here.</p>
      </Sheet>
    );

  async function go(body: Record<string, unknown>) {
    setBusy(true);
    setErr('');
    try {
      await send(`/api/whatsapp/conversations/${wa!.threadId}`, 'POST', body, 'Not sent');
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not sent');
    } finally {
      setBusy(false);
    }
  }
  const asks = text.includes('?');

  return (
    <Sheet title={title} onClose={onClose}>
      <p className="crm-muted crm-small">
        +{wa.number} · {wa.windowOpen ? 'free to reply (inside 24 hours)' : 'outside 24 hours: an approved template is needed (about 2–5p)'}
      </p>
      {wa.windowOpen ? (
        <>
          <SnippetPicker projectId={projectId} name={customer.name} onPick={(t) => setText((cur) => (cur.trim() ? `${cur}\n${t}` : t))} />
          <WhatsAppDocSend id={projectId} docs={docs} onSent={async () => onSent()} />
          <textarea
            className="crm-input"
            rows={4}
            autoFocus
            placeholder="Message"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim() && !busy) {
                e.preventDefault();
                void go({ text: text.trim(), chaseHours: asks && chase ? wa.chaseHours : 0 });
              }
            }}
          />
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
              title="Ctrl/⌘ + Enter"
              onClick={() => go({ text: text.trim(), chaseHours: asks && chase ? wa.chaseHours : 0 })}
            >
              {busy ? 'Sending…' : 'Send WhatsApp'}
            </button>
          </div>
        </>
      ) : templates === null ? (
        <p className="crm-muted">Loading templates…</p>
      ) : !templates.length || !tpl ? (
        <p className="crm-muted">
          No approved templates yet.{' '}
          <Link href="/admin/enquiries/templates" className="crm-link">
            Send one to Meta from WhatsApp templates
          </Link>
        </p>
      ) : (
        <>
          <TemplateSendFields send={tplSend} inputClass="crm-input" />
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--wa" disabled={busy || !tplSend.ready} onClick={() => go({ template: tpl.name, lang: tpl.lang, params: tpl.params })}>
              {busy ? 'Sending…' : 'Send template'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** "Send booking link": asks Unit B's booking for the customer's link, then WhatsApp it or copy it. */
export function LinkSheet({ projectId, onWhatsApp, onClose }: { projectId: string; onWhatsApp: (text: string) => void; onClose: () => void }) {
  const [link, setLink] = useState<{ url: string; whatsappText: string } | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    send<{ url: string; whatsappText: string }>('/api/crm/booking/link', 'POST', { project_id: projectId }, 'Couldn’t make the booking link.')
      .then((d) => live && setLink(d))
      .catch((e) => live && setErr(e instanceof Error ? e.message : 'Couldn’t make the booking link.'));
    return () => {
      live = false;
    };
  }, [projectId]);
  return (
    <Sheet title="Send booking link" onClose={onClose}>
      {err ? (
        <p className="crm-banner crm-banner--err">{err}</p>
      ) : !link ? (
        <p className="crm-muted">Making their link…</p>
      ) : (
        <>
          <p className="crm-muted">They pick a time that suits the surveyor’s diary, and it books itself.</p>
          <p className="crmr-linkbox">{link.url}</p>
          <div className="crm-actions">
            <button type="button" className="crm-btn crm-btn--wa" onClick={() => onWhatsApp(link.whatsappText)}>
              WhatsApp it
            </button>
            <button
              type="button"
              className="crm-btn crm-btn--ghost"
              onClick={async () => {
                if (await copyText(link.url)) setCopied(true);
              }}
            >
              {copied ? 'Copied ✓' : 'Copy link'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/**
 * Delete a job (admins): asks first; a signed or paid job then needs its ref typed (the API's 409).
 * After the customer's last job it says what's kept, then goes back to the list.
 */
export function DeleteSheet({
  project,
  customer,
  canInbox,
  area,
  onClose,
  onDone,
}: {
  project: Project;
  customer: Customer;
  canInbox: boolean;
  area: Area;
  onClose: () => void;
  onDone: (to: string) => void;
}) {
  const [step, setStep] = useState<'ask' | 'type' | 'last'>('ask');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ filesRemoved: number; filesFailed: number } | null>(null);
  const back = area === 'projects' ? '/admin/projects' : '/admin/crm';

  async function go(confirm?: string) {
    setBusy(true);
    setErr('');
    const r = await fetch(`/api/crm/projects/${project.id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(confirm ? { confirm } : {}),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409 && d.needsConfirm) {
      setLabel(d.label || project.project_ref || project.title);
      setMessage(d.message || '');
      setStep('type');
      if (confirm) setErr('That doesn’t match. Type it exactly as shown.');
      return;
    }
    if (!r.ok) return setErr(d.error || 'Not deleted');
    setResult({ filesRemoved: d.filesRemoved ?? 0, filesFailed: d.filesFailed ?? 0 });
    if (d.lastJob) setStep('last');
    else onDone(back);
  }

  return (
    <Sheet title={step === 'last' ? 'Job deleted' : 'Delete this job?'} onClose={step === 'last' ? () => onDone(back) : onClose}>
      {step === 'ask' && (
        <>
          <p>
            This deletes <b>{project.project_ref || project.title}</b> for {customer.name}: its timeline, tasks, photos, documents and portal link. It can’t be undone.
          </p>
          <p className="crm-muted crm-small">If the customer just said no, moving it to Lost keeps the history instead.</p>
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button type="button" className="crm-btn crmr-btn--danger" disabled={busy} onClick={() => void go()}>
              {busy ? 'Deleting…' : 'Delete the job'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
              Keep it
            </button>
          </div>
        </>
      )}
      {step === 'type' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void go(typed);
          }}
        >
          <p>{message}</p>
          <label className="crm-label" htmlFor="rec-del-typed">
            Type {label} to delete everything
          </label>
          <input id="rec-del-typed" className="crm-input" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          {err && <p className="crm-banner crm-banner--err">{err}</p>}
          <div className="crm-actions">
            <button type="submit" className="crm-btn crmr-btn--danger" disabled={busy || !typed.trim()}>
              {busy ? 'Deleting…' : 'Delete everything'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
              Keep it
            </button>
          </div>
        </form>
      )}
      {step === 'last' && (
        <>
          <p>
            {customer.name} has no other jobs. Their details, WhatsApp chat and emails are kept. To remove them too, use Delete in Enquiries.
          </p>
          {result && result.filesFailed > 0 && (
            <p className="crm-banner crm-banner--err">
              {result.filesFailed} file{result.filesFailed === 1 ? '' : 's'} couldn’t be removed from storage, even on a second try.
            </p>
          )}
          <div className="crm-actions">
            {canInbox && (
              <Link className="crm-btn crm-btn--ghost" href="/admin/enquiries">
                Open Enquiries
              </Link>
            )}
            <button type="button" className="crm-btn" onClick={() => onDone(back)}>
              Done
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

/** After tapping Call and coming back: "Log the call with Jane?". */
export function CallPrompt({ name, onAnswered, onNoAnswer, onSkip }: { name: string; onAnswered: () => void; onNoAnswer: () => void; onSkip: () => void }) {
  return (
    <div className="crmr-callbar" role="status">
      <span>Log the call with {firstName(name) || name}?</span>
      <button type="button" className="crm-btn crm-btn--small" onClick={onAnswered}>
        Answered
      </button>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={onNoAnswer}>
        No answer
      </button>
      <button type="button" className="crm-link" onClick={onSkip}>
        Skip
      </button>
    </div>
  );
}


/** A sheet for content that brings its own heading (the email composer). Esc or a click outside closes it. */
export function PlainSheet({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="crm-sheet" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className="crm-sheet-box crmr-plainsheet" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="crmh-x crmr-plainsheet__x" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}

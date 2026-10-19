'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addDaysISO,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_STATUSES,
  todayISO,
  type Assignee,
  type Task,
  type TaskJob,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/tasks';
import {
  applyOps,
  enqueue,
  flush,
  loadCache,
  loadOutbox,
  saveCache,
  saveOutbox,
  withDerived,
  type TaskOp,
} from '@/lib/tasks-offline';
import './tasks.css';

type View = 'open' | 'overdue' | 'done' | 'all';
type Draft = {
  title: string;
  notes: string;
  /** profile id, '' = unassigned, OTHER = free-text name */
  assignee: string;
  assigneeName: string;
  due: string;
  priority: TaskPriority;
};

const OTHER = '__other__';
const EMPTY: Draft = { title: '', notes: '', assignee: '', assigneeName: '', due: '', priority: 'normal' };
const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

function draftFrom(t: Task): Draft {
  return {
    title: t.title,
    notes: t.notes ?? '',
    assignee: t.assignee_id ?? (t.assignee_name ? OTHER : ''),
    assigneeName: t.assignee_name ?? '',
    due: t.due_date ?? '',
    priority: t.priority,
  };
}

function payloadFrom(d: Draft) {
  return {
    title: d.title,
    notes: d.notes,
    assignee_id: d.assignee && d.assignee !== OTHER ? d.assignee : '',
    assignee_name: d.assignee === OTHER ? d.assigneeName : '',
    due_date: d.due,
    priority: d.priority,
  };
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Days from today to the next Friday (0 if today is Friday). */
function daysToFriday(today: string) {
  const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
  return (5 - dow + 7) % 7;
}

function dueInfo(t: Task, today: string) {
  if (!t.due_date) return { label: 'No deadline', cls: 'is-none' };
  if (t.status === 'done') return { label: fmtDate(t.due_date), cls: 'is-done' };
  if (t.due_date < today) {
    const days = Math.round((Date.parse(today) - Date.parse(t.due_date)) / 86400000);
    return { label: `${days} day${days > 1 ? 's' : ''} overdue`, cls: 'is-overdue' };
  }
  if (t.due_date === today) return { label: 'Due today', cls: 'is-today' };
  if (t.due_date === addDaysISO(today, 1)) return { label: 'Tomorrow', cls: 'is-soon' };
  if (t.due_date <= addDaysISO(today, 7)) return { label: fmtDate(t.due_date), cls: 'is-soon' };
  return { label: fmtDate(t.due_date), cls: '' };
}

function TaskForm({
  draft,
  setDraft,
  people,
  meId,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  people: Assignee[];
  meId: string | null;
  submitLabel: string;
  onSubmit: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
}) {
  const today = todayISO();
  const quick: [string, string][] = [
    ['Today', today],
    ['Tomorrow', addDaysISO(today, 1)],
    ['Friday', addDaysISO(today, daysToFriday(today) || 7)],
    ['Next week', addDaysISO(today, 7)],
  ];
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  return (
    <form
      className="tk-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.title.trim()) onSubmit();
      }}
    >
      <input
        className="tk-title-input"
        placeholder="What needs doing?"
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
        autoFocus={!draft.title}
        required
      />
      <textarea
        placeholder="Notes, links, context (optional)"
        rows={2}
        value={draft.notes}
        onChange={(e) => set({ notes: e.target.value })}
      />
      <div className="tk-form-row">
        <label>
          <span>Assign to</span>
          <select value={draft.assignee} onChange={(e) => set({ assignee: e.target.value })}>
            <option value="">Unassigned</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.id === meId ? ' (me)' : ''}
              </option>
            ))}
            <option value={OTHER}>Someone else…</option>
          </select>
          {draft.assignee === OTHER && (
            <input
              placeholder="Their name"
              value={draft.assigneeName}
              onChange={(e) => set({ assigneeName: e.target.value })}
            />
          )}
        </label>
        <label>
          <span>Deadline</span>
          <input type="date" value={draft.due} onChange={(e) => set({ due: e.target.value })} />
          <span className="tk-quick">
            {quick.map(([label, iso]) => (
              <button
                key={label}
                type="button"
                className={draft.due === iso ? 'is-on' : ''}
                onClick={() => set({ due: draft.due === iso ? '' : iso })}
              >
                {label}
              </button>
            ))}
          </span>
        </label>
        <label>
          <span>Priority</span>
          <span className="tk-seg">
            {TASK_PRIORITIES.map((p) => (
              <button
                key={p}
                type="button"
                className={`pr-${p}${draft.priority === p ? ' is-on' : ''}`}
                onClick={() => set({ priority: p })}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </span>
        </label>
      </div>
      <div className="tk-form-actions">
        {onDelete && (
          <button type="button" className="tk-link tk-link--danger tk-form-delete" onClick={onDelete}>
            Delete
          </button>
        )}
        {onCancel && (
          <button type="button" className="tk-btn" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="tk-btn tk-btn--primary" disabled={!draft.title.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

/** The task form in a pop-up card (a sheet from the bottom on phones). Esc or the backdrop closes it. */
function TaskModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div className="tk-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tk-modal-card" role="dialog" aria-modal="true" aria-label={title}>
        <header className="tk-modal-head">
          <h2>{title}</h2>
          <button type="button" className="tk-modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function TasksBoard({
  initialTasks,
  people,
  meId,
  setupNeeded,
}: {
  initialTasks: Task[];
  people: Assignee[];
  meId: string | null;
  setupNeeded: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [view, setView] = useState<View>('open');
  const [who, setWho] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  // Which job each CRM task belongs to (from the server; not kept offline).
  const [jobs, setJobs] = useState<Record<string, TaskJob>>({});

  // Local-first: the outbox holds changes not yet on the server (see tasks-offline.ts).
  const store = meId ?? 'anon';
  const outbox = useRef<TaskOp[]>([]);
  const server = useRef<Task[]>(initialTasks);
  const flushing = useRef(false);

  const publish = useCallback(() => {
    const merged = applyOps(server.current, outbox.current);
    setTasks(merged);
    setPending(outbox.current.length);
    saveOutbox(store, outbox.current);
    saveCache(store, merged);
  }, [store]);

  const sync = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    setSyncing(true);
    try {
      if (outbox.current.length) {
        const sent = outbox.current;
        const r = await flush(sent);
        // Keep anything queued while we were sending.
        outbox.current = [...r.remaining, ...outbox.current.slice(sent.length)];
        if (r.rejected.length) setError(r.rejected.join(' · '));
        if (r.offline) {
          setOnline(false);
          return;
        }
      }
      const res = await fetch('/api/tasks', { cache: 'no-store' }).catch(() => null);
      if (!res) {
        setOnline(false);
        return;
      }
      if (res.ok) {
        const body = await res.json();
        server.current = (body.tasks ?? []) as Task[];
        setJobs((body.jobs ?? {}) as Record<string, TaskJob>);
        setOnline(true);
      }
    } finally {
      flushing.current = false;
      setSyncing(false);
      publish();
    }
  }, [publish]);

  useEffect(() => {
    outbox.current = loadOutbox(store);
    // Offline (page served from the app's cache): the saved copy is newer than the page.
    if (!navigator.onLine) server.current = loadCache(store) ?? initialTasks;
    setOnline(navigator.onLine);
    publish();
    if (navigator.onLine) void sync();

    const onOnline = () => {
      setOnline(true);
      void sync();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => document.visibilityState === 'visible' && navigator.onLine && void sync();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // initialTasks is the server render — only read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // Opened from a notification (?task=<id>): bring that task into view.
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('task');
    if (!id) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`task-${id}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.classList.add('is-flash');
    }, 150);
    return () => clearTimeout(t);
  }, []);

  function mutate(op: TaskOp) {
    setError(null);
    outbox.current = enqueue(outbox.current, op);
    publish();
    void sync();
  }

  const today = todayISO();
  const nameOf = (t: Task) =>
    (t.assignee_id && people.find((p) => p.id === t.assignee_id)?.name) || t.assignee_name || null;

  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done');
    return {
      overdue: open.filter((t) => t.due_date && t.due_date < today).length,
      today: open.filter((t) => t.due_date === today).length,
      week: open.filter((t) => t.due_date && t.due_date > today && t.due_date <= addDaysISO(today, 7)).length,
      open: open.length,
      done: tasks.length - open.length,
    };
  }, [tasks, today]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => {
        if (view === 'open' && t.status === 'done') return false;
        if (view === 'done' && t.status !== 'done') return false;
        if (view === 'overdue' && (t.status === 'done' || !t.due_date || t.due_date >= today)) return false;
        if (who === 'none' && (t.assignee_id || t.assignee_name)) return false;
        if (who !== 'all' && who !== 'none' && t.assignee_id !== who) return false;
        if (q && !`${t.title} ${t.notes ?? ''} ${t.assignee_name ?? ''}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
        if (a.status === 'done') return (b.completed_at ?? '').localeCompare(a.completed_at ?? '');
        if (a.due_date !== b.due_date) {
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        }
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      });
  }, [tasks, view, who, query, today]);

  function create() {
    const now = new Date().toISOString();
    const p = payloadFrom(draft);
    mutate({
      kind: 'create',
      task: {
        id: crypto.randomUUID(),
        title: p.title.trim(),
        notes: p.notes.trim() || null,
        assignee_id: p.assignee_id || null,
        assignee_name: p.assignee_name.trim() || null,
        due_date: p.due_date || null,
        priority: p.priority,
        status: 'todo',
        created_by: meId,
        created_at: now,
        updated_at: now,
        completed_at: null,
      },
    });
    setDraft(EMPTY);
    setAdding(false);
  }

  function update(id: string, patch: Partial<Task>) {
    mutate({ kind: 'update', id, patch: withDerived(patch) });
  }

  const editingTask = editing ? tasks.find((t) => t.id === editing) ?? null : null;
  const closeEdit = useCallback(() => setEditing(null), []);

  function saveEdit(id: string) {
    const p = payloadFrom(editDraft);
    update(id, {
      title: p.title.trim(),
      notes: p.notes.trim() || null,
      assignee_id: p.assignee_id || null,
      assignee_name: p.assignee_name.trim() || null,
      due_date: p.due_date || null,
      priority: p.priority,
    });
    setEditing(null);
  }

  function remove(t: Task) {
    if (!confirm(`Delete “${t.title}”? This can’t be undone.`)) return;
    mutate({ kind: 'delete', id: t.id });
  }

  if (setupNeeded) {
    return (
      <div className="tk-page">
        <h1>Tasks</h1>
        <p className="tk-banner">
          The tasks table isn&apos;t set up yet — run <code>supabase/tasks.sql</code> in the Supabase SQL editor, then
          reload.
        </p>
      </div>
    );
  }

  const VIEWS: [View, string, number][] = [
    ['open', 'Open', stats.open],
    ['overdue', 'Overdue', stats.overdue],
    ['done', 'Done', stats.done],
    ['all', 'All', tasks.length],
  ];

  return (
    <div className="tk-page">
      <div className="tk-head">
        <div>
          <h1>Tasks</h1>
          <p>Create a task, assign it, give it a deadline — then tick it off.</p>
          <p className={`tk-sync${online ? '' : ' is-offline'}`} aria-live="polite">
            {!online
              ? `Offline — ${pending ? `${pending} change${pending > 1 ? 's' : ''} will sync when you're back online` : 'showing your saved copy'}`
              : syncing
                ? 'Syncing…'
                : pending
                  ? `${pending} change${pending > 1 ? 's' : ''} waiting to sync`
                  : 'All changes saved'}
          </p>
        </div>
        {!adding && (
          <button type="button" className="tk-btn tk-btn--primary" onClick={() => setAdding(true)}>
            + New task
          </button>
        )}
      </div>

      <div className="tk-stats">
        <button type="button" className="tk-stat is-overdue" onClick={() => setView('overdue')}>
          <b>{stats.overdue}</b>
          <span>Overdue</span>
        </button>
        <div className="tk-stat is-today">
          <b>{stats.today}</b>
          <span>Due today</span>
        </div>
        <div className="tk-stat">
          <b>{stats.week}</b>
          <span>Next 7 days</span>
        </div>
        <button type="button" className="tk-stat" onClick={() => setView('open')}>
          <b>{stats.open}</b>
          <span>Open</span>
        </button>
        <button type="button" className="tk-stat is-done" onClick={() => setView('done')}>
          <b>{stats.done}</b>
          <span>Done</span>
        </button>
      </div>

      {error && (
        <p className="tk-banner tk-banner--error">
          {error} <button type="button" onClick={() => setError(null)}>Dismiss</button>
        </p>
      )}

      {adding && (
        <TaskModal
          title="New task"
          onClose={() => {
            setAdding(false);
            setDraft(EMPTY);
          }}
        >
          <TaskForm
            draft={draft}
            setDraft={setDraft}
            people={people}
            meId={meId}
            submitLabel="Add task"
            onSubmit={create}
            onCancel={() => {
              setAdding(false);
              setDraft(EMPTY);
            }}
          />
        </TaskModal>
      )}

      {editingTask && (
        <TaskModal title="Edit task" onClose={closeEdit}>
          <TaskForm
            draft={editDraft}
            setDraft={setEditDraft}
            people={people}
            meId={meId}
            submitLabel="Save changes"
            onSubmit={() => saveEdit(editingTask.id)}
            onCancel={closeEdit}
            onDelete={() => {
              closeEdit();
              remove(editingTask);
            }}
          />
        </TaskModal>
      )}

      <div className="tk-toolbar">
        <div className="tk-tabs" role="tablist">
          {VIEWS.map(([v, label, n]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              className={view === v ? 'is-on' : ''}
              onClick={() => setView(v)}
            >
              {label} <span>{n}</span>
            </button>
          ))}
        </div>
        <div className="tk-filters">
          <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
            <option value="all">Everyone</option>
            {meId && <option value={meId}>Assigned to me</option>}
            {people
              .filter((p) => p.id !== meId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            <option value="none">Unassigned</option>
          </select>
          <input
            type="search"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search tasks"
          />
        </div>
      </div>

      <div className="tk-panel">
        {visible.length === 0 && (
          <p className="tk-empty">
            {tasks.length === 0 ? 'No tasks yet — add the first one above.' : 'Nothing here.'}
          </p>
        )}
        <ul className="tk-list">
          {visible.map((t) => {
            const due = dueInfo(t, today);
            const name = nameOf(t);
            const job = t.crm_project_id ? jobs[t.crm_project_id] : undefined;
            return (
              <li key={t.id} id={`task-${t.id}`} className={`tk-item${t.status === 'done' ? ' is-done' : ''}${editing === t.id ? ' is-editing' : ''}`}>
                <button
                  type="button"
                  className="tk-check"
                  aria-label={t.status === 'done' ? 'Mark as not done' : 'Mark as done'}
                  onClick={() => update(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
                >
                  {t.status === 'done' ? '✓' : ''}
                </button>
                <div className="tk-main">
                  <div className="tk-title">
                    {t.priority === 'high' && <span className="tk-pri pr-high">High</span>}
                    {t.priority === 'low' && <span className="tk-pri pr-low">Low</span>}
                    {t.title}
                  </div>
                  {t.notes && <div className="tk-notes">{t.notes}</div>}
                  <div className="tk-meta">
                    <span className={`tk-who${name ? '' : ' is-none'}`}>{name ?? 'Unassigned'}</span>
                    <span className={`tk-due ${due.cls}`}>{due.label}</span>
                    {job && t.crm_project_id && (
                      <a className="tk-who tk-job" href={`/admin/crm/${t.crm_project_id}`} style={{ textDecoration: 'none' }}>
                        Job: {job.ref ? `${job.ref} / ` : ''}
                        {job.name}
                      </a>
                    )}
                  </div>
                </div>
                <div className="tk-actions">
                  <select
                    className={`tk-status st-${t.status}`}
                    value={t.status}
                    onChange={(e) => update(t.id, { status: e.target.value as TaskStatus })}
                    aria-label="Status"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="tk-link"
                    onClick={() => {
                      setEditDraft(draftFrom(t));
                      setEditing(t.id);
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" className="tk-link tk-link--danger" onClick={() => remove(t)}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { TeamMember } from '@/lib/projects/server';
import { plusDays } from '@/lib/projects/feed';
import { Icon, Sheet } from '../CrmUi';
import { dueWords, initials, nextWeekday, shortDate } from '../crm-shared';
import { send, type CrmTask } from './record-shared';

/**
 * The job's Tasks card (research 2.3 "RIGHT" 1): quick-add, overdue first, then soonest, then
 * undated; 5 shown, the rest one tap away. It sits in the page's right-hand column, in the band on
 * tablets and phones, or (docked open from 1280px) in the WhatsApp panel's This job tab, where the
 * record page puts it with createPortal. Its own class carries the CRM colours, so it looks the same
 * inside the panel.
 */
export function TasksCard({
  projectId,
  tasks,
  team,
  me,
  today,
  defaultAssignee,
  delivery,
  where,
  onChanged,
}: {
  projectId: string;
  tasks: CrmTask[];
  team: TeamMember[];
  me: string;
  /** UK date; '' until the clock is known. */
  today: string;
  defaultAssignee: string | null;
  /** At delivery stages a phone shows only what's overdue or due today. */
  delivery: boolean;
  where: 'page' | 'dock';
  /** Read the job again (resolves once it has, so a ticked task doesn't flash back). */
  onChanged: () => Promise<unknown> | void;
}) {
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [snoozing, setSnoozing] = useState<CrmTask | null>(null);
  const [err, setErr] = useState('');

  const open = tasks
    .filter((t) => t.status !== 'done' && !hidden.has(t.id))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || Number(b.priority === 'high') - Number(a.priority === 'high'));
  const done = tasks.filter((t) => t.status === 'done');
  const dueNow = (t: CrmTask) => !!t.due_date && !!today && t.due_date <= today;
  // Phones: up to 3 (at delivery stages, what's overdue or due today, at most 2).
  const phoneMax = delivery ? Math.min(2, open.filter(dueNow).length) : 3;

  async function tick(t: CrmTask, status: 'done' | 'todo') {
    setErr('');
    if (status === 'done') setHidden((h) => new Set(h).add(t.id));
    try {
      await send(`/api/crm/tasks/${t.id}`, 'PATCH', { status });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    }
    await onChanged();
    setHidden(new Set());
  }
  async function snooze(t: CrmTask, due: string, assignee?: string) {
    setSnoozing(null);
    setErr('');
    try {
      await send(`/api/crm/tasks/${t.id}`, 'PATCH', { due_date: due, ...(assignee !== undefined ? { assignee_id: assignee || null } : {}) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    }
    void onChanged();
  }

  return (
    <section className={`crm crmh crmh-card crmr-tasks crmr-tasks--${where}${all ? ' is-all' : ''}${delivery ? ' is-delivery' : ''}`} aria-label="Tasks">
      <div className="crmh-card__h">
        <h3>Tasks</h3>
        {open.length > 0 && <span className="crmh-n">{open.length}</span>}
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small crmh-ml" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
          + Task
        </button>
      </div>
      <div className="crmh-card__b">
        {adding && (
          <QuickAdd
            projectId={projectId}
            team={team}
            me={me}
            today={today}
            defaultAssignee={defaultAssignee}
            onDone={() => {
              setAdding(false);
              void onChanged();
            }}
            onCancel={() => setAdding(false)}
          />
        )}
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        {open.length === 0 && !adding ? (
          <p className="crm-muted crmh-none">No open tasks.</p>
        ) : (
          <ul className="crmr-tasklist">
            {open.map((t, i) => {
              const late = !!t.due_date && !!today && t.due_date < today;
              const isToday = !!t.due_date && t.due_date === today;
              const extra = [i >= 5 ? 'is-more' : '', i >= 3 ? 'is-more3' : '', dueNow(t) ? 'is-due' : ''].filter(Boolean).join(' ');
              return (
                <li key={t.id} className={`crmh-task crmr-task ${extra}`}>
                  <button type="button" className="crmh-tick" onClick={() => void tick(t, 'done')} aria-label={`Done: ${t.title}`} title="Mark as done">
                    <span />
                  </button>
                  <div className="crmh-task__b">
                    <div className="crmh-task__t">{t.title}</div>
                    <div className="crmh-task__m">
                      {t.deadline && (
                        <span className="crmh-tag crmh-tag--deadline">
                          <Icon k="clock" size={12} /> Deadline
                        </span>
                      )}
                      {t.due_date && today && <span className={`crmh-due ${late ? 'late' : isToday ? 'today' : ''}`}>{dueWords(t.due_date, today)}</span>}
                      {t.assignee && (
                        <span className="crmh-ini" title={t.assignee}>
                          {initials(t.assignee)}
                        </span>
                      )}
                    </div>
                  </div>
                  {t.priority === 'high' && <i className="crmh-pri" title="High priority" />}
                  <div className="crmh-task__acts">
                    <button type="button" className="crmh-act" onClick={() => setSnoozing(t)} aria-label={`Snooze or change: ${t.title}`} title="Snooze">
                      <Icon k="clock" size={15} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!all && open.length > 5 && (
          <button type="button" className="crmh-fold crmr-tasks__all" onClick={() => setAll(true)}>
            Show all ({open.length}) <span aria-hidden="true">▾</span>
          </button>
        )}
        {!all && open.length > phoneMax && (
          <button type="button" className="crmh-fold crmr-tasks__allphone" onClick={() => setAll(true)}>
            All tasks ({open.length}) <span aria-hidden="true">▾</span>
          </button>
        )}
        {done.length > 0 && (
          <>
            <button type="button" className="crmh-fold crmr-tasks__done" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
              {showDone ? 'Hide' : 'Show'} {done.length} done <span aria-hidden="true">{showDone ? '▾' : '▸'}</span>
            </button>
            {showDone && (
              <ul className="crmr-tasklist crmr-tasklist--done">
                {done.map((t) => (
                  <li key={t.id} className="crmh-task crmr-task is-done">
                    <button type="button" className="crmh-tick is-done" onClick={() => void tick(t, 'todo')} aria-label={`Not done yet: ${t.title}`} title="Open it again">
                      <span>✓</span>
                    </button>
                    <div className="crmh-task__b">
                      <div className="crmh-task__t">{t.title}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {snoozing &&
        createPortal(
          // Into <body>: inside the dock's panel (layer 26) the sheet would sit under the app header (30).
          // The wrapper carries the card's CRM colours.
          <div className="crm crmh">
            <SnoozeSheet task={snoozing} today={today} team={team} onClose={() => setSnoozing(null)} onPick={(d, who) => void snooze(snoozing, d, who)} />
          </div>,
          document.body
        )}
    </section>
  );
}

/** "+ Task" in the card: a title, when and who. Enter saves. */
function QuickAdd({
  projectId,
  team,
  me,
  today,
  defaultAssignee,
  onDone,
  onCancel,
}: {
  projectId: string;
  team: TeamMember[];
  me: string;
  today: string;
  defaultAssignee: string | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(today);
  const [who, setWho] = useState(defaultAssignee || me);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const friday = today ? nextWeekday(today, 5) : '';
  const chips: [string, string][] = today
    ? [
        ['Today', today],
        ['Tomorrow', plusDays(today, 1)],
        [friday === today ? 'Next Fri' : 'Fri', friday === today ? plusDays(today, 7) : friday],
      ]
    : [];

  async function save() {
    if (!title.trim()) return;
    setBusy(true);
    setErr('');
    try {
      await send(`/api/crm/projects/${projectId}/tasks`, 'POST', { title: title.trim(), due_date: due || null, assignee_id: who || null, priority: 'normal' });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="crmh-quick"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input className="crm-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus aria-label="Task" />
      <div className="crmh-quick__row">
        {chips.map(([label, ymd]) => (
          <button key={label} type="button" className={`crm-chipbtn${due === ymd ? ' on' : ''}`} onClick={() => setDue(ymd)}>
            {label}
          </button>
        ))}
        <input className="crm-input crmh-quick__date" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
      </div>
      <select className="crm-input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose task">
        <option value="">Nobody yet</option>
        {team.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id === me ? `${t.name} (me)` : t.name}
          </option>
        ))}
      </select>
      {err && <p className="crm-banner crm-banner--err">{err}</p>}
      <div className="crm-actions">
        <button type="submit" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy || !title.trim()}>
          {busy ? 'Adding…' : 'Add task'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function SnoozeSheet({
  task,
  today,
  team,
  onClose,
  onPick,
}: {
  task: CrmTask;
  today: string;
  team: TeamMember[];
  onClose: () => void;
  onPick: (ymd: string, assignee?: string) => void;
}) {
  const start = today || task.due_date || '';
  const [date, setDate] = useState(task.due_date && task.due_date > start ? task.due_date : start ? plusDays(start, 1) : '');
  const [who, setWho] = useState<string | undefined>(undefined);
  const monday = start ? nextWeekday(plusDays(start, 1), 1) : '';
  return (
    <Sheet title="Snooze the task" onClose={onClose}>
      <p className="crm-muted">{task.title}</p>
      {start && (
        <div className="crmh-snooze">
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => onPick(plusDays(start, 1), who)}>
            Tomorrow
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={() => onPick(monday, who)}>
            Next week ({shortDate(monday)})
          </button>
        </div>
      )}
      <label className="crm-label" htmlFor="crmr-snooze-date">
        Pick a date
      </label>
      <input id="crmr-snooze-date" className="crm-input" type="date" min={today || undefined} value={date} onChange={(e) => setDate(e.target.value)} />
      <label className="crm-label" htmlFor="crmr-snooze-who">
        Whose task
      </label>
      <select id="crmr-snooze-who" className="crm-input" value={who ?? ''} onChange={(e) => setWho(e.target.value || undefined)}>
        <option value="">Keep as it is</option>
        {team.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)} onClick={() => onPick(date, who)}>
          Save
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

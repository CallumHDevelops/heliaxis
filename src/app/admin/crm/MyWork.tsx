'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { DUE_GROUPS, plusDays, type DueGroup } from '@/lib/projects/feed';
import type { TeamMember } from '@/lib/projects/server';
import type { SchemaReady } from '@/lib/schema-ready';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { Icon, JobPicker, Sheet, StageDot, WaIcon } from './CrmUi';
import { dueWords, initials, londonIso, nextWeekday, shortDate, ukTime, type PipelineProject } from './crm-shared';
import { openDock } from './dock-link';

type JobChip = { id: string; title: string; stage: string; ref: string | null; customer: string; enquiryId: string; postcode: string | null };
type Item = {
  kind: 'task' | 'next_step';
  id: string;
  title: string;
  due: string | null;
  at: string | null;
  priority: string;
  assignee: string;
  deadline: boolean;
  job: JobChip | null;
};
type Visit = { kind: 'survey' | 'install'; at: string; day: number; days: number; address: string | null; job: JobChip | null };
type Work = {
  today: string;
  groups: Record<DueGroup, Item[]>;
  doneToday: { kind: 'task' | 'next_step'; id: string; title: string; at: string | null; job: JobChip | null }[];
  noNextStep: number;
  todayVisits: Visit[];
  waiting: { bookingRequests: number };
};

const GROUP_LABEL: Record<DueGroup, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  week: 'This week',
  later: 'Later',
  nodate: 'No date',
};
const keyOf = (i: { kind: string; id: string }) => `${i.kind}:${i.id}`;

/**
 * My work on the CRM home: anything waiting for you, today's visits, and the tasks and next steps
 * (Mine or Everyone) in UK-day groups. Ticking, snoozing and adding use the existing task and job
 * routes; the list comes from GET /api/crm/my-work.
 */
export function MyWork({
  me,
  projects,
  team,
  today,
  schema,
  canTasks,
  canInbox,
  scope,
  onScope,
  dueOnly,
  onDueOnly,
  onNudge,
  onChanged,
  refreshKey,
}: {
  me: string;
  projects: PipelineProject[];
  team: TeamMember[];
  today: string;
  schema: SchemaReady;
  canTasks: boolean;
  canInbox: boolean;
  scope: 'mine' | 'all';
  onScope: (s: 'mine' | 'all') => void;
  dueOnly: boolean;
  onDueOnly: (v: boolean) => void;
  onNudge: () => void;
  onChanged: () => void;
  /** A new number: something was added from the page's + button, so load again now. */
  refreshKey: number;
}) {
  const [work, setWork] = useState<{ scope: string; data: Work } | null>(null);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [opened, setOpened] = useState<Set<DueGroup | 'done'>>(() => new Set());
  const [adding, setAdding] = useState(false);
  const [snoozing, setSnoozing] = useState<Item | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/my-work?scope=${scope}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load your work');
      setWork({ scope, data: d as Work });
      setHidden(new Set());
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your work');
      return false;
    }
  }, [scope]);
  const { reload } = useLiveRefresh(load, 60_000);
  // Something was added from the page's + button: show it now.
  useEffect(() => {
    if (refreshKey) void reload();
  }, [refreshKey, reload]);

  const data = work?.scope === scope ? work.data : null;
  const phoneOf = (jobId: string | undefined) => (jobId ? (projects.find((p) => p.id === jobId)?.phone ?? null) : null);

  async function send(item: Item, body: Record<string, unknown>) {
    const [url, payload] =
      item.kind === 'next_step'
        ? [`/api/crm/projects/${item.id}`, body]
        : item.job
          ? [`/api/crm/tasks/${item.id}`, body]
          : ['/api/tasks', { id: item.id, ...body }];
    const r = await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Not saved. Try again.');
    }
  }

  async function tick(item: Item) {
    setHidden((h) => new Set(h).add(keyOf(item)));
    try {
      await send(item, item.kind === 'next_step' ? { complete_next_step: true } : { status: 'done' });
      setError('');
    } catch (e) {
      setHidden((h) => {
        const n = new Set(h);
        n.delete(keyOf(item));
        return n;
      });
      setError(e instanceof Error ? e.message : 'Not saved');
    }
    void reload();
    onChanged();
  }

  async function snooze(item: Item, ymd: string, assignee?: string) {
    setSnoozing(null);
    try {
      const body: Record<string, unknown> =
        item.kind === 'next_step' ? { next_step_at: londonIso(ymd, item.at ? ukTime(item.at) : '09:00') } : { due_date: ymd };
      if (assignee !== undefined && item.kind === 'task') body.assignee_id = assignee || null;
      await send(item, body);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Not saved');
    }
    void reload();
    onChanged();
  }

  function chat(job: JobChip) {
    if (openDock({ enquiryId: job.enquiryId, tab: 'chats' })) return;
    // Phones (and pages without the dock): the full-screen chat.
    router.push(canInbox ? `/admin/enquiries/inbox/${job.enquiryId}?job=${job.id}` : `/admin/crm/chats/${job.enquiryId}?job=${job.id}`);
  }

  const groups = data?.groups;
  const visible = (g: DueGroup) => (groups?.[g] ?? []).filter((i) => !hidden.has(keyOf(i)));
  const isOpen = (g: DueGroup) =>
    opened.has(g) || g === 'overdue' || g === 'today' || (g === 'tomorrow' && visible('tomorrow').length <= 5);
  const shownGroups = dueOnly ? (['overdue', 'today'] as DueGroup[]) : DUE_GROUPS;
  const total = shownGroups.reduce((n, g) => n + visible(g).length, 0);
  const done = (data?.doneToday ?? []).length + hidden.size;
  const toggle = (g: DueGroup | 'done') =>
    setOpened((o) => {
      const n = new Set(o);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const visits = data?.todayVisits ?? [];
  const waiting = data?.waiting.bookingRequests ?? 0;

  return (
    <div className="crmh-col crmh-work">
      {schema.booking && waiting > 0 && (
        <div className="crmh-waiting">
          <b>Waiting for you</b>
          <Link href="/admin/surveys">
            {waiting} booking request{waiting === 1 ? '' : 's'} to confirm
          </Link>
        </div>
      )}

      {/* Phones: one line to the Home tab's Today list. */}
      <Link href="/admin" className="crmh-linkrow crmh-todaylink">
        {visits.length === 0 ? (
          <span>Nothing booked today</span>
        ) : visits.length === 1 ? (
          <span>
            <b>Today:</b> {ukTime(visits[0].at)} {visits[0].kind === 'survey' ? 'survey' : 'install'} · {visits[0].job?.customer}
          </span>
        ) : (
          <span>
            <b>Today:</b> {visits.length} visits
          </span>
        )}
        <span aria-hidden="true">→</span>
      </Link>

      <section className="crmh-card crmh-today" aria-label="Today">
        <div className="crmh-card__h">
          <h3>Today</h3>
          <span className="crm-muted crm-small">{shortDate(today)}</span>
          {schema.booking && (
            <Link href="/admin/surveys" className="crmh-link crmh-ml">
              Diary →
            </Link>
          )}
        </div>
        <div className="crmh-card__b">
          {visits.length === 0 ? (
            <p className="crm-muted crmh-none">Nothing booked today.</p>
          ) : (
            visits.slice(0, 3).map((v) => (
              <div key={`${v.kind}-${v.job?.id}-${v.at}`} className="crmh-visit">
                <time>{ukTime(v.at)}</time>
                <div>
                  <b>
                    {v.kind === 'survey' ? 'Survey' : v.days > 1 ? `Install day ${v.day} of ${v.days}` : 'Install'}
                    {v.job ? ' · ' : ''}
                    {v.job && <Link href={`/admin/crm/${v.job.id}`}>{v.job.customer}</Link>}
                  </b>
                  <small>{[v.job?.ref, v.job?.postcode].filter(Boolean).join(' · ')}</small>
                </div>
                {v.kind === 'survey' && schema.surveys && v.job ? (
                  <a className="crm-btn crm-btn--small" href={`/admin/surveys/start?project=${v.job.id}&type=solar`}>
                    Start survey
                  </a>
                ) : (
                  (v.address || v.job?.postcode) && (
                    <a
                      className="crm-btn crm-btn--ghost crm-btn--small"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(v.address || v.job?.postcode || '')}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon k="pin" size={14} />
                      Directions
                    </a>
                  )
                )}
              </div>
            ))
          )}
          {visits.length > 3 && (
            <Link href="/admin" className="crmh-link crm-small">
              {visits.length - 3} more today →
            </Link>
          )}
        </div>
      </section>

      <section className="crmh-card crmh-tasks" id="crmh-tasks" aria-label="Tasks">
        <div className="crmh-card__h">
          <h3>{scope === 'mine' ? 'My tasks' : 'Tasks'}</h3>
          <div className="crmh-tog" role="group" aria-label="Whose tasks">
            <button type="button" className={scope === 'mine' ? 'on' : ''} aria-pressed={scope === 'mine'} onClick={() => onScope('mine')}>
              Mine
            </button>
            <button type="button" className={scope === 'all' ? 'on' : ''} aria-pressed={scope === 'all'} onClick={() => onScope('all')}>
              Everyone
            </button>
          </div>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small crmh-ml" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            + Task
          </button>
        </div>
        <div className="crmh-card__b">
          {adding && (
            <QuickTask
              me={me}
              projects={projects}
              team={team}
              today={today}
              canTasks={canTasks}
              onDone={() => {
                setAdding(false);
                void reload();
                onChanged();
              }}
              onCancel={() => setAdding(false)}
            />
          )}
          {dueOnly && (
            <p className="crmh-duebar">
              Showing what’s due by today, for everyone.{' '}
              <button type="button" className="crm-link" onClick={() => onDueOnly(false)}>
                Show everything
              </button>
            </p>
          )}
          {error && <p className="crm-banner crm-banner--err">{error}</p>}
          {!data ? (
            <p className="crm-muted crmh-none">Loading…</p>
          ) : total === 0 ? (
            <p className="crm-muted crmh-none">{dueOnly ? 'Nothing due today. ' : scope === 'mine' ? 'No tasks for you. ' : 'No open tasks. '}All clear ✓</p>
          ) : (
            shownGroups.map((g) => {
              const items = visible(g);
              if (!items.length) return null;
              if (!isOpen(g)) {
                return (
                  <button key={g} type="button" className="crmh-fold" onClick={() => toggle(g)} aria-expanded={false}>
                    {GROUP_LABEL[g]} <b>{items.length}</b> <span aria-hidden="true">▸</span>
                  </button>
                );
              }
              return (
                <div key={g} className="crmh-group">
                  <div className={`crmh-group__h${g === 'overdue' ? ' late' : ''}`}>
                    {GROUP_LABEL[g]} <span className="crmh-n">{items.length}</span>
                    {opened.has(g) && (
                      <button type="button" className="crmh-group__fold" onClick={() => toggle(g)} aria-expanded>
                        Hide
                      </button>
                    )}
                  </div>
                  {items.map((i) => (
                    <TaskRow
                      key={keyOf(i)}
                      item={i}
                      group={g}
                      today={today}
                      everyone={scope === 'all'}
                      phone={phoneOf(i.job?.id)}
                      onTick={() => void tick(i)}
                      onSnooze={() => setSnoozing(i)}
                      onChat={i.job ? () => chat(i.job!) : undefined}
                    />
                  ))}
                </div>
              );
            })
          )}
          {data && done > 0 && (
            <>
              <button type="button" className="crmh-fold" onClick={() => toggle('done')} aria-expanded={opened.has('done')}>
                Done today <b>{done}</b> <span aria-hidden="true">{opened.has('done') ? '▾' : '▸'}</span>
              </button>
              {opened.has('done') && (
                <ul className="crmh-donelist">
                  {data.doneToday.map((d) => (
                    <li key={keyOf(d)}>
                      ✓ {d.title}
                      {d.job && <small> · {d.job.customer}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </section>

      {data && data.noNextStep > 0 && (
        <p className="crmh-nudge">
          {data.noNextStep} lead{data.noNextStep === 1 ? ' has' : 's have'} no next step yet.{' '}
          <button type="button" className="crm-link" onClick={onNudge}>
            Work through them →
          </button>
        </p>
      )}

      {snoozing && (
        <SnoozeSheet item={snoozing} today={today} team={team} onClose={() => setSnoozing(null)} onPick={(ymd, who) => void snooze(snoozing, ymd, who)} />
      )}
    </div>
  );
}

function TaskRow({
  item,
  group,
  today,
  everyone,
  phone,
  onTick,
  onSnooze,
  onChat,
}: {
  item: Item;
  group: DueGroup;
  today: string;
  everyone: boolean;
  phone: string | null;
  onTick: () => void;
  onSnooze: () => void;
  onChat?: () => void;
}) {
  const due =
    item.kind === 'next_step' && item.at && group === 'today' ? ukTime(item.at) : item.due ? dueWords(item.due, today) : '';
  const tone = group === 'overdue' ? 'late' : group === 'today' ? 'today' : '';
  const job = item.job;
  return (
    <div className="crmh-task">
      <button type="button" className="crmh-tick" onClick={onTick} aria-label={`Done: ${item.title}`} title="Mark as done">
        <span />
      </button>
      <div className="crmh-task__b">
        <div className="crmh-task__t">{item.title}</div>
        <div className="crmh-task__m">
          {job && (
            <Link href={`/admin/crm/${job.id}`} className="crmh-jobchip">
              <StageDot stage={job.stage} />
              {job.customer || job.title}
              {(job.ref || job.postcode) && ` · ${job.ref || job.postcode}`}
            </Link>
          )}
          {item.kind === 'next_step' && <span className="crmh-tag">Next step</span>}
          {item.deadline && (
            <span className="crmh-tag crmh-tag--deadline">
              <Icon k="clock" size={12} /> Deadline
            </span>
          )}
          {due && <span className={`crmh-due ${tone}`}>{due}</span>}
          {everyone && item.assignee && (
            <span className="crmh-ini" title={item.assignee}>
              {initials(item.assignee)}
            </span>
          )}
        </div>
      </div>
      {item.priority === 'high' && <i className="crmh-pri" title="High priority" />}
      <div className="crmh-task__acts">
        {onChat && phone && (
          <button type="button" className="crmh-act crmh-act--wa" onClick={onChat} aria-label={`WhatsApp ${job?.customer ?? ''}`} title="WhatsApp">
            <WaIcon size={15} />
          </button>
        )}
        <button type="button" className="crmh-act" onClick={onSnooze} aria-label="Snooze or change" title="Snooze">
          <Icon k="clock" size={15} />
        </button>
        {job && (
          <Link href={`/admin/crm/${job.id}`} className="crmh-act" aria-label="Open the job" title="Open the job">
            <Icon k="open" size={15} />
          </Link>
        )}
      </div>
    </div>
  );
}

function SnoozeSheet({
  item,
  today,
  team,
  onClose,
  onPick,
}: {
  item: Item;
  today: string;
  team: TeamMember[];
  onClose: () => void;
  onPick: (ymd: string, assignee?: string) => void;
}) {
  const [date, setDate] = useState(item.due && item.due > today ? item.due : plusDays(today, 1));
  const [who, setWho] = useState<string | undefined>(undefined);
  const monday = nextWeekday(plusDays(today, 1), 1);
  return (
    <Sheet title={item.kind === 'next_step' ? 'Move the next step' : 'Snooze the task'} onClose={onClose}>
      <p className="crm-muted">{item.title}</p>
      <div className="crmh-snooze">
        <button type="button" className="crm-btn crm-btn--ghost" onClick={() => onPick(plusDays(today, 1), who)}>
          Tomorrow
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={() => onPick(monday, who)}>
          Next week ({shortDate(monday)})
        </button>
      </div>
      <label className="crm-label" htmlFor="crmh-snooze-date">
        Pick a date
      </label>
      <input id="crmh-snooze-date" className="crm-input" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
      {item.kind === 'task' && item.job && (
        <>
          <label className="crm-label" htmlFor="crmh-snooze-who">
            Whose task
          </label>
          <select id="crmh-snooze-who" className="crm-input" value={who ?? ''} onChange={(e) => setWho(e.target.value)}>
            <option value="">Keep as it is</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </>
      )}
      <div className="crm-actions">
        <button type="button" className="crm-btn crm-btn--solar" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(date)} onClick={() => onPick(date, who || undefined)}>
          Save
        </button>
        <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  );
}

/** "+ Task": a title, the job (optional with the Tasks portal), when, and who. Enter saves. */
export function QuickTask({
  me,
  projects,
  team,
  today,
  canTasks,
  onDone,
  onCancel,
}: {
  me: string;
  projects: PipelineProject[];
  team: TeamMember[];
  today: string;
  canTasks: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [job, setJob] = useState<PipelineProject | null>(null);
  const [due, setDue] = useState(today);
  const [who, setWho] = useState(me);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const friday = nextWeekday(today, 5);
  const chips: [string, string][] = [
    ['Today', today],
    ['Tomorrow', plusDays(today, 1)],
    [friday === today ? 'Next Fri' : 'Fri', friday === today ? plusDays(today, 7) : friday],
  ];

  async function save() {
    if (!title.trim()) return;
    if (!job && !canTasks) {
      setErr('Pick the customer this task is for.');
      return;
    }
    setBusy(true);
    setErr('');
    const body = { title: title.trim(), due_date: due || null, assignee_id: who || null, priority: 'normal' };
    const r = await fetch(job ? `/api/crm/projects/${job.id}/tasks` : '/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) onDone();
    else setErr(d.error || 'Not saved. Try again.');
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
      <JobPicker projects={projects} value={job} onChange={setJob} placeholder={canTasks ? 'For a customer? (optional)' : 'For which customer?'} />
      <div className="crmh-quick__row">
        {chips.map(([label, ymd]) => (
          <button key={label} type="button" className={`crm-chipbtn${due === ymd ? ' on' : ''}`} onClick={() => setDue(ymd)}>
            {label}
          </button>
        ))}
        <input className="crm-input crmh-quick__date" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
      </div>
      <select className="crm-input" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Whose task">
        {team.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id === me ? `${t.name} (me)` : t.name}
          </option>
        ))}
        {!team.some((t) => t.id === me) && <option value={me}>Me</option>}
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

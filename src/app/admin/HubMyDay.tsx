'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HubFollowUp, HubTask, HubToday } from './HubView';
// Today's styles live with the other Quotes / tasks / Today additions.
import './crm/[id]/extras.css';

function dueLabel(iso: string | null, today: string) {
  if (!iso) return { text: 'No date', tone: '' };
  if (iso < today) {
    const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000);
    return { text: days === 1 ? 'Yesterday' : `${days}d overdue`, tone: 'late' };
  }
  if (iso === today) return { text: 'Today', tone: 'today' };
  return {
    text: new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    tone: '',
  };
}

const TAG: Record<string, string> = { survey: 'Survey', install: 'Install', diary: 'Diary' };

/** Today: surveys, installs and my diary entries, with Start survey and Directions for the van. */
function TodayList({ today }: { today: HubToday }) {
  return (
    <section className="hub-section hub-today">
      <h2 className="hub-h2">Today</h2>
      {today.items.length === 0 ? (
        <div className="hub-list">
          <p className="hub-today-empty">No surveys, installs or diary entries today.</p>
        </div>
      ) : (
        <ul className="hub-list">
          {today.items.map((it) => {
            const main = (
              <>
                <b>
                  <span className={`hub-today-tag is-${it.kind}`}>{it.tag ?? TAG[it.kind]}</span>
                  {it.title}
                </b>
                {it.sub && <small>{it.sub}</small>}
              </>
            );
            return (
              <li key={it.key}>
                <div className="hub-row">
                  <span className="hub-today-time">{it.time}</span>
                  {it.href ? (
                    <Link href={it.href} className="hub-row-main">
                      {main}
                    </Link>
                  ) : (
                    <span className="hub-row-main">{main}</span>
                  )}
                  {(it.action || it.directions) && (
                    <span className="hub-today-actions">
                      {/* Plain links: the survey pages load (and work offline) as whole pages. */}
                      {it.action && (
                        <a className="hub-today-btn is-primary" href={it.action.href}>
                          {it.action.label}
                        </a>
                      )}
                      {it.directions && (
                        <a className="hub-today-btn" href={it.directions} target="_blank" rel="noopener noreferrer">
                          Directions
                        </a>
                      )}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {today.canAddDiary && (
        <Link className="hub-today-add" href="/admin/surveys?add=1">
          + Add to my diary
        </Link>
      )}
    </section>
  );
}

/** "My day": Today (CRM), your open tasks (tick them off here) and CRM follow-ups due today. */
export function HubMyDay({
  tasks,
  followUps,
  today,
  todayList = null,
}: {
  tasks: HubTask[];
  followUps: HubFollowUp[];
  today: string;
  todayList?: HubToday | null;
}) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [now] = useState(() => Date.now());
  async function complete(id: string) {
    setDone((s) => new Set(s).add(id));
    const r = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'done' }),
    }).catch(() => null);
    if (!r?.ok)
      setDone((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
  }
  const open = tasks.filter((t) => !done.has(t.id));
  const todaySection = todayList ? <TodayList today={todayList} /> : null;
  if (!open.length && !followUps.length) return todaySection;

  return (
    <>
      {todaySection}
      <section className="hub-section">
        <h2 className="hub-h2">My day</h2>
        <ul className="hub-list">
          {followUps.map((f) => {
            const at = f.next_step_at ? new Date(f.next_step_at) : null;
            const late = at && at.getTime() < now && at.toDateString() !== new Date(now).toDateString();
            return (
              <li key={`f-${f.id}`}>
                <Link href={`/admin/crm/${f.id}`} className="hub-row">
                  <span className="hub-row-icon" aria-hidden="true">⏰</span>
                  <span className="hub-row-main">
                    <b>{f.next_step || 'Follow up'}</b>
                    <small>{f.title}</small>
                  </span>
                  <span className={`hub-due ${late ? 'late' : 'today'}`}>
                    {at ? (late ? 'Overdue' : at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) : 'Today'}
                  </span>
                </Link>
              </li>
            );
          })}
          {open.map((t) => {
            const due = dueLabel(t.due_date, today);
            return (
              <li key={t.id}>
                <div className="hub-row">
                  <button type="button" className="hub-tick" aria-label={`Mark “${t.title}” done`} onClick={() => complete(t.id)} />
                  <Link href="/admin/tasks" className="hub-row-main">
                    <b>{t.title}</b>
                    {t.priority === 'high' && <small className="hub-high">High priority</small>}
                  </Link>
                  <span className={`hub-due ${due.tone}`}>{due.text}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <Link href="/admin/tasks" className="hub-more">
          All tasks →
        </Link>
      </section>
    </>
  );
}

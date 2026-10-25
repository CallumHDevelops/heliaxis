'use client';

import Link from 'next/link';
import type { HubToday } from './HubView';
// Today's styles live with the other Quotes / tasks / Today additions.
import './crm/[id]/extras.css';

export function dueLabel(iso: string | null, today: string) {
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
export function TodayList({ today }: { today: HubToday }) {
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

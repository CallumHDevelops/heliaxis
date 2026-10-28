'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HubWeekDay } from './HubView';

/** The week ahead: seven day tiles (a dot per booking), and the chosen day's surveys and installs underneath. */
export function WeekAhead({ days }: { days: HubWeekDay[] }) {
  const [sel, setSel] = useState(0);
  const day = days[sel];
  const total = days.reduce((n, d) => n + d.items.length, 0);
  return (
    <section className="hub-section hub-week" aria-label="The week ahead">
      <h2 className="hub-h2">
        Week ahead <span className="hub-week__n">{total}</span>
      </h2>
      <div className="hub-week__card">
        <div className="hub-week__tiles" role="tablist" aria-label="Day">
          {days.map((d, i) => (
            <button key={d.iso} type="button" role="tab" aria-selected={i === sel} className={`hub-week__tile${i === sel ? ' on' : ''}${d.items.length ? ' has' : ''}`} onClick={() => setSel(i)}>
              <small>{i === 0 ? 'Today' : d.dow}</small>
              <b>{d.dom}</b>
              <span className="hub-week__dots" aria-label={`${d.items.length} booked`}>
                {d.items.slice(0, 3).map((it) => (
                  <i key={it.key} className={`is-${it.kind}`} />
                ))}
              </span>
            </button>
          ))}
        </div>
        {day.items.length === 0 ? (
          <p className="hub-today-empty">Nothing booked.</p>
        ) : (
          <ul className="hub-week__list">
            {day.items.map((it) => (
              <li key={it.key}>
                <span className="hub-today-time">{it.time}</span>
                <Link href={it.href} className="hub-row-main">
                  <b>
                    <span className={`hub-today-tag is-${it.kind}`}>{it.kind === 'survey' ? 'Survey' : 'Install'}</span>
                    {it.title}
                  </b>
                  <small>{it.sub}</small>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link className="hub-today-add" href="/admin/surveys">
          Open the diary →
        </Link>
      </div>
    </section>
  );
}

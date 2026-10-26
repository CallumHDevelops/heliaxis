'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HubFollowUp, HubTask } from './HubView';
import { dueLabel } from './HubMyDay';
import type { HubMetaLeads } from './meta-leads';

/** Dashboard → New Meta leads: the ones someone needs to get to, with why, WhatsApp, Call and Open. */
export function MetaLeadsPanel({ leads }: { leads: HubMetaLeads }) {
  return (
    <section className="nu" aria-labelledby="nu-leads-h">
      <div className="nu-head">
        <h2 id="nu-leads-h">New Meta leads</h2>
        {leads.count > 0 && (
          <span className="nu-count" aria-label={`${leads.count}${leads.more ? ' or more' : ''} new`}>
            {leads.count.toLocaleString('en-GB')}
            {leads.more ? '+' : ''}
          </span>
        )}
        {leads.today > 0 && <span className="nu-today">{leads.today} today</span>}
      </div>
      {leads.rows.length === 0 ? (
        <p className="nu-empty">
          Nobody to get to: every Meta lead has been contacted or has a message lined up. {leads.last ? `The last one came in ${leads.last}.` : 'None have come in from Meta yet.'}
        </p>
      ) : (
        <ul className="nu-list">
          {leads.rows.map((r) => (
            <li key={r.id} className="nu-item">
              <span className="nu-avatar" aria-hidden="true">{(r.name.trim()[0] ?? '?').toUpperCase()}</span>
              {r.href ? (
                <Link href={r.href} className="nu-main">
                  <b>
                    {r.name}
                    {r.ref && <span className="nu-ref">{r.ref}</span>}
                  </b>
                  <small>
                    <span title={r.note ?? undefined}>{r.ad}</span>
                    {r.postcode ? ` · ${r.postcode}` : ''} · {r.ago}
                  </small>
                </Link>
              ) : (
                <span className="nu-main">
                  <b>{r.name}</b>
                  <small>
                    {r.ad} · {r.ago}
                  </small>
                </span>
              )}
              <span className={`nu-chip is-${r.why.key}`}>{r.why.label}</span>
              <span className="nu-actions">
                {r.chat && (
                  <Link className="nu-btn" href={r.chat}>
                    WhatsApp
                  </Link>
                )}
                {r.phone && (
                  <a className="nu-btn" href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}>
                    Call
                  </a>
                )}
                {r.href && (
                  <Link className="nu-btn is-primary" href={r.href}>
                    Open
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {leads.seeAll && leads.count > 0 && (
        <div className="nu-foot">
          <Link href={leads.seeAll} className="hub-more">
            {leads.notContacted === 1 ? 'See the 1 not contacted →' : `See all ${leads.notContacted} not contacted →`}
          </Link>
        </div>
      )}
    </section>
  );
}

/** Dashboard → To do: CRM follow-ups due and your open tasks. Ticking a task off saves it straight away. */
export function TodoPanel({ tasks, followUps, today }: { tasks: HubTask[]; followUps: HubFollowUp[]; today: string }) {
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
  return (
    <section className="nu" aria-labelledby="nu-todo-h">
      <div className="nu-head">
        <h2 id="nu-todo-h">To do</h2>
        {open.length + followUps.length > 0 && <span className="nu-count">{open.length + followUps.length}</span>}
      </div>
      {open.length + followUps.length === 0 ? (
        <p className="nu-empty">Nothing to do. You are all caught up.</p>
      ) : (
        <ul className="nu-list">
          {followUps.map((f) => {
            const at = f.next_step_at ? new Date(f.next_step_at) : null;
            const late = !!at && at.getTime() < now && at.toDateString() !== new Date(now).toDateString();
            return (
              <li key={`f-${f.id}`} className="nu-item">
                <span className="nu-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="13" r="7.5" />
                    <path d="M12 9v4l2.5 2" />
                  </svg>
                </span>
                <Link href={`/admin/crm/${f.id}`} className="nu-main">
                  <b>{f.next_step || 'Follow up'}</b>
                  <small>{f.title}</small>
                </Link>
                <span className={`nu-chip ${late ? 'is-late' : 'is-today'}`}>
                  {at ? (late ? 'Overdue' : at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) : 'Today'}
                </span>
              </li>
            );
          })}
          {open.map((t) => {
            const due = dueLabel(t.due_date, today);
            return (
              <li key={`t-${t.id}`} className="nu-item">
                <button type="button" className="hub-tick" aria-label={`Mark “${t.title}” done`} onClick={() => complete(t.id)} />
                <Link href="/admin/tasks" className="nu-main">
                  <b>{t.title}</b>
                  {t.priority === 'high' && <small>High priority</small>}
                </Link>
                <span className={`nu-chip ${due.tone === 'late' ? 'is-late' : due.tone === 'today' ? 'is-today' : ''}`}>{due.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="nu-foot">
        <Link href="/admin/tasks" className="hub-more">
          All tasks →
        </Link>
      </div>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { HubFollowUp, HubTask } from './HubView';
import { dueLabel } from './HubMyDay';
import type { HubMetaLead, HubMetaLeads } from './meta-leads';

type Tab = 'all' | 'leads' | 'tasks';
const ALL_LIMIT = 12;

/**
 * Dashboard → Next up: the things to work through, one list. CRM follow-ups and tasks first (late
 * ones are marked), then the new Meta leads someone needs to get to. Filter by Meta leads or Tasks.
 * Ticking a task off here saves it straight away, as My day did.
 */
export function NextUp({ leads, tasks, followUps, today }: { leads: HubMetaLeads | null; tasks: HubTask[]; followUps: HubFollowUp[]; today: string }) {
  const [tab, setTab] = useState<Tab>('all');
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
  const leadRows = leads?.rows ?? [];
  const taskCount = open.length + followUps.length;

  if (!leadRows.length && !taskCount) {
    return (
      <section className="nu" aria-labelledby="nu-h">
        <div className="nu-head">
          <h2 id="nu-h">Next up</h2>
        </div>
        <p className="nu-empty">Nothing waiting. {leads?.last ? `The last Meta lead came in ${leads.last}.` : 'You are all caught up.'}</p>
      </section>
    );
  }

  const followUpRows = followUps.map((f) => {
    const at = f.next_step_at ? new Date(f.next_step_at) : null;
    const late = !!at && at.getTime() < now && at.toDateString() !== new Date(now).toDateString();
    return (
      <li key={`f-${f.id}`} className="nu-item">
        <span className="nu-mark is-follow" aria-hidden="true">
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
        <Link className="nu-btn is-primary" href={`/admin/crm/${f.id}`}>
          Open
        </Link>
      </li>
    );
  });
  const taskRows = open.map((t) => {
    const due = dueLabel(t.due_date, today);
    return (
      <li key={`t-${t.id}`} className="nu-item">
        <button type="button" className="hub-tick" aria-label={`Mark “${t.title}” done`} onClick={() => complete(t.id)} />
        <Link href="/admin/tasks" className="nu-main">
          <b>{t.title}</b>
          <small>{t.priority === 'high' ? 'Task · High priority' : 'Task'}</small>
        </Link>
        <span className={`nu-chip ${due.tone === 'late' ? 'is-late' : due.tone === 'today' ? 'is-today' : ''}`}>{due.text}</span>
      </li>
    );
  });
  const leadItems = (rows: HubMetaLead[]) =>
    rows.map((r) => (
      <li key={`l-${r.id}`} className="nu-item">
        <span className="nu-avatar" aria-hidden="true">{(r.name.trim()[0] ?? '?').toUpperCase()}</span>
        {r.href ? (
          <Link href={r.href} className="nu-main">
            <b>
              {r.name}
              {r.ref && <span className="nu-ref">{r.ref}</span>}
            </b>
            <small>
              Meta lead · <span title={r.note ?? undefined}>{r.ad}</span>
              {r.postcode ? ` · ${r.postcode}` : ''} · {r.ago}
            </small>
          </Link>
        ) : (
          <span className="nu-main">
            <b>{r.name}</b>
            <small>
              Meta lead · {r.ad} · {r.ago}
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
    ));

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: taskCount + leadRows.length },
    ...(leads ? [{ key: 'leads' as const, label: 'Meta leads', n: leads.count }] : []),
    { key: 'tasks', label: 'Tasks', n: taskCount },
  ];
  const showLeads = tab !== 'tasks';
  const showTasks = tab !== 'leads';
  const taskList = [...followUpRows, ...taskRows];
  const body = tab === 'all' ? [...taskList, ...leadItems(leadRows)].slice(0, ALL_LIMIT) : [...(showTasks ? taskList : []), ...(showLeads ? leadItems(leadRows) : [])];

  return (
    <section className="nu" aria-labelledby="nu-h">
      <div className="nu-head">
        <h2 id="nu-h">Next up</h2>
        <div className="nu-tabs" role="tablist" aria-label="Filter">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'nu-tab on' : 'nu-tab'} onClick={() => setTab(t.key)}>
              {t.label}
              <span>{t.n.toLocaleString('en-GB')}{t.key === 'leads' && leads?.more ? '+' : ''}</span>
            </button>
          ))}
        </div>
      </div>
      {body.length ? <ul className="nu-list">{body}</ul> : <p className="nu-empty">Nothing here.</p>}
      <div className="nu-foot">
        {tab !== 'leads' && (
          <Link href="/admin/tasks" className="hub-more">
            All tasks →
          </Link>
        )}
        {tab !== 'tasks' && leads?.seeAll && leads.count > 0 && (
          <Link href={leads.seeAll} className="hub-more">
            {leads.notContacted === 1 ? 'See the 1 not contacted →' : `See all ${leads.notContacted} not contacted →`}
          </Link>
        )}
      </div>
    </section>
  );
}

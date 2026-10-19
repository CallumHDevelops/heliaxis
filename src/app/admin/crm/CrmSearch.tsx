'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { isProjectStage, stageLabel } from '@/lib/crm/stages';
import { shownRef } from '@/lib/projects/refs';
import { Icon, StageDot } from './CrmUi';
import { isLive, matchesSearch, type PipelineProject } from './crm-shared';

type Customer = {
  id: string;
  name: string;
  postcode: string | null;
  customer_ref: string | null;
  projects: number;
};
type Hit =
  | { kind: 'job'; key: string; p: PipelineProject }
  | { kind: 'customer'; key: string; c: Customer };

const jobHref = (p: PipelineProject) => (isProjectStage(p.stage) ? `/admin/projects/${p.id}` : `/admin/crm/${p.id}`);

/**
 * The CRM search: name, postcode, phone or HX-ref. Jobs on the page match as you type; customers
 * without one show up from the server (GET /api/crm/customers). The list jumps straight to a record;
 * Enter on its own opens List filtered by what was typed. "/" puts the cursor here from anywhere on
 * the page.
 */
export function CrmSearch({
  projects,
  onSubmit,
  className = '',
}: {
  projects: PipelineProject[];
  onSubmit: (q: string) => void;
  className?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [server, setServer] = useState<{ q: string; rows: Customer[] }>({ q: '', rows: [] });
  const [busy, setBusy] = useState(false);
  const t = q.trim();

  // "/" anywhere (except while typing somewhere else) puts the cursor in the search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName))) return;
      const box = input.current;
      if (!box || box.offsetParent === null) return;
      e.preventDefault();
      box.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Customers from the server, a moment after typing stops.
  useEffect(() => {
    if (t.length < 2) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/crm/customers?q=${encodeURIComponent(t)}`, { cache: 'no-store', signal: ctl.signal });
        const d = await r.json().catch(() => ({}));
        if (r.ok) setServer({ q: t, rows: (d.customers ?? []) as Customer[] });
      } catch {
        // Typing on, or offline: the jobs on the page still match.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [t]);

  const jobs = t.length < 1 ? [] : projects.filter((p) => matchesSearch(p, t)).sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.updated_at.localeCompare(a.updated_at));
  const withJob = new Set(jobs.map((p) => p.enquiry_id));
  const customers = server.q === t ? server.rows.filter((c) => !withJob.has(c.id) && !projects.some((p) => p.enquiry_id === c.id)) : [];
  const hits: Hit[] = [
    ...jobs.slice(0, 8).map((p): Hit => ({ kind: 'job', key: p.id, p })),
    ...customers.slice(0, 4).map((c): Hit => ({ kind: 'customer', key: c.id, c })),
  ];
  const showList = open && t.length >= 1;

  async function pick(h: Hit) {
    setOpen(false);
    if (h.kind === 'job') {
      router.push(jobHref(h.p));
      return;
    }
    // A customer with no job on the list: their latest open job, or a new opportunity for them.
    setBusy(true);
    const r = await fetch('/api/crm/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiry_id: h.c.id, open_existing: true }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok && d.id) router.push(`/admin/crm/${d.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      const n = hits.length;
      if (!n) return;
      setActive((i) => (e.key === 'ArrowDown' ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && hits[active]) void pick(hits[active]);
      else if (t) {
        setOpen(false);
        onSubmit(t);
      }
    } else if (e.key === 'Escape') {
      if (q) setQ('');
      else input.current?.blur();
      setOpen(false);
    }
  }

  return (
    <div
      className={`crmh-searchbox ${className}`}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <label className="crmh-searchbox__field">
        <Icon k="search" />
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Name, postcode, phone or HX-ref"
          aria-label="Search the CRM"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={active >= 0 && hits[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <kbd aria-hidden="true">/</kbd>
      </label>
      {showList && (
        <ul id={listId} className="crmh-searchbox__list" role="listbox" aria-label="Matches">
          {hits.length === 0 && <li className="crmh-searchbox__none">{t.length < 2 ? 'Keep typing…' : busy ? 'Opening…' : `Nothing found for “${t}”.`}</li>}
          {hits.map((h, i) => (
            <li key={`${h.kind}-${h.key}`} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'on' : ''} onMouseEnter={() => setActive(i)} onClick={() => void pick(h)}>
                {h.kind === 'job' ? (
                  <>
                    <StageDot stage={h.p.stage} />
                    <span className="crmh-searchbox__main">
                      <b>{h.p.customer || h.p.title}</b>
                      <small>{[shownRef(h.p), h.p.customer_projects > 1 ? h.p.title : null, h.p.phone].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="crmh-searchbox__stage">{stageLabel(h.p.stage)}</span>
                  </>
                ) : (
                  <>
                    <i className="crmh-dot" aria-hidden="true" />
                    <span className="crmh-searchbox__main">
                      <b>{h.c.name}</b>
                      <small>{[h.c.customer_ref, h.c.postcode].filter(Boolean).join(' · ') || 'Customer'}</small>
                    </span>
                    <span className="crmh-searchbox__stage">{h.c.projects ? 'Open their job' : 'Create opportunity'}</span>
                  </>
                )}
              </button>
            </li>
          ))}
          {t && (
            <li className="crmh-searchbox__all">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSubmit(t);
                }}
              >
                Show every match in List →
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

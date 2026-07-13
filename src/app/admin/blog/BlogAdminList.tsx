'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { CmsAiBlogListItem } from '@/lib/blog/cms-ai-blogs';

type Filter = 'all' | 'draft' | 'scheduled' | 'published';

const PAGE_SIZE = 10;

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalInputValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseLocalInput(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return new Date(NaN);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatSchedule(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSummary(value: string): string {
  const d = parseLocalInput(value);
  if (Number.isNaN(d.getTime())) return 'Pick a date and time';
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusOf(p: CmsAiBlogListItem): Filter {
  if (p.status === 'published' || p.live) return 'published';
  if (p.status === 'scheduled') return 'scheduled';
  return 'draft';
}

function buildMonthCells(viewYear: number, viewMonth: number) {
  const first = new Date(viewYear, viewMonth, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays = new Date(viewYear, viewMonth, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];

  for (let i = startPad - 1; i >= 0; i -= 1) {
    cells.push({ date: new Date(viewYear, viewMonth - 1, prevDays - i), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ date: new Date(viewYear, viewMonth, d), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const n = cells.length - (startPad + daysInMonth) + 1;
    cells.push({ date: new Date(viewYear, viewMonth + 1, n), inMonth: false });
  }
  return cells;
}

export function BlogAdminList({ posts: initial }: { posts: CmsAiBlogListItem[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [scheduleFor, setScheduleFor] = useState<CmsAiBlogListItem | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return toLocalInputValue(d);
  });
  const [calView, setCalView] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  useEffect(() => {
    setPosts(initial);
  }, [initial]);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get('scheduled') === '1') {
        setMsg({ tone: 'ok', text: 'Scheduled — it will go live automatically at the set time.' });
        window.history.replaceState({}, '', '/admin/blog');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const selected = useMemo(() => parseLocalInput(scheduleAt), [scheduleAt]);
  const hour12 = useMemo(() => {
    if (Number.isNaN(selected.getTime())) return 9;
    const h = selected.getHours() % 12;
    return h === 0 ? 12 : h;
  }, [selected]);
  const minute = Number.isNaN(selected.getTime()) ? 0 : selected.getMinutes();
  const isPm = Number.isNaN(selected.getTime()) ? false : selected.getHours() >= 12;

  const counts = useMemo(() => {
    let draft = 0;
    let scheduled = 0;
    let published = 0;
    for (const p of posts) {
      const s = statusOf(p);
      if (s === 'draft') draft += 1;
      else if (s === 'scheduled') scheduled += 1;
      else published += 1;
    }
    return { draft, scheduled, published, all: posts.length };
  }, [posts]);

  const visible = useMemo(() => {
    if (filter === 'all') return posts;
    return posts.filter((p) => statusOf(p) === filter);
  }, [posts, filter]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return visible.slice(start, start + PAGE_SIZE);
  }, [visible, safePage]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const monthCells = useMemo(
    () => buildMonthCells(calView.y, calView.m),
    [calView.y, calView.m],
  );

  function setDatePart(next: Date) {
    const base = Number.isNaN(selected.getTime()) ? new Date() : new Date(selected);
    base.setFullYear(next.getFullYear(), next.getMonth(), next.getDate());
    setScheduleAt(toLocalInputValue(base));
  }

  function setTimePart(nextHour24: number, nextMinute: number) {
    const base = Number.isNaN(selected.getTime()) ? new Date() : new Date(selected);
    base.setHours(nextHour24, nextMinute, 0, 0);
    setScheduleAt(toLocalInputValue(base));
  }

  function onHourChange(h12: number) {
    const hour24 = isPm ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
    setTimePart(hour24, minute);
  }

  function onMinuteChange(m: number) {
    const hour24 = Number.isNaN(selected.getTime()) ? 9 : selected.getHours();
    setTimePart(hour24, m);
  }

  function onAmPm(pm: boolean) {
    const h = hour12;
    const hour24 = pm ? (h === 12 ? 12 : h + 12) : h === 12 ? 0 : h;
    setTimePart(hour24, minute);
  }

  function shiftMonth(delta: number) {
    const d = new Date(calView.y, calView.m + delta, 1);
    setCalView({ y: d.getFullYear(), m: d.getMonth() });
  }

  async function onDelete(p: CmsAiBlogListItem) {
    if (
      !confirm(
        `Delete “${p.name}”?\n\nThis removes it from the CMS${p.live ? ' and from the live site' : ''}. This cannot be undone.`,
      )
    ) {
      return;
    }
    setMsg(null);
    setBusyId(p.id);
    setBusyAction('delete');
    try {
      const r = await fetch('/api/blog/pages', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, slug: p.slug }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Delete failed');
      setPosts((list) => list.filter((x) => x.id !== p.id));
      setMsg({ tone: 'ok', text: `Deleted “${p.name}”.` });
      router.refresh();
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Delete failed' });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function onCancelSchedule(p: CmsAiBlogListItem) {
    if (!confirm(`Cancel scheduled publish for “${p.name}”?`)) return;
    setMsg(null);
    setBusyId(p.id);
    setBusyAction('cancel');
    try {
      const r = await fetch('/api/blog/schedule', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, slug: p.slug }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Could not cancel');
      setMsg({ tone: 'ok', text: `Cancelled schedule for “${p.name}”.` });
      router.refresh();
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not cancel schedule' });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  function openSchedule(p: CmsAiBlogListItem) {
    const base = p.publishAt ? new Date(p.publishAt) : new Date(Date.now() + 60 * 60 * 1000);
    if (!p.publishAt) base.setMinutes(0, 0, 0);
    // Snap minutes to nearest 5 for the custom select
    base.setMinutes(Math.round(base.getMinutes() / 5) * 5, 0, 0);
    setScheduleAt(toLocalInputValue(base));
    setCalView({ y: base.getFullYear(), m: base.getMonth() });
    setScheduleFor(p);
  }

  function confirmSchedule() {
    if (!scheduleFor) return;
    const when = parseLocalInput(scheduleAt);
    if (Number.isNaN(when.getTime())) {
      setMsg({ tone: 'err', text: 'Pick a valid date and time.' });
      return;
    }
    if (when.getTime() <= Date.now() + 30_000) {
      setMsg({ tone: 'err', text: 'Schedule time must be at least 30 seconds from now.' });
      return;
    }
    const iso = when.toISOString();
    const p = scheduleFor;
    setScheduleFor(null);
    window.location.href = `${p.editPath}?cmsAction=schedule&at=${encodeURIComponent(iso)}`;
  }

  function goEdit(p: CmsAiBlogListItem) {
    window.location.href = p.editPath;
  }

  function goPreview(p: CmsAiBlogListItem) {
    window.open(`${p.editPath}?cmsAction=preview`, '_blank', 'noopener,noreferrer');
  }

  function goPublish(p: CmsAiBlogListItem) {
    if (
      !confirm(
        `Publish “${p.name}” now?\n\nThis publishes the whole CMS site (including this article) and makes it live immediately.`,
      )
    ) {
      return;
    }
    window.location.href = `${p.editPath}?cmsAction=publish`;
  }

  function badge(p: CmsAiBlogListItem) {
    const s = statusOf(p);
    if (s === 'published') return { cls: 'is-live', text: 'Live' };
    if (s === 'scheduled') {
      return {
        cls: 'is-scheduled',
        text: p.publishAt ? `Scheduled ${formatSchedule(p.publishAt)}` : 'Scheduled',
      };
    }
    return { cls: 'is-draft', text: 'Draft' };
  }

  const filters: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: counts.all },
    { id: 'draft', label: 'Drafts', n: counts.draft },
    { id: 'scheduled', label: 'Scheduled', n: counts.scheduled },
    { id: 'published', label: 'Live', n: counts.published },
  ];

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <section className="blog-admin__panel" aria-label="AI blog list">
      <div className="blog-admin__panel-head">
        <h2>Articles</h2>
        <div className="blog-admin__filters" role="tablist" aria-label="Filter by status">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`blog-admin__filter${filter === f.id ? ' is-active' : ''}`}
              onClick={() => {
                setFilter(f.id);
                setPage(1);
              }}
            >
              {f.label} {f.n}
            </button>
          ))}
        </div>
      </div>

      {msg ? (
        <p className={`blog-admin__msg ${msg.tone === 'ok' ? 'is-ok' : 'is-err'}`}>{msg.text}</p>
      ) : null}

      {posts.length === 0 ? (
        <p className="blog-admin__empty">
          No AI blogs yet. Use <strong>New article</strong> above to generate one.
        </p>
      ) : visible.length === 0 ? (
        <p className="blog-admin__empty">No articles in this filter.</p>
      ) : (
        <>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {pageItems.map((p) => {
              const busy = busyId === p.id;
              const b = badge(p);
              const live = statusOf(p) === 'published';
              const scheduled = statusOf(p) === 'scheduled';
              return (
                <li key={p.id} className="blog-admin__row" title={p.name}>
                  <div className="blog-admin__row-main">
                    <span className="blog-admin__row-title">{p.name}</span>
                    <span className={`blog-admin__badge ${b.cls}`}>{b.text}</span>
                    <span className="blog-admin__row-meta">{p.slug}</span>
                  </div>

                  <div className={`blog-admin__actions${busy ? ' is-busy' : ''}`}>
                    <button type="button" className="blog-admin__btn" onClick={() => goEdit(p)}>
                      Edit
                    </button>
                    <button type="button" className="blog-admin__btn is-ghost" onClick={() => goPreview(p)}>
                      Preview
                    </button>
                    <span className="blog-admin__sep" aria-hidden="true" />
                    <button
                      type="button"
                      className="blog-admin__btn is-primary"
                      onClick={() => goPublish(p)}
                    >
                      Publish
                    </button>
                    {scheduled ? (
                      <button
                        type="button"
                        className="blog-admin__btn is-ghost"
                        onClick={() => onCancelSchedule(p)}
                      >
                        {busy && busyAction === 'cancel' ? '…' : 'Unschedule'}
                      </button>
                    ) : !live ? (
                      <button
                        type="button"
                        className="blog-admin__btn is-ghost"
                        onClick={() => openSchedule(p)}
                      >
                        Schedule
                      </button>
                    ) : (
                      <a
                        href={p.livePath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="blog-admin__btn is-ghost"
                      >
                        View live
                      </a>
                    )}
                    <span className="blog-admin__sep" aria-hidden="true" />
                    <button
                      type="button"
                      className="blog-admin__btn is-danger"
                      onClick={() => onDelete(p)}
                      disabled={busy}
                    >
                      {busy && busyAction === 'delete' ? '…' : 'Delete'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          {visible.length > PAGE_SIZE ? (
            <div className="blog-admin__pager" aria-label="Pagination">
              <span className="blog-admin__pager-meta">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, visible.length)} of{' '}
                {visible.length}
              </span>
              <div className="blog-admin__pager-controls">
                <button
                  type="button"
                  className="blog-admin__pager-btn"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`blog-admin__pager-btn${n === safePage ? ' is-active' : ''}`}
                    aria-current={n === safePage ? 'page' : undefined}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  className="blog-admin__pager-btn"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : visible.length > 0 ? (
            <div className="blog-admin__pager">
              <span className="blog-admin__pager-meta">
                {visible.length} article{visible.length === 1 ? '' : 's'}
              </span>
            </div>
          ) : null}
        </>
      )}

      {scheduleFor ? (
        <div
          className="blog-sched-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setScheduleFor(null)}
        >
          <div className="blog-sched" onClick={(e) => e.stopPropagation()}>
            <div className="blog-sched__body">
              <h3 className="blog-sched__title">Schedule publish</h3>
              <p className="blog-sched__lede">
                “{scheduleFor.name}” will go live automatically at this time.
              </p>
              <p className="blog-sched__summary">{formatSummary(scheduleAt)}</p>

              <div className="blog-sched__pick">
                <div>
                  <span className="blog-sched__label">Date</span>
                  <div className="blog-cal">
                    <div className="blog-cal__nav">
                      <p className="blog-cal__month">
                        {MONTHS[calView.m]} {calView.y}
                      </p>
                      <div className="blog-cal__nav-btns">
                        <button
                          type="button"
                          className="blog-cal__nav-btn"
                          aria-label="Previous month"
                          onClick={() => shiftMonth(-1)}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="blog-cal__nav-btn"
                          aria-label="Next month"
                          onClick={() => shiftMonth(1)}
                        >
                          ›
                        </button>
                      </div>
                    </div>
                    <div className="blog-cal__dow">
                      {DOW.map((d) => (
                        <span key={d}>{d}</span>
                      ))}
                    </div>
                    <div className="blog-cal__grid">
                      {monthCells.map(({ date, inMonth }) => {
                        const disabled = date < startOfToday;
                        const selectedDay =
                          !Number.isNaN(selected.getTime()) && sameDay(date, selected);
                        const isToday = sameDay(date, today);
                        return (
                          <button
                            key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${inMonth ? 'm' : 'o'}`}
                            type="button"
                            disabled={disabled}
                            className={[
                              'blog-cal__day',
                              !inMonth ? 'is-muted' : '',
                              selectedDay ? 'is-selected' : '',
                              isToday ? 'is-today' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => {
                              setCalView({ y: date.getFullYear(), m: date.getMonth() });
                              setDatePart(date);
                            }}
                          >
                            {date.getDate()}
                          </button>
                        );
                      })}
                    </div>
                    <div className="blog-cal__quick">
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          setCalView({ y: d.getFullYear(), m: d.getMonth() });
                          setDatePart(d);
                        }}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() + 1);
                          setCalView({ y: d.getFullYear(), m: d.getMonth() });
                          setDatePart(d);
                        }}
                      >
                        Tomorrow
                      </button>
                    </div>
                  </div>
                </div>

                <div className="blog-time">
                  <span className="blog-sched__label">Time</span>
                  <div className="blog-time__stack">
                    <div className="blog-time__field">
                      <label htmlFor="sched-hour">Hour</label>
                      <select
                        id="sched-hour"
                        value={hour12}
                        onChange={(e) => onHourChange(Number(e.target.value))}
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="blog-time__field">
                      <label htmlFor="sched-min">Minute</label>
                      <select
                        id="sched-min"
                        value={
                          [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].includes(minute)
                            ? minute
                            : Math.round(minute / 5) * 5
                        }
                        onChange={(e) => onMinuteChange(Number(e.target.value))}
                      >
                        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                          <option key={m} value={m}>
                            {pad(m)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="blog-time__ampm" role="group" aria-label="AM or PM">
                      <button
                        type="button"
                        className={!isPm ? 'is-active' : ''}
                        onClick={() => onAmPm(false)}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        className={isPm ? 'is-active' : ''}
                        onClick={() => onAmPm(true)}
                      >
                        PM
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="blog-sched__foot">
              <button
                type="button"
                className="blog-admin__btn is-ghost"
                onClick={() => setScheduleFor(null)}
              >
                Cancel
              </button>
              <button type="button" className="blog-admin__btn is-primary" onClick={confirmSchedule}>
                Confirm schedule
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

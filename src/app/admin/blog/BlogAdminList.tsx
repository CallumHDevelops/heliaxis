'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CmsAiBlogListItem } from '@/lib/blog/cms-ai-blogs';

type Filter = 'all' | 'draft' | 'scheduled' | 'published';

type ConfirmKind = 'delete' | 'unschedule' | 'publish';

type ConfirmState = {
  kind: ConfirmKind;
  post: CmsAiBlogListItem;
};

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

function confirmCopy(c: ConfirmState): { title: string; body: string; action: string; danger?: boolean } {
  const name = c.post.name;
  if (c.kind === 'delete') {
    return {
      title: 'Delete article',
      body: `Delete “${name}”? This removes it from the CMS${c.post.live ? ' and from the live site' : ''}. This cannot be undone.`,
      action: 'Delete',
      danger: true,
    };
  }
  if (c.kind === 'unschedule') {
    return {
      title: 'Cancel schedule',
      body: `Cancel the scheduled publish for “${name}”? It will stay as a draft.`,
      action: 'Unschedule',
    };
  }
  return {
    title: 'Publish now',
    body: `Publish “${name}” now? This publishes the whole CMS site (including this article) and makes it live immediately.`,
    action: 'Publish',
  };
}

export function BlogAdminList({ posts: initial }: { posts: CmsAiBlogListItem[] }) {
  const router = useRouter();
  const [posts, setPosts] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [scheduleErr, setScheduleErr] = useState<string | null>(null);
  const [scheduleFor, setScheduleFor] = useState<CmsAiBlogListItem | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
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
      } else {
        const err = q.get('scheduleError');
        if (err) {
          setMsg({ tone: 'err', text: err });
          window.history.replaceState({}, '', '/admin/blog');
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuId(null);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuId]);

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
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (filter !== 'all' && statusOf(p) !== filter) return false;
      if (!q) return true;
      const name = (p.name || '').toLowerCase();
      const slug = (p.slug || '').toLowerCase();
      return name.includes(q) || slug.includes(q);
    });
  }, [posts, filter, search]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return visible.slice(start, start + PAGE_SIZE);
  }, [visible, safePage]);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

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
    setScheduleErr(null);
    setScheduleAt(toLocalInputValue(base));
  }

  function setTimePart(nextHour24: number, nextMinute: number) {
    const base = Number.isNaN(selected.getTime()) ? new Date() : new Date(selected);
    base.setHours(nextHour24, nextMinute, 0, 0);
    setScheduleErr(null);
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

  async function runDelete(p: CmsAiBlogListItem) {
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

  async function runCancelSchedule(p: CmsAiBlogListItem) {
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
      setPosts((prev) =>
        prev.map((row) =>
          row.id === p.id ? { ...row, status: 'draft', publishAt: null, live: false } : row,
        ),
      );
      setMsg({ tone: 'ok', text: `Cancelled schedule for “${p.name}”.` });
      router.refresh();
    } catch (e) {
      setMsg({ tone: 'err', text: e instanceof Error ? e.message : 'Could not cancel schedule' });
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function onConfirmAction() {
    if (!confirm) return;
    const { kind, post } = confirm;
    setConfirm(null);
    if (kind === 'delete') await runDelete(post);
    else if (kind === 'unschedule') await runCancelSchedule(post);
    else window.location.href = `${post.editPath}?cmsAction=publish`;
  }

  function openSchedule(p: CmsAiBlogListItem) {
    const base = p.publishAt ? new Date(p.publishAt) : new Date(Date.now() + 60 * 60 * 1000);
    if (!p.publishAt) base.setMinutes(0, 0, 0);
    base.setMinutes(Math.round(base.getMinutes() / 5) * 5, 0, 0);
    setScheduleAt(toLocalInputValue(base));
    setCalView({ y: base.getFullYear(), m: base.getMonth() });
    setScheduleErr(null);
    setMenuId(null);
    setScheduleFor(p);
  }

  async function confirmSchedule() {
    if (!scheduleFor) return;
    const when = parseLocalInput(scheduleAt);
    if (Number.isNaN(when.getTime())) {
      setScheduleErr('Pick a valid date and time.');
      return;
    }
    if (when.getTime() <= Date.now() + 30_000) {
      setScheduleErr('Choose a time at least 30 seconds from now.');
      return;
    }
    const iso = when.toISOString();
    const p = scheduleFor;
    setScheduleErr(null);
    setBusyId(p.id);
    setBusyAction('schedule');
    try {
      const r = await fetch('/api/blog/schedule', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id, slug: p.slug, publishAt: iso }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; publishAt?: string };
      if (!r.ok) throw new Error(d.error || 'Could not schedule');
      setPosts((prev) =>
        prev.map((row) =>
          row.id === p.id
            ? { ...row, status: 'scheduled', publishAt: d.publishAt || iso, live: false }
            : row,
        ),
      );
      setScheduleFor(null);
      setMsg({
        tone: 'ok',
        text: `Scheduled “${p.name}” — it will go live automatically at the set time.`,
      });
      router.refresh();
    } catch (e) {
      setScheduleErr(e instanceof Error ? e.message : 'Could not schedule');
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  function goEdit(p: CmsAiBlogListItem) {
    window.location.href = p.editPath;
  }

  function goPreview(p: CmsAiBlogListItem) {
    setMenuId(null);
    window.open(`${p.editPath}?cmsAction=preview`, '_blank', 'noopener,noreferrer');
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
  const confirmUi = confirm ? confirmCopy(confirm) : null;
  const confirmBusy =
    confirm &&
    busyId === confirm.post.id &&
    (busyAction === 'delete' || busyAction === 'cancel');

  return (
    <section className="blog-admin__panel" aria-label="AI blog list">
      <div className="blog-admin__panel-head">
        <div className="blog-admin__panel-top">
          <h2>Articles</h2>
          <label className="blog-admin__search">
            <span className="blog-admin__sr">Search articles</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title or slug…"
              aria-label="Search articles"
            />
          </label>
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
                {f.label}
                <span className="blog-admin__filter-n">{f.n}</span>
              </button>
            ))}
          </div>
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
        <p className="blog-admin__empty">
          {search.trim()
            ? `No articles match “${search.trim()}”.`
            : 'No articles in this filter.'}
        </p>
      ) : (
        <>
          <ul className="blog-admin__list">
            {pageItems.map((p) => {
              const busy = busyId === p.id;
              const b = badge(p);
              const live = statusOf(p) === 'published';
              const scheduled = statusOf(p) === 'scheduled';
              const menuOpen = menuId === p.id;
              return (
                <li key={p.id} className="blog-admin__row" title={p.name}>
                  <div className="blog-admin__row-main">
                    <div className="blog-admin__row-text">
                      <span className="blog-admin__row-title">{p.name}</span>
                      <span className="blog-admin__row-meta">{p.slug}</span>
                    </div>
                    <span className={`blog-admin__badge ${b.cls}`}>{b.text}</span>
                  </div>

                  <div className={`blog-admin__actions${busy ? ' is-busy' : ''}`}>
                    <button type="button" className="blog-admin__btn" onClick={() => goEdit(p)}>
                      Edit
                    </button>

                    {scheduled ? (
                      <button
                        type="button"
                        className="blog-admin__btn is-ghost"
                        onClick={() => setConfirm({ kind: 'unschedule', post: p })}
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
                        View
                      </a>
                    )}

                    <div
                      className="blog-admin__more"
                      ref={menuOpen ? menuRef : undefined}
                    >
                      <button
                        type="button"
                        className="blog-admin__btn is-ghost blog-admin__more-btn"
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        aria-label={`More actions for ${p.name}`}
                        onClick={() => setMenuId(menuOpen ? null : p.id)}
                      >
                        ⋯
                      </button>
                      {menuOpen ? (
                        <div className="blog-admin__menu" role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => goPreview(p)}
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenuId(null);
                              setConfirm({ kind: 'publish', post: p });
                            }}
                          >
                            Publish now
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="is-danger"
                            onClick={() => {
                              setMenuId(null);
                              setConfirm({ kind: 'delete', post: p });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      ) : null}
                    </div>
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
                  onClick={() => setPage((n) => Math.max(1, n - 1))}
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
                  onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
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

      {confirm && confirmUi ? (
        <div
          className="blog-sched-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="blog-confirm-title"
          onClick={() => setConfirm(null)}
        >
          <div className="blog-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="blog-confirm__body">
              <h3 id="blog-confirm-title" className="blog-sched__title">
                {confirmUi.title}
              </h3>
              <p className="blog-confirm__lede">{confirmUi.body}</p>
            </div>
            <div className="blog-sched__foot">
              <button
                type="button"
                className="blog-admin__btn is-ghost"
                disabled={!!confirmBusy}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`blog-admin__btn ${confirmUi.danger ? 'is-danger is-solid' : 'is-primary'}`}
                disabled={!!confirmBusy}
                onClick={() => void onConfirmAction()}
              >
                {confirmBusy ? '…' : confirmUi.action}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scheduleFor ? (
        <div
          className="blog-sched-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setScheduleErr(null);
            setScheduleFor(null);
          }}
        >
          <div className="blog-sched" onClick={(e) => e.stopPropagation()}>
            <div className="blog-sched__body">
              <h3 className="blog-sched__title">Schedule publish</h3>
              <p className="blog-sched__lede">
                “{scheduleFor.name}” will go live automatically at this time.
              </p>
              <p className="blog-sched__summary">{formatSummary(scheduleAt)}</p>
              {scheduleErr ? (
                <p className="blog-sched__err" role="alert">
                  {scheduleErr}
                </p>
              ) : null}

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
                disabled={busyAction === 'schedule'}
                onClick={() => {
                  setScheduleErr(null);
                  setScheduleFor(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="blog-admin__btn is-primary"
                disabled={busyAction === 'schedule'}
                onClick={() => void confirmSchedule()}
              >
                {busyAction === 'schedule' ? 'Scheduling…' : 'Confirm schedule'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import { DELIVERY_STAGES, PRODUCTS, PROJECT_STAGES, productLabel, stageLabel } from '@/lib/crm/stages';
import { plusDays } from '@/lib/projects/feed';
import type { ProjectListRow, TeamMember } from '@/lib/projects/server';
import { useLiveRefresh } from '@/lib/use-live-refresh';
import { useNow } from '@/lib/use-now';
import { useBoardHeight } from '../crm/board-height';
import { MoveSheet } from '../crm/CrmCard';
import { Icon, SalesProjects, StageChip } from '../crm/CrmUi';
import { matchesSearch, mondayIndex, rememberView, shortDate, ukDayOf, ukTime } from '../crm/crm-shared';
import { useMedia } from '../crm/use-stored';
import { NewProjectSheet } from './NewProjectSheet';
import '../crm/crm.css';
import './projects.css';

export type ProjectsView = 'list' | 'schedule' | 'board';
type Filter = 'live' | 'attention' | 'hold' | 'complete' | 'lost' | 'mine';
type Data = { ready: boolean; projects: ProjectListRow[] };

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'live', label: 'Live' },
  { key: 'attention', label: 'Needs attention' },
  { key: 'hold', label: 'On hold' },
  { key: 'mine', label: 'Mine' },
  { key: 'complete', label: 'Complete' },
  { key: 'lost', label: 'Lost' },
];
const MOVE_TO = [...PROJECT_STAGES, 'lost'] as const;
const WEEKS = 8;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const isOpenJob = (p: ProjectListRow) => p.stage !== 'complete' && p.stage !== 'lost';
const forSearch = (p: ProjectListRow) => ({ customer: p.customer?.name, title: p.title, postcode: p.postcode, phone: p.customer?.phone, project_ref: p.project_ref, customer_ref: p.customer_ref });
const refOf = (p: ProjectListRow) => p.project_ref || p.customer_ref || null;

/** "Fri 6 Nov · 3 days" (install) or "Survey Tue 3 Nov, 11:45". */
function nextWords(p: ProjectListRow): string {
  const n = p.next_date;
  if (!n) return 'Not booked';
  const day = shortDate(ukDayOf(n.at));
  if (n.kind === 'survey') return `Survey ${day}, ${ukTime(n.at)}`;
  return `${day} · ${n.days ?? 1} day${(n.days ?? 1) === 1 ? '' : 's'}`;
}

/**
 * The Projects page: every job from Won to Complete (GET /api/crm/projects?scope=projects). List first
 * (needs attention, then by the next date, then not booked), Schedule (installs and scaffold over the
 * next 8 weeks) and, from 1024px, a Board with a column per delivery stage.
 */
export function ProjectsBoard({
  me,
  initialView,
  initial,
  team,
  today: serverToday,
}: {
  me: string;
  initialView: ProjectsView;
  initial: Data;
  team: TeamMember[];
  today: string;
}) {
  const router = useRouter();
  const now = useNow(60_000);
  const today = now ? ukDayOf(now) : serverToday;
  const [data, setData] = useState<Data>(initial);
  const [error, setError] = useState('');
  const [view, setView] = useState<ProjectsView>(initialView);
  const [filter, setFilter] = useState<Filter>('live');
  const [product, setProduct] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const wideBoard = useMedia('(min-width: 1024px)', true);

  const skipFirst = useRef(true);
  const load = useCallback(async () => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return true;
    }
    try {
      const r = await fetch('/api/crm/projects?scope=projects', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load the projects');
      setData(d as Data);
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the projects');
      return false;
    }
  }, []);
  const { reload } = useLiveRefresh(load, 60_000);

  function pickView(v: ProjectsView) {
    setView(v);
    rememberView('view', v);
  }

  async function moveTo(id: string, to: string) {
    const p = data.projects.find((x) => x.id === id);
    if (!p || p.stage === to) return;
    setData((d) => ({ ...d, projects: d.projects.map((x) => (x.id === id ? { ...x, stage: to } : x)) }));
    const r = await fetch(`/api/crm/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: to }) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || 'Couldn’t move that job. Try again.');
    }
    void reload();
  }

  const all = data.projects;
  const searched = all.filter((p) => matchesSearch(forSearch(p), q) && (!product || p.products.includes(product)));
  const test: Record<Filter, (p: ProjectListRow) => boolean> = {
    live: (p) => isOpenJob(p) && !p.on_hold,
    attention: (p) => p.stage !== 'lost' && p.needs_attention,
    hold: (p) => isOpenJob(p) && p.on_hold,
    mine: (p) => isOpenJob(p) && p.owner_id === me,
    complete: (p) => p.stage === 'complete',
    lost: (p) => p.stage === 'lost',
  };
  const shown = searched.filter(test[filter]);
  const live = all.filter(test.live);
  const attention = all.filter(test.attention).length;
  const soon = live.filter((p) => p.next_date?.kind === 'install' && ukDayOf(p.next_date.at) <= plusDays(today, 14)).length;
  // The installs part only shows where the header has room (crm.css .crmh-sum__x).
  const summary = [
    { text: `${live.length} live`, extra: false },
    { text: attention ? `${attention} need${attention === 1 ? 's' : ''} attention` : '', extra: false },
    { text: soon ? `${soon} install${soon === 1 ? '' : 's'} in the next 2 weeks` : '', extra: true },
  ].filter((x) => x.text);

  const effective = view === 'board' && !wideBoard ? 'list' : view;

  return (
    <div className="crm crmh prj" data-view={effective}>
      <div className="crmh-head">
        <div className="crmh-head__l">
          <h1 className="crmh-h1">Projects</h1>
          <SalesProjects on="projects" className="crmh-sp" />
          <span className="crmh-sum" title={summary.map((x) => x.text).join(' · ')}>
            {data.ready &&
              summary.map((x, i) => (
                <span key={x.text} className={x.extra ? 'crmh-sum__x' : undefined}>
                  {i ? ' · ' : ''}
                  {x.text}
                </span>
              ))}
          </span>
        </div>
        <label className="crmh-searchbox crmh-search prj-search">
          <span className="crmh-searchbox__field">
            <Icon k="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, postcode, phone or HX-ref" aria-label="Search the projects" />
          </span>
        </label>
        <div className="crmh-head__r">
          <div className="crmh-seg crmh-views" role="group" aria-label="View">
            {(['list', 'schedule', 'board'] as const).map((v) => (
              <button key={v} type="button" className={`${effective === v ? 'on' : ''} crmh-view--${v}`} aria-pressed={effective === v} onClick={() => pickView(v)}>
                {v === 'list' ? 'List' : v === 'schedule' ? 'Schedule' : 'Board'}
              </button>
            ))}
          </div>
          <button type="button" className="crm-btn crm-btn--solar crmh-new prj-new" onClick={() => setAdding(true)}>
            + New project
          </button>
        </div>
      </div>

      {error && <p className="crm-banner crm-banner--err">{error}</p>}

      {!data.ready ? (
        <div className="crm-emptystate">
          <b>Projects appear here once crm-v3.sql has been run</b>
          <p>
            It’s on your <Link href="/admin/setup">to-do list</Link>. Until then, jobs stay on the CRM board.
          </p>
        </div>
      ) : (
        <>
          {effective !== 'schedule' && (
            <div className="crmh-filters prj-filters">
              <div className="crm-stages crmh-chips" role="group" aria-label="Show">
                {FILTERS.map((f) => {
                  const n = searched.filter(test[f.key]).length;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      className={`${filter === f.key ? 'on' : ''}${f.key === 'attention' && n ? ' warn' : ''}`}
                      aria-pressed={filter === f.key}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label}
                      <span>{n}</span>
                    </button>
                  );
                })}
              </div>
              <div className="crm-stages crmh-chips prj-products" role="group" aria-label="Products">
                {PRODUCTS.filter((p) => p.key !== 'other').map((p) => (
                  <button key={p.key} type="button" className={product === p.key ? 'on' : ''} aria-pressed={product === p.key} onClick={() => setProduct(product === p.key ? '' : p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {effective === 'list' && <ProjectsList rows={shown} filter={filter} />}
          {effective === 'board' && (
            <ProjectsBoardView
              // Live on the board also counts the completed jobs for the Complete rail at the end.
              rows={searched.filter((p) => (filter === 'live' ? test.live(p) || p.stage === 'complete' : test[filter](p)))}
              onMove={moveTo}
              onComplete={() => {
                setFilter('complete');
                pickView('list');
              }}
            />
          )}
          {effective === 'schedule' && <Schedule rows={searched.filter((p) => p.stage !== 'lost')} today={today} />}
        </>
      )}

      {adding && (
        <NewProjectSheet mode="project" me={me} team={team} onClose={() => setAdding(false)} onCreated={(id) => router.push(`/admin/projects/${id}`)} />
      )}
    </div>
  );
}

/* ── List ────────────────────────────────────────────────────────────────────── */

function ProjectsList({ rows, filter }: { rows: ProjectListRow[]; filter: Filter }) {
  const sections = useMemo(() => {
    if (filter === 'complete' || filter === 'lost' || filter === 'hold') {
      return [{ key: 'all', label: '', rows: [...rows].sort((a, b) => b.updated_at.localeCompare(a.updated_at)) }];
    }
    const need = rows.filter((p) => p.needs_attention);
    const rest = rows.filter((p) => !p.needs_attention);
    const booked = rest.filter((p) => p.next_date).sort((a, b) => a.next_date!.at.localeCompare(b.next_date!.at));
    const notBooked = rest.filter((p) => !p.next_date).sort((a, b) => (b.project_started_at ?? '').localeCompare(a.project_started_at ?? ''));
    return [
      { key: 'need', label: 'Needs attention', rows: need.sort((a, b) => (a.next_date?.at ?? '9999').localeCompare(b.next_date?.at ?? '9999')) },
      { key: 'booked', label: 'Coming up', rows: booked },
      { key: 'none', label: 'Not booked', rows: notBooked },
    ].filter((s) => s.rows.length);
  }, [rows, filter]);

  if (!rows.length) return <p className="crm-muted crm-emptystate">No jobs here.</p>;
  return (
    <div className="prj-list">
      <div className="prj-row prj-row--head" aria-hidden="true">
        <span>Ref</span>
        <span>Customer and job</span>
        <span>Stage</span>
        <span>Next date</span>
        <span>Checklist</span>
        <span>Flags</span>
      </div>
      {sections.map((s) => (
        <section key={s.key} className="prj-section" aria-label={s.label || 'Jobs'}>
          {s.label && (
            <h2 className={`prj-section__h${s.key === 'need' ? ' late' : ''}`}>
              {s.label} <span className="crmh-n">{s.rows.length}</span>
            </h2>
          )}
          {s.rows.map((p) => (
            <ProjectRow key={p.id} p={p} />
          ))}
        </section>
      ))}
    </div>
  );
}

function ProductIcons({ products }: { products: string[] }) {
  if (!products.length) return null;
  const SHORT: Record<string, string> = { solar: 'PV', battery: 'Batt', heatpump: 'HP', ev: 'EV', infrared: 'IR', led: 'LED', other: '+' };
  return (
    <span className="prj-prods">
      {products.map((k) => (
        <abbr key={k} className={`prj-prod prj-prod--${k}`} title={productLabel(k)}>
          {SHORT[k] ?? k}
        </abbr>
      ))}
    </span>
  );
}

function Progress({ p }: { p: ProjectListRow }) {
  const { done, total, keyMissing } = p.progress;
  if (!total) return <span className="crm-muted crm-small">–</span>;
  return (
    <span className={`prj-progress${keyMissing ? ' is-key' : ''}`} title={keyMissing ? `${keyMissing} key item${keyMissing === 1 ? '' : 's'} not done` : 'Checklist for this stage'}>
      <span className="prj-progress__bar">
        <i style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </span>
      {done}/{total}
    </span>
  );
}

function Flags({ p, max = 4 }: { p: ProjectListRow; max?: number }) {
  if (!p.flags.length) return null;
  const hot = new Set(p.attention);
  return (
    <span className="prj-flags">
      {p.flags.slice(0, max).map((f) => (
        <span key={f} className={`prj-flag${hot.has(f) ? ' hot' : ''}${f === 'On hold' ? ' hold' : ''}`} title={f === 'Possible duplicate' && p.possible_duplicate ? `Possible duplicate of ${p.possible_duplicate.name}` : undefined}>
          {f}
        </span>
      ))}
      {p.flags.length > max && <span className="prj-flag">+{p.flags.length - max}</span>}
    </span>
  );
}

function ProjectRow({ p }: { p: ProjectListRow }) {
  const name = p.customer?.name || p.title;
  const sub = p.title && p.title !== name ? p.title : '';
  return (
    <Link href={`/admin/projects/${p.id}`} className={`prj-row${p.needs_attention ? ' is-attention' : ''}`}>
      <span className="prj-ref">{refOf(p) || '—'}</span>
      <span className="prj-who">
        <b>{name}</b>
        <small>
          {sub}
          {sub && p.products.length ? ' ' : ''}
          <ProductIcons products={p.products} />
        </small>
      </span>
      <span className="prj-stage">
        <StageChip stage={p.stage} />
      </span>
      <span className={`prj-next${p.next_date ? '' : ' none'}`}>
        {nextWords(p)}
        {p.next_date?.kind === 'install' && p.team.length > 0 && <small>{p.team.join(', ')}</small>}
      </span>
      <span className="prj-check">
        <Progress p={p} />
      </span>
      <span className="prj-flagcell">
        <Flags p={p} />
      </span>
    </Link>
  );
}

/* ── Board ───────────────────────────────────────────────────────────────────── */

function ProjectsBoardView({ rows, onMove, onComplete }: { rows: ProjectListRow[]; onMove: (id: string, stage: string) => void; onComplete: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useBoardHeight(box);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<ProjectListRow | null>(null);
  const complete = rows.filter((p) => p.stage === 'complete').length;
  const drop = (stage: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      setOver(stage);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(null);
      const id = e.dataTransfer.getData('text/plain');
      setDragId(null);
      if (id) onMove(id, stage);
    },
  });
  return (
    <>
      <div className="crmb prj-board" ref={box} role="region" aria-label="Board" tabIndex={0}>
        {DELIVERY_STAGES.map((k) => {
          const cards = rows.filter((p) => p.stage === k);
          if (!cards.length) {
            return (
              <div key={k} data-col={k} className={`crmb-rail${over === k ? ' is-over' : ''}`} title={`${stageLabel(k)}: nothing here`} {...drop(k)}>
                <span>{stageLabel(k)}</span>
                <b>0</b>
              </div>
            );
          }
          return (
            <section key={k} data-col={k} className={`crmb-col${over === k ? ' is-over' : ''}`} aria-label={stageLabel(k)} {...drop(k)}>
              <header className="crmb-col__h">
                <b>{stageLabel(k)}</b>
                <span>{cards.length}</span>
              </header>
              <div className="crmb-col__cards">
                {cards.map((p) => (
                  <div
                    key={p.id}
                    className={`crm-card crmh-card2 compact prj-card${dragId === p.id ? ' is-dragging' : ''}${p.needs_attention ? ' is-attention' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', p.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDragId(p.id);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOver(null);
                    }}
                  >
                    <div className="crm-card-top">
                      <Link href={`/admin/projects/${p.id}`} className="crmh-card2__link" draggable={false}>
                        {p.customer?.name || p.title}
                      </Link>
                      {refOf(p) && <span className="crmh-refchip">{refOf(p)}</span>}
                    </div>
                    <div className="crm-card-sub">{p.title}</div>
                    <span className={`crm-next${p.next_date ? '' : ' none'}`}>{nextWords(p)}</span>
                    <div className="crm-card-mid">
                      <Progress p={p} />
                      <Flags p={p} max={2} />
                      <span className="crmh-card2__end">
                        <button type="button" className="crmh-movebtn" onClick={() => setMoving(p)} aria-label={`Move ${p.customer?.name || p.title} to another stage`}>
                          Move
                        </button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <button type="button" className="crmb-rail prj-donerail" onClick={onComplete} title="Show the completed jobs in the list">
          <span>Complete</span>
          <b>{complete}</b>
        </button>
      </div>
      {moving && (
        <MoveSheet
          p={{ id: moving.id, stage: moving.stage, customer: moving.customer?.name, title: moving.title }}
          stages={MOVE_TO}
          onMove={onMove}
          onClose={() => setMoving(null)}
        />
      )}
    </>
  );
}

/* ── Schedule ────────────────────────────────────────────────────────────────── */

type Event = { key: string; kind: 'install' | 'scaffold_up' | 'scaffold_down'; p: ProjectListRow; day?: number; of?: number };

function Schedule({ rows, today }: { rows: ProjectListRow[]; today: string }) {
  const start = plusDays(today, -mondayIndex(today));
  const end = plusDays(start, WEEKS * 7 - 1);
  const byDay = new Map<string, Event[]>();
  const add = (d: string, e: Event) => {
    if (d < start || d > end) return;
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  };
  for (const p of rows) {
    p.install_dates.forEach((d, i) => add(d, { key: `${p.id}-i-${d}`, kind: 'install', p, day: i + 1, of: p.install_dates.length }));
    if (p.scaffold_up_on) add(p.scaffold_up_on, { key: `${p.id}-su`, kind: 'scaffold_up', p });
    if (p.scaffold_down_on) add(p.scaffold_down_on, { key: `${p.id}-sd`, kind: 'scaffold_down', p });
  }
  const notBooked = rows.filter((p) => p.stage === 'ready' && !p.install_at);
  const weeks = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, d) => plusDays(start, w * 7 + d)));

  return (
    <div className="prj-sched">
      {notBooked.length > 0 && (
        <section className="crmh-card prj-notbooked" aria-label="Not booked yet">
          <div className="crmh-card__h">
            <h3>Not booked yet</h3>
            <span className="crmh-n">{notBooked.length}</span>
            <span className="crm-muted crm-small">Ready to book, no install date</span>
          </div>
          <ul>
            {notBooked.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/projects/${p.id}`}>
                  <span className="prj-ref">{refOf(p) || '—'}</span>
                  <b>{p.customer?.name || p.title}</b>
                  <small>{p.title}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="prj-weekhead" aria-hidden="true">
        {DAY_NAMES.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      {weeks.map((days) => {
        const any = days.some((d) => byDay.has(d));
        return (
          <section key={days[0]} className={`prj-week${any ? '' : ' is-empty'}`} aria-label={`Week starting ${shortDate(days[0])}`}>
            <h3 className="prj-week__h">
              Week of {shortDate(days[0])}
              {!any && <small> · nothing booked</small>}
            </h3>
            <div className="prj-days">
              {days.map((d) => {
                const events = byDay.get(d) ?? [];
                return (
                  <div key={d} className={`prj-day${d === today ? ' is-today' : ''}${d < today ? ' is-past' : ''}${events.length ? '' : ' is-free'}`}>
                    <span className="prj-day__n">
                      <span className="prj-day__wd">{DAY_NAMES[mondayIndex(d)]} </span>
                      {Number(d.slice(8))}
                      {d === today && <em> Today</em>}
                    </span>
                    {events.map((e) => (
                      <Link key={e.key} href={`/admin/projects/${e.p.id}`} className={`prj-ev prj-ev--${e.kind}`}>
                        <b>
                          {e.kind === 'install' ? (e.of && e.of > 1 ? `Install ${e.day}/${e.of}` : 'Install') : e.kind === 'scaffold_up' ? 'Scaffold up' : 'Scaffold down'}
                        </b>
                        <span>
                          {refOf(e.p) ? `${refOf(e.p)} · ` : ''}
                          {e.p.customer?.name || e.p.title}
                        </span>
                        {e.kind === 'install' && e.p.team.length > 0 && <small>{e.p.team.join(', ')}</small>}
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

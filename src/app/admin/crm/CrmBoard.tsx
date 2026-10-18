'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { relativeTime } from '@/lib/enquiries';
import { money, PRODUCTS, productLabel, STAGES, stageLabel } from '@/lib/crm/stages';
import './crm.css';

type Project = {
  id: string;
  enquiry_id: string;
  title: string;
  stage: string;
  products: string[];
  value: number | null;
  postcode: string | null;
  customer: string;
  phone: string | null;
  owner: string;
  owner_id: string | null;
  wa_unread: number;
  survey_at: string | null;
  install_at: string | null;
  next_step: string | null;
  next_step_at: string | null;
  updated_at: string;
};
type Lead = { id: string; name: string; phone: string | null; postcode: string | null; interest: string | null; source: string; created_at: string };

type Filter = 'live' | 'due' | 'unread' | 'nostep' | 'mine' | (typeof STAGES)[number]['key'];
const LIVE = (p: Project) => p.stage !== 'complete' && p.stage !== 'lost';
const BOARD_STAGES = STAGES.filter((s) => s.key !== 'complete' && s.key !== 'lost');
const QUIET_DAYS = 7;

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
const isDue = (p: Project) => !!p.next_step_at && new Date(p.next_step_at).getTime() <= endOfToday();
const isOverdue = (p: Project) => !!p.next_step_at && new Date(p.next_step_at).getTime() < Date.now();
const quietDays = (p: Project) => Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86_400_000);

export function CrmBoard({ me }: { me: string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('live');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/crm/projects', { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not load projects');
      setProjects(d.projects);
      setLeads(d.unassigned);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load projects');
      setProjects((p) => p ?? []);
    }
  }, []);
  useEffect(() => {
    load();
    // Desktop starts on the board, phones on the list; remembered per device.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('hx-crm-view');
    } catch {}
    const v = saved === 'board' || saved === 'list' ? saved : window.matchMedia('(min-width: 1000px)').matches ? 'board' : 'list';
    if (v !== 'list') setView(v);
  }, [load]);
  function pickView(v: 'list' | 'board') {
    setView(v);
    try {
      localStorage.setItem('hx-crm-view', v);
    } catch {}
  }

  const all = projects ?? [];
  const live = all.filter(LIVE);
  const today = {
    due: live.filter(isDue).length,
    unread: live.filter((p) => p.wa_unread > 0).length,
    nostep: live.filter((p) => !p.next_step).length,
  };
  const pipelineValue = live
    .filter((p) => ['lead', 'contacted', 'survey_booked', 'surveyed', 'quote_sent'].includes(p.stage))
    .reduce((s, p) => s + (Number(p.value) || 0), 0);

  const matches = (p: Project) =>
    !q.trim() || `${p.title} ${p.customer} ${p.postcode || ''} ${p.phone || ''}`.toLowerCase().includes(q.trim().toLowerCase());
  const byFilter = (p: Project) => {
    switch (filter) {
      case 'live':
        return LIVE(p);
      case 'due':
        return LIVE(p) && isDue(p);
      case 'unread':
        return LIVE(p) && p.wa_unread > 0;
      case 'nostep':
        return LIVE(p) && !p.next_step;
      case 'mine':
        return LIVE(p) && p.owner_id === me;
      default:
        return p.stage === filter;
    }
  };
  const shown = all.filter((p) => matches(p) && byFilter(p)).sort((a, b) => {
    // Most urgent first: overdue/due next steps, then unread WhatsApp, then most recent.
    const ad = a.next_step_at ? new Date(a.next_step_at).getTime() : Infinity;
    const bd = b.next_step_at ? new Date(b.next_step_at).getTime() : Infinity;
    if (isDue(a) || isDue(b)) return ad - bd;
    if ((a.wa_unread > 0) !== (b.wa_unread > 0)) return a.wa_unread > 0 ? -1 : 1;
    return b.updated_at.localeCompare(a.updated_at);
  });

  async function fromLead(l: Lead) {
    setBusy(l.id);
    const r = await fetch('/api/crm/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiry_id: l.id, products: guessProducts(l.interest) }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (r.ok) router.push(`/admin/crm/${d.id}`);
    else setError(d.error || 'Could not create the project');
  }

  async function moveTo(id: string, stage: string) {
    const p = all.find((x) => x.id === id);
    if (!p || p.stage === stage) return;
    setProjects((ps) => ps?.map((x) => (x.id === id ? { ...x, stage, updated_at: new Date().toISOString() } : x)) ?? null);
    const r = await fetch(`/api/crm/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (!r.ok) {
      setError('Couldn’t move that project — try again.');
      load();
    }
  }

  const chip = (f: Filter, label: string, n?: number, tone?: string) => (
    <button type="button" className={`${filter === f ? 'on' : ''} ${tone || ''}`} onClick={() => setFilter(f)}>
      {label}
      {n !== undefined && <span>{n}</span>}
    </button>
  );

  return (
    <div className="crm">
      <div className="crm-head">
        <div>
          <h1>CRM</h1>
          <p>
            {live.length} live project{live.length === 1 ? '' : 's'} · {money(pipelineValue) || '£0'} in sales
          </p>
        </div>
        <div className="crm-head-actions">
          <div className="crm-viewtoggle" role="group" aria-label="View">
            <button type="button" className={view === 'list' ? 'on' : ''} onClick={() => pickView('list')}>
              List
            </button>
            <button type="button" className={view === 'board' ? 'on' : ''} onClick={() => pickView('board')}>
              Board
            </button>
          </div>
          <button type="button" className="crm-btn crm-btn--solar" onClick={() => setAdding(true)}>
            + New
          </button>
        </div>
      </div>

      {error && <p className="crm-banner crm-banner--err">{error}</p>}

      {/* Today: what needs doing now (Capsule / Pipedrive style). */}
      <div className="crm-today">
        <button type="button" className={`crm-today-card${today.due ? ' hot' : ''}`} onClick={() => setFilter('due')}>
          <b>{today.due}</b>
          <span>Follow-ups due</span>
        </button>
        <button type="button" className={`crm-today-card${today.unread ? ' wa' : ''}`} onClick={() => setFilter('unread')}>
          <b>{today.unread}</b>
          <span>Unread WhatsApp</span>
        </button>
        <button type="button" className={`crm-today-card${leads.length ? ' new' : ''}`} onClick={() => document.getElementById('crm-leads')?.scrollIntoView({ behavior: 'smooth' })}>
          <b>{leads.length}</b>
          <span>New enquiries</span>
        </button>
      </div>

      {leads.length > 0 && (
        <section className="crm-leads" id="crm-leads">
          <h2>New enquiries — start a project</h2>
          <div className="crm-leads-row">
            {leads.slice(0, 12).map((l) => (
              <div key={l.id} className="crm-lead">
                <b>{l.name}</b>
                <span>
                  {[l.postcode, l.source].filter(Boolean).join(' · ')} · {relativeTime(l.created_at)}
                </span>
                <button type="button" className="crm-btn crm-btn--small" disabled={busy === l.id} onClick={() => fromLead(l)}>
                  {busy === l.id ? '…' : 'Start project'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <input className="crm-input crm-search" placeholder="Search name, postcode or phone" value={q} onChange={(e) => setQ(e.target.value)} />

      {view === 'list' && (
        <div className="crm-stages">
          {chip('live', 'All live', live.length)}
          {chip('mine', 'Mine')}
          {chip('due', 'Due', today.due, today.due ? 'warn' : '')}
          {chip('nostep', 'No next step', today.nostep)}
          {STAGES.map((st) => chip(st.key, st.label, all.filter((p) => p.stage === st.key).length))}
        </div>
      )}

      {projects === null ? (
        <p className="crm-muted">Loading…</p>
      ) : all.length === 0 ? (
        <div className="crm-emptystate">
          <b>No projects yet</b>
          <p>Start one from a new enquiry above, or tap “+ New” for a customer who rang you. (If this shows an error, run supabase/crm.sql first.)</p>
        </div>
      ) : view === 'board' ? (
        <div className="crm-board">
          {BOARD_STAGES.map((st) => {
            const col = all.filter((p) => p.stage === st.key && matches(p));
            const total = col.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
            return (
              <div
                key={st.key}
                className={`crm-col${dragId ? ' drop' : ''}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData('text/plain');
                  setDragId(null);
                  if (id) void moveTo(id, st.key);
                }}
              >
                <div className="crm-col-head">
                  <b>{st.label}</b>
                  <span>
                    {col.length}
                    {total ? ` · ${money(total)}` : ''}
                  </span>
                </div>
                {col.map((p) => (
                  <ProjectCard
                    key={p.id}
                    p={p}
                    compact
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', p.id);
                      setDragId(p.id);
                    }}
                    onDragEnd={() => setDragId(null)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      ) : shown.length === 0 ? (
        <p className="crm-muted crm-emptystate">Nothing here.</p>
      ) : (
        <div className="crm-list">
          {shown.map((p) => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {adding && <NewProject onClose={() => setAdding(false)} onCreated={(id) => router.push(`/admin/crm/${id}`)} />}
    </div>
  );
}

function NextStepLine({ p }: { p: Project }) {
  if (!LIVE(p)) return null;
  if (!p.next_step) return <span className="crm-next none">No next step</span>;
  const tone = isOverdue(p) ? 'late' : isDue(p) ? 'today' : '';
  return (
    <span className={`crm-next ${tone}`}>
      ▸ {p.next_step}
      {p.next_step_at ? ` · ${dueLabel(p.next_step_at)}` : ''}
    </span>
  );
}

function dueLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const tmw = new Date(now.getTime() + 86_400_000);
  if (d.toDateString() === tmw.toDateString()) return `Tomorrow ${time}`;
  if (d < now) {
    const days = Math.max(1, Math.round((now.getTime() - d.getTime()) / 86_400_000));
    return `${days}d overdue`;
  }
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function ProjectCard({
  p,
  compact,
  ...drag
}: {
  p: Project;
  compact?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}) {
  const quiet = LIVE(p) && ['lead', 'contacted', 'survey_booked', 'surveyed', 'quote_sent'].includes(p.stage) ? quietDays(p) : 0;
  return (
    <Link href={`/admin/crm/${p.id}`} className={`crm-card${compact ? ' compact' : ''}`} {...drag}>
      <div className="crm-card-top">
        <b>{p.customer || p.title}</b>
        {p.value ? <span className="crm-value">{money(p.value)}</span> : null}
      </div>
      <div className="crm-card-sub">
        {[p.postcode, p.products.map(productLabel).join(', ')].filter(Boolean).join(' · ') || p.title}
      </div>
      <NextStepLine p={p} />
      <div className="crm-card-mid">
        {!compact && <span className={`crm-stage st-${p.stage}`}>{stageLabel(p.stage)}</span>}
        {p.wa_unread > 0 && <span className="crm-chip crm-chip--wa">💬 {p.wa_unread}</span>}
        {quiet >= QUIET_DAYS && <span className="crm-chip crm-chip--quiet">Quiet {quiet}d</span>}
        {p.owner && <span className="crm-owner" title={p.owner}>{initials(p.owner)}</span>}
      </div>
    </Link>
  );
}

function initials(name: string) {
  const w = name.split('@')[0].split(/[\s._-]+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}


function guessProducts(interest: string | null) {
  const s = (interest || '').toLowerCase();
  const out: string[] = [];
  if (/solar|pv/.test(s)) out.push('solar');
  if (/batter/.test(s)) out.push('battery');
  if (/heat ?pump|ashp|air source/.test(s)) out.push('heatpump');
  if (/infrared/.test(s)) out.push('infrared');
  if (/\bev\b|charger/.test(s)) out.push('ev');
  if (/\bled\b|lighting/.test(s)) out.push('led');
  return out;
}

function NewProject({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', postcode: '', title: '', value: '', products: [] as string[] });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    setErr('');
    const r = await fetch('/api/crm/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, source: 'crm' }),
    });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.ok) onCreated(d.id);
    else setErr(d.error || 'Not saved');
  }
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="crm-sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="crm-sheet-box" onClick={(e) => e.stopPropagation()}>
        <h2>New project</h2>
        <p className="crm-muted">For a new customer (e.g. a phone call). For a web or Meta lead, use “Start project” on their enquiry.</p>
        <label className="crm-label">Customer name</label>
        <input className="crm-input" value={f.name} onChange={set('name')} autoFocus />
        <div className="crm-grid2">
          <div>
            <label className="crm-label">Mobile</label>
            <input className="crm-input" type="tel" value={f.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="crm-label">Postcode</label>
            <input className="crm-input" value={f.postcode} onChange={set('postcode')} />
          </div>
        </div>
        <label className="crm-label">Email</label>
        <input className="crm-input" type="email" value={f.email} onChange={set('email')} />
        <label className="crm-label">Products</label>
        <div className="crm-checks">
          {PRODUCTS.map((p) => (
            <label key={p.key} className={f.products.includes(p.key) ? 'on' : ''}>
              <input
                type="checkbox"
                checked={f.products.includes(p.key)}
                onChange={(e) =>
                  setF({ ...f, products: e.target.checked ? [...f.products, p.key] : f.products.filter((x) => x !== p.key) })
                }
              />
              {p.label}
            </label>
          ))}
        </div>
        <div className="crm-grid2">
          <div>
            <label className="crm-label">Project name (optional)</label>
            <input className="crm-input" value={f.title} onChange={set('title')} placeholder="e.g. 6kW solar + battery" />
          </div>
          <div>
            <label className="crm-label">Value £ (optional)</label>
            <input className="crm-input" inputMode="decimal" value={f.value} onChange={set('value')} />
          </div>
        </div>
        {err && <p className="crm-banner crm-banner--err">{err}</p>}
        <div className="crm-actions">
          <button type="button" className="crm-btn crm-btn--solar" disabled={busy || !f.name.trim()} onClick={save}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" className="crm-btn crm-btn--ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

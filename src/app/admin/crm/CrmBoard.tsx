'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  wa_unread: number;
  survey_at: string | null;
  install_at: string | null;
  updated_at: string;
};
type Lead = { id: string; name: string; phone: string | null; postcode: string | null; interest: string | null; source: string; created_at: string };

const OPEN = 'open';

export function CrmBoard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState('');
  const [stage, setStage] = useState<string>(OPEN);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

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
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<string, { n: number; v: number }> = {};
    for (const p of projects ?? []) {
      c[p.stage] ??= { n: 0, v: 0 };
      c[p.stage].n++;
      c[p.stage].v += Number(p.value) || 0;
    }
    return c;
  }, [projects]);
  const openCount = (projects ?? []).filter((p) => p.stage !== 'complete' && p.stage !== 'lost').length;
  const openValue = (projects ?? [])
    .filter((p) => !['complete', 'lost', 'won', 'install_booked', 'installing'].includes(p.stage))
    .reduce((s, p) => s + (Number(p.value) || 0), 0);

  const shown = (projects ?? []).filter((p) => {
    if (stage === OPEN ? p.stage === 'complete' || p.stage === 'lost' : p.stage !== stage) return false;
    if (!q.trim()) return true;
    return `${p.title} ${p.customer} ${p.postcode || ''} ${p.phone || ''}`.toLowerCase().includes(q.trim().toLowerCase());
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

  return (
    <div className="crm">
      <div className="crm-head">
        <div>
          <h1>Projects</h1>
          <p>
            {openCount} live · {money(openValue) || '£0'} in the sales pipeline
          </p>
        </div>
        <button type="button" className="crm-btn crm-btn--solar" onClick={() => setAdding(true)}>
          + New project
        </button>
      </div>

      {error && <p className="crm-banner crm-banner--err">{error}</p>}

      {leads.length > 0 && (
        <section className="crm-leads">
          <h2>New enquiries without a project</h2>
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

      <div className="crm-stages">
        <button type="button" className={stage === OPEN ? 'on' : ''} onClick={() => setStage(OPEN)}>
          All live <span>{openCount}</span>
        </button>
        {STAGES.map((s) => (
          <button key={s.key} type="button" className={stage === s.key ? 'on' : ''} onClick={() => setStage(s.key)}>
            {s.label} <span>{counts[s.key]?.n ?? 0}</span>
          </button>
        ))}
      </div>
      <input className="crm-input crm-search" placeholder="Search name, postcode or phone" value={q} onChange={(e) => setQ(e.target.value)} />

      {projects === null ? (
        <p className="crm-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="crm-muted">
          {projects.length === 0
            ? 'No projects yet. Start one from an enquiry above, or with “New project”. (Run supabase/crm.sql first if this shows an error.)'
            : 'Nothing here.'}
        </p>
      ) : (
        <div className="crm-list">
          {shown.map((p) => (
            <Link key={p.id} href={`/admin/crm/${p.id}`} className="crm-card">
              <div className="crm-card-top">
                <b>{p.title}</b>
                {p.value ? <span className="crm-value">{money(p.value)}</span> : null}
              </div>
              <div className="crm-card-mid">
                <span className={`crm-stage st-${p.stage}`}>{stageLabel(p.stage)}</span>
                {p.products.map((k) => (
                  <span key={k} className="crm-chip">
                    {productLabel(k)}
                  </span>
                ))}
                {p.wa_unread > 0 && <span className="crm-chip crm-chip--wa">💬 {p.wa_unread}</span>}
              </div>
              <div className="crm-card-foot">
                <span>{[p.customer !== p.title ? p.customer : '', p.postcode].filter(Boolean).join(' · ')}</span>
                <span>
                  {p.survey_at && p.stage === 'survey_booked' ? `Survey ${shortDate(p.survey_at)}` : ''}
                  {p.install_at && p.stage === 'install_booked' ? `Install ${shortDate(p.install_at)}` : ''}
                  {!(p.survey_at && p.stage === 'survey_booked') && !(p.install_at && p.stage === 'install_booked')
                    ? relativeTime(p.updated_at)
                    : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {adding && <NewProject onClose={() => setAdding(false)} onCreated={(id) => router.push(`/admin/crm/${id}`)} />}
    </div>
  );
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
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

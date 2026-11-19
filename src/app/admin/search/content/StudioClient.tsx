'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WritingSpark } from '@/app/admin/sales/quotes/[id]/WritingSpark';
import '../../sales/quotes/quotes.css';
import {
  acceptBriefAction,
  approvePublishAction,
  editBriefAction,
  editDraftAction,
  rebuildBriefAction,
  recordRefreshAction,
  rejectAction,
  runChecksAction,
  saveProofAction,
  sendBackAction,
  startContent,
  submitAction,
  writeDraftAction,
} from './actions';
import type { Proof, ProofFigure, ProofProject, ProofReview } from '@/lib/search/studio/types';

type Result = { ok: true; message?: string; id?: number } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (key: string, fn: () => Promise<Result>, after?: (r: Result) => void) => {
    setBusy(key);
    setMsg(null);
    const r = await fn().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Something went wrong' }));
    setBusy(null);
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
    after?.(r);
    router.refresh();
  };
  return { busy, msg, run };
}

function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return <p className={`sc-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">{msg.text}</p>;
}

/** Start a page from a planner group, a tracked search or a live page (refresh mode). */
export function StartButton({ clusterId, keywordId, page, kind, label = 'Build the brief', solar = true }: { clusterId?: number; keywordId?: number; page?: string; kind?: 'cms_page' | 'blog'; label?: string; solar?: boolean }) {
  const router = useRouter();
  const { busy, msg, run } = useRun();
  return (
    <span className="sx-row">
      <button
        type="button"
        className={`crm-btn ${solar ? 'crm-btn--solar' : 'crm-btn--ghost'} crm-btn--small`}
        disabled={!!busy}
        onClick={() => run('start', () => startContent({ clusterId, keywordId, page, kind }), (r) => r.ok && r.id && router.push(`/admin/search/content/${r.id}`))}
      >
        {busy ? 'Building the brief…' : label}
      </button>
      <Msg msg={msg} />
    </span>
  );
}

export function BriefTools({ id, status, outline, min, max, kind, pageType, canEdit }: { id: number; status: string; outline: string[]; min: number; max: number; kind: 'cms_page' | 'blog'; pageType: string; canEdit: boolean }) {
  const { busy, msg, run } = useRun();
  const [o, setO] = useState(outline.join('\n'));
  const [lo, setLo] = useState(min);
  const [hi, setHi] = useState(max);
  const [k, setK] = useState(kind);
  const [pt, setPt] = useState(pageType);
  const locked = !canEdit || ['in_review', 'approved', 'published'].includes(status);
  return (
    <div className="sx-form sc-wide">
      <label>
        Outline (one H2 per line)
        <textarea value={o} onChange={(e) => setO(e.target.value)} disabled={locked} rows={Math.min(12, outline.length + 2)} />
      </label>
      <div className="sx-row">
        <label className="sc-inline">
          Words from
          <input type="number" value={lo} onChange={(e) => setLo(Number(e.target.value))} disabled={locked} />
        </label>
        <label className="sc-inline">
          to
          <input type="number" value={hi} onChange={(e) => setHi(Number(e.target.value))} disabled={locked} />
        </label>
        <label className="sc-inline">
          Kind
          <select value={k} onChange={(e) => setK(e.target.value as 'cms_page' | 'blog')} disabled={locked || status !== 'brief'}>
            <option value="cms_page">Website page</option>
            <option value="blog">Blog article</option>
          </select>
        </label>
        <label className="sc-inline">
          Page type
          <select value={pt} onChange={(e) => setPt(e.target.value)} disabled={locked}>
            {['pillar', 'town', 'case_study', 'cost_guide', 'comparison', 'sector', 'article'].map((x) => (
              <option key={x} value={x}>
                {x.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="sx-row">
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked || !!busy} onClick={() => run('save', () => editBriefAction(id, { outline: o.split('\n'), min: lo, max: hi, kind: k, pageType: pt as never }))}>
          {busy === 'save' ? 'Saving…' : 'Save the brief'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={locked || !!busy} onClick={() => run('rebuild', () => rebuildBriefAction(id))} title="Reads the latest SERP, page facts and teardown again (no cost)">
          {busy === 'rebuild' ? 'Rebuilding…' : 'Rebuild from the latest data'}
        </button>
        {status === 'brief' && (
          <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!canEdit || !!busy} onClick={() => run('accept', () => acceptBriefAction(id))}>
            {busy === 'accept' ? 'Saving…' : 'Brief is right: on to the proof pack'}
          </button>
        )}
      </div>
      <Msg msg={msg} />
    </div>
  );
}

type PkgOption = { id: string; name: string; price: number | null; kwp: number | null; usableKwh: number | null; active: boolean };

const blankProject: ProofProject = { town: '', sizeKwp: null, batteryKwh: null, date: '', summary: '', photoUrl: '', photoPermission: false };
const blankReview: ProofReview = { quote: '', name: '', town: '', source: 'Google', date: '', stars: 5 };
const blankFigure: ProofFigure = { label: '', value: '', source: '', checked: '', money: false };

/** The proof pack form. Prices are picked from the packages, never typed; the author comes from Settings › Author. */
export function ProofForm({ id, proof, packages, dnos, locked }: { id: number; proof: Proof; packages: PkgOption[]; dnos: string[]; locked: boolean }) {
  const { busy, msg, run } = useRun();
  const [p, setP] = useState<Proof>(proof);
  const [picked, setPicked] = useState<string[]>(proof.packages.map((x) => x.id));
  const set = <K extends keyof Proof>(k: K, v: Proof[K]) => setP((o) => ({ ...o, [k]: v }));
  const upd = <T,>(list: T[], i: number, patch: Partial<T>) => list.map((x, j) => (j === i ? { ...x, ...patch } : x));
  const numOrNull = (v: string) => (v === '' ? null : Number(v));
  return (
    <div className="sc-proof">
      <fieldset disabled={locked}>
        <legend>Real projects near here</legend>
        {p.projects.map((x, i) => (
          <div key={i} className="sc-rowgrid">
            <input placeholder="Town" value={x.town} onChange={(e) => set('projects', upd(p.projects, i, { town: e.target.value }))} aria-label="Town" />
            <input placeholder="kWp" type="number" step="0.01" value={x.sizeKwp ?? ''} onChange={(e) => set('projects', upd(p.projects, i, { sizeKwp: numOrNull(e.target.value) }))} aria-label="System size, kWp" />
            <input placeholder="Battery kWh" type="number" step="0.01" value={x.batteryKwh ?? ''} onChange={(e) => set('projects', upd(p.projects, i, { batteryKwh: numOrNull(e.target.value) }))} aria-label="Battery, kWh" />
            <input placeholder="Month (2026-09)" value={x.date} onChange={(e) => set('projects', upd(p.projects, i, { date: e.target.value }))} aria-label="When" />
            <input className="sc-span2" placeholder="What we did and found (real details)" value={x.summary} onChange={(e) => set('projects', upd(p.projects, i, { summary: e.target.value }))} aria-label="Summary" />
            <input className="sc-span2" placeholder="Photo link (CMS image or project photo)" value={x.photoUrl} onChange={(e) => set('projects', upd(p.projects, i, { photoUrl: e.target.value }))} aria-label="Photo link" />
            <label className="sc-tick">
              <input type="checkbox" checked={x.photoPermission} onChange={(e) => set('projects', upd(p.projects, i, { photoPermission: e.target.checked }))} />
              Customer gave permission to use the photo
            </label>
            <button type="button" className="crm-link" onClick={() => set('projects', p.projects.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => set('projects', [...p.projects, { ...blankProject }])}>
          Add a project
        </button>
      </fieldset>

      <fieldset disabled={locked}>
        <legend>Local facts</legend>
        <div className="sc-rowgrid">
          <label className="sc-span2">
            Network operator
            <select value={dnos.includes(p.dno) ? p.dno : p.dno ? '__other' : ''} onChange={(e) => set('dno', e.target.value === '__other' ? ' ' : e.target.value)}>
              <option value="">Pick one</option>
              {dnos.map((d) => (
                <option key={d}>{d}</option>
              ))}
              <option value="__other">Another (type it)</option>
            </select>
            {p.dno && !dnos.includes(p.dno) && <input value={p.dno.trim()} onChange={(e) => set('dno', e.target.value)} aria-label="Network operator" />}
          </label>
          <label className="sc-span2">
            Council
            <input value={p.council} onChange={(e) => set('council', e.target.value)} placeholder="e.g. Newport City Council" />
          </label>
          <label className="sc-span4">
            What our surveys find here (Heliaxis-only facts: roof types, shading, typical problems)
            <textarea value={p.findings} onChange={(e) => set('findings', e.target.value)} rows={3} />
          </label>
        </div>
      </fieldset>

      <fieldset disabled={locked}>
        <legend>Prices, from the packages (picked, never typed)</legend>
        {packages.length ? (
          <ul className="sx-list">
            {packages.map((k) => (
              <li key={k.id}>
                <label className="sc-tick">
                  <input type="checkbox" checked={picked.includes(k.id)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, k.id] : x.filter((y) => y !== k.id)))} />
                  {k.name}
                  {!k.active && <span className="sx-chip">not active</span>}
                </label>
                <small>
                  {k.price == null ? 'no price set' : `£${k.price.toLocaleString('en-GB')} inc VAT`}
                  {k.kwp ? ` · ${k.kwp} kWp` : ''}
                  {k.usableKwh ? ` · ${k.usableKwh} kWh battery` : ''}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sx-note">No packages in pv_packages yet. Add them in ProspectPV › Packages.</p>
        )}
      </fieldset>

      <fieldset disabled={locked}>
        <legend>Real reviews (word for word)</legend>
        {p.reviews.map((x, i) => (
          <div key={i} className="sc-rowgrid">
            <textarea className="sc-span4" placeholder="The review, exactly as written" value={x.quote} onChange={(e) => set('reviews', upd(p.reviews, i, { quote: e.target.value }))} rows={2} aria-label="Review" />
            <input placeholder="First name" value={x.name} onChange={(e) => set('reviews', upd(p.reviews, i, { name: e.target.value }))} aria-label="Name" />
            <input placeholder="Town" value={x.town} onChange={(e) => set('reviews', upd(p.reviews, i, { town: e.target.value }))} aria-label="Town" />
            <input placeholder="Where (Google, Facebook)" value={x.source} onChange={(e) => set('reviews', upd(p.reviews, i, { source: e.target.value }))} aria-label="Source" />
            <input placeholder="Date" value={x.date} onChange={(e) => set('reviews', upd(p.reviews, i, { date: e.target.value }))} aria-label="Date" />
            <button type="button" className="crm-link" onClick={() => set('reviews', p.reviews.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => set('reviews', [...p.reviews, { ...blankReview }])}>
          Add a review
        </button>
      </fieldset>

      <fieldset disabled={locked}>
        <legend>Figures the page may use (each with a source and the date checked)</legend>
        {p.figures.map((x, i) => (
          <div key={i} className="sc-rowgrid">
            <input placeholder="What it is" value={x.label} onChange={(e) => set('figures', upd(p.figures, i, { label: e.target.value }))} aria-label="Label" />
            <input placeholder="Value, e.g. 2,700 kWh a year" value={x.value} onChange={(e) => set('figures', upd(p.figures, i, { value: e.target.value }))} aria-label="Value" />
            <input placeholder="Source" value={x.source} onChange={(e) => set('figures', upd(p.figures, i, { source: e.target.value }))} aria-label="Source" />
            <input type="date" value={x.checked} onChange={(e) => set('figures', upd(p.figures, i, { checked: e.target.value }))} aria-label="Last checked" />
            <label className="sc-tick">
              <input type="checkbox" checked={x.money === true} onChange={(e) => set('figures', upd(p.figures, i, { money: e.target.checked }))} />
              A £ amount (a price or saving the page may quote)
            </label>
            <button type="button" className="crm-link" onClick={() => set('figures', p.figures.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => set('figures', [...p.figures, { ...blankFigure }])}>
          Add a figure
        </button>
      </fieldset>

      <div className="sx-row">
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={locked || !!busy} onClick={() => run('proof', () => saveProofAction(id, { ...p, packages: picked.map((x) => ({ id: x })) }))}>
          {busy ? 'Saving…' : 'Save the proof pack'}
        </button>
      </div>
      <Msg msg={msg} />
    </div>
  );
}

/** Writes the draft through the CMS or blog writer, with the spark while it works. */
export function WriteDraft({ id, ready, hasDraft, failing, canEdit }: { id: number; ready: boolean; hasDraft: boolean; failing: number; canEdit: boolean }) {
  const { busy, msg, run } = useRun();
  return (
    <div className="sc-write">
      {busy && <WritingSpark screen label="Writing the draft" steps={['Reading the brief', 'Working in the proof pack', 'Writing the sections', 'Checking the claims', 'Comparing with other pages']} stepMs={14000} />}
      <div className="sx-row">
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!ready || !canEdit || !!busy} onClick={() => run('write', () => writeDraftAction(id))} title={ready ? 'Takes a minute or two on the strongest model; the cost is logged' : 'Fill the proof pack first'}>
          {busy === 'write' ? 'Writing…' : hasDraft ? 'Write it again' : 'Write the draft'}
        </button>
        {hasDraft && failing > 0 && (
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!ready || !canEdit || !!busy} onClick={() => run('fix', () => writeDraftAction(id, { fixes: true }))}>
            {busy === 'fix' ? 'Writing…' : `Write again, fixing the ${failing} failed check${failing === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
      <Msg msg={msg} />
    </div>
  );
}

const counter = (n: number, lo: number, hi: number) => <small className={n >= lo && n <= hi ? 'sx-up' : 'sx-down'}>{n} characters ({lo} to {hi})</small>;

export function DraftEditor({ id, title, description, slug, schema, body, canEdit, isBlog }: { id: number; title: string; description: string; slug: string; schema: string; body: string; canEdit: boolean; isBlog: boolean }) {
  const { busy, msg, run } = useRun();
  const [t, setT] = useState(title);
  const [d, setD] = useState(description);
  const [s, setS] = useState(slug);
  const [j, setJ] = useState(schema);
  const [b, setB] = useState(body);
  return (
    <div className="sx-form sc-wide">
      <label>
        Title {counter(t.trim().length, 50, 60)}
        <input value={t} onChange={(e) => setT(e.target.value)} disabled={!canEdit} />
      </label>
      <label>
        Description {counter(d.trim().length, 120, 158)}
        <textarea value={d} onChange={(e) => setD(e.target.value)} disabled={!canEdit} rows={2} />
      </label>
      <label>
        Slug ({isBlog ? '/blog/' : '/'}…)
        <input value={s} onChange={(e) => setS(e.target.value)} disabled={!canEdit} />
      </label>
      <details>
        <summary>Schema (JSON-LD)</summary>
        <textarea className="sc-code" value={j} onChange={(e) => setJ(e.target.value)} disabled={!canEdit} rows={12} />
      </details>
      <details>
        <summary>{isBlog ? 'Article fields (JSON)' : 'Sections (CMS blocks, JSON)'}</summary>
        <textarea className="sc-code" value={b} onChange={(e) => setB(e.target.value)} disabled={!canEdit} rows={18} />
      </details>
      <div className="sx-row">
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!canEdit || !!busy} onClick={() => run('save', () => editDraftAction(id, { title: t, description: d, slug: s, schema: j, body: b }))}>
          {busy === 'save' ? 'Saving…' : 'Save and check'}
        </button>
      </div>
      <Msg msg={msg} />
    </div>
  );
}

export function RunChecks({ id, label = 'Run the checks' }: { id: number; label?: string }) {
  const { busy, msg, run } = useRun();
  return (
    <span className="sx-row">
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run('checks', () => runChecksAction(id))}>
        {busy ? 'Checking…' : label}
      </button>
      <Msg msg={msg} />
    </span>
  );
}

/** Send for approval (editors), approve and publish or send back (admins). */
export function ReviewBar({ id, status, canDraft, canPublish, submitWhy, publishWhy }: { id: number; status: string; canDraft: boolean; canPublish: boolean; submitWhy: string | null; publishWhy: string | null }) {
  const { busy, msg, run } = useRun();
  const [note, setNote] = useState('');
  return (
    <div className="sx-form sc-wide">
      {status === 'draft' && (
        <div className="sx-row">
          <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!canDraft || !!submitWhy || !!busy} onClick={() => run('submit', () => submitAction(id))}>
            {busy === 'submit' ? 'Sending…' : 'Send for approval'}
          </button>
          {submitWhy && <small className="sx-note">{submitWhy}</small>}
        </div>
      )}
      {(status === 'in_review' || status === 'approved') && (
        <>
          <div className="sx-row">
            <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!canPublish || !!publishWhy || !!busy} onClick={() => run('publish', () => approvePublishAction(id))}>
              {busy === 'publish' ? 'Publishing…' : status === 'approved' ? 'Try publishing again' : 'Approve and publish'}
            </button>
            {!canPublish && <small className="sx-note">Only an admin or the owner can approve.</small>}
            {canPublish && publishWhy && <small className="sx-note">{publishWhy}</small>}
          </div>
          {canPublish && (
            <div className="sx-row">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What to change (sent back to the editor)" aria-label="What to change" className="sc-grow" />
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run('back', () => sendBackAction(id, note))}>
                {busy === 'back' ? 'Sending back…' : 'Send back'}
              </button>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => window.confirm('Reject this page? It stays in the list as Rejected.') && run('reject', () => rejectAction(id))}>
                {busy === 'reject' ? 'Rejecting…' : 'Reject'}
              </button>
            </div>
          )}
        </>
      )}
      <Msg msg={msg} />
    </div>
  );
}

export function RecordRefresh({ id, canPublish }: { id: number; canPublish: boolean }) {
  const { busy, msg, run } = useRun();
  return (
    <span className="sx-row">
      <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!canPublish || !!busy} onClick={() => run('rec', () => recordRefreshAction(id))} title="After the edits are live in the website editor">
        {busy ? 'Recording…' : 'The edits are live: restart the measures'}
      </button>
      {!canPublish && <small className="sx-note">An admin records it.</small>}
      <Msg msg={msg} />
    </span>
  );
}

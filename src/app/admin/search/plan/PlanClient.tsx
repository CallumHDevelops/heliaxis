'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { QUEUE_STATUSES, STATUS_LABEL, type PlannerSettings, type QueueStatus } from '@/lib/search/planner/config';
import { dismissCluster, rescoreNow, researchNow, savePlannerWeights, updateCluster } from './actions';

type R = { ok: true; message?: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<R>) => {
    setBusy(true);
    setMsg(null);
    const r = await fn();
    setBusy(false);
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  };
  return { busy, msg, run };
}

const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) => (m ? <small className={m.ok ? 'pl-ok' : 'pl-err'}>{m.text}</small> : null);

/** Owner, status and due date for one queued page, saved as they change. */
export function QueueControls({ id, owner, status, due, canEdit }: { id: number; owner: string | null; status: string; due: string | null; canEdit: boolean }) {
  const { busy, msg, run } = useRun();
  const [o, setO] = useState(owner ?? '');
  if (!canEdit) return <>{owner || <span className="sx-note">–</span>}</>;
  return (
    <span className="pl-controls">
      <input aria-label="Owner" placeholder="Owner" value={o} maxLength={80} disabled={busy} onChange={(e) => setO(e.target.value)} onBlur={() => o !== (owner ?? '') && run(() => updateCluster(id, { owner: o || null }))} />
      <Msg m={msg} />
      <StatusDue id={id} status={status} due={due} />
    </span>
  );
}

function StatusDue({ id, status, due }: { id: number; status: string; due: string | null }) {
  const { busy, msg, run } = useRun();
  return (
    <span className="pl-sd">
      <select aria-label="Status" value={(QUEUE_STATUSES as readonly string[]).includes(status) ? status : 'idea'} disabled={busy} onChange={(e) => run(() => updateCluster(id, { status: e.target.value as QueueStatus }))}>
        {QUEUE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <input aria-label="Due date" type="date" defaultValue={due ?? ''} disabled={busy} onChange={(e) => run(() => updateCluster(id, { due: e.target.value || null }))} />
      <Msg m={msg} />
    </span>
  );
}

export function RowActions({ id, writeHref, dismissed = false }: { id: number; writeHref: string | null; dismissed?: boolean }) {
  const { busy, msg, run } = useRun();
  return (
    <span className="sx-row pl-nowrap">
      {writeHref && !dismissed && (
        <Link className="crm-btn crm-btn--ghost crm-btn--small" href={writeHref}>
          Write it
        </Link>
      )}
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => run(() => dismissCluster(id, dismissed))}>
        {busy ? (dismissed ? 'Restoring…' : 'Dismissing…') : dismissed ? 'Restore' : 'Dismiss'}
      </button>
      <Msg m={msg} />
    </span>
  );
}

export function RescoreButton() {
  const { busy, msg, run } = useRun();
  return (
    <span className="sx-row">
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => run(rescoreNow)} title="Free: groups and scores what is already stored">
        {busy ? 'Scoring…' : 'Re-score now (free)'}
      </button>
      <Msg m={msg} />
    </span>
  );
}

export function ResearchButton({ estimate, overCap, canOverride, label }: { estimate: number; overCap: boolean; canOverride: boolean; label: string }) {
  const { busy, msg, run } = useRun();
  const blocked = overCap && !canOverride;
  return (
    <span className="sx-row">
      <button
        type="button"
        className="crm-btn crm-btn--solar crm-btn--small"
        disabled={busy || blocked}
        title={blocked ? 'This would pass the monthly cap. Only the owner can override it.' : 'DataForSEO Labs: rival gaps, keyword ideas, difficulty and intent'}
        onClick={() => run(() => researchNow({ override: overCap && canOverride }))}
      >
        {busy ? 'Researching… (up to 3 minutes)' : `${label}, about $${estimate.toFixed(2)}${overCap && canOverride ? ' (over the cap)' : ''}`}
      </button>
      <Msg m={msg} />
    </span>
  );
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** The owner tunes the weights in the score. */
export function WeightsForm({ value }: { value: PlannerSettings }) {
  const { busy, msg, run } = useRun();
  const [v, setV] = useState({
    lc: String(value.intentWeights.local_commercial),
    c: String(value.intentWeights.commercial),
    i: String(value.intentWeights.informational),
    pw: String(value.proofWeights.with),
    pwo: String(value.proofWeights.without),
    overlap: String(value.overlapUrls),
    cuts: value.difficultyCuts.join(', '),
    unkBand: String(value.unknownDifficultyBand),
    unkVol: String(value.unknownVolume),
    minImpr: String(value.minImpressions),
  });
  const f = (k: keyof typeof v, label: ReactNode, hint?: string) => (
    <label>
      {label}
      <input value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} disabled={busy} inputMode="decimal" />
      {hint && <small className="sx-note">{hint}</small>}
    </label>
  );
  const save = () =>
    run(() =>
      savePlannerWeights({
        ...value,
        intentWeights: { local_commercial: num(v.lc), commercial: num(v.c), informational: num(v.i) },
        proofWeights: { with: num(v.pw), without: num(v.pwo) },
        overlapUrls: num(v.overlap),
        difficultyCuts: v.cuts.split(/[,\s]+/).filter(Boolean).map(Number),
        unknownDifficultyBand: num(v.unkBand),
        unknownVolume: num(v.unkVol),
        minImpressions: num(v.minImpr),
      }),
    );
  return (
    <div className="pl-weights">
      <div className="pl-weights__grid">
        {f('lc', 'Intent: local commercial')}
        {f('c', 'Intent: commercial')}
        {f('i', 'Intent: informational')}
        {f('pw', 'Proof: with')}
        {f('pwo', 'Proof: without')}
        {f('overlap', 'Shared top-10 URLs for one page', '1 to 10')}
        {f('cuts', 'Difficulty band cut points', 'Comma separated, 0 to 100')}
        {f('unkBand', 'Band when difficulty unknown')}
        {f('unkVol', 'Volume when unknown')}
        {f('minImpr', 'Search Console: least impressions (28 days)')}
      </div>
      <div className="sx-row">
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save weights'}
        </button>
        <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={busy} onClick={() => run(() => savePlannerWeights(null, true))}>
          Reset to defaults
        </button>
        <Msg m={msg} />
      </div>
    </div>
  );
}

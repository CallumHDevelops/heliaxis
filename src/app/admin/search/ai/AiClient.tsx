'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileButton } from '../../crm/CrmUi';
import type { ProposedPrompt } from '@/lib/search/ai/prompts';
import { VERDICT_LABEL, type CrawlerResult } from '@/lib/search/ai/crawl';
import { SOURCE_LABEL, type UploadSource } from '@/lib/search/ai/uploads';
import { DFS_ANSWER_USD, RUNS } from '@/lib/search/ai/report';
import { acceptProposalsAction, addPromptAction, checkCrawlersAction, deleteUploadAction, removePromptAction, startRunAction, stepNowAction, updatePromptAction, uploadCsvAction } from './actions';

type R = { ok: true; message?: string } | { ok: false; error: string };

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (key: string, fn: () => Promise<R>) => {
    setBusy(key);
    setMsg(null);
    const r = await fn().catch((e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong' }));
    setBusy(null);
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
    if (r.ok) router.refresh();
    return r.ok;
  };
  return { busy, msg, run };
}

const Msg = ({ m }: { m: { ok: boolean; text: string } | null }) => (m ? <small className={m.ok ? 'sx-note' : 'ai-error'}>{m.text}</small> : null);

/* ── Run controls ──────────────────────────────────────────────────────────────────────────────────────────────── */

export function RunControls({ running, canSpend, canOverride, estimateUsd, wouldPassCap, sampledThisMonth }: { running: boolean; canSpend: boolean; canOverride: boolean; estimateUsd: number; wouldPassCap: boolean; sampledThisMonth: boolean }) {
  const { busy, msg, run } = useAct();
  const [override, setOverride] = useState(false);
  if (!canSpend) return <p className="sx-note">Only an admin or the owner can start a run.</p>;
  return (
    <div className="sx-row">
      {running ? (
        <button type="button" className="crm-btn crm-btn--solar crm-btn--small" disabled={!!busy} onClick={() => run('step', () => stepNowAction())}>
          {busy === 'step' ? 'Asking… (up to 3 minutes)' : 'Ask the next batch now'}
        </button>
      ) : (
        <>
          <button
            type="button"
            className="crm-btn crm-btn--solar crm-btn--small"
            disabled={!!busy || (wouldPassCap && !override)}
            title={wouldPassCap && !override ? 'This would pass the monthly DataForSEO cap' : undefined}
            onClick={() => run('start', () => startRunAction({ override, again: sampledThisMonth }))}
          >
            {busy === 'start' ? 'Starting… (up to 3 minutes)' : `${sampledThisMonth ? 'Run again' : 'Run now'}, about $${estimateUsd.toFixed(2)}`}
          </button>
          {wouldPassCap && canOverride && (
            <label className="sx-note">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Go past the cap (owner)
            </label>
          )}
        </>
      )}
      <Msg m={msg} />
    </div>
  );
}

/* ── Questions ─────────────────────────────────────────────────────────────────────────────────────────────────── */

export type PromptRow = { id: number; prompt: string; town: string | null; service: string | null; kind: 'local' | 'consideration'; active: boolean; answers: number; mentionShare: number | null };

function PromptLine({ p, canEdit }: { p: PromptRow; canEdit: boolean }) {
  const { busy, msg, run } = useAct();
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(p.prompt);
  const [town, setTown] = useState(p.town ?? '');
  const [service, setService] = useState(p.service ?? '');
  const [kind, setKind] = useState(p.kind);
  if (edit)
    return (
      <tr>
        <td colSpan={6}>
          <div className="ai-edit">
            <input aria-label="Question" value={text} onChange={(e) => setText(e.target.value)} />
            <input aria-label="Town" placeholder="Town" value={town} onChange={(e) => setTown(e.target.value)} />
            <input aria-label="Service" placeholder="Service" value={service} onChange={(e) => setService(e.target.value)} />
            <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as PromptRow['kind'])}>
              <option value="local">Town × service</option>
              <option value="consideration">Consideration</option>
            </select>
            <button
              type="button"
              className="crm-btn crm-btn--solar crm-btn--small"
              disabled={!!busy}
              onClick={async () => {
                if (await run('save', () => updatePromptAction(p.id, { prompt: text, town, service, kind }))) setEdit(false);
              }}
            >
              {busy === 'save' ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => setEdit(false)}>
              Cancel
            </button>
            <Msg m={msg} />
          </div>
        </td>
      </tr>
    );
  return (
    <tr className={p.active ? '' : 'ai-off'}>
      <td>
        {p.prompt}
        {!p.active && <span className="sx-chip">off</span>}
      </td>
      <td>{p.kind === 'consideration' ? 'Consideration' : [p.town, p.service].filter(Boolean).join(' · ')}</td>
      <td className="num">{p.answers}</td>
      <td className="num">{p.mentionShare === null ? '–' : `${p.mentionShare}%`}</td>
      <td>
        {canEdit && (
          <span className="sx-row">
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => setEdit(true)}>
              Edit
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run('toggle', () => updatePromptAction(p.id, { active: !p.active }))}>
              {busy === 'toggle' ? 'Saving…' : p.active ? 'Stop asking' : 'Ask again'}
            </button>
            {!p.answers && (
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run('remove', () => removePromptAction(p.id))}>
                {busy === 'remove' ? 'Removing…' : 'Remove'}
              </button>
            )}
          </span>
        )}
      </td>
      <td>
        <Msg m={msg} />
      </td>
    </tr>
  );
}

export function PromptEditor({ prompts, proposals, canEdit }: { prompts: PromptRow[]; proposals: ProposedPrompt[]; canEdit: boolean }) {
  const { busy, msg, run } = useAct();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'local' | 'consideration'>('local');
  const [town, setTown] = useState('');
  const [service, setService] = useState('');
  const [showProps, setShowProps] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  return (
    <>
      <div className="sx-tablewrap">
        <table className="sx-table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Town · service</th>
              <th className="num">Answers</th>
              <th className="num">Names us</th>
              <th />
              <th />
            </tr>
          </thead>
          <tbody>
            {prompts.map((p) => (
              <PromptLine key={p.id} p={p} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <>
          <div className="ai-edit">
            <input aria-label="New question" placeholder="Who installs home batteries in Swansea?" value={text} onChange={(e) => setText(e.target.value)} />
            <input aria-label="Town" placeholder="Town" value={town} onChange={(e) => setTown(e.target.value)} />
            <input aria-label="Service" placeholder="Service" value={service} onChange={(e) => setService(e.target.value)} />
            <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as 'local' | 'consideration')}>
              <option value="local">Town × service</option>
              <option value="consideration">Consideration</option>
            </select>
            <button
              type="button"
              className="crm-btn crm-btn--solar crm-btn--small"
              disabled={!!busy || !text.trim()}
              onClick={async () => {
                if (await run('add', () => addPromptAction({ prompt: text, kind, town, service }))) {
                  setText('');
                  setTown('');
                  setService('');
                }
              }}
            >
              {busy === 'add' ? 'Adding…' : 'Add question'}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setShowProps((v) => !v)} disabled={!proposals.length}>
              {proposals.length ? `${showProps ? 'Hide' : 'Suggest'} questions (${proposals.length})` : 'No new suggestions'}
            </button>
          </div>
          <Msg m={msg} />
          {showProps && (
            <div className="ai-props">
              <p className="sx-note">From the Tier 1 areas in Settings › Target areas × the core services, plus questions homeowners ask before choosing. Tick the ones worth asking; each one adds about ${(DFS_ANSWER_USD * RUNS * 3).toFixed(2)} a month across the three paid engines.</p>
              <ul className="sx-list">
                {proposals.map((p) => (
                  <li key={p.prompt}>
                    <label>
                      <input
                        type="checkbox"
                        checked={picked.has(p.prompt)}
                        onChange={(e) =>
                          setPicked((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(p.prompt);
                            else n.delete(p.prompt);
                            return n;
                          })
                        }
                      />{' '}
                      {p.prompt}
                    </label>
                    <small>{p.kind === 'consideration' ? 'Consideration' : `${p.town} · ${p.service}`}</small>
                  </li>
                ))}
              </ul>
              <div className="sx-row">
                <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setPicked(new Set(proposals.map((p) => p.prompt)))}>
                  Tick all
                </button>
                <button
                  type="button"
                  className="crm-btn crm-btn--solar crm-btn--small"
                  disabled={!!busy || !picked.size}
                  onClick={async () => {
                    if (await run('accept', () => acceptProposalsAction(proposals.filter((p) => picked.has(p.prompt))))) setPicked(new Set());
                  }}
                >
                  {busy === 'accept' ? 'Adding…' : `Add ${picked.size || ''} ticked`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ── Uploads ───────────────────────────────────────────────────────────────────────────────────────────────────── */

const lastMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

export function UploadPanel({ canEdit }: { canEdit: boolean }) {
  const { busy, msg, run } = useAct();
  const [month, setMonth] = useState(lastMonth());
  if (!canEdit) return <p className="sx-note">Editors and above can upload.</p>;
  const up = (source: UploadSource) => (files: File[]) => run(source, async () => uploadCsvAction(source, await files[0].text(), month));
  return (
    <div className="sx-row">
      <label className="sx-note">
        Month, for a file without dates{' '}
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month the file covers" />
      </label>
      {(['gsc_genai', 'bing_ai'] as const).map((s) => (
        <FileButton key={s} label={busy === s ? 'Reading…' : `Upload ${SOURCE_LABEL[s]} CSV`} accept=".csv,text/csv,.tsv,text/plain" busy={busy === s} disabled={!!busy} onFiles={up(s)} />
      ))}
      <Msg m={msg} />
    </div>
  );
}

export function DeleteUpload({ id }: { id: number }) {
  const { busy, msg, run } = useAct();
  return (
    <>
      <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" disabled={!!busy} onClick={() => run('del', () => deleteUploadAction(id))}>
        {busy ? 'Removing…' : 'Remove'}
      </button>
      <Msg m={msg} />
    </>
  );
}

/* ── Crawler access ────────────────────────────────────────────────────────────────────────────────────────────── */

type CrawlOut = { checkedAt: string; base: string; robotsStatus: number; robotsBlocked: string[]; baseline: number; results: CrawlerResult[] };

export function CrawlerPanel() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<CrawlOut | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <div className="sx-row">
        <button
          type="button"
          className="crm-btn crm-btn--solar crm-btn--small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            const r = await checkCrawlersAction().catch(() => ({ ok: false as const, error: 'Could not check' }));
            setBusy(false);
            if (r.ok) setOut(r);
            else setErr(r.error);
          }}
        >
          {busy ? 'Checking…' : out ? 'Check again' : 'Check crawler access (free)'}
        </button>
        {err && <small className="ai-error">{err}</small>}
        {out && <small className="sx-note">Checked {new Date(out.checkedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} against {out.base}</small>}
      </div>
      {out && (
        <>
          <p className="sx-note">
            robots.txt answered {out.robotsStatus || 'nothing'}
            {out.robotsStatus === 200 ? (out.robotsBlocked.length ? `, and blocks ${out.robotsBlocked.join(', ')}` : ', and blocks none of these crawlers') : ''}. An ordinary browser got {out.baseline || 'no answer'}.
          </p>
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Crawler</th>
                  <th>robots.txt</th>
                  <th className="num">Home page status</th>
                  <th className="num">Time</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {out.results.map((r) => (
                  <tr key={r.bot}>
                    <td>{r.bot}</td>
                    <td>{r.robotsBlocked ? <span className="sx-down">blocked</span> : 'allowed'}</td>
                    <td className="num">{r.status || '–'}</td>
                    <td className="num">{(r.ms / 1000).toFixed(1)} s</td>
                    <td>
                      <span className={`sx-state ${r.verdict === 'ok' ? 'done' : 'action'}`}>{VERDICT_LABEL[r.verdict]}</span>
                      {r.redirectedTo && <small className="sx-note"> via {r.redirectedTo}</small>}
                      {r.error && <small className="sx-note"> {r.error}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

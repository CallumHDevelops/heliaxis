'use client';
/* eslint-disable @next/next/no-html-link-for-pages -- survey pages open with a full page load, so the service worker can serve its copy with no signal */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useNow } from '@/lib/use-now';
import { allDrafts, allPacks, outboxItems, SURVEYS_CHANGED, type Draft, type OutboxItem } from '@/lib/surveys/offline';
import type { SurveyPayload } from '@/lib/surveys/solar-schema';
import { NewSurveySheet } from './NewSurveySheet';
import './surveys.css';

/**
 * Surveys To do (booked and started, by day), Drafts (started) and Done. Read from the server, or
 * with no signal from the surveys copied to this phone; either way with what's happening on this
 * phone on top ("Finished, uploading", "Changes on this phone"). Survey links are plain <a href>
 * so they open from the service worker's copy with no signal.
 */

export type ListView = 'todo' | 'drafts' | 'done';

type Row = {
  id: string;
  project_id: string;
  type: string;
  status: string;
  customer: string | null;
  postcode: string | null;
  title: string | null;
  ref: string | null;
  date: string | null;
  minutes: number | null;
  surveyor: string | null;
  flagsCount: number;
  drawingsToDo: boolean;
};

type Local = { finishing: Set<string>; failed: Map<string, string>; unsynced: Set<string> };

const DRAWINGS_FLAG = 'Drawings to do';
const QUERY: Record<ListView, string> = { todo: 'status=booked,draft', drafts: 'status=draft', done: 'status=complete&sort=desc' };
const UK_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });
const UK_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const UK_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });

const ukDay = (t: number) => UK_DAY.format(new Date(t));
function nextDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** A survey copied to the phone, as a list row. */
function rowFromPack(p: SurveyPayload): Row {
  const s = p.survey;
  const open = s.status === 'booked' || s.status === 'draft';
  return {
    id: s.id,
    project_id: s.project_id,
    type: s.type,
    status: s.status,
    customer: p.customer?.name ?? null,
    postcode: p.project.postcode,
    title: p.project.title,
    ref: p.project.ref,
    date: open ? p.project.survey_at : s.completed_at,
    minutes: p.project.survey_minutes,
    surveyor: s.surveyor,
    flagsCount: s.flags.filter((f) => f !== DRAWINGS_FLAG).length,
    drawingsToDo: s.flags.includes(DRAWINGS_FLAG),
  };
}

function wanted(view: ListView, status: string) {
  return view === 'todo' ? status === 'booked' || status === 'draft' : view === 'drafts' ? status === 'draft' : status === 'complete';
}

export function SurveysList({ view, ready }: { view: ListView; ready: boolean }) {
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const now = useNow(60_000);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fromPhone, setFromPhone] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [local, setLocal] = useState<Local>({ finishing: new Set(), failed: new Map(), unsynced: new Set() });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/crm/surveys?${QUERY[view]}`, { cache: 'no-store' });
      if (r.status === 401 || r.status === 403) throw new Error('signin');
      if (!r.ok) throw new Error('offline');
      const j = (await r.json()) as { surveys?: Row[] };
      setRows(j.surveys ?? []);
      setFromPhone(false);
      setSignIn(false);
    } catch (err) {
      // No signal (or signed out): what's on this phone.
      setSignIn(err instanceof Error && err.message === 'signin');
      const packs = await allPacks().catch(() => [] as SurveyPayload[]);
      const list = packs.map(rowFromPack).filter((r) => wanted(view, r.status));
      list.sort((a, b) => (a.date && b.date ? (view === 'done' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) : a.date ? -1 : b.date ? 1 : 0));
      setRows(list);
      setFromPhone(true);
    }
  }, [view]);

  const readLocal = useCallback(async () => {
    const [out, drafts] = await Promise.all([outboxItems().catch(() => [] as OutboxItem[]), allDrafts().catch(() => [] as Draft[])]);
    const next: Local = { finishing: new Set(), failed: new Map(), unsynced: new Set() };
    for (const o of out) {
      if (o.kind !== 'complete') continue;
      if (o.failed) next.failed.set(o.surveyId, o.failed.message);
      else next.finishing.add(o.surveyId);
    }
    for (const d of drafts) if (!d.synced && !d.locked) next.unsynced.add(d.id);
    setLocal(next);
  }, []);

  useEffect(() => {
    if (!ready) return;
    void load();
    void readLocal();
    const onChange = () => void readLocal();
    const onOnline = () => void load();
    window.addEventListener(SURVEYS_CHANGED, onChange);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener(SURVEYS_CHANGED, onChange);
      window.removeEventListener('online', onOnline);
    };
  }, [ready, load, readLocal]);

  const groups = useMemo(() => {
    if (!rows) return [];
    if (view !== 'todo' || !now) return [{ key: 'all', title: '', rows }];
    const today = ukDay(now);
    const tomorrow = nextDay(today);
    const out: Record<string, Row[]> = { earlier: [], today: [], tomorrow: [], later: [], none: [] };
    for (const r of rows) {
      const t = r.date ? Date.parse(r.date) : NaN;
      if (Number.isNaN(t)) out.none.push(r);
      else {
        const d = ukDay(t);
        out[d < today ? 'earlier' : d === today ? 'today' : d === tomorrow ? 'tomorrow' : 'later'].push(r);
      }
    }
    return [
      { key: 'earlier', title: 'Earlier, not finished', rows: out.earlier },
      { key: 'today', title: 'Today', rows: out.today },
      { key: 'tomorrow', title: 'Tomorrow', rows: out.tomorrow },
      { key: 'later', title: 'Later', rows: out.later },
      { key: 'none', title: 'Not dated', rows: out.none },
    ].filter((g) => g.rows.length);
  }, [rows, view, now]);

  if (!ready) {
    return <p className="svl-empty">Surveys appear here once surveys.sql has been run in Supabase (see the to-do list on Home).</p>;
  }

  return (
    <div className="svl">
      <div className="svl-head">
        <h1>{view === 'todo' ? 'Surveys to do' : view === 'drafts' ? 'Started surveys' : 'Finished surveys'}</h1>
        {view !== 'done' && (
          <button type="button" className="svf-btn svf-btn--solar" onClick={() => setAdding(true)} disabled={!online}>
            + New survey
          </button>
        )}
      </div>
      {fromPhone && (
        <p className={signIn ? 'svf-banner svf-banner--err' : 'svf-banner'} role="status">
          {signIn ? (
            <>
              Signed out: showing the surveys saved on this phone. <a href="/login?next=%2Fadmin%2Fsurveys%2Ftodo">Sign in</a>
            </>
          ) : (
            'No signal: showing the surveys saved on this phone.'
          )}
        </p>
      )}

      {!rows ? (
        <p className="svl-empty">Loading…</p>
      ) : !rows.length ? (
        <p className="svl-empty">
          {view === 'todo'
            ? 'Nothing booked. Surveys appear here when a survey date is set on a job, or tap + New survey.'
            : view === 'drafts'
              ? 'No surveys started and not finished.'
              : 'No finished surveys yet.'}
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="svl-group" aria-label={g.title || undefined}>
            {g.title && <h2 className="svl-group__title">{g.title}</h2>}
            <ul className="svl-rows">
              {g.rows.map((r) => (
                <ListRow key={r.id} r={r} view={view} group={g.key} local={local} />
              ))}
            </ul>
          </section>
        ))
      )}

      {adding && <NewSurveySheet onClose={() => setAdding(false)} />}
    </div>
  );
}

function ListRow({ r, view, group, local }: { r: Row; view: ListView; group: string; local: Local }) {
  const finishing = local.finishing.has(r.id);
  const failed = local.failed.get(r.id);
  const form = `/admin/surveys/${r.id}`;
  const report = `/admin/surveys/${r.id}/report`;
  const t = r.date ? Date.parse(r.date) : NaN;
  const dated = !Number.isNaN(t);
  const showDate = view === 'done' || group === 'later' || group === 'earlier' || group === 'all';
  const kind = r.type === 'ashp' ? 'Heat pump' : 'Solar';

  let status: string;
  if (failed) status = `Not finished: ${failed}`;
  else if (finishing) status = 'Finished, uploading';
  else if (r.status === 'complete') status = r.drawingsToDo && r.type === 'solar' ? 'Finished, drawings to do' : 'Finished';
  else if (r.status === 'draft' || local.unsynced.has(r.id)) status = local.unsynced.has(r.id) ? 'Started (changes on this phone)' : 'Started';
  else status = 'Booked';

  const action =
    r.status === 'complete' && !finishing
      ? r.type === 'solar'
        ? { href: report, label: 'Report' }
        : { href: form, label: 'Open' }
      : finishing
        ? { href: form, label: 'Open' }
        : r.status === 'draft' || local.unsynced.has(r.id)
          ? { href: form, label: 'Continue' }
          : { href: form, label: 'Start' };

  return (
    <li className={failed ? 'svl-row is-failed' : 'svl-row'}>
      <div className="svl-when">
        {dated ? (
          <>
            {showDate && <span>{UK_DATE.format(new Date(t))}</span>}
            {view !== 'done' && <strong>{UK_TIME.format(new Date(t))}</strong>}
          </>
        ) : (
          <span>No date</span>
        )}
      </div>
      <div className="svl-main">
        <a className="svl-name" href={r.status === 'complete' && r.type === 'solar' ? report : form}>
          {r.customer || r.title || 'Customer'}
        </a>
        <p className="svl-meta">{[r.postcode, kind, r.ref].filter(Boolean).join(' · ')}</p>
        <p className={failed ? 'svl-status svl-status--err' : 'svl-status'}>
          {status}
          {r.flagsCount > 0 && <span className="svl-flags"> · ⚑ {r.flagsCount} red flag{r.flagsCount === 1 ? '' : 's'}</span>}
          {r.surveyor && view === 'done' ? ` · ${r.surveyor}` : ''}
        </p>
      </div>
      <div className="svl-actions">
        <a className={action.label === 'Start' || action.label === 'Continue' ? 'svf-btn svf-btn--solar' : 'svf-btn'} href={action.href}>
          {action.label}
        </a>
        {r.status === 'complete' && r.drawingsToDo && r.type === 'solar' && (
          <a className="svf-btn svf-btn--ghost" href={form}>
            ✎ Draw
          </a>
        )}
      </div>
    </li>
  );
}

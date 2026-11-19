'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { BrandIcon } from '../crm/CrmUi';
import { runNowAction } from './actions';

type IconKey = Parameters<typeof BrandIcon>[0]['k'];

const TABS: { href: string; label: string; icon: IconKey; exact?: boolean }[] = [
  { href: '/admin/search', label: 'Overview', icon: 'gauge', exact: true },
  { href: '/admin/search/reports', label: 'Reports', icon: 'document' },
  { href: '/admin/search/rankings', label: 'Rankings', icon: 'trending' },
  { href: '/admin/search/competitors', label: 'Competitors', icon: 'users' },
  { href: '/admin/search/plan', label: 'Plan', icon: 'clipboard' },
  { href: '/admin/search/content', label: 'Content', icon: 'el-text' },
  { href: '/admin/search/local', label: 'Local', icon: 'mappin' },
  { href: '/admin/search/ai', label: 'AI answers', icon: 'quote' },
  { href: '/admin/search/health', label: 'Site health', icon: 'shield' },
  { href: '/admin/search/leads', label: 'Leads', icon: 'coin' },
];

export type RunInfo = { searches: number; usd: number; spent: number; cap: number };

export function SearchShell({ children, needsYou, canSpend, canOverride, run, towns, services }: { children: ReactNode; needsYou: number; canSpend: boolean; canOverride: boolean; run: RunInfo; towns: string[]; services: string[] }) {
  const path = usePathname() || '/admin/search';
  const isOn = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(`${href}/`));
  return (
    <div className="crm sx-app">
      <aside className="sx-shell" aria-label="Search">
        <nav className="sx-rail">
          <div className="sx-rail__tabs">
            {TABS.map((t) => (
              <Link key={t.href} href={t.href} className={`sx-rail__tab${isOn(t.href, t.exact) ? ' on' : ''}`} aria-current={isOn(t.href, t.exact) ? 'page' : undefined}>
                <BrandIcon k={t.icon} size={22} />
                <span>{t.label}</span>
              </Link>
            ))}
          </div>
          <div className="sx-rail__acts">
            <Link href="/admin/search/needs-you" className={`sx-rail__btn${isOn('/admin/search/needs-you') ? ' on' : ''}`} title="Needs you">
              <BrandIcon k="warning" size={18} />
              <small>NEEDS YOU</small>
              {needsYou > 0 && <span className="sx-badge">{needsYou > 99 ? '99+' : needsYou}</span>}
            </Link>
            <Link href="/admin/search/settings" className={`sx-rail__btn${isOn('/admin/search/settings') ? ' on' : ''}`} title="Settings">
              <BrandIcon k="cog" size={18} />
              <small>SETTINGS</small>
            </Link>
            <RunNow canSpend={canSpend} canOverride={canOverride} run={run} />
          </div>
        </nav>
        <Suspense fallback={<div className="sx-panel" />}>
          <SidePanel towns={towns} services={services} />
        </Suspense>
      </aside>
      <div className="sx-main">{children}</div>
    </div>
  );
}

/** The gold Run now button: says what it will cost before it spends anything. */
function RunNow({ canSpend, canOverride, run }: { canSpend: boolean; canOverride: boolean; run: RunInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const over = run.spent + run.usd > run.cap;
  const go = async () => {
    setBusy(true);
    setMsg(null);
    const r = await runNowAction({ override: over && canOverride });
    setBusy(false);
    setMsg(r.ok ? (r.message ?? 'Started.') : r.error);
    if (r.ok) router.refresh();
  };
  return (
    <>
      <button type="button" className="sx-rail__btn sx-rail__btn--solar" onClick={() => setOpen((o) => !o)} disabled={!canSpend} title={canSpend ? 'Check every tracked search now' : 'Only an admin or the owner can spend'}>
        <BrandIcon k="bolt" size={18} />
        <small>RUN NOW</small>
      </button>
      {open && (
        <div role="dialog" aria-label="Run now" className="sx-card" style={{ position: 'fixed', left: 96, bottom: 24, zIndex: 70, width: 320, boxShadow: '0 12px 30px rgb(0 0 0 / .18)' }}>
          <h2>Check every tracked search now</h2>
          <p>
            {run.searches} searches on a phone, top 100 each, through DataForSEO’s standard queue. Estimated cost <b>${run.usd.toFixed(2)}</b>. This month so far ${run.spent.toFixed(2)} of the ${run.cap.toFixed(0)} cap.
          </p>
          {over && <p className="crm-banner crm-banner--err">This would go past the monthly cap.{canOverride ? ' As the owner you can still run it.' : ' Ask the owner.'}</p>}
          {msg && <p className="sx-note">{msg}</p>}
          <div className="sx-row">
            <button type="button" className="crm-btn crm-btn--solar crm-btn--small" onClick={go} disabled={busy || (over && !canOverride)}>
              {busy ? 'Posting…' : `Run for about $${run.usd.toFixed(2)}`}
            </button>
            <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const PERIODS: [string, string][] = [
  ['this_week', 'This week'],
  ['last_week', 'Last week'],
  ['last_4_weeks', 'Last 4 weeks'],
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['quarter', 'Quarter'],
];
const FILTER_KEYS = ['period', 'compare', 'device', 'tier', 'town', 'service', 'intent'] as const;
const VIEWS_KEY = 'hx-search-views';
const VIEWS_EVENT = 'hx-search-views';
const readViews = () => {
  try {
    return localStorage.getItem(VIEWS_KEY) || '[]';
  } catch {
    return '[]';
  }
};
const subscribeViews = (cb: () => void) => {
  window.addEventListener(VIEWS_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(VIEWS_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
};

type SavedView = { name: string; query: string };
const BUILT_IN: SavedView[] = [
  { name: 'My weekly view', query: 'period=last_week&device=mobile' },
  { name: 'Tier 1 towns', query: 'tier=1' },
];

/** Filters for every chart and table on the screen, kept in the address so a view can be shared or saved. */
function SidePanel({ towns, services }: { towns: string[]; services: string[] }) {
  const router = useRouter();
  const path = usePathname() || '/admin/search';
  const q = useSearchParams();
  // Saved views live in this browser only (a convenience; nothing depends on them).
  const stored = useSyncExternalStore(subscribeViews, readViews, () => '[]');
  const views = useMemo<SavedView[]>(() => {
    try {
      return JSON.parse(stored);
    } catch {
      return [];
    }
  }, [stored]);
  const [naming, setNaming] = useState<string | null>(null);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(q.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${path}?${next.toString()}`);
  };
  const current = () => {
    const next = new URLSearchParams();
    for (const k of FILTER_KEYS) if (q.get(k)) next.set(k, q.get(k)!);
    return next.toString();
  };
  const save = (name: string) => {
    if (!name.trim()) return;
    const list = [...views.filter((v) => v.name !== name.trim()), { name: name.trim(), query: current() }];
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(list));
      window.dispatchEvent(new Event(VIEWS_EVENT));
    } catch {
      /* storage blocked */
    }
    setNaming(null);
  };
  if (path.startsWith('/admin/search/settings') || path.startsWith('/admin/search/needs-you')) {
    return (
      <div className="sx-panel">
        <h3>{path.startsWith('/admin/search/settings') ? 'Settings' : 'Needs you'}</h3>
        <p className="sx-note">{path.startsWith('/admin/search/settings') ? 'Everything Search depends on, and what still needs doing.' : 'Everything that needs a person, with who and when.'}</p>
      </div>
    );
  }
  return (
    <div className="sx-panel">
      <h3>Filters</h3>
      <label className="sx-field">
        Period
        <select value={q.get('period') ?? 'this_week'} onChange={(e) => set('period', e.target.value === 'this_week' ? '' : e.target.value)}>
          {PERIODS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label className="sx-field">
        Compare with
        <select value={q.get('compare') ?? 'previous'} onChange={(e) => set('compare', e.target.value === 'previous' ? '' : e.target.value)}>
          <option value="previous">The period before</option>
          <option value="year">Same period last year</option>
        </select>
      </label>
      <label className="sx-field">
        Device
        <select value={q.get('device') ?? 'mobile'} onChange={(e) => set('device', e.target.value === 'mobile' ? '' : e.target.value)}>
          <option value="mobile">Phone (weekly)</option>
          <option value="desktop">Desktop (monthly)</option>
        </select>
      </label>
      <label className="sx-field">
        Area tier
        <select value={q.get('tier') ?? ''} onChange={(e) => set('tier', e.target.value)}>
          <option value="">All</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
      </label>
      <label className="sx-field">
        Town
        <select value={q.get('town') ?? ''} onChange={(e) => set('town', e.target.value)}>
          <option value="">All</option>
          {towns.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="sx-field">
        Service
        <select value={q.get('service') ?? ''} onChange={(e) => set('service', e.target.value)}>
          <option value="">All</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="sx-field">
        Intent
        <select value={q.get('intent') ?? ''} onChange={(e) => set('intent', e.target.value)}>
          <option value="">All</option>
          <option value="local_commercial">Local commercial</option>
          <option value="commercial">Commercial</option>
          <option value="informational">Informational</option>
        </select>
      </label>
      <h3>Saved views</h3>
      <div className="sx-views">
        {[...BUILT_IN, ...views].map((v) => (
          <button key={v.name} type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => router.push(`${path}?${v.query}`)}>
            {v.name}
          </button>
        ))}
        {naming === null ? (
          <button type="button" className="crm-link" onClick={() => setNaming('')}>
            Save this view
          </button>
        ) : (
          <form
            className="sx-field"
            onSubmit={(e) => {
              e.preventDefault();
              save(naming);
            }}
          >
            <input value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Name this view" aria-label="Name this view" autoFocus />
            <span className="sx-row">
              <button type="submit" className="crm-btn crm-btn--solar crm-btn--small" disabled={!naming.trim()}>
                Save
              </button>
              <button type="button" className="crm-btn crm-btn--ghost crm-btn--small" onClick={() => setNaming(null)}>
                Cancel
              </button>
            </span>
          </form>
        )}
      </div>
    </div>
  );
}

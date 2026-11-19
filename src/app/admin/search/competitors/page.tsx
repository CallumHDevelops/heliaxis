import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { isInstaller, isOurs } from '@/lib/seo/rankings';
import { getSetting, searchSession } from '@/lib/search/server';
import { can, tierOf } from '@/lib/search/settings';
import type { TeardownFacts } from '@/lib/search/teardown/card';
import { latestRunDate, type TeardownSummary } from '@/lib/search/teardown/server';
import { dateLabel, filtersFrom, n, one, PageHead, type SP } from '../common';
import { rivalHref, TeardownCard } from './TeardownCard';
import './competitors.css';

export const dynamic = 'force-dynamic';

type Kw = { id: number; phrase: string; town: string | null; service: string | null; intent: string; priority: number };
type Td = { keyword_id: number; date: string; facts: TeardownFacts; summary: TeardownSummary; model: string | null; cost_usd: number };

export default async function Competitors({ searchParams }: { searchParams: SP }) {
  const q = await searchParams;
  const { filters } = filtersFrom(q);
  const all = one(q.p) === 'all';
  const db = createAdminClient();
  const [session, areas, date] = await Promise.all([searchSession(), getSetting('areas', db), latestRunDate(db)]);
  const canSpend = session ? can.spend(session.role) : false;

  const { data: kwData } = await db.from('seo_keyword').select('id, phrase, town, service, intent, priority').eq('active', true).order('priority').order('id');
  const kws = ((kwData ?? []) as Kw[]).filter(
    (k) =>
      (all || k.priority === 1) &&
      (!filters.town || k.town === filters.town) &&
      (!filters.service || k.service === filters.service) &&
      (!filters.intent || k.intent === filters.intent) &&
      (!filters.tier || tierOf(k.town, areas.list) === filters.tier),
  );
  const ids = kws.map((k) => k.id);

  const [tdRes, itemRes, factsCount, bizCount] = await Promise.all([
    ids.length ? db.from('seo_teardown').select('keyword_id, date, facts, summary, model, cost_usd').in('keyword_id', ids).order('date', { ascending: false }).limit(ids.length * 4) : Promise.resolve({ data: [] }),
    ids.length && date ? db.from('seo_serp_item').select('keyword_id, pos, domain').eq('date', date).eq('device', 'mobile').eq('type', 'organic').lte('pos', 10).in('keyword_id', ids).limit(5000) : Promise.resolve({ data: [] }),
    db.from('seo_page_facts').select('url', { count: 'exact', head: true }),
    db.from('seo_business').select('id', { count: 'exact', head: true }),
  ]);
  const latest = new Map<number, Td>();
  for (const t of (tdRes.data ?? []) as Td[]) if (!latest.has(t.keyword_id)) latest.set(t.keyword_id, t);

  // Rival league across the searches shown: who holds the top 10 most often (installers only; ours apart).
  const league = new Map<string, { searches: Set<number>; top3: number; best: number }>();
  for (const it of (itemRes.data ?? []) as { keyword_id: number; pos: number; domain: string | null }[]) {
    if (!it.domain || isOurs(it.domain) || !isInstaller(it.domain)) continue;
    const e = league.get(it.domain) ?? { searches: new Set<number>(), top3: 0, best: 99 };
    if (!e.searches.has(it.keyword_id) && it.pos <= 3) e.top3++;
    e.searches.add(it.keyword_id);
    e.best = Math.min(e.best, it.pos);
    league.set(it.domain, e);
  }
  const rivals = [...league.entries()].map(([domain, e]) => ({ domain, searches: e.searches.size, top3: e.top3, best: e.best })).sort((a, b) => b.searches - a.searches || b.top3 - a.top3).slice(0, 15);

  const toggle = new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([k]) => k !== 'p').map(([k, v]) => [k, one(v)])));
  if (!all) toggle.set('p', 'all');

  return (
    <>
      <PageHead
        title="Competitors"
        sub="What the pages and businesses that beat us have in common, worked out from stored facts only, and where we fall short."
        fresh={date ? <>Run of <b>{dateLabel(date, true)}</b> (phone)<br />{n(factsCount.count ?? 0)} pages read · {n(bizCount.count ?? 0)} profiles</> : 'No run yet'}
      />

      {filters.device === 'desktop' && <p className="sx-note">Teardowns use the weekly phone run; the device filter does not change them.</p>}

      <section className="sx-card">
        <div className="sx-row" style={{ justifyContent: 'space-between' }}>
          <h2>Rivals in the top 10 ({rivals.length})</h2>
          <Link className="crm-link" href={`?${toggle.toString()}`}>
            {all ? 'Priority-1 searches only' : 'Show every priority'}
          </Link>
        </div>
        {!rivals.length ? (
          <p className="sx-note">{date ? 'No installer holds a top-10 place in the searches shown.' : 'Nothing yet: the weekly rankings run posts on Sunday at 23:00.'}</p>
        ) : (
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th className="num">Searches in the top 10</th>
                  <th className="num">In the top 3</th>
                  <th className="num">Best place</th>
                </tr>
              </thead>
              <tbody>
                {rivals.map((r) => (
                  <tr key={r.domain}>
                    <td>
                      <Link href={rivalHref(r.domain)}>{r.domain}</Link>
                    </td>
                    <td className="num">
                      {r.searches} <small className="sx-note">of {kws.length}</small>
                    </td>
                    <td className="num">{r.top3}</td>
                    <td className="num">{r.best}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="sx-note">From seo_serp_item, run of {dateLabel(date)}. Directories, advice sites and social networks are left out.</p>
      </section>

      {!kws.length ? (
        <section className="sx-card">
          <p className="sx-note">No {all ? '' : 'priority-1 '}searches match these filters. Set priorities in Settings › Keywords.</p>
        </section>
      ) : (
        kws.map((k) => {
          const t = latest.get(k.id);
          return (
            <TeardownCard
              key={k.id}
              keywordId={k.id}
              title={{ phrase: k.phrase, town: k.town, date: t?.date ?? null }}
              facts={t?.facts && Array.isArray(t.facts.metrics) ? t.facts : null}
              summary={t?.summary ?? null}
              model={t?.model ?? null}
              costUsd={Number(t?.cost_usd ?? 0)}
              canSpend={canSpend}
            />
          );
        })
      )}
    </>
  );
}

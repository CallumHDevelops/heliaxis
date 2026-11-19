import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { dfsBalance, dfsConfigured, dfsLoginShown } from '@/lib/dataforseo/client';
import { getUmamiConfig } from '@/lib/umami';
import { gscAccount, gscSite, gscStatus } from '@/lib/search/gsc';
import { budget, getSetting, searchSession } from '@/lib/search/server';
import { can, searchRole, type SettingKey } from '@/lib/search/settings';
import { PageHead } from '../../common';
import { SECTIONS, SettingsNav } from '../nav';
import { AccessRow, BudgetForm, BulkAdd, KeywordRow, SettingForm, type Field } from '../SettingsUi';

export const dynamic = 'force-dynamic';

const FORMS: Partial<Record<string, { setting: SettingKey; intro: string; fields: Field[] }>> = {
  business: {
    setting: 'business',
    intro: 'The one source for the facts about Heliaxis. Schema, the page writer, the claims check and the citations checker all read from here. Credentials are MCS, RECC and NAPIT only.',
    fields: [
      { key: 'name', label: 'Business name', type: 'text' },
      { key: 'phone', label: 'Phone', type: 'text' },
      { key: 'address', label: 'Address', type: 'textarea' },
      { key: 'area', label: 'Area wording', type: 'text', help: 'As the strategy fixes it: “South Wales and the South West”.' },
      { key: 'credentials', label: 'Credentials', type: 'checks', options: ['MCS', 'RECC', 'NAPIT'] },
      { key: 'services', label: 'Services, one per line', type: 'list' },
      { key: 'hours', label: 'Opening hours', type: 'text' },
      { key: 'website', label: 'Website', type: 'text' },
      { key: 'socials', label: 'Social profile links, one per line', type: 'list' },
    ],
  },
  author: {
    setting: 'author',
    intro: 'Cal is the named author on every page (decided 19 November). Used on each page and in Person schema.',
    fields: [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'role', label: 'Role', type: 'text' },
      { key: 'bio', label: 'Short bio (real facts only)', type: 'textarea' },
      { key: 'photo', label: 'Photo URL', type: 'text' },
      { key: 'links', label: 'Profile links, one per line', type: 'list' },
    ],
  },
  content: {
    setting: 'content',
    intro: 'Rules the content studio (phase 3) enforces. Only the owner can raise the weekly limit.',
    fields: [
      { key: 'weeklyNewPages', label: 'New pages a week, at most', type: 'number' },
      { key: 'originalityMaxOverlap', label: 'Originality: largest overlap with our own pages (0 to 1)', type: 'number', help: 'Over this share of shared word runs blocks publishing. 0.3 = 30%.' },
      { key: 'bannedClaims', label: 'Banned claims, one per line', type: 'list' },
    ],
  },
  alerts: {
    setting: 'alerts',
    intro: 'Who gets the reports by email (phase 4), and when a ranking drop becomes a Needs you item.',
    fields: [
      { key: 'recipients', label: 'Report recipients, one email per line', type: 'list' },
      { key: 'rankDropPlaces', label: 'Raise a ranking drop when a priority-1 search falls this many places', type: 'number' },
    ],
  },
};

export default async function SettingsSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const title = SECTIONS.find(([k]) => k === section)?.[1];
  if (!title) notFound();
  const s = await searchSession();
  const role = s?.role ?? 'viewer';
  const form = FORMS[section];
  return (
    <>
      <PageHead title={title} sub="Settings" />
      <SettingsNav on={section} />
      {form ? (
        <section className="sx-card">
          <p>{form.intro}</p>
          <SettingForm setting={form.setting} value={(await getSetting(form.setting)) as Record<string, unknown>} fields={form.fields} disabled={!can.editSetting(role, form.setting)} />
        </section>
      ) : section === 'connections' ? (
        <Connections />
      ) : section === 'budget' ? (
        <Budget editable={can.editSetting(role, 'budget')} />
      ) : section === 'keywords' ? (
        <Keywords editable={can.spend(role)} />
      ) : section === 'areas' ? (
        <Areas />
      ) : section === 'access' ? (
        <Access isOwner={role === 'owner'} />
      ) : section === 'competitors' ? (
        <Competitors />
      ) : section === 'ai-questions' ? (
        <AiQuestions />
      ) : (
        <Data />
      )}
    </>
  );
}

async function Connections() {
  const [gsc, balance] = await Promise.all([gscStatus(), dfsConfigured() ? dfsBalance().catch(() => null) : Promise.resolve(null)]);
  const db = createAdminClient();
  const [{ data: lastGsc }, { data: lastCall }] = await Promise.all([
    db.from('gsc_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle(),
    db.from('seo_api_call').select('at, ok, endpoint').order('at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const rows: [string, string, string][] = [
    ['Search Console', gsc.ok ? `Connected to ${gscSite()} as ${gscAccount()}` : gsc.message, lastGsc ? `Data to ${lastGsc.date}` : 'No data yet'],
    ['DataForSEO', dfsConfigured() ? `Signed in as ${dfsLoginShown()}${balance !== null ? `; balance $${balance.toFixed(2)}` : '; login not accepted'}` : 'Not set up', lastCall ? `Last call ${new Date(lastCall.at).toLocaleString('en-GB')}${lastCall.ok ? '' : ' (failed)'}` : 'No calls yet'],
    ['Umami', getUmamiConfig() ? 'Connected' : 'Not set up', ''],
    ['Bing Webmaster Tools', 'Not connected (CSV upload in phase 4)', ''],
    ['Business Profile', 'Not connected (phase 2: needs owner access and API approval)', ''],
  ];
  return (
    <section className="sx-card">
      <p>Secrets live in Vercel’s environment variables and are never shown here.</p>
      <table className="sx-table">
        <tbody>
          {rows.map(([a, b, c]) => (
            <tr key={a}>
              <td>
                <b>{a}</b>
              </td>
              <td>{b}</td>
              <td className="sx-note">{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function Budget({ editable }: { editable: boolean }) {
  const db = createAdminClient();
  const [b, cfg, balance, { data: calls }] = await Promise.all([
    budget('dataforseo', db),
    getSetting('budget', db),
    dfsConfigured() ? dfsBalance().catch(() => null) : Promise.resolve(null),
    db.from('seo_api_call').select('module, cost_usd').gte('at', `${new Date().toISOString().slice(0, 7)}-01T00:00:00Z`).limit(20000),
  ]);
  const byModule = new Map<string, number>();
  for (const c of calls ?? []) byModule.set(c.module ?? 'other', (byModule.get(c.module ?? 'other') ?? 0) + Number(c.cost_usd));
  return (
    <>
      <section className="sx-card">
        <h2>This month</h2>
        <p>
          DataForSEO: ${b.spent.toFixed(2)} of the ${b.cap.toFixed(0)} cap. Balance {balance === null ? 'unknown' : `$${balance.toFixed(2)}`}.{' '}
          <a className="crm-link" href="https://app.dataforseo.com/" target="_blank" rel="noreferrer">
            Top up at DataForSEO
          </a>
        </p>
        <ul className="sx-list">
          {[...byModule.entries()].map(([m, v]) => (
            <li key={m}>
              <span>{m.toUpperCase()}</span>
              <span>${v.toFixed(4)}</span>
            </li>
          ))}
          {!byModule.size && <li className="sx-note">Nothing spent yet this month.</li>}
        </ul>
      </section>
      <section className="sx-card">
        <h2>Caps</h2>
        <p>A ceiling, not a forecast: expected spend is about $10 to $25 a month. Every Run now shows its cost first and stops at the cap unless the owner overrides it. Writing costs are logged in AI costs under the existing AI cap.</p>
        <BudgetForm cap={cfg.caps.dataforseo ?? 40} low={cfg.lowBalanceUsd} disabled={!editable} />
      </section>
    </>
  );
}

async function Keywords({ editable }: { editable: boolean }) {
  const { data } = await createAdminClient().from('seo_keyword').select('id, phrase, town, service, intent, priority, target_page, active, devices, location_name').order('priority').order('town').order('phrase');
  const rows = data ?? [];
  return (
    <>
      {editable && (
        <section className="sx-card">
          <BulkAdd />
          <p>
            Add South West towns only once a page and real projects exist there. Keywords Google already ranks us for can be tracked with one click from <Link href="/admin/search/rankings">Untracked wins</Link>.
          </p>
        </section>
      )}
      <section className="sx-card">
        <h2>
          Tracked searches ({rows.filter((r) => r.active).length} active of {rows.length})
        </h2>
        <div className="sx-tablewrap">
          <table className="sx-table">
            <thead>
              <tr>
                <th>Search</th>
                <th>Town and location</th>
                <th>Service</th>
                <th>Intent</th>
                <th>Priority</th>
                <th>Target page</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((k) => (
                <KeywordRow key={k.id} k={k} editable={editable} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

async function Areas() {
  const areas = await getSetting('areas');
  return (
    <section className="sx-card">
      <p>The draft from the spec (§9), for Cal to confirm. Local proof decides whether an area gets a page: at least one real project, photo or review from it. Newport (South Wales) and Newport (Pembrokeshire) are kept apart. Editing here arrives with phase 2, alongside the map grid.</p>
      <div className="sx-tablewrap">
        <table className="sx-table">
          <thead>
            <tr>
              <th>Area</th>
              <th>Region</th>
              <th>Tier</th>
              <th>Installs here?</th>
              <th>Tracked towns</th>
            </tr>
          </thead>
          <tbody>
            {areas.list.map((a) => (
              <tr key={a.name}>
                <td>{a.name}</td>
                <td>{a.region}</td>
                <td>{a.tier}</td>
                <td>{a.installs === 'yes' ? 'Yes' : a.installs === 'no' ? 'No' : <span className="sx-note">Cal to confirm</span>}</td>
                <td className="sx-note">{a.towns.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

async function Access({ isOwner }: { isOwner: boolean }) {
  const db = createAdminClient();
  const [{ data: people }, access] = await Promise.all([db.from('profiles').select('id, full_name, email, role, status, portals').eq('status', 'approved'), getSetting('access', db)]);
  const withSearch = (people ?? []).filter((p) => p.role === 'admin' || (Array.isArray(p.portals) && p.portals.includes('search')));
  return (
    <section className="sx-card">
      <p>Owner and admin can spend and publish; editor can draft; viewer can only read. Business facts, budget and access need the owner. Give someone Search itself in Users (the Search portal tick).</p>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Role in Search</th>
          </tr>
        </thead>
        <tbody>
          {withSearch.map((p) => (
            <AccessRow key={p.id} id={p.id} name={p.full_name || p.email || p.id} role={searchRole({ id: p.id, role: p.role }, access)} isSelfOwner={isOwner} />
          ))}
        </tbody>
      </table>
      {!Object.values(access.roles).includes('owner') && <p>No owner is set yet, so every admin counts as owner. The first change here records you as the owner.</p>}
    </section>
  );
}

async function Competitors() {
  const { data } = await createAdminClient().from('social_competitor').select('name, website, base_location, google_place_id, tracked').order('name');
  return (
    <section className="sx-card">
      <p>Rival installers (shared with Social monitoring). The SERP teardown (phase 2) fills in blank websites and Business Profile IDs. Directories such as Checkatrade and Yell are not counted as rivals.</p>
      <table className="sx-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Website</th>
            <th>Based</th>
            <th>Business Profile</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((c) => (
            <tr key={c.name}>
              <td>{c.name}</td>
              <td>{c.website || <span className="sx-note">blank</span>}</td>
              <td>{c.base_location}</td>
              <td>{c.google_place_id ? 'Linked' : <span className="sx-note">not yet</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

async function AiQuestions() {
  const { data } = await createAdminClient().from('social_geo_prompt').select('prompt, town, service, active').order('id');
  return (
    <section className="sx-card">
      <p>The questions AI assistants are sampled with. Phase 4 merges these into Search, adds ChatGPT, Gemini and Perplexity, and runs each 3 times a month.</p>
      <ul className="sx-list">
        {(data ?? []).map((p) => (
          <li key={p.prompt}>
            <span>{p.prompt}</span>
            <small>{p.active ? (p.town ?? '') : 'paused'}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Data() {
  const db = createAdminClient();
  const [{ count: results }, { count: items }, { count: calls }] = await Promise.all([
    db.from('seo_serp_result').select('keyword_id', { count: 'exact', head: true }),
    db.from('seo_serp_item').select('keyword_id', { count: 'exact', head: true }),
    db.from('seo_api_call').select('id', { count: 'exact', head: true }),
  ]);
  return (
    <section className="sx-card">
      <p>
        Raw DataForSEO answers are kept in Storage (seo-raw) for 90 days, so the parser can be fixed and re-run without paying again. Stored now: {results ?? 0} search results, {items ?? 0} result rows, {calls ?? 0} logged paid calls. The old weekly snapshots in cms_kv stay, read-only, for a month.
      </p>
      <p className="sx-note">The reprocess button and history exports arrive with phase 4.</p>
    </section>
  );
}

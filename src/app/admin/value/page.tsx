import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { collectMonth, loadValueAssumptions } from '@/lib/value/collect';
import { BENEFITS, buildValueReport, QUALITATIVE } from '@/lib/value/model';
import { saveValue } from './actions';
import './value.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Added value · Heliaxis', robots: { index: false, follow: false } };

const gbp = (n: number, dp = 0) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monthRange = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return { from: new Date(Date.UTC(y, mo - 1, 1)).toISOString(), to: new Date(Date.UTC(y, mo, 1)).toISOString() };
};
const step = (m: string, d: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)) - 1 + d, 1)).toISOString().slice(0, 7);

/**
 * Operations › Added value: what the Heliaxis admin portal does for the business and what it costs.
 * Counts are measured from the live tables; minutes saved, hourly cost and subscriptions are assumptions an
 * admin can change at the bottom of the page. Admins only.
 */
export default async function ValuePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved') redirect('/login');
  if (profile.role !== 'admin') redirect('/admin?denied=1');

  const sp = await searchParams;
  const nowMonth = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? (sp.month as string) : nowMonth;
  const { from, to } = monthRange(month);
  const a = await loadValueAssumptions();
  const { counts, measured } = await collectMonth(from, to);
  const r = buildValueReport(counts, measured, a);
  const areas = [...new Set(BENEFITS.map((b) => b.area))];
  const unmeasured = r.rows.filter((x) => x.count == null && x.key !== 'social_monitoring');

  return (
    <AdminShell active="value">
      <div className="va">
        <header className="va-head">
          <div>
            <h1>Added value</h1>
            <p className="va-sub">What the Heliaxis admin portal does for the business, and what it costs to run. Counts are measured from the live system. Minutes saved and subscription costs are assumptions you can change at the bottom.</p>
          </div>
          <div className="va-month">
            <Link href={`/admin/value?month=${step(month, -1)}`} aria-label="Previous month">‹</Link>
            <b>{monthLabel(month)}</b>
            {step(month, 1) <= nowMonth ? <Link href={`/admin/value?month=${step(month, 1)}`} aria-label="Next month">›</Link> : <span aria-hidden="true">›</span>}
          </div>
        </header>

        <section className="va-tiles">
          <div className="va-tile">
            <span>Time saved</span>
            <b>{r.totalHours} hours</b>
            <small>worth {gbp(r.timeValueGbp)} at {gbp(a.staff_hourly_cost_gbp)} an hour (assumed)</small>
          </div>
          <div className="va-tile">
            <span>Running cost</span>
            <b>{gbp(r.runningCostGbp, r.runningCostGbp < 100 ? 2 : 0)}</b>
            <small>{r.costs.length ? 'AI and WhatsApp fees measured, subscriptions as you entered them' : 'add your subscriptions below for a true figure'}</small>
          </div>
          <div className="va-tile is-good">
            <span>Net benefit this month</span>
            <b>{gbp(r.netGbp)}</b>
            <small>{r.returnPerPound ? `${r.returnPerPound}x what it costs` : 'enter costs to see the return'}</small>
          </div>
          <div className="va-tile">
            <span>Off-the-shelf tools replaced</span>
            <b>{r.replacedToolsGbp > 0 ? `${gbp(r.replacedToolsGbp)} a month` : 'not entered'}</b>
            <small>an alternative to counting the time, not added to it</small>
          </div>
        </section>

        {areas.map((area) => (
          <section key={area} className="va-card">
            <h2>{area}</h2>
            <ul className="va-list">
              {r.rows.filter((x) => x.area === area).map((x) => (
                <li key={x.key}>
                  <div className="va-main">
                    <b>{x.label}</b>
                    <small>{x.why}</small>
                  </div>
                  <div className="va-num">
                    <b>{x.key === 'social_monitoring' ? (x.count == null ? 'not measured' : `${x.count} days`) : x.count == null ? 'not measured' : `${x.count.toLocaleString('en-GB')} ${x.unit}`}</b>
                    <small>
                      {x.count == null ? 'table not set up yet' : `${x.minutesEach} min each = ${x.hours} h = ${gbp(x.valueGbp)}`}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="va-card">
          <h2>What it costs</h2>
          {r.costs.length === 0 ? (
            <p className="va-sub">Nothing to show yet. Fill in your subscriptions below.</p>
          ) : (
            <ul className="va-list">
              {r.costs.map((c) => (
                <li key={c.label}>
                  <div className="va-main">
                    <b>{c.label}</b>
                    <small>{c.measured ? 'Measured' : 'As you entered it'}</small>
                  </div>
                  <div className="va-num">
                    <b>{gbp(c.gbp, 2)}</b>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="va-sub">Not metered yet: the Metis assistant (estimated if you enter a figure), WhatsApp conversation fees other than templates, and Meta lead ad spend (which is advertising, not a platform cost).</p>
        </section>

        <section className="va-card">
          <h2>Benefits that matter but cannot be priced</h2>
          <ul className="va-quals">
            {QUALITATIVE.map((q) => (
              <li key={q.title}>
                <b>{q.title}</b>
                <span>{q.text}</span>
              </li>
            ))}
          </ul>
        </section>

        {unmeasured.length > 0 && (
          <p className="va-sub">Not measured because the tables are not set up yet: {unmeasured.map((x) => x.label.toLowerCase()).join(', ')}.</p>
        )}

        <section className="va-card">
          <h2>The numbers behind the estimates</h2>
          <p className="va-sub">These start as sensible guesses. Replace them with your own and everything above updates. Minutes are what ONE event would have taken someone to do by hand.</p>
          <form action={saveValue} className="va-form">
            <label>
              <span>What an hour of staff time costs you (£)</span>
              <input name="hourly" type="number" step="any" min="0" defaultValue={a.staff_hourly_cost_gbp} />
            </label>
            {BENEFITS.filter((b) => b.key !== 'social_monitoring').map((b) => (
              <label key={b.key}>
                <span>
                  {b.label}: minutes saved each
                </span>
                <input name={`m:${b.key}`} type="number" step="any" min="0" defaultValue={a.minutes[b.key]} />
              </label>
            ))}
            {Object.entries(a.costs_gbp).map(([k, v]) => (
              <label key={k}>
                <span>{k}: £ a month</span>
                <input name={`c:${k}`} type="number" step="any" min="0" defaultValue={v} />
              </label>
            ))}
            <label>
              <span>Metis assistant: estimated £ a month</span>
              <input name="metis" type="number" step="any" min="0" defaultValue={a.metis_monthly_gbp} />
            </label>
            <label>
              <span>WhatsApp template fee: pence each</span>
              <input name="wa" type="number" step="any" min="0" defaultValue={a.whatsapp_template_pence} />
            </label>
            {Object.entries(a.replaced_tools_monthly_gbp).map(([k, v]) => (
              <label key={k}>
                <span>{k}: £ a month you would pay instead</span>
                <input name={`t:${k}`} type="number" step="any" min="0" defaultValue={v} />
              </label>
            ))}
            <label>
              <span>Dollar to pound rate (AI is billed in dollars)</span>
              <input name="fx" type="number" step="any" min="0" defaultValue={a.usd_to_gbp} />
            </label>
            <button className="va-save">Save numbers</button>
          </form>
        </section>
      </div>
    </AdminShell>
  );
}

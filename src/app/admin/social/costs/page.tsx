import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { AdminShell } from '@/components/admin/AdminShell';
import { loadAssumptions } from '@/lib/social/assumptions';
import { buildReport, type Volume } from '@/lib/social/costs';
import { saveCostAssumptions } from './actions';
import '../social.css';
import './costs.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Costs · Social monitoring · Heliaxis', robots: { index: false, follow: false } };

const gbp = (n: number, dp = 2) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const monthLabel = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 1)).toISOString() };
}

const FIELDS: { key: string; label: string; hint: string }[] = [
  { key: 'staff_hourly_cost_gbp', label: 'What an hour of staff time costs you (£)', hint: 'Wages plus on-costs. 20 is a placeholder.' },
  { key: 'minutes_to_check_one_comment', label: 'Minutes to read and judge one comment', hint: 'Without this tool, someone has to find it and decide what it is.' },
  { key: 'minutes_to_write_one_reply', label: 'Minutes to write a careful reply from scratch', hint: 'Including checking the wording is safe.' },
  { key: 'minutes_to_review_a_draft', label: 'Minutes to review a suggested reply', hint: 'Reading it, tweaking, copying.' },
  { key: 'minutes_checking_platforms_per_day', label: 'Minutes a day spent checking each platform by hand', hint: 'Facebook, Instagram, Trustpilot and Google, just to spot anything risky.' },
  { key: 'days_checked_per_month', label: 'Days a month you would do that', hint: '22 is a normal working month.' },
  { key: 'comparison_tool_monthly_gbp', label: 'Monthly cost of the paid tool you would buy instead (£)', hint: 'Check the current price of the tool you have in mind.' },
  { key: 'ai_monthly_cap_gbp', label: 'Monthly AI spend you want to stay under (£)', hint: 'You said £10.' },
  { key: 'usd_to_gbp', label: 'Dollar to pound rate', hint: 'The AI is billed in dollars.' },
];

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await requirePortal('social_monitoring');
  if (!session) redirect('/admin');
  const ready = await schemaReady();
  if (!ready.social) redirect('/admin/social');
  const isAdmin = session.profile.role === 'admin';
  const sp = await searchParams;
  const nowMonth = new Date().toISOString().slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? (sp.month as string) : nowMonth;
  const { from, to } = monthRange(month);
  const a = await loadAssumptions();
  const db = createAdminClient();

  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const base = () => db.from('social_mention').select('id', { count: 'exact', head: true }).eq('is_synthetic', false).eq('author_is_own', false).gte('received_at', from).lt('received_at', to);

  const [usage, received, handled, draftsUsed, urgentAlerts, history] = await Promise.all([
    db.from('social_usage').select('cost_usd').gte('at', from).lt('at', to),
    count(base()),
    count(base().in('status', ['posted', 'dismissed', 'copied'])),
    count(db.from('social_draft').select('id', { count: 'exact', head: true }).in('status', ['copied', 'posted']).gte('copied_at', from).lt('copied_at', to)),
    count(db.from('social_alert').select('id', { count: 'exact', head: true }).in('kind', ['social_critical', 'social_high']).gte('created_at', from).lt('created_at', to)),
    db.from('social_usage').select('at, cost_usd').gte('at', new Date(Date.now() - 190 * 86_400_000).toISOString()),
  ]);
  const usageMissing = !!usage.error;
  const rows = (usage.data ?? []) as { cost_usd: number }[];
  const volume: Volume = { received, handled, draftsUsed, urgentAlerts, aiCalls: rows.length, aiCostUsd: rows.reduce((s, r) => s + Number(r.cost_usd), 0) };
  const r = buildReport(volume, a);

  const byMonth = new Map<string, number>();
  for (const h of (history.data ?? []) as { at: string; cost_usd: number }[]) byMonth.set(h.at.slice(0, 7), (byMonth.get(h.at.slice(0, 7)) ?? 0) + Number(h.cost_usd) * a.usd_to_gbp);
  const months = [...byMonth.keys()].sort().reverse().slice(0, 6);

  const prev = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 1)).toISOString().slice(0, 7);

  return (
    <AdminShell active="social">
      <div className="sm-page cs">
        <p className="sm-back">
          <Link href="/admin/social">← Inbox</Link>
        </p>
        <header className="cs-head">
          <div>
            <h1>Costs and savings</h1>
            <p className="sm-sub">What social monitoring costs to run, and what it saves. Figures marked “measured” come from the system. Everything marked “assumed” is an estimate from the numbers at the bottom, which you can change.</p>
          </div>
          <div className="cs-month">
            <Link href={`/admin/social/costs?month=${prev}`} aria-label="Previous month">‹</Link>
            <b>{monthLabel(month)}</b>
            {next <= nowMonth ? <Link href={`/admin/social/costs?month=${next}`} aria-label="Next month">›</Link> : <span aria-hidden="true">›</span>}
          </div>
        </header>

        {usageMissing && <p className="sm-empty">The AI usage table is not there yet. Run <code>social-monitoring.sql</code> again from the dashboard to-dos (it is safe to run twice). Costs start counting from then.</p>}

        <section className="cs-tiles">
          <div className="cs-tile">
            <span>Running cost</span>
            <b>{gbp(r.runningCostGbp)}</b>
            <small>AI {gbp(r.aiCostGbp, 3)} measured + {gbp(r.fixedCostsGbp)} other assumed</small>
          </div>
          <div className="cs-tile">
            <span>Time saved</span>
            <b>{r.hours.total} hours</b>
            <small>worth {gbp(r.timeValueGbp)} (assumed)</small>
          </div>
          <div className="cs-tile is-good">
            <span>Net saving vs doing it by hand</span>
            <b>{gbp(r.netSavingGbp)}</b>
            <small>{r.returnPerPound ? `${r.returnPerPound}x what it costs` : 'nothing spent yet'}</small>
          </div>
          <div className="cs-tile">
            <span>Saving vs buying a paid tool</span>
            <b>{gbp(r.vsToolSavingGbp)}</b>
            <small>that tool would cost {gbp(r.toolAvoidedGbp)} a month (assumed)</small>
          </div>
        </section>

        <section className="sm-card">
          <h2>AI spend against your cap</h2>
          <div className="cs-meter" role="img" aria-label={`${r.capUsedPct}% of the monthly cap used`}>
            <span style={{ width: `${Math.min(100, r.capUsedPct)}%` }} className={r.capUsedPct >= 80 ? 'is-warn' : ''} />
          </div>
          <p className="sm-sub">
            {gbp(r.aiCostGbp, 3)} of {gbp(a.ai_monthly_cap_gbp)} ({r.capUsedPct}%). {volume.aiCalls.toLocaleString('en-GB')} AI calls this month (measured). The AI is the only usage-based cost.
          </p>
          {r.capUsedPct >= 80 && <p className="sm-bad">You are close to your cap. Tell me and I will switch the drafting step to the cheaper keyword-only mode.</p>}
        </section>

        <div className="sm-grid">
          <section className="sm-card">
            <h2>What was handled (measured)</h2>
            <dl className="sm-facts cs-facts">
              <dt>Comments and reviews received</dt>
              <dd>{received}</dd>
              <dt>Dealt with by a person</dt>
              <dd>{handled}</dd>
              <dt>Suggested replies used</dt>
              <dd>{draftsUsed}</dd>
              <dt>Urgent alerts sent</dt>
              <dd>{urgentAlerts}</dd>
            </dl>
          </section>
          <section className="sm-card">
            <h2>Where the saved time comes from (assumed)</h2>
            <dl className="sm-facts cs-facts">
              <dt>Not having to judge each comment</dt>
              <dd>{r.hours.triage} h</dd>
              <dt>Reviewing a draft instead of writing a reply</dt>
              <dd>{r.hours.replies} h</dd>
              <dt>Not checking each platform by hand</dt>
              <dd>{r.hours.monitoring} h</dd>
            </dl>
            <p className="sm-sub">The two savings figures are alternatives: your time saved, or the tool you would otherwise buy. They are not added together.</p>
          </section>
        </div>

        {months.length > 0 && (
          <section className="sm-card">
            <h2>AI spend by month (measured)</h2>
            <table className="cs-table">
              <tbody>
                {months.map((m) => (
                  <tr key={m}>
                    <td>
                      <Link href={`/admin/social/costs?month=${m}`}>{monthLabel(m)}</Link>
                    </td>
                    <td>{gbp(byMonth.get(m) ?? 0, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="sm-card">
          <h2>The numbers behind the estimates</h2>
          <p className="sm-sub">Every “assumed” figure above uses these. They start as guesses: put in your own. {isAdmin ? '' : 'Only an admin can change them.'}</p>
          <form action={saveCostAssumptions} className="cs-form">
            {FIELDS.map((f) => (
              <label key={f.key}>
                <span>{f.label}</span>
                <input name={f.key} type="number" step="any" min="0" defaultValue={(a as unknown as Record<string, number>)[f.key]} disabled={!isAdmin} className="sm-input" />
                <small>{f.hint}</small>
              </label>
            ))}
            {Object.entries(a.fixed_costs_gbp).map(([name, v]) => (
              <label key={name}>
                <span>{name}: monthly cost (£)</span>
                <input name={`fixed:${name}`} type="number" step="any" min="0" defaultValue={v} disabled={!isAdmin} className="sm-input" />
                <small>Your share of what you pay for it each month. Left at 0 until you fill it in.</small>
              </label>
            ))}
            {isAdmin && <button className="sm-btn is-primary">Save numbers</button>}
          </form>
          <p className="sm-sub">{a.comparison_tool_note}</p>
        </section>
      </div>
    </AdminShell>
  );
}

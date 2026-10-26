import Link from 'next/link';
import type { Report } from '@/lib/quotes/report';
import { PERIODS } from '@/lib/quotes/report';
import { money, pct } from '@/lib/quotes/types';
import { TargetForm } from './TargetForm';
import '../../crm/crm.css';
import '../quotes/quotes.css';
import './margin.css';

const monthName = (m: string) => new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function MarginView({ ready, report, period, target }: { ready: boolean; report: Report; period: string; target: number }) {
  const settings = { minMarginPct: target };
  const below = report.rows.filter((r) => r.belowTarget);
  return (
      <div className="crm crmh qb-page mr-page">
        <Link href="/admin/sales/quotes" className="crm-back">
          ← Quotes
        </Link>
        <div className="crmh-head">
          <div className="crmh-head__l">
            <h1 className="crmh-h1">Margin report</h1>
            <span className="crmh-sum">Internal. Costs and profit are never shown to customers.</span>
          </div>
        </div>
        {!ready ? (
          <div className="crm-emptystate">
            <b>Run quotes.sql first</b>
          </div>
        ) : (
          <>
            <div className="crm-stages crmh-chips qb-chips" role="group" aria-label="Period">
              {PERIODS.map((x) => (
                <Link key={x.key} href={`/admin/sales/margin?p=${x.key}`} className={`mr-chip${period === x.key ? ' on' : ''}`} aria-current={period === x.key ? 'true' : undefined}>
                  {x.label}
                </Link>
              ))}
            </div>

            <div className="mr-kpis">
              <div className="mr-kpi">
                <span>Won (signed)</span>
                <b>{money(report.won.sell)}</b>
                <small>{report.won.count} quote{report.won.count === 1 ? '' : 's'} before VAT</small>
              </div>
              <div className="mr-kpi mr-kpi--hero">
                <span>Profit on won jobs</span>
                <b>{money(report.won.profit)}</b>
                <small>{pct(report.won.marginPct)} margin</small>
              </div>
              <div className="mr-kpi">
                <span>Quoted (sent or won)</span>
                <b>{money(report.sent.sell)}</b>
                <small>{money(report.sent.profit)} potential profit · {pct(report.sent.marginPct)}</small>
              </div>
              <div className="mr-kpi">
                <span>Margin target</span>
                <b>{settings.minMarginPct ? `${settings.minMarginPct}%` : 'Not set'}</b>
                <small>{settings.minMarginPct ? `${below.length} quote${below.length === 1 ? '' : 's'} below it` : 'Set one to flag low-margin quotes'}</small>
              </div>
            </div>

            <TargetForm initial={settings.minMarginPct} />

            {report.rows.length === 0 ? (
              <div className="crm-emptystate">
                <b>No sent quotes in this period</b>
                <p>Quotes appear here once they have been sent to a customer.</p>
              </div>
            ) : (
              <>
                <h2 className="mr-h2">By month</h2>
                <div className="qb-list">
                  <div className="mr-row mr-row--head" aria-hidden="true">
                    <span>Month</span>
                    <span className="qb-total">Won</span>
                    <span className="qb-total">Won profit</span>
                    <span className="qb-total">Margin</span>
                    <span className="qb-total">Quoted</span>
                  </div>
                  {report.months.map((m) => (
                    <div key={m.month} className="mr-row">
                      <span>{monthName(m.month)}</span>
                      <span className="qb-total">{m.won.count ? money(m.won.sell) : '–'}</span>
                      <span className="qb-total">{m.won.count ? money(m.won.profit) : '–'}</span>
                      <span className="qb-total">{pct(m.won.marginPct)}</span>
                      <span className="qb-total">{money(m.sent.sell)}</span>
                    </div>
                  ))}
                </div>

                <h2 className="mr-h2">Every quote</h2>
                <div className="qb-list">
                  <div className="mr-row mr-row--q mr-row--head" aria-hidden="true">
                    <span>Quote</span>
                    <span>Customer</span>
                    <span>Status</span>
                    <span className="qb-total">Sell</span>
                    <span className="qb-total">Cost</span>
                    <span className="qb-total">Profit</span>
                    <span className="qb-total">Margin</span>
                  </div>
                  {report.rows.map((r) => (
                    <Link key={r.id} href={`/admin/sales/quotes/${r.id}`} className={`mr-row mr-row--q qb-rowlink${r.belowTarget ? ' is-low' : ''}`}>
                      <span className="qb-num">{r.number}</span>
                      <span className="qb-main">
                        <b>{r.customer}</b>
                        <small>{r.title}</small>
                      </span>
                      <span>
                        <span className={`qb-status qb-status--${r.status}`}>{r.status === 'accepted' ? 'Won' : 'Sent'}</span>
                      </span>
                      <span className="qb-total">{money(r.profit.sell)}</span>
                      <span className="qb-total">{r.profit.cost ? money(r.profit.cost) : '–'}</span>
                      <span className={`qb-total${r.profit.profit < 0 ? ' mr-neg' : ''}`}>{r.profit.cost ? money(r.profit.profit) : '–'}</span>
                      <span className={`qb-total${r.belowTarget ? ' mr-neg' : ''}`}>{r.profit.cost ? pct(r.profit.marginPct) : 'no costs'}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
  );
}

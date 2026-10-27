'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { guessProducts, money } from '@/lib/crm/stages';
import type { Dash } from '@/lib/crm/dashboard-stats';
import type { Pipeline } from '@/lib/projects/server';
import type { TeamMember } from '@/lib/projects/server';
import { NewProjectSheet } from '../../projects/NewProjectSheet';
import { ContactForm, OrgForm } from '../organisations/OrgForms';
import { Sheet } from '../CrmUi';
import '../crm.css';
import './dashboard.css';

type Lead = Pipeline['unassigned'][number];

const PERIODS = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];
const mins = (m: number | null) => (m == null ? '—' : m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`);
const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const ago = (iso: string) => {
  const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60_000);
  return m < 60 ? `${Math.round(m)}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};

type Adding = null | 'menu' | 'contact' | 'org' | 'opportunity';

export function CrmDashboard({ dash, me, team, unassigned, booking, quotes }: { dash: Dash; me: string; team: TeamMember[]; unassigned: Lead[]; booking: boolean; quotes: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState<Adding>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { sales, response } = dash;

  async function fromLead(l: Lead) {
    setBusy(l.id);
    setError('');
    const r = await fetch('/api/crm/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enquiry_id: l.id, products: guessProducts(l.interest) }) });
    const d = await r.json().catch(() => ({}));
    setBusy(null);
    if (r.ok) router.push(`/admin/crm/${d.id}`);
    else setError(d.error || 'Could not create the opportunity');
  }

  const change = sales.change;
  return (
    <div className="crm crmh dash">
      <header className="dash-head">
        <div>
          <h1>CRM dashboard</h1>
          <p className="crm-muted">The last {PERIODS.find((p) => p.days === dash.days)?.label ?? `${dash.days} days`}, compared with the same length before.</p>
        </div>
        <div className="dash-head__act">
          <nav className="dash-periods" aria-label="Period">
            {PERIODS.map((p) => (
              <Link key={p.days} href={`/admin/crm/dashboard?days=${p.days}`} className={p.days === dash.days ? 'on' : ''} aria-current={p.days === dash.days ? 'page' : undefined} replace>
                {p.label}
              </Link>
            ))}
          </nav>
          <button type="button" className="dash-plus" aria-label="Add something new" aria-haspopup="dialog" onClick={() => setAdding('menu')}>
            <span aria-hidden="true">+</span>
            <b>Add</b>
          </button>
        </div>
      </header>

      <section className="dash-tiles" aria-label="Key numbers">
        <div className="dash-tile dash-tile--hero">
          <span className="lab">Sales won</span>
          <b className="big">{money(sales.value) || '£0'}</b>
          <span className="sub">
            {sales.count} sale{sales.count === 1 ? '' : 's'}
            {sales.average ? ` · average ${money(sales.average)}` : ''}
          </span>
          {change != null && (
            <span className={`delta ${change >= 0 ? 'up' : 'down'}`}>
              {change >= 0 ? '▲' : '▼'} {Math.abs(Math.round(change * 100))}% on the period before ({money(sales.prevValue)})
            </span>
          )}
          {change == null && sales.prevValue === 0 && sales.value > 0 && <span className="delta">Nothing sold in the period before</span>}
        </div>
        <div className="dash-tile">
          <span className="lab">Live quotes</span>
          <b className="big">{dash.quotes.liveCount}</b>
          <span className="sub">{money(dash.quotes.liveValue) || '£0'} waiting for a yes</span>
          <span className="sub">{dash.quotes.quotedCount} sent in the period, {money(dash.quotes.quotedValue) || '£0'}</span>
        </div>
        <div className="dash-tile">
          <span className="lab">Time to first response</span>
          <b className="big">{mins(response.meanMins)}</b>
          <span className="sub">average · median {mins(response.medianMins)}</span>
          <span className="sub">{pct(response.within15)} within 15 minutes ({response.n} contacted)</span>
        </div>
        <div className="dash-tile">
          <span className="lab">New enquiries</span>
          <b className="big">{dash.enquiries.count}</b>
          <span className="sub">{response.waiting ? `${response.waiting} not contacted yet${response.oldestWaitingMins != null ? `, the oldest ${mins(response.oldestWaitingMins)}` : ''}` : 'Everyone has been contacted'}</span>
        </div>
      </section>

      {error && <p className="crm-error" role="alert">{error}</p>}

      <div className="dash-cols">
        <section className="dash-card" aria-label="Not in the CRM yet">
          <h2>
            Not in the CRM yet <span className="count">{unassigned.length}</span>
          </h2>
          {unassigned.length === 0 ? (
            <p className="crm-muted">Every enquiry has an opportunity.</p>
          ) : (
            <ul className="dash-list">
              {unassigned.slice(0, 8).map((l) => (
                <li key={l.id}>
                  <span>
                    <b>{l.name}</b>
                    <small>{[l.postcode, l.source_label, l.created_at ? ago(l.created_at) : ''].filter(Boolean).join(' · ')}</small>
                  </span>
                  <button type="button" className="crm-btn crm-btn--small crm-btn--solar" disabled={busy === l.id} onClick={() => void fromLead(l)}>
                    {busy === l.id ? '…' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {unassigned.length > 8 && <p className="crm-muted">…and {unassigned.length - 8} more on the <Link href="/admin/crm">CRM home</Link>.</p>}
        </section>

        <section className="dash-card" aria-label="Live quotes">
          <h2>
            Live quotes <span className="count">{dash.quotes.rows.length}</span>
          </h2>
          {!quotes ? (
            <p className="crm-muted">Quotes aren’t set up yet.</p>
          ) : dash.quotes.rows.length === 0 ? (
            <p className="crm-muted">No quotes out at the moment. <Link href="/admin/sales/quotes?new=1">Start one</Link>.</p>
          ) : (
            <ul className="dash-list">
              {dash.quotes.rows.slice(0, 8).map((q) => (
                <li key={q.id}>
                  <span>
                    <Link href={`/admin/sales/quotes/${q.id}`}>
                      <b>{q.customer}</b>
                    </Link>
                    <small>
                      {q.number} · sent {day(q.sentAt)} ({q.ageDays === 0 ? 'today' : `${q.ageDays}d ago`})
                      {q.pastValid ? ' · past its valid date' : q.validUntil ? ` · valid to ${day(q.validUntil)}` : ''}
                    </small>
                  </span>
                  <span className="amt">{money(q.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="dash-card" aria-label="Recent sales">
          <h2>Recent sales</h2>
          {dash.wins.length === 0 ? (
            <p className="crm-muted">Nothing sold in this period yet.</p>
          ) : (
            <ul className="dash-list">
              {dash.wins.map((w) => (
                <li key={w.id}>
                  <span>
                    <Link href={`/admin/crm/${w.id}`}>
                      <b>{w.customer}</b>
                    </Link>
                    <small>
                      {w.ref ? `${w.ref} · ` : ''}won {day(w.at)}
                    </small>
                  </span>
                  <span className="amt">{money(w.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* The + : one place to add anything. Phones get it by the thumb, the desktop has it in the header. */}
      <button type="button" className="dash-fab" aria-label="Add something new" aria-haspopup="dialog" onClick={() => setAdding('menu')}>
        +
      </button>

      {adding === 'menu' && (
        <Sheet title="Add" onClose={() => setAdding(null)}>
          <div className="dash-menu">
            <button type="button" onClick={() => setAdding('contact')}>
              <span className="ic">☺</span>
              <span className="t">
                <b>Contact</b>
                <small>A person: someone at a company, a builder, a supplier</small>
              </span>
            </button>
            <button type="button" onClick={() => setAdding('org')}>
              <span className="ic">▣</span>
              <span className="t">
                <b>Organisation</b>
                <small>A company, school, landlord or supplier</small>
              </span>
            </button>
            <button type="button" onClick={() => setAdding('opportunity')}>
              <span className="ic">＋</span>
              <span className="t">
                <b>Opportunity</b>
                <small>A new job to survey and quote</small>
              </span>
            </button>
            {booking && (
              <>
                <Link href="/admin/surveys?find=1" onClick={() => setAdding(null)} className="dash-menu__link">
                  <span className="ic">▦</span>
              <span className="t">
                <b>Appointment</b>
                <small>A survey you have arranged: it goes in the diary and they get an email</small>
              </span>
                </Link>
                <Link href="/admin/surveys?add=1" onClick={() => setAdding(null)} className="dash-menu__link">
                  <span className="ic">✎</span>
              <span className="t">
                <b>Diary entry</b>
                <small>Time off, a meeting, anything that is not a customer</small>
              </span>
                </Link>
              </>
            )}
            {quotes && (
              <Link href="/admin/sales/quotes?new=1" onClick={() => setAdding(null)} className="dash-menu__link">
                <span className="ic">£</span>
              <span className="t">
                <b>Quote</b>
                <small>Price a job and send it to the customer</small>
              </span>
              </Link>
            )}
          </div>
        </Sheet>
      )}
      {adding === 'contact' && (
        <Sheet title="Add a contact" onClose={() => setAdding(null)} wide>
          <ContactForm chooseOrg onCancel={() => setAdding(null)} onSaved={(c) => router.push(`/admin/crm/contacts/${c.id}`)} />
        </Sheet>
      )}
      {adding === 'org' && (
        <Sheet title="Add an organisation" onClose={() => setAdding(null)} wide>
          <OrgForm onCancel={() => setAdding(null)} onSaved={(o, warning) => router.push(`/admin/crm/organisations/${o.id}${warning ? `?warn=${encodeURIComponent(warning)}` : ''}`)} />
        </Sheet>
      )}
      {adding === 'opportunity' && <NewProjectSheet mode="opportunity" me={me} team={team} onClose={() => setAdding(null)} onCreated={(id) => router.push(`/admin/crm/${id}`)} />}
    </div>
  );
}

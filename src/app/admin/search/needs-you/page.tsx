import Link from 'next/link';
import { openActions } from '@/lib/search/inbox';
import { dateLabel, PageHead } from '../common';
import { ActionButtons } from './ActionButtons';

export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = {
  review: 'Google review',
  ai_fact: 'AI answer',
  rank_drop: 'Ranking',
  index: 'Indexing',
  approval: 'Approval',
  refresh: 'Refresh',
  meta: 'Meta tags',
  setup: 'Setup',
  budget: 'Budget or run',
};

export default async function NeedsYou() {
  const items = await openActions(300);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHead title="Needs you" sub="Everything that needs a person. Each item closes by itself when its cause clears; mark it done, snooze it, or say why it is not relevant." />
      <section className="sx-card">
        {!items.length ? (
          <p>Nothing waiting.</p>
        ) : (
          <div className="sx-tablewrap">
            <table className="sx-table">
              <thead>
                <tr>
                  <th>What</th>
                  <th>Kind</th>
                  <th>Owner</th>
                  <th>Due</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.fix_href ? <Link href={a.fix_href}>{a.title}</Link> : a.title}
                      {a.why && (
                        <>
                          <br />
                          <small className="sx-note">{a.why}</small>
                        </>
                      )}
                    </td>
                    <td>
                      <span className="sx-chip">{KIND[a.kind] ?? a.kind}</span>
                    </td>
                    <td>{a.owner ?? <span className="sx-note">Anyone</span>}</td>
                    <td style={a.due && a.due < today ? { color: '#b3261e', fontWeight: 700 } : undefined}>
                      {a.status === 'snoozed' ? `Snoozed to ${dateLabel(a.snoozed_until)}` : dateLabel(a.due)}
                    </td>
                    <td>
                      <ActionButtons id={a.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>Manual actions and security issues are not in the Search Console API, so the setup checklist asks for a monthly look at both reports.</p>
      </section>
    </>
  );
}

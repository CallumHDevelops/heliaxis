import { checklist } from '@/lib/search/checklist';
import { searchSession } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { PageHead } from '../common';
import { SettingsNav } from './nav';
import { ConfirmItem, Recheck } from './SettingsUi';

export const dynamic = 'force-dynamic';

const LABEL = { done: 'Done', action: 'Needs action', manual: 'Can’t check automatically' } as const;

export default async function SetupChecklist() {
  const [items, s] = await Promise.all([checklist(), searchSession()]);
  const done = items.filter((i) => i.state === 'done').length;
  return (
    <>
      <PageHead title="Settings" sub="Every setting Search depends on, with a live checklist of what is done and what still needs doing." fresh={`${done} of ${items.length} done`} />
      <SettingsNav on="" />
      <section className="sx-card">
        <div className="sx-row" style={{ justifyContent: 'space-between' }}>
          <h2>Setup checklist</h2>
          <Recheck />
        </div>
        <p>Checked live each time this page opens, and every morning, when anything needing action becomes a Needs you item. The Search Console and Bing verification steps are also a HAP task for Cal.</p>
        <div>
          {items.map((i) => (
            <div key={i.key} className="sx-check">
              <span className={`sx-state ${i.state}`}>{LABEL[i.state]}</span>
              <div>
                <b>{i.label}</b>
                <div className="sx-note">{i.detail}</div>
                {i.state !== 'done' && (
                  <details>
                    <summary className="crm-link">How</summary>
                    <ol>
                      {i.how.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              <div>{(i.state === 'manual' || (i.state === 'done' && ['bing', 'genai', 'sitemap', 'manual_review'].includes(i.key))) && s && can.spend(s.role) && <ConfirmItem item={i.key} done={i.state === 'done'} />}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

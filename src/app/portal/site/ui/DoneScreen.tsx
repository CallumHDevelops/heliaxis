'use client';

import { shortDate } from '@/lib/site/client';
import type { SiteForm } from '@/lib/site/forms/types';
import type { PackRecord } from '@/lib/site/offline';
import { SyncLine, TopBar } from './bits';
import { go } from './nav';
import { PoCard } from './PoCard';

/**
 * P11: after signing. Sent and taken: "Signed ✓" and the PO (PoCard). Still on the phone: "Signed
 * on this phone…", and the PO number arrives once it sends. Turned down by the server (something
 * hasn't reached it): what it still needs, each opening its step, and Check and sign again.
 */
export function DoneScreen({ rec, form, pending }: { rec: PackRecord; form: SiteForm; pending: boolean }) {
  const job = rec.id;
  const signed = rec.pack.assignment.signoffs.find((s) => s.stage === form.stage);
  const gate = !signed && !pending && rec.gate?.stage === form.stage ? rec.gate : null;
  const stepOf = (m: { key: string; step: string }) => m.step || form.steps.find((s) => s.fields.some((f) => f.key === m.key))?.key || '';
  const strike = form.stage === 'strike';

  return (
    <>
      <TopBar title={gate ? 'Not signed yet' : 'Signed'} onBack={() => go(`/portal/site/job/${job}`)} />
      <SyncLine />
      <main className="sa-main sa-done">
        <p className="sa-kicker">{form.title}</p>
        {gate ? (
          <>
            <div className="sa-alert sa-alert-bad" role="alert">
              <b>{gate.missing.length ? 'Heliaxis hasn’t got everything yet' : 'Sign again'}</b>
              <span>{gate.missing.length ? 'Your answers are kept. Do these, then sign again:' : gate.message}</span>
            </div>
            {gate.missing.length > 0 && (
              <section className="sa-card">
                <ul className="sa-todo">
                  {gate.missing.map((m) => (
                    <li key={`${m.key}:${m.label}`}>
                      <button type="button" className="sa-todo-row" onClick={() => stepOf(m) && go(`/portal/site/job/${job}/${stepOf(m)}`)}>
                        <span>{m.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <button type="button" className="sa-btn sa-btn-1" onClick={() => go(`/portal/site/job/${job}/sign-${form.stage}`)}>
              Check and sign again
            </button>
          </>
        ) : signed ? (
          <>
            <div className="sa-card sa-signed">
              <h2>Signed ✓</h2>
              <p>
                By {signed.signed_name} on {shortDate(signed.signed_at)}.{strike ? ' Thanks for taking the scaffold down.' : ''}
              </p>
            </div>
            <PoCard rec={rec} stage={form.stage} />
          </>
        ) : (
          <div className="sa-card sa-signed">
            <h2>Signed ✓</h2>
            <p>
              Signed on this phone. It will send when you have signal. Keep the app open, or open it again later.
              {strike ? '' : ' Your PO number will arrive then, by email too.'}
            </p>
          </div>
        )}
        <button type="button" className="sa-btn sa-btn-2" onClick={() => go(`/portal/site/job/${job}`)}>
          Back to the job
        </button>
      </main>
    </>
  );
}

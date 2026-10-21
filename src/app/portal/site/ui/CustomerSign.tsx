'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import { queueCustomerSign, waitingSigns } from '@/lib/site/electrician-client';
import { CUSTOMER_DECLARATION, CUSTOMER_SIGN_TITLE, type CustomerSignKind } from '@/lib/site/electrician-shared';
import type { PackRecord } from '@/lib/site/offline';
import type { SitePack } from '@/lib/site/pack-shared';
import { SyncLine, TopBar } from './bits';
import { go, useLive } from './nav';

/** "Solar panels (16, 7.2 kWp), a battery and an EV charger": what was done, in plain words, from the job. */
export function whatWeDid(pack: SitePack): string {
  const p = pack.job.products;
  const s = pack.system;
  const parts: string[] = [];
  if (p.includes('solar')) parts.push(`solar panels${s.panel_count || s.kwp ? ` (${[s.panel_count ? `${s.panel_count}` : '', s.kwp ? `${s.kwp} kWp` : ''].filter(Boolean).join(', ')})` : ''}`);
  if (p.includes('battery')) parts.push(s.battery_model ? `a ${s.battery_model} battery` : 'a battery');
  if (p.includes('ev')) parts.push('an EV charger');
  if (p.includes('heatpump')) parts.push('the heat pump’s electrical supply');
  if (!parts.length) return 'The electrical work for your installation.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `${list[0].toUpperCase()}${list.slice(1)}.`;
}

/** The signatures this job asks the customer for, in order: the completion record, then G98 Form B on G98 jobs. */
export const kindsFor = (pack: SitePack): CustomerSignKind[] => (pack.electrician?.g98 ? ['f16e', 'g98'] : ['f16e']);

/**
 * P15: after the electrician's sign-off, "Hand the phone to Jane": what was done in plain words, the
 * completion declaration and a signature; on G98 jobs a separate signature for Form B (D15: one
 * signature is never reused). Skipping is fine: their portal asks later. Each is kept on the phone
 * and sent like everything else.
 */
export function CustomerSign({ rec }: { rec: PackRecord }) {
  const job = rec.id;
  const pack = rec.pack;
  const waiting = useLive(() => waitingSigns(job), `signs:${job}`);
  const done = new Set<CustomerSignKind>([...(Object.keys(pack.electrician?.customer ?? {}) as CustomerSignKind[]), ...(waiting ?? []).map((w) => w.kind)]);
  const kinds = kindsFor(pack);
  const next = kinds.find((k) => !done.has(k));
  const [name, setName] = useState(pack.job.customer.name);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const first = pack.job.customer.first || 'the customer';
  const address = [...pack.job.address, pack.job.postcode].filter(Boolean).join(', ');

  return (
    <>
      <TopBar title={`Hand the phone to ${first}`} onBack={() => go(`/portal/site/job/${job}`)} />
      <SyncLine />
      <main className="sa-main sa-sign">
        {!next ? (
          <div className="sa-card sa-signed">
            <h2>Thank you{pack.job.customer.first ? `, ${pack.job.customer.first}` : ''} ✓</h2>
            <p>Please hand the phone back.</p>
            <button type="button" className="sa-btn sa-btn-1" onClick={() => go(`/portal/site/job/${job}`)}>
              Back to the job
            </button>
          </div>
        ) : (
          <>
            <section className="sa-card">
              <p className="sa-kicker">
                {CUSTOMER_SIGN_TITLE[next]}
                {kinds.length > 1 ? ` · ${kinds.indexOf(next) + 1} of ${kinds.length}` : ''}
              </p>
              {next === 'f16e' && (
                <>
                  <h3>What we did</h3>
                  <p>{whatWeDid(pack)}</p>
                  <p className="sa-muted">One of the team will be in touch tomorrow to go through your handover pack.</p>
                </>
              )}
              <p className="sa-declaration">{CUSTOMER_DECLARATION[next](address)}</p>
              <label className="sa-label" htmlFor="sa-cust-name">
                Your name
              </label>
              <input id="sa-cust-name" className="sa-text" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              <p className="sa-label">Sign here</p>
              <div className="sa-pad">
                <SignaturePad key={next} onChange={setSignature} height={180} />
              </div>
            </section>
            <button
              type="button"
              className="sa-btn sa-btn-1 sa-signbtn"
              disabled={!signature || !name.trim() || busy}
              onClick={async () => {
                if (!signature) return;
                setBusy(true);
                await queueCustomerSign(job, { kind: next, name: name.trim(), signature, declaration: CUSTOMER_DECLARATION[next](address) });
                setSignature(null);
                setBusy(false);
              }}
            >
              {busy ? 'Signing…' : 'Sign'}
            </button>
            <button type="button" className="sa-btn sa-btn-2" onClick={() => go(`/portal/site/job/${job}`)}>
              Skip: they’ll sign in their portal
            </button>
          </>
        )}
      </main>
    </>
  );
}

/** On the signed screen and the job: the customer's signatures, or the button to take them. */
export function CustomerSignCard({ rec }: { rec: PackRecord }) {
  const job = rec.id;
  const pack = rec.pack;
  const waiting = useLive(() => waitingSigns(job), `signs:${job}`);
  if (pack.assignment.trade !== 'electrician' || !pack.electrician) return null;
  const kinds = kindsFor(pack);
  const signed = kinds.filter((k) => pack.electrician?.customer[k] || waiting?.some((w) => w.kind === k));
  const first = pack.job.customer.first || 'the customer';
  return (
    <section className="sa-card">
      <h3>Customer sign (optional)</h3>
      {signed.length === kinds.length ? (
        <p className="sa-hint-ok">
          {first} signed ✓{waiting?.length ? ' It sends when you have signal.' : ''}
        </p>
      ) : (
        <>
          <p className="sa-muted">If {first} is there, they can sign to say the work’s finished{kinds.includes('g98') ? ', and sign the G98 form' : ''}. If not, their portal asks them later.</p>
          <button type="button" className="sa-btn sa-btn-1" onClick={() => go(`/portal/site/job/${job}/customer`)}>
            Hand the phone to {first}
          </button>
        </>
      )}
    </section>
  );
}

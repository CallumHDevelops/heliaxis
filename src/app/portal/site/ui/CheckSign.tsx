'use client';

import { useState } from 'react';
import { SignaturePad } from '@/components/subcontractors/SignaturePad';
import type { SiteForm } from '@/lib/site/forms/types';
import { getDevice, type PackRecord } from '@/lib/site/offline';
import { signCheck } from '@/lib/site/rules';
import { queueSignoff } from '@/lib/site/signoff-client';
import { SEVERITY_LABEL } from '@/lib/site/types';
import { shortDate } from '@/lib/site/client';
import { SyncLine, TopBar } from './bits';
import type { JobForms } from './form-state';
import { go, useLive } from './nav';

/**
 * P10: check and sign. Flags first (Stop in red with "Fix this"; Urgent and For the office in amber),
 * then what's still to do (each opens its step), then "Not filled" (never blocks), the declaration,
 * the name (prefilled, editable), the signature and Sign off. Grey, with the reasons, while a Stop
 * or a must is open.
 */
export function CheckSign({ rec, jf, form }: { rec: PackRecord; jf: JobForms; form: SiteForm }) {
  const job = rec.id;
  const device = useLive(getDevice, 'device');
  const [name, setName] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const check = signCheck(form, jf.ctx);
  const signedOn = rec.pack.assignment.signoffs.find((s) => s.stage === form.stage);
  const pending = jf.pendingSign.includes(form.stage);
  const declaration = form.sig.declaration?.(jf.ctx) ?? '';
  const who = name ?? device?.contact.name ?? '';
  const stepOf = (key: string) => form.steps.find((s) => s.fields.some((f) => f.key === key))?.key;
  const openStep = (key: string) => {
    const s = stepOf(key);
    if (s) go(`/portal/site/job/${job}/${s}`);
  };
  const flags = [...check.flags].sort((a, b) => ['stop', 'urgent', 'review'].indexOf(a.severity) - ['stop', 'urgent', 'review'].indexOf(b.severity));
  const reasons = [
    ...(check.stops.length ? [`${check.stops.length} thing${check.stops.length === 1 ? '' : 's'} to fix`] : []),
    ...(check.must.length ? [`${check.must.length} still to do`] : []),
    ...(!who.trim() ? ['your name'] : []),
    ...(!signature ? ['your signature'] : []),
  ];

  return (
    <>
      <TopBar title="Check and sign" onBack={() => go(`/portal/site/job/${job}`)} />
      <SyncLine />
      <main className="sa-main sa-sign">
        <p className="sa-kicker">{form.title}</p>
        {signedOn || pending ? (
          <div className="sa-card sa-signed">
            <h2>Signed ✓</h2>
            <p>{signedOn ? `By ${signedOn.signed_name} on ${shortDate(signedOn.signed_at)}.` : 'Signed on this phone. It will send when you have signal.'}</p>
          </div>
        ) : (
          <>
            {rec.gate?.stage === form.stage && (
              <div className="sa-alert sa-alert-bad" role="alert">
                <b>Not signed yet</b>
                <span>{rec.gate.missing.length ? `Heliaxis still needs: ${rec.gate.missing.map((m) => m.label).join('; ')}.` : rec.gate.message}</span>
              </div>
            )}
            {flags.length > 0 && (
              <section className="sa-flags">
                {flags.map((f) => (
                  <div key={f.code} className={`sa-flag sa-flag-${f.severity}`}>
                    <span className="sa-flag-sev">{SEVERITY_LABEL[f.severity]}</span>
                    <span className="sa-flag-text">{f.text}</span>
                    {f.severity === 'stop' && stepOf(f.key) && (
                      <button type="button" className="sa-small" onClick={() => openStep(f.key)}>
                        Fix this
                      </button>
                    )}
                  </div>
                ))}
                {flags.some((f) => f.severity !== 'stop') && <p className="sa-muted">The office is told about these. You can still sign.</p>}
              </section>
            )}
            {check.must.length > 0 && (
              <section className="sa-card">
                <h3>Still to do</h3>
                <ul className="sa-todo">
                  {check.must.slice(0, 12).map((m) => (
                    <li key={m.key}>
                      <button type="button" className="sa-todo-row" onClick={() => go(`/portal/site/job/${job}/${m.step}`)}>
                        <span>{m.label}</span>
                        <span className="sa-muted">{m.why}</span>
                      </button>
                    </li>
                  ))}
                  {check.must.length > 12 && <li className="sa-muted">and {check.must.length - 12} more</li>}
                </ul>
              </section>
            )}
            {check.should.length > 0 && (
              <section className="sa-card">
                <h3>Not filled</h3>
                <p className="sa-muted">Worth doing, but they don’t stop you signing.</p>
                <ul className="sa-todo">
                  {check.should.map((m) => (
                    <li key={m.key}>
                      <button type="button" className="sa-todo-row" onClick={() => go(`/portal/site/job/${job}/${m.step}`)}>
                        <span>{m.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section className="sa-card">
              <h3>Declaration</h3>
              <p className="sa-declaration">{declaration}</p>
              <label className="sa-label" htmlFor="sa-sign-name">
                Your name
              </label>
              <input id="sa-sign-name" className="sa-text" type="text" autoComplete="name" value={who} onChange={(e) => setName(e.target.value)} />
              <p className="sa-label">Sign here</p>
              <div className="sa-pad">
                <SignaturePad onChange={setSignature} height={180} />
              </div>
            </section>
            {reasons.length > 0 && <p className="sa-muted sa-reasons">To sign: {reasons.join(', ')}.</p>}
            <button
              type="button"
              className="sa-btn sa-btn-1 sa-signbtn"
              disabled={!!reasons.length || busy}
              onClick={async () => {
                if (!signature) return;
                setBusy(true);
                await queueSignoff(job, { stage: form.stage, name: who.trim(), signature, declaration });
                setBusy(false);
                go(`/portal/site/job/${job}/done-${form.stage}`, { replace: true });
              }}
            >
              {busy ? 'Signing…' : 'Sign off'}
            </button>
          </>
        )}
      </main>
    </>
  );
}

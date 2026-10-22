'use client';

import { useState } from 'react';
import { PRINT_LABEL } from '@/lib/documents/print-shared';
import { pounds, shortDate } from '@/lib/site/client';
import { getDevice, getFile, type PackRecord } from '@/lib/site/offline';
import type { PackPo } from '@/lib/site/pack-shared';
import { PO_TERMS_TITLE, poNext, snapshotOf } from '@/lib/site/po-shared';
import { poReviewOf, type ReviewState } from '@/lib/site/review-shared';
import type { Stage } from '@/lib/site/types';
import { useBlobUrl, useLive } from './nav';
import { REVIEW_PILL, reviewOf } from './Review';

/** The phone's copy of an issued PO's PDF (packs.ts keeps it, so it opens with no signal). */
export const poFileId = (po: Pick<PackPo, 'id' | 'labour'>) => `po:${po.id}:v${snapshotOf(po.labour)?.version ?? 0}`;

/** The PO's review on the phone: on hold while a return to site is live, green once all is reviewed. */
function poReviewState(rec: PackRecord): ReviewState | null {
  const states = reviewOf(rec).map((r) => r.state);
  const po = poReviewOf(states);
  if (!po) return null;
  if (po === 'hold') return states.includes('open') ? 'open' : 'fixed';
  return po === 'green' ? 'green' : 'waiting';
}

/**
 * The print version of the issued PO (the ink saver), made by the server when asked: it needs signal.
 * Fetched with the phone's device token, then opened (or saved) like the PO itself.
 */
function PrintVersion({ assignmentId, poNumber }: { assignmentId: string; poNumber: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'offline'>('idle');
  const open = async () => {
    setState('busy');
    try {
      const token = (await getDevice().catch(() => undefined))?.token;
      const r = await fetch(`/api/site/jobs/${assignmentId}/po/print`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store', credentials: 'omit' });
      if (!r.ok || !r.headers.get('content-type')?.includes('pdf')) throw new Error('not a pdf');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = `${poNumber} (print version).pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setState('idle');
    } catch {
      setState('offline');
    }
  };
  return (
    <>
      <button type="button" className="sa-link" disabled={state === 'busy'} onClick={() => void open()}>
        {state === 'busy' ? 'Getting the print version…' : PRINT_LABEL}
      </button>
      {state === 'offline' && <p className="sa-muted">You need signal for the print version. Try again when you have some.</p>}
    </>
  );
}

/**
 * The PO after signing (P11, and on the job once signed): the number, where the office's review is
 * up to (waiting, on hold: return to site, green light), rate × quantity, VAT, CIS, **What you'll be
 * paid**, where it went, the PDF, and the PO's terms (po-shared.ts PO_TERMS) behind a tap. Held:
 * "once the office has checked one thing". POs go at once, day or night.
 */
export function PoCard({ rec, stage }: { rec: PackRecord; stage: Stage }) {
  const po = rec.pack.po;
  // Keyed by the version too: the file is looked for again when an issued copy arrives.
  const fileId = po ? poFileId(po) : '';
  const file = useLive(() => (fileId ? getFile(fileId) : Promise.resolve(undefined)), `po-file:${fileId}`);
  const url = useBlobUrl(file?.blob);
  if (!po) return null;
  const s = snapshotOf(po.labour);
  const next = poNext(po, stage);
  if (next === 'held') {
    return (
      <section className="sa-card sa-po">
        <p className="sa-kicker">{po.po_number}</p>
        <p>Your PO will be sent once the office has checked one thing.</p>
      </section>
    );
  }
  const where = s?.sub.email ? `by email to ${s.sub.email}` : 'on WhatsApp';
  const review = poReviewState(rec);
  const pill = review ? REVIEW_PILL[review] : null;
  const terms = s?.terms ?? [];
  return (
    <section className="sa-card sa-po">
      <div className="sa-po-head">
        <p className="sa-kicker">Your purchase order</p>
        <h3>{po.po_number}</h3>
        {pill && <span className={`sa-review-pill is-${pill.tone}`}>{pill.text}</span>}
      </div>
      {s && (
        <dl className="sa-po-lines">
          {s.rate_words && (
            <div>
              <dt>{s.rate_words}</dt>
              <dd>{pounds(s.labour_net)}</dd>
            </div>
          )}
          {s.materials_net > 0 && (
            <div>
              <dt>Materials</dt>
              <dd>{pounds(s.materials_net)}</dd>
            </div>
          )}
          <div>
            <dt>{s.vat_words}</dt>
            <dd>{s.vat ? pounds(s.vat) : '–'}</dd>
          </div>
          <div>
            <dt>{s.cis.words}</dt>
            <dd>{s.cis.pence ? `−${pounds(s.cis.pence)}` : '–'}</dd>
          </div>
        </dl>
      )}
      <div className="sa-po-pay">
        <span>What you’ll be paid</span>
        <b>{pounds(po.payable_pence ?? s?.payable ?? 0)}</b>
      </div>
      {s?.payment_terms && <p className="sa-muted">{s.payment_terms}</p>}
      <p className="sa-po-where">{po.sent_at ? `Sent to you ${where} on ${shortDate(po.sent_at)}.` : `It’s on its way to you ${where}.`}</p>
      {url && (
        <a className="sa-btn sa-btn-2" href={url} target="_blank" rel="noopener" download={`${po.po_number}.pdf`}>
          Open the PO (PDF)
        </a>
      )}
      {(snapshotOf(po.labour)?.version ?? 0) > 0 && <PrintVersion assignmentId={rec.pack.assignment.id} poNumber={po.po_number} />}
      {po.paid_on && <p className="sa-po-paid">Paid {shortDate(po.paid_on)} ✓</p>}
      {terms.length > 0 && (
        <details className="sa-po-terms">
          <summary>{PO_TERMS_TITLE}</summary>
          <ol>
            {terms.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

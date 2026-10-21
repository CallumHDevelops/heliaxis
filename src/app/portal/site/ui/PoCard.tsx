'use client';

import { pounds, shortDate } from '@/lib/site/client';
import { getFile, type PackRecord } from '@/lib/site/offline';
import type { PackPo } from '@/lib/site/pack-shared';
import { poNext, snapshotOf } from '@/lib/site/po-shared';
import { sendTimeWords } from '@/lib/site/messages';
import type { Stage } from '@/lib/site/types';
import { useNow } from '@/lib/use-now';
import { useBlobUrl, useLive } from './nav';

/** The phone's copy of an issued PO's PDF (packs.ts keeps it, so it opens with no signal). */
export const poFileId = (po: Pick<PackPo, 'id' | 'labour'>) => `po:${po.id}:v${snapshotOf(po.labour)?.version ?? 0}`;

/**
 * The PO after signing (P11, and on the job once signed): the number, rate × quantity, VAT, CIS,
 * **What you'll be paid**, payment terms, and where it went. Held: "once the office has checked one
 * thing". The PDF opens from the phone once it has been issued.
 */
export function PoCard({ rec, stage }: { rec: PackRecord; stage: Stage }) {
  const po = rec.pack.po;
  // Keyed by the version too: the file is looked for again when an issued copy arrives.
  const fileId = po ? poFileId(po) : '';
  const file = useLive(() => (fileId ? getFile(fileId) : Promise.resolve(undefined)), `po-file:${fileId}`);
  const url = useBlobUrl(file?.blob);
  const now = useNow(60_000);
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
  // Issued but not reached them yet: the evening rule holds it until the morning, or it's on its way.
  const goesAt = !po.sent_at && rec.poGoesAt && Date.parse(rec.poGoesAt) > now ? rec.poGoesAt : null;
  const where = s?.sub.email ? `by email to ${s.sub.email}` : 'on WhatsApp';
  return (
    <section className="sa-card sa-po">
      <div className="sa-po-head">
        <p className="sa-kicker">Your purchase order</p>
        <h3>{po.po_number}</h3>
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
      <p className="sa-po-where">
        {po.sent_at
          ? `Sent to you ${where} on ${shortDate(po.sent_at)}.`
          : goesAt
            ? `It goes to you ${where} at ${sendTimeWords(goesAt)} (nothing is sent late in the evening).`
            : `On its way to you ${where}.`}
      </p>
      {url && (
        <a className="sa-btn sa-btn-2" href={url} target="_blank" rel="noopener" download={`${po.po_number}.pdf`}>
          Open the PO (PDF)
        </a>
      )}
      {po.paid_on && <p className="sa-po-paid">Paid {shortDate(po.paid_on)} ✓</p>}
    </section>
  );
}

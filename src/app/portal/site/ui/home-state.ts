import type { DraftRecord, OutboxRecord, PhotoRecord } from '@/lib/site/offline';
import type { SiteJobRow } from '@/lib/site/pack-shared';
import type { Stage } from '@/lib/site/types';

/** Where a sign-off moves the job (src/lib/site/signoff.ts TO): the scaffold's erection to signed, the rest to done. */
const SIGNED_TO: Record<Stage, string> = { main: 'done', erection: 'signed', strike: 'done' };

export const SIGNED_HERE = 'Signed on this phone, waiting to send';
export const PUT_RIGHT_HERE = 'Put right signed, waiting to send';

type Row = Pick<SiteJobRow, 'id' | 'status' | 'status_label' | 'put_right'>;

/**
 * A home-list card as this phone knows it. The list is the server's last word (refreshed at most
 * once a minute, never with no signal), so what's been done here and not sent yet goes on top, as
 * the job screen shows it: a sign-off signed here puts the job under Signed off, a put right signed
 * here takes it out of Return to site required, and answers or photos given here make it In
 * progress. `local` is the line the card shows for it.
 */
export function onThisPhone<T extends Row>(card: T, outbox: OutboxRecord[], photos: PhotoRecord[], draft: DraftRecord | undefined): T & { local: string | null } {
  const ops = outbox.filter((o) => o.assignmentId === card.id && !o.failed);
  const out: T & { local: string | null } = { ...card, local: null };
  const signs = ops.filter((o) => o.kind === 'signoff').map((o) => String(o.payload.stage) as Stage);
  if (signs.length) {
    // The scaffold's strike after its erection: the later one says where the job is.
    const to = signs.map((s) => SIGNED_TO[s] ?? 'signed');
    out.status = to.includes('done') ? 'done' : out.status === 'done' ? 'done' : 'signed';
    out.status_label = SIGNED_HERE;
    out.local = SIGNED_HERE;
  }
  if (ops.some((o) => o.kind === 'put-right' && (!card.put_right || Number(o.payload.n) === card.put_right.n))) {
    out.put_right = null;
    out.local = PUT_RIGHT_HERE;
  }
  const started = ops.some((o) => o.kind === 'answers') || photos.some((p) => p.assignmentId === card.id) || Object.keys(draft?.answers ?? {}).length > 0;
  if (started && ['draft', 'sent', 'opened'].includes(out.status)) out.status = 'started';
  return out;
}

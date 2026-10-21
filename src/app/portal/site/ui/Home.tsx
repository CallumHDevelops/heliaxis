'use client';

import { pounds, shortDate } from '@/lib/site/client';
import { allPacks, allRec, getDevice, type DraftRecord, type OutboxRecord, type PackRecord, type PhotoRecord } from '@/lib/site/offline';
import { poState, type SiteJobRow } from '@/lib/site/pack-shared';
import { workByJob, type JobWork } from '@/lib/site/sync';
import { STATUS_LABEL, type AssignmentStatus } from '@/lib/site/types';
import { SyncLine, TopBar } from './bits';
import { onThisPhone } from './home-state';
import { jobProgress } from './progress';
import { go, useLive } from './nav';

type Card = SiteJobRow & { pack: PackRecord | null; problem: string | null; local?: string | null };

/** The home list from the server, with jobs only this phone knows yet (opened from a link with no signal since). */
function cardsOf(rows: SiteJobRow[], packs: PackRecord[]): Card[] {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const out: Card[] = rows.map((r) => ({ ...r, pack: byId.get(r.id) ?? null, problem: byId.get(r.id)?.problem?.message ?? null }));
  for (const p of packs) {
    if (out.some((c) => c.id === p.id)) continue;
    const a = p.pack.assignment;
    out.push({
      id: p.id,
      trade: a.trade,
      title: a.title,
      status: a.status,
      status_label: STATUS_LABEL[a.status as AssignmentStatus] ?? a.status,
      starts_on: a.starts_on,
      site: p.pack.job.short,
      ref: p.pack.job.ref,
      rev: a.rev,
      signed_at: a.signoffs.at(-1)?.signed_at ?? null,
      done_at: null,
      po: p.pack.po ? { po_number: p.pack.po.po_number, status: p.pack.po.status, payable_pence: p.pack.po.payable_pence, sent_at: p.pack.po.sent_at, paid_on: p.pack.po.paid_on, review_status: p.pack.po.review_status } : null,
      put_right: (() => {
        const open = (p.pack.returns ?? []).filter((r) => r.status === 'open').sort((x, y) => y.n - x.n)[0];
        return open ? { n: open.n, fix_by: open.fix_by } : null;
      })(),
      pack: p,
      problem: p.problem?.message ?? null,
    });
  }
  return out;
}

const GROUPS: { key: string; title: string; has: (c: Card) => boolean }[] = [
  // The office has asked them to put something right: first, so it's never missed.
  { key: 'fix', title: 'Return to site required', has: (c) => !c.problem && !!c.put_right },
  { key: 'now', title: 'In progress', has: (c) => !c.problem && !c.put_right && c.status === 'started' },
  { key: 'next', title: 'To start', has: (c) => !c.problem && !c.put_right && ['draft', 'sent', 'opened'].includes(c.status) },
  { key: 'signed', title: 'Signed off', has: (c) => !c.problem && !c.put_right && (c.status === 'signed' || c.status === 'done') },
  { key: 'off', title: 'Cancelled or taken off your list', has: (c) => !!c.problem || c.status === 'cancelled' },
];

function syncOf(w: JobWork | undefined): string | null {
  if (!w) return null;
  if (w.failed + w.failedPhotos) return 'Couldn’t send something: tap the pill';
  const n = w.answers + w.photos + w.other;
  return n ? `${n} waiting to send` : null;
}

/** P3 "Your Heliaxis jobs", and P13 their POs and payments. */
export function Home() {
  const device = useLive(getDevice, 'device');
  const packs = useLive(allPacks, 'packs');
  const work = useLive(workByJob, 'work');
  const drafts = useLive(() => allRec<DraftRecord>('drafts'), 'drafts');
  const outbox = useLive(() => allRec<OutboxRecord>('outbox'), 'outbox');
  const photos = useLive(() => allRec<PhotoRecord>('photos'), 'photos');

  // The server's list, with what's been done on this phone and not sent yet on top (home-state.ts).
  const cards = cardsOf(device?.home?.rows ?? [], packs ?? []).map((c) => onThisPhone(c, outbox ?? [], photos ?? [], drafts?.find((d) => d.id === c.id)));
  const pos = cards.filter((c) => c.po);
  return (
    <>
      <TopBar title="Your jobs" />
      <SyncLine />
      <main className="sa-main">
        <h1 className="sa-hello">{device?.contact.first ? `Hello ${device.contact.first}: your Heliaxis jobs` : 'Your Heliaxis jobs'}</h1>
        {packs && !cards.length && <p className="sa-empty">No jobs on this phone yet. Open the link in your message from Heliaxis.</p>}
        {GROUPS.map((g) => {
          const list = cards.filter(g.has);
          if (!list.length) return null;
          return (
            <section key={g.key} className={`sa-group sa-group-${g.key}`}>
              <h2>{g.title}</h2>
              {list.map((c) => {
                const progress = c.pack ? jobProgress(c.pack.pack, drafts?.find((d) => d.id === c.id)?.answers ?? c.pack.pack.assignment.answers, photos ?? [], outbox ?? []) : null;
                const sync = syncOf(work?.get(c.id));
                return (
                  <button type="button" key={c.id} className="sa-card sa-jobcard" onClick={() => go(`/portal/site/job/${c.id}`)}>
                    <span className="sa-jobcard-site">{c.site || 'Heliaxis job'}</span>
                    <span className="sa-jobcard-meta">
                      {c.title}
                      {c.starts_on ? ` · ${c.status === 'signed' || c.status === 'done' ? '' : 'starts '}${shortDate(c.starts_on)}` : ''}
                    </span>
                    {c.problem ? (
                      <span className="sa-jobcard-bad">{c.problem}</span>
                    ) : c.put_right ? (
                      <span className="sa-jobcard-bad">Put it right by {shortDate(c.put_right.fix_by)}</span>
                    ) : (
                      <>
                        {c.local && <span className="sa-jobcard-state">{c.local}</span>}
                        {c.po ? (
                          <span className="sa-jobcard-po">
                            {c.po.po_number}
                            {c.po.payable_pence != null ? ` · ${pounds(c.po.payable_pence)} to pay` : ''} · {poState(c.po)}
                          </span>
                        ) : (
                          !c.local && <span className="sa-jobcard-state">{progress ?? c.status_label}</span>
                        )}
                      </>
                    )}
                    {sync && <span className="sa-jobcard-sync">{sync}</span>}
                  </button>
                );
              })}
            </section>
          );
        })}
        {pos.length > 0 && (
          <section className="sa-group">
            <h2>Your POs and payments</h2>
            <div className="sa-card sa-pos">
              {pos.map((c) => (
                <button type="button" className="sa-po-row" key={c.id} onClick={() => go(`/portal/site/job/${c.id}`)}>
                  <div>
                    <b>{c.po!.po_number}</b>
                    <span className="sa-muted">
                      {c.site}
                      {c.po!.sent_at ? ` · ${shortDate(c.po!.sent_at)}` : ''}
                    </span>
                  </div>
                  <div className="sa-po-amount">
                    <b>{c.po!.payable_pence != null ? pounds(c.po!.payable_pence) : '–'}</b>
                    <span className="sa-muted">{poState(c.po!)}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import './contacted-catch-up.css';

/**
 * "41 customers you've already messaged on WhatsApp are still at Lead": the one-tap catch-up for chats
 * imported before imports moved people to Contacted (GET/POST /api/crm/contacted-catch-up). It shows
 * the number first; the button then moves them a few at a time, and each job's timeline says when you
 * first messaged them. Admins only: for anyone else, and when there's nobody to move, it shows nothing.
 * On the CRM home and Enquiries → Import.
 */

type Phase = { k: 'ask' } | { k: 'moving'; done: number } | { k: 'done'; moved: number; left: number } | { k: 'error'; message: string; moved: number };

const URL = '/api/crm/contacted-catch-up';
/** Requests at most (15 customers each): far more than are ever at Lead. */
const MAX_ROUNDS = 60;

const people = (n: number) => `${n.toLocaleString('en-GB')} customer${n === 1 ? '' : 's'}`;

export function ContactedCatchUp({ onMoved }: { onMoved?: () => void }) {
  const [count, setCount] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>({ k: 'ask' });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { customers?: number } | null) => {
        if (live) setCount(typeof d?.customers === 'number' ? d.customers : 0);
      })
      .catch(() => {
        if (live) setCount(0);
      });
    return () => {
      live = false;
    };
  }, []);

  async function move() {
    let moved = 0;
    setPhase({ k: 'moving', done: 0 });
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const r = await fetch(URL, { method: 'POST', cache: 'no-store' });
        const d = (await r.json().catch(() => ({}))) as { moved?: number; tried?: number; remaining?: number; error?: string };
        if (!r.ok) throw new Error(d.error || 'Something went wrong');
        const now = d.moved ?? 0;
        moved += now;
        setPhase({ k: 'moving', done: moved });
        // Done, or nobody in that batch could be moved (they'd only be tried again).
        if (!d.remaining || !now) {
          setPhase({ k: 'done', moved, left: (d.tried ?? 0) - now + (now ? 0 : (d.remaining ?? 0)) });
          break;
        }
      }
    } catch (e) {
      setPhase({ k: 'error', message: e instanceof Error ? e.message : 'Something went wrong', moved });
    }
    if (moved) onMoved?.();
  }

  if (hidden || count === null || (count === 0 && phase.k === 'ask')) return null;

  return (
    <div className="hx-catchup" role={phase.k === 'ask' ? undefined : 'status'}>
      {phase.k === 'ask' && (
        <>
          <p>
            <b>{people(count)}</b> you’ve already messaged on WhatsApp {count === 1 ? 'is' : 'are'} still at Lead.
          </p>
          <span className="hx-catchup__acts">
            <button type="button" className="hx-catchup__go" onClick={() => void move()}>
              Move {count === 1 ? 'them' : 'them all'} to Contacted
            </button>
            <button type="button" className="hx-catchup__later" onClick={() => setHidden(true)}>
              Not now
            </button>
          </span>
        </>
      )}
      {phase.k === 'moving' && (
        <p>
          Moving them to Contacted… {phase.done.toLocaleString('en-GB')} of {count.toLocaleString('en-GB')}
        </p>
      )}
      {phase.k === 'done' && (
        <>
          <p>
            {phase.moved ? (
              <>
                Done: <b>{people(phase.moved)}</b> moved to Contacted. Each job’s timeline says when you first messaged them.
              </>
            ) : (
              'Nobody needed moving: they’re all up to date.'
            )}
            {phase.left > 0 && ` ${people(phase.left)} couldn’t be moved; try again later.`}
          </p>
          <span className="hx-catchup__acts">
            <button type="button" className="hx-catchup__later" onClick={() => setHidden(true)}>
              OK
            </button>
          </span>
        </>
      )}
      {phase.k === 'error' && (
        <>
          <p>
            {phase.moved ? `${people(phase.moved)} moved, then: ` : 'Couldn’t move them: '}
            {phase.message}
          </p>
          <span className="hx-catchup__acts">
            <button type="button" className="hx-catchup__go" onClick={() => void move()}>
              Try again
            </button>
          </span>
        </>
      )}
    </div>
  );
}

'use client';

import { changed, flushDraft, getDraft, putRec, type OutboxRecord } from './offline';
import { drainSoon } from './sync';
import type { Stage } from './types';

/**
 * Signing off on the phone (P10). The sign-off is a real sign-off the moment it's made, with or
 * without signal: it goes on the outbox behind the answers, and the sync sends it last, once every
 * photo for the job is up (sync.ts, the 'signoff' sender). Its op_id makes a retry find the same
 * sign-off and the same PO.
 */
export type SignoffPayload = { stage: Stage; name: string; signature: string; declaration: string; signed_at: string; rev: number };

export async function queueSignoff(assignmentId: string, p: Omit<SignoffPayload, 'signed_at' | 'rev'>): Promise<string> {
  // Every answer typed so far goes first.
  await flushDraft(assignmentId);
  const d = await getDraft(assignmentId);
  const op: OutboxRecord = {
    op_id: crypto.randomUUID(),
    assignmentId,
    kind: 'signoff',
    payload: { ...p, signed_at: new Date().toISOString(), rev: d.baseRev } satisfies SignoffPayload,
    createdAt: new Date().toISOString(),
    tries: 0,
  };
  await putRec('outbox', op);
  changed();
  drainSoon(0);
  return op.op_id;
}

'use client';

import { factsFromPack, withFiles } from '@/lib/site/electrician-shared';
import { schemaFor } from '@/lib/site/forms';
import type { LabelReadResult } from '@/lib/site/forms/types';
import type { OutboxRecord, PhotoRecord } from '@/lib/site/offline';
import type { SitePack } from '@/lib/site/pack-shared';
import { formProgress, makeCtx, openForms } from '@/lib/site/rules';
import type { Answers, Stage } from '@/lib/site/types';

/**
 * "Roof checks 4 of 9" for a job card, from its form and what's on this phone, counted as the job
 * screen counts them (form-state.ts): the answers given here, photos from the moment they're taken
 * (still waiting to send, or already on the server and not being taken off), certificate files
 * picked here, and a sign-off made here that hasn't sent yet. Null when the job has no form, or
 * everything's signed.
 */
export function jobProgress(pack: SitePack, answers: Answers, local: PhotoRecord[] = [], outbox: OutboxRecord[] = []): string | null {
  const job = pack.assignment.id;
  const ops = outbox.filter((o) => o.assignmentId === job && !o.failed);
  const mine = local.filter((p) => p.assignmentId === job);
  const forms = schemaFor(pack.assignment);
  const signed = [...new Set([...pack.assignment.signoffs.map((s) => s.stage), ...pendingSignoffs(ops)])];
  const form = openForms(forms, signed).find((f) => !signed.includes(f.stage));
  if (!form) return null;
  const removing = new Set(ops.filter((o) => o.kind === 'photo-delete').map((o) => String(o.payload.client_id)));
  const photos: Record<string, number> = {};
  for (const p of mine) photos[p.slot] = (photos[p.slot] ?? 0) + 1;
  for (const p of pack.photos) {
    const id = p.client_id ?? p.id;
    if (removing.has(id) || mine.some((l) => l.client_id === id)) continue;
    photos[p.slot] = (photos[p.slot] ?? 0) + 1;
  }
  const files = [...(pack.electrician?.uploads ?? []), ...ops.filter((o) => o.kind === 'file').map((o) => ({ slot: String(o.payload.slot) }))];
  const ctx = makeCtx({
    trade: pack.assignment.trade,
    answers,
    design: pack.design,
    system: pack.system,
    products: pack.job.products,
    sides: pack.sides,
    photos: withFiles(photos, files),
    reads: pack.reads.map((r) => ({ key: r.key, status: r.status, result: r.result as LabelReadResult | null })),
    address: '',
    signed,
    el: factsFromPack(pack),
    eic: pack.eic,
  });
  const p = formProgress(form, ctx);
  return `${form.title} ${p.done} of ${p.total}`;
}

/** Stages signed on this phone and still to send. */
export const pendingSignoffs = (ops: OutboxRecord[]): Stage[] => [...new Set(ops.filter((o) => o.kind === 'signoff' && !o.failed).map((o) => String(o.payload.stage) as Stage))];

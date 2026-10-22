'use client';

import { useMemo } from 'react';
import { factsFromPack, withFiles } from '@/lib/site/electrician-shared';
import { schemaFor } from '@/lib/site/forms';
import type { FormCtx, LabelReadResult, SiteForm } from '@/lib/site/forms/types';
import { byJob, type OutboxRecord, type PackRecord, type PhotoRecord } from '@/lib/site/offline';
import type { PackPhoto } from '@/lib/site/pack-shared';
import { photosOf } from '@/lib/site/photo-queue';
import { makeCtx } from '@/lib/site/rules';
import type { Answers, Stage } from '@/lib/site/types';
import { useLive } from './nav';

/** One photo in a slot: on the phone (maybe still waiting to send), or already on the server. */
export type SlotPhoto = { id: string; local: PhotoRecord | null; server: PackPhoto | null };

export type JobForms = {
  ctx: FormCtx;
  forms: SiteForm[];
  /** Stages signed off, including a sign-off made on this phone that hasn't sent yet. */
  signed: Stage[];
  /** Signed on this phone, waiting to send. */
  pendingSign: Stage[];
  photos: Record<string, SlotPhoto[]>;
};

/**
 * The job's forms and the rules' context, from the phone's copy: the pack, the draft's answers, the
 * photo queue (photos count from the moment they're taken), photos the server already holds (less
 * any being taken off), and Claude's reads.
 */
export function useJobForms(rec: PackRecord, answers: Answers): JobForms | null {
  const local = useLive(() => photosOf(rec.id), `photos:${rec.id}`);
  const outbox = useLive(() => byJob<OutboxRecord>('outbox', rec.id), `outbox:${rec.id}`);
  return useMemo(() => {
    if (!local || !outbox) return null;
    const pack = rec.pack;
    const removing = new Set(outbox.filter((o) => o.kind === 'photo-delete').map((o) => String(o.payload.client_id)));
    const pendingSign = outbox.filter((o) => o.kind === 'signoff' && !o.failed).map((o) => String(o.payload.stage) as Stage);
    const photos: Record<string, SlotPhoto[]> = {};
    const add = (slot: string, p: SlotPhoto) => (photos[slot] ??= []).push(p);
    for (const p of local) add(p.slot, { id: p.client_id, local: p, server: null });
    for (const p of pack.photos) {
      const id = p.client_id ?? p.id;
      if (removing.has(id) || local.some((l) => l.client_id === id)) continue;
      add(p.slot, { id, local: null, server: p });
    }
    const counts: Record<string, number> = {};
    for (const [slot, list] of Object.entries(photos)) counts[slot] = list.length;
    // An electrician's certificate PDFs count in their slot too: on the server, or still on the phone.
    const files = [...(pack.electrician?.uploads ?? []), ...outbox.filter((o) => o.kind === 'file' && !o.failed).map((o) => ({ slot: String(o.payload.slot) }))];
    const signed = [...new Set([...pack.assignment.signoffs.map((s) => s.stage), ...pendingSign])];
    const ctx = makeCtx({
      trade: pack.assignment.trade,
      answers,
      design: pack.design,
      system: pack.system,
      products: pack.job.products,
      sides: pack.sides,
      photos: withFiles(counts, files),
      reads: pack.reads.map((r) => ({ key: r.key, status: r.status, result: r.result as LabelReadResult | null })),
      address: [...pack.job.address, pack.job.postcode].filter(Boolean).join(', '),
      signed,
      el: factsFromPack(pack),
      eic: pack.eic,
    });
    return { ctx, forms: schemaFor(pack.assignment), signed, pendingSign, photos };
  }, [rec, answers, local, outbox]);
}

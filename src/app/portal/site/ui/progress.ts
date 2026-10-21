'use client';

import { schemaFor } from '@/lib/site/forms';
import type { LabelReadResult } from '@/lib/site/forms/types';
import type { SitePack } from '@/lib/site/pack-shared';
import { formProgress, makeCtx, openForms } from '@/lib/site/rules';
import type { Answers } from '@/lib/site/types';

/**
 * "Roof checks 4 of 9" for a job card, from its form and the answers on this phone (photos counted
 * from the pack, so a photo still waiting to send shows on the job screen first). Null when the job
 * has no form, or everything's signed.
 */
export function jobProgress(pack: SitePack, answers: Answers): string | null {
  const forms = schemaFor(pack.assignment);
  const signed = pack.assignment.signoffs.map((s) => s.stage);
  const form = openForms(forms, signed).find((f) => !signed.includes(f.stage));
  if (!form) return null;
  const photos: Record<string, number> = {};
  for (const p of pack.photos) photos[p.slot] = (photos[p.slot] ?? 0) + 1;
  const ctx = makeCtx({
    trade: pack.assignment.trade,
    answers,
    design: pack.design,
    system: pack.system,
    products: pack.job.products,
    sides: pack.sides,
    photos,
    reads: pack.reads.map((r) => ({ key: r.key, status: r.status, result: r.result as LabelReadResult | null })),
    address: '',
    signed,
  });
  const p = formProgress(form, ctx);
  return `${form.title} ${p.done} of ${p.total}`;
}

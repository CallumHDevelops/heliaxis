import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { ASSISTANT_MODEL, assistantConfigured } from '@/lib/assistant/run';
import { CRM_BUCKET } from '@/lib/crm/server';
import type { LabelReadResult } from './forms/types';
import type { Db } from './server';

/**
 * Reading a label or data-badge photo with Claude (the same client, model and refusal fallback as
 * Metis, src/lib/assistant/run.ts): serial, make, model and the ratings printed on it. The photo goes
 * as base64 from storage, so no link to it leaves Supabase. The answer is structured output, checked
 * with zod again on the way back. A read is only ever a suggestion: nothing is saved into the answers
 * until a person taps ✓ or types over it. No ANTHROPIC_API_KEY: no reads (scanning and typing still work).
 */

const n = z.number().nullable();
export const LabelRead = z.object({
  readable: z.boolean(),
  problem: z.string().nullable(),
  kind: z.enum(['panel', 'inverter', 'battery', 'optimiser_sheet', 'ev_charger', 'heat_pump', 'meter', 'other']),
  make: z.string().nullable(),
  model: z.string().nullable(),
  serials: z.array(z.string()),
  panel: z.object({ pmax_w: n, voc_v: n, isc_a: n, vmp_v: n, imp_a: n, max_system_v: n }).nullable(),
  battery: z.object({ usable_kwh: n, nominal_kwh: n, rated_kw: n }).nullable(),
  inverter: z.object({ rated_ac_kw: n }).nullable(),
  meter: z.object({ reading_kwh: n }).nullable(),
});

/** What each photo slot shows, so the read knows what to look for. */
const WHAT: Record<string, string> = {
  RF12: 'the data label on the back of a solar panel',
  RF7b: 'an optimiser layout plan with the optimisers’ serial stickers stuck on it (read every sticker)',
  // The electrician's label photos (FORMS 4.3).
  EP21: 'the data label of a solar or hybrid inverter',
  EP26: 'a generation meter: copy the reading (kWh) into meter.reading_kwh and its serial number',
  EP31: 'the data label of a home battery module',
  EP32: 'the data label of a battery inverter, gateway or battery management unit',
  EP41: 'the data label of an EV charge point',
  EP53: 'the data label of a heat pump’s outdoor unit',
  EP54: 'the data label of a heat pump’s indoor unit or controller',
  SN_OPT: 'an optimiser layout plan or optimiser serial stickers (read every sticker)',
  SN_METERp: 'an electricity supply meter: copy its serial number',
};

const PROMPT = (what: string) =>
  `This photo is ${what}, taken on site by an installer. Copy what is printed on it into the fields. ` +
  'Only copy what is printed. If a value isn’t printed or can’t be read, give null. Never estimate or work a value out. ' +
  'serials: every serial number printed or shown under a barcode, exactly as printed. ' +
  'If glare, blur or the edge of the photo stops you reading the label, set readable to false and say in problem, in a few plain words, what is in the way (for example "glare over the serial").';

export const readsEnabled = () => assistantConfigured();

/** One photo read. Returns null when there's no key or the call fails (it's tried again later). */
export async function readLabel(bytes: Buffer, mime: string, key: string): Promise<{ result: LabelReadResult; model: string } | { refused: true } | null> {
  if (!readsEnabled()) return null;
  const client = new Anthropic();
  const res = await client.beta.messages.create({
    model: ASSISTANT_MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low', format: betaZodOutputFormat(LabelRead) },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime === 'image/png' ? 'image/png' : mime === 'image/webp' ? 'image/webp' : 'image/jpeg', data: bytes.toString('base64') } },
          { type: 'text', text: PROMPT(WHAT[key.split(':')[0]] ?? 'an equipment label') },
        ],
      },
    ],
  });
  if (res.stop_reason === 'refusal') return { refused: true };
  const texts = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text');
  const last = texts.at(-1)?.text;
  if (!last) return null;
  let json: unknown;
  try {
    json = JSON.parse(last);
  } catch {
    return null;
  }
  const parsed = LabelRead.safeParse(json);
  return parsed.success ? { result: parsed.data, model: res.model } : null;
}

type ReadRow = { id: string; assignment_id: string; photo_id: string; key: string; status: string; attempts: number; result: LabelReadResult | null };
const MAX_TRIES = 3;

/** Queue a read for a photo (once). */
export async function queueRead(db: Db, assignmentId: string, photoId: string, key: string) {
  await db.from('site_reads').upsert({ assignment_id: assignmentId, photo_id: photoId, key, status: 'queued' }, { onConflict: 'photo_id', ignoreDuplicates: true });
}

/**
 * Run a queued read, once however many callers ask (the phone waiting on it, the upload's after(),
 * the cron): whoever moves `attempts` on first does it.
 */
export async function runRead(db: Db, photoId: string): Promise<ReadRow | null> {
  const { data } = await db.from('site_reads').select('*').eq('photo_id', photoId).maybeSingle();
  const row = data as ReadRow | null;
  if (!row || row.status !== 'queued' || row.attempts >= MAX_TRIES || !readsEnabled()) return row;
  const { data: claimed } = await db.from('site_reads').update({ attempts: row.attempts + 1 }).eq('id', row.id).eq('attempts', row.attempts).eq('status', 'queued').select('id');
  if (!claimed?.length) return row;
  const { data: ph } = await db.from('crm_photos').select('storage_path').eq('id', photoId).maybeSingle();
  const path = (ph as { storage_path?: string } | null)?.storage_path;
  const file = path ? await db.storage.from(CRM_BUCKET).download(path) : null;
  if (!file?.data) return { ...row, attempts: row.attempts + 1 };
  const mime = file.data.type || 'image/jpeg';
  const out = await readLabel(Buffer.from(await file.data.arrayBuffer()), mime, row.key).catch(() => null);
  const done = row.attempts + 1;
  if (!out) {
    if (done >= MAX_TRIES) await db.from('site_reads').update({ status: 'failed' }).eq('id', row.id);
    return { ...row, attempts: done, status: done >= MAX_TRIES ? 'failed' : 'queued' };
  }
  const patch =
    'refused' in out
      ? { status: 'unreadable', result: null, model: ASSISTANT_MODEL, read_at: new Date().toISOString() }
      : { status: out.result.readable ? 'read' : 'unreadable', result: out.result, model: out.model, read_at: new Date().toISOString() };
  await db.from('site_reads').update(patch).eq('id', row.id);
  return { ...row, attempts: done, ...patch } as ReadRow;
}

/** The cron's sweep: reads still queued (a photo that arrived while the phone wasn't waiting). */
export async function retryReads(db: Db): Promise<number> {
  if (!readsEnabled()) return 0;
  const { data } = await db.from('site_reads').select('photo_id').eq('status', 'queued').lt('attempts', MAX_TRIES).limit(10);
  let n = 0;
  for (const r of (data ?? []) as { photo_id: string }[]) if ((await runRead(db, r.photo_id))?.status !== 'queued') n++;
  return n;
}

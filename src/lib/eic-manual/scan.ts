import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { recordAi } from '@/lib/ai-usage';
import { ASSISTANT_MODEL, assistantConfigured } from '@/lib/assistant/run';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Reading a photo of a distribution board, or of a paper test sheet or an old certificate's schedule, into circuits (the same client and
 * model as the label reader). What it returns is only ever a suggestion for a person to look over: it is copied from what is on the page,
 * never worked out, and anything it isn't sure of is left out and listed, so a doubtful figure is never put on a certificate for them.
 */

const n = z.number().nullable();
/** A reading that may be shown as "greater than" (">999"). */
const reading = z.union([z.number(), z.string()]).nullable();
export const ScanCircuit = z
  .object({
  n: z.string().nullable(),
  desc: z.string().nullable(),
  ocpd_bs: z.string().nullable(),
  ocpd_type: z.string().nullable(),
  ocpd_a: n,
  ocpd_ka: n,
  rcd: z.boolean().nullable(),
  rcd_type: z.string().nullable(),
  rcd_idn: n,
  rcd_a: n,
  afdd: z.boolean().nullable(),
  r1: reading,
  rn: reading,
  r2: reading,
  r12: reading,
  r2only: reading,
  /** Only when a certificate has more than one board: which one this circuit is on ("DB1"). */
  board: z.string().nullable().optional(),
  ir_v: reading,
  ir_ll: reading,
  ir_le: reading,
  zs: reading,
  rcd_ms: reading,
  /** The fields on this circuit that are hard to read or unsure. */
  unsure: z.array(z.string()),
})
  .partial()
  .extend({ unsure: z.array(z.string()).optional().default([]) });
export const Scan = z.object({
  readable: z.boolean().default(true),
  problem: z.string().nullable().optional().default(null),
  kind: z.enum(['board', 'test_sheet', 'other']).catch('other'),
  board: z.object({ ref: z.string().nullable().optional().default(null), location: z.string().nullable().optional().default(null) }).nullable().optional().default(null),
  circuits: z.array(ScanCircuit).default([]),
});
export type ScanResult = z.infer<typeof Scan>;

const PROMPT =
  'This photo shows part of an electrical installation, taken by an electrician: a consumer unit or distribution board (with its circuit labels and devices), ' +
  'or a paper schedule of circuit details and test results (a test sheet, or the schedule from an older certificate). Copy what is on it into the fields, one entry per circuit, in the order they appear. ' +
  'Rules. Only copy what is printed or written: if a value is missing or can’t be read, give null. Never estimate, calculate or fill in a typical value. ' +
  'On a photo of a board there are no test results: leave every test field (r1, rn, r2, r12, r2only, ir_v, ir_ll, ir_le, zs, rcd_ms) null. ' +
  'n is the way or circuit number as labelled. desc is the circuit’s label as written ("Cooker", "Upstairs sockets"). ' +
  'A breaker marked "B32" is ocpd_type "B" and ocpd_a 32; its standard (ocpd_bs) such as "60898-1" or "61009-1" only if it is printed on it or the sheet. ' +
  'An RCBO or a circuit under an RCD has rcd true; rcd_idn is its rated residual current in mA (30, 100, 300), rcd_type AC, A, F or B if shown, rcd_a its rating if shown. ' +
  'ir_ll and ir_le are in megohms and may be shown as greater than: give ">999" as a string, otherwise a number. Where the sheet says LIM (a limitation) in place of a reading, give the string "LIM". Resistances are ohms. ' +
  'Handwriting you are not sure of: give your best reading in the field AND list the field’s name in that circuit’s unsure array, or give null if you cannot tell at all. ' +
  'board.ref is the board’s name if shown (DB1, CU1), board.location where it is, only if written. ' +
  'If glare, blur or the edge of the photo stops you reading it, set readable to false and say in problem, in a few plain words, what is in the way.';

/** The answer's shape, spelled out: the structured-output mode refuses a schema with this many nullable fields. */
const SHAPE =
  ' Reply with JSON only, no other text, in this shape: {"readable": boolean, "problem": string|null, "kind": "board"|"test_sheet"|"other", "board": {"ref": string|null, "location": string|null}|null, "circuits": [ { ' +
  Object.keys(ScanCircuit.shape)
    .map((k) => `"${k}"`)
    .join(', ') +
  ' } ]}. Numbers are plain numbers, text is a string, anything not shown is null, unsure is an array of field names.';

/** The JSON object in a model's reply (it may be wrapped in a code fence or a sentence). */
export function jsonIn(text: string | undefined): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch {
    return null;
  }
}

/** A photo or a PDF as the model's content block (a PDF's first 12 pages, which is where a certificate's schedules are). */
export async function mediaBlock(bytes: Buffer, mime: string): Promise<Anthropic.Beta.BetaContentBlockParam> {
  if (mime === 'application/pdf') {
    let use: Uint8Array = bytes;
    try {
      const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
      if (src.getPageCount() > 12) {
        const out = await PDFDocument.create();
        (await out.copyPages(src, Array.from({ length: 12 }, (_, i) => i))).forEach((pg) => out.addPage(pg));
        use = await out.save();
      }
    } catch {
      // Sent as it is.
    }
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(use).toString('base64') } };
  }
  return { type: 'image', source: { type: 'base64', media_type: mime as 'image/jpeg' | 'image/png' | 'image/webp', data: bytes.toString('base64') } };
}

export const scanEnabled = () => assistantConfigured();
/** Photos a certificate may read in a day: a personal link that leaks can't run up the bill. */
export const SCANS_PER_DAY = 25;

export async function scansToday(ref: string): Promise<number> {
  const { count } = await createAdminClient().from('ai_usage').select('id', { count: 'exact', head: true }).eq('feature', 'eic_read').eq('ref', ref).gte('at', new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  return count ?? 0;
}

export type Suggested = { id: string; fields: Record<string, unknown>; unsure: string[] };
export type ScanOut = { ok: true; kind: ScanResult['kind']; board: { ref: string | null; location: string | null } | null; circuits: Suggested[]; left_out: number } | { ok: false; error: string };

const TESTS_KEYS = new Set(['r1', 'rn', 'r2', 'r12', 'r2only', 'ir_v', 'ir_ll', 'ir_le', 'zs', 'rcd_ms']);
const FIELDS = ['n', 'desc', 'ocpd_bs', 'ocpd_type', 'ocpd_a', 'ocpd_ka', 'rcd_type', 'rcd_idn', 'rcd_a', 'r1', 'rn', 'r2', 'r12', 'r2only', 'ir_v', 'ir_ll', 'ir_le', 'zs', 'rcd_ms'] as const;

/** The reading as the certificate's circuit record keys it: Yes/No answers as 'yes' and 'no', and only what was read with confidence. */
export function toRecord(c: z.infer<typeof ScanCircuit>): { fields: Record<string, unknown>; left_out: number } {
  const fields: Record<string, unknown> = {};
  let left = 0;
  const doubt = new Set(c.unsure);
  const take = (k: string, v: unknown) => {
    if (v === null || v === undefined || v === '') return;
    // A reading is a number, ">999" or LIM; any other words in a reading's place are not used.
    if (TESTS_KEYS.has(k) && typeof v === 'string') {
      const t = v.trim();
      if (/^lim$/i.test(t)) v = 'LIM';
      else if (/^>\s*\d+(\.\d+)?$/.test(t)) v = `>${t.replace(/^>\s*/, '')}`;
      else if (Number.isFinite(Number(t.replace(',', '.'))) && t) v = Number(t.replace(',', '.'));
      else return;
    }
    if (doubt.has(k)) {
      left++;
      return;
    }
    fields[k] = typeof v === 'string' ? v.trim().slice(0, 200) : v;
  };
  for (const k of FIELDS) take(k, c[k]);
  if (c.rcd != null && !doubt.has('rcd')) fields.rcd = c.rcd ? 'yes' : 'no';
  if (c.afdd != null && !doubt.has('afdd')) fields.afdd = c.afdd ? 'yes' : 'no';
  return { fields, left_out: left };
}

/** One photo read. `ref` is the certificate (for the cost log and the daily limit). */
export async function scanPhoto(bytes: Buffer, mime: string, ref: string): Promise<ScanOut> {
  if (!scanEnabled()) return { ok: false, error: 'Reading photos isn’t switched on for this system yet.' };
  if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(mime)) return { ok: false, error: 'Use a JPEG or PNG photo, or a PDF.' };
  if ((await scansToday(ref)) >= SCANS_PER_DAY) return { ok: false, error: 'That’s a lot of photos for today. Try again tomorrow, or type the rest.' };
  const r = await readCircuits(bytes, mime, ref);
  if (!r) return { ok: false, error: 'It couldn’t make sense of that photo. Try again.' };
  if (!r.readable || !r.circuits.length) return { ok: false, error: r.problem ? `It couldn’t read it: ${r.problem}.` : 'It couldn’t find any circuits in that photo.' };
  let leftOut = 0;
  const circuits = r.circuits.slice(0, 60).map((c, i): Suggested => {
    const t = toRecord(c);
    leftOut += t.left_out;
    return { id: `s${i}`, fields: t.fields, unsure: c.unsure };
  });
  return { ok: true, kind: r.kind, board: r.board, circuits, left_out: leftOut };
}

/** The circuits on a photo or PDF, as the model read them (null when the call or its answer failed). */
export async function readCircuits(bytes: Buffer, mime: string, ref: string, extra = ''): Promise<ScanResult | null> {
  const client = new Anthropic();
  const res = await client.beta.messages.create(
    {
      model: ASSISTANT_MODEL,
      max_tokens: 12000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: [await mediaBlock(bytes, mime), { type: 'text', text: PROMPT + extra + SHAPE }] }],
    },
    { timeout: 90_000 }
  );
  await recordAi('eic_read', res.model, res.usage, ref);
  if (res.stop_reason === 'refusal') return null;
  const last = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').at(-1)?.text;
  const parsed = Scan.safeParse(jsonIn(last));
  if (!parsed.success) {
    console.error('EIC circuits read: unexpected shape', parsed.error.issues.slice(0, 5));
    return null;
  }
  return parsed.data;
}

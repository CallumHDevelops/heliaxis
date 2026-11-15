import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { recordAi } from '@/lib/ai-usage';
import { ASSISTANT_MODEL, assistantConfigured } from '@/lib/assistant/run';
import { EIC_STEPS } from '@/lib/site/forms/electrician/eic';
import { boardKey, circuitKey, newId } from '@/lib/site/forms/electrician/eic-model';
import type { Field } from '@/lib/site/forms/types';
import { jsonIn, mediaBlock, readCircuits, toRecord } from './scan';

/**
 * Converting a certificate someone else made (an NICEIC or NAPIT EIC, as a PDF or a photo) into one of ours. The certificate's own questions
 * are put to the model as a catalogue (each question's key, words and allowed answers), and what comes back is checked against that catalogue:
 * an answer that isn't one of the allowed ones is dropped, and anything the reader was unsure of is left for a person. The schedules of circuits
 * and test results are read the same way as a photo of a board (scan.ts). Signatures are never copied: it has to be signed again by whoever is
 * responsible for it.
 */

type Cat = { key: string; label: string; type: Field['type']; options?: string[]; na?: boolean };

const SKIP = new Set(['eic_route', 'eic_route_why']);
/** Every question the certificate can ask, with what a valid answer looks like. */
export function catalogue(): Cat[] {
  const out: Cat[] = [];
  for (const s of EIC_STEPS) {
    for (const f of s.fields) {
      if (SKIP.has(f.key) || ['CUSTOM', 'PHOTOS', 'AUTO'].includes(f.type)) continue;
      out.push({ key: f.key, label: f.label, type: f.type, options: f.options?.map((o) => o.key), na: f.na });
    }
  }
  return out;
}

const VALID: Record<string, string[]> = {
  TICK: ['done', 'problem', 'na'],
  YN: ['yes', 'no'],
  YNN: ['yes', 'no', 'na'],
  PF: ['pass', 'fail'],
  PFN: ['pass', 'fail', 'na'],
};

/** One answer, kept only if it is a valid one for its question. */
export function cleanAnswer(c: Cat, v: unknown): unknown {
  if (v === null || v === undefined || v === '') return undefined;
  if (VALID[c.type]) return typeof v === 'string' && VALID[c.type].includes(v) ? v : undefined;
  switch (c.type) {
    case 'SEL':
      return typeof v === 'string' && c.options?.includes(v) ? v : undefined;
    case 'MULTI':
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!c.options?.includes(x)) : undefined;
    case 'CONFIRM':
      return v === true ? true : undefined;
    case 'NUM': {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const t = v.trim().replace(',', '.');
        if (/^>\s*\d+(\.\d+)?$/.test(t)) return `>${t.replace(/^>\s*/, '')}`;
        if (c.na && t.toLowerCase() === 'na') return 'na';
        if (t.toLowerCase() === 'lim') return 'LIM';
        const n = Number(t);
        return t && Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    }
    default:
      return typeof v === 'string' ? v.trim().slice(0, 1500) || undefined : undefined;
  }
}

const PROMPT = (cat: Cat[]) =>
  'This is an Electrical Installation Certificate made by another contractor (an NICEIC, NAPIT or similar certificate, the IET model form). ' +
  'Below is a catalogue of the questions our own certificate asks, each with a key, the words, its type and, for choices, the allowed answers. ' +
  'Fill in an answer for every question the certificate you were given actually answers. Copy what is printed or written there; never estimate, work out or guess, and leave out any question the certificate does not answer or that you cannot read. ' +
  'Types: SEL gives one of the allowed keys; YN is "yes" or "no"; YNN is "yes", "no" or "na"; PF is "pass" or "fail"; PFN adds "na"; CONFIRM is true when the box is ticked; TICK is "done" for a tick, "na" for N/A, "problem" for a cross; NUM is a number (or ">999" when shown as greater than, or "LIM" when the certificate says LIM for a limitation); MULTI is an array of allowed keys; TEXT and LONG are the words. ' +
  'The inspection schedule items eic_i1 to eic_i14 are the numbered lines of the schedule of inspections, in order (1.0 to 14.0). ' +
  'eic_work is "new", "addition" or "alteration" depending on whether it is a new installation, an addition or an alteration. ' +
  'Do not read or copy any signature. ' +
  'Also give: route, "eic" if the certificate has separate signatures for design, construction and inspection and testing, or "eic_single" if one person signed it all; scheme, the body named on it ("NICEIC", "NAPIT" or another, else null); certificate_no, its number as printed or null; unsure, the keys you answered but are not sure you read correctly. ' +
  'Reply with JSON only, no other text: {"route": string, "scheme": string|null, "certificate_no": string|null, "answers": { "<key>": <answer> }, "unsure": ["<key>"]}. ' +
  `The catalogue: ${JSON.stringify(cat)}`;

export type Imported = {
  route: 'eic' | 'eic_single';
  scheme: string | null;
  certificate_no: string | null;
  /** key → value, the certificate's own keys (boards and circuits included). */
  values: Record<string, unknown>;
  circuits: number;
  boards: number;
  /** Values the reader was unsure of, left out. */
  left_out: number;
};

export const importEnabled = () => assistantConfigured();

/** Read a whole certificate (PDF, or a photo) into answers. Null when the reading failed. */
export async function importCertificate(bytes: Buffer, mime: string, ref: string): Promise<Imported | null> {
  const cat = catalogue();
  const byKey = new Map(cat.map((c) => [c.key, c]));
  const client = new Anthropic();
  const header = async () => {
    const res = await client.beta.messages.create(
      { model: ASSISTANT_MODEL, max_tokens: 12000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', messages: [{ role: 'user', content: [await mediaBlock(bytes, mime), { type: 'text', text: PROMPT(cat) }] }] },
      { timeout: 90_000 }
    );
    await recordAi('eic_read', res.model, res.usage, ref);
    if (res.stop_reason === 'refusal') return null;
    const last = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').at(-1)?.text;
    return jsonIn(last) as { route?: unknown; scheme?: unknown; certificate_no?: unknown; answers?: Record<string, unknown>; unsure?: unknown } | null;
  };
  const [head, sched] = await Promise.all([header().catch(() => null), readCircuits(bytes, mime, ref, ' This is a whole certificate: read only its Schedule of Circuit Details and Schedule of Test Results, matching each circuit across the two schedules by its number. If there is more than one board, set board on each circuit to that board’s reference.').catch(() => null)]);
  if (!head || typeof head.answers !== 'object' || !head.answers) return null;

  const values: Record<string, unknown> = {};
  const unsure = new Set(Array.isArray(head.unsure) ? head.unsure.filter((x): x is string => typeof x === 'string') : []);
  let left = 0;
  for (const [k, raw] of Object.entries(head.answers)) {
    const c = byKey.get(k);
    if (!c) continue;
    if (unsure.has(k)) {
      left++;
      continue;
    }
    const v = cleanAnswer(c, raw);
    if (v !== undefined && !(Array.isArray(v) && !v.length)) values[k] = v;
  }

  // The schedules: one board per board reference seen (or one board), each circuit as read.
  let boards = 0;
  let circuits = 0;
  if (sched?.circuits.length) {
    const refs = [...new Set(sched.circuits.map((c) => (c.board ?? sched.board?.ref ?? '').trim() || 'DB1'))].slice(0, 6);
    const ids = new Map(refs.map((r, i) => [r, { id: newId(), o: i + 1 }]));
    for (const r of refs) {
      const b = ids.get(r)!;
      values[boardKey(b.id)] = { o: b.o, ref: r, ...(sched.board?.location && refs.length === 1 ? { loc: sched.board.location } : {}) };
      boards++;
    }
    let o = 0;
    for (const c of sched.circuits.slice(0, 80)) {
      const t = toRecord(c);
      left += t.left_out;
      const b = ids.get((c.board ?? sched.board?.ref ?? '').trim() || 'DB1') ?? [...ids.values()][0];
      values[circuitKey(newId())] = { ...t.fields, board: b.id, o: ++o };
      circuits++;
    }
  }
  return {
    route: head.route === 'eic' ? 'eic' : 'eic_single',
    scheme: typeof head.scheme === 'string' ? head.scheme.slice(0, 40) : null,
    certificate_no: typeof head.certificate_no === 'string' ? head.certificate_no.slice(0, 60) : null,
    values,
    circuits,
    boards,
    left_out: left,
  };
}

/**
 * Three-way merge of survey answers, for two phones (or a phone and the office) editing the same
 * survey while one of them had no signal.
 *
 *   base   = the answers this phone last saw from the server
 *   local  = this phone's answers now
 *   server = the server's answers now
 *
 * Per top-level field id (and per key inside `skip` and `send`), and per roof area by id then per
 * field: take the local value where it differs from base, otherwise the server's. Roof areas added
 * on either side are kept; one deleted on one side and untouched on the other is deleted.
 *
 * Pure, type-only imports (scripts/test-survey-rules.mjs runs it).
 */
import type { Answers, RoofAnswers } from './solar-schema';

const MAX_ROOFS = 6;

/** Deep equality that ignores key order (Postgres jsonb reorders keys) and treats null as missing. */
export function same(x: unknown, y: unknown): boolean {
  if (x === y) return true;
  if (x == null || y == null) return x == null && y == null;
  if (typeof x !== 'object' || typeof y !== 'object') return false;
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length) return false;
    return x.every((v, i) => same(v, y[i]));
  }
  const ox = x as Record<string, unknown>;
  const oy = y as Record<string, unknown>;
  const keys = new Set([...Object.keys(ox), ...Object.keys(oy)]);
  for (const k of keys) if (!same(ox[k], oy[k])) return false;
  return true;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});

/** Field-by-field merge of plain objects, ignoring the keys in `except`. */
function mergeFields(base: Obj, local: Obj, server: Obj, except: string[] = []): Obj {
  const out: Obj = {};
  const keys = new Set([...Object.keys(server), ...Object.keys(local)]);
  for (const k of keys) {
    if (except.includes(k)) continue;
    const v = same(local[k], base[k]) ? server[k] : local[k];
    if (v != null) out[k] = v;
  }
  return out;
}

const roofList = (v: unknown): RoofAnswers[] =>
  Array.isArray(v) ? (v.filter((r) => r && typeof r === 'object' && typeof (r as RoofAnswers).id === 'string') as RoofAnswers[]) : [];

export type MergeResult = {
  answers: Answers;
  /** A roof area this phone added under an id the other side also added: it was moved to a free id. */
  renamedRoofs: Record<string, string>;
};

export function mergeSurvey(baseIn: Answers | null | undefined, localIn: Answers, serverIn: Answers | null | undefined): MergeResult {
  const base = obj(baseIn);
  const local = obj(localIn);
  const server = obj(serverIn);
  const out = mergeFields(base, local, server, ['roofs', 'skip', 'send']);

  for (const k of ['skip', 'send'] as const) {
    const m = mergeFields(obj(base[k]), obj(local[k]), obj(server[k]));
    if (Object.keys(m).length) out[k] = m;
  }

  const b = new Map(roofList(base.roofs).map((r) => [r.id, r]));
  const l = new Map(roofList(local.roofs).map((r) => [r.id, r]));
  const s = new Map(roofList(server.roofs).map((r) => [r.id, r]));
  const renamedRoofs: Record<string, string> = {};
  const roofs: RoofAnswers[] = [];
  const order = [...s.keys(), ...[...l.keys()].filter((id) => !s.has(id))];
  const moved: RoofAnswers[] = [];

  for (const id of order) {
    const inB = b.get(id);
    const inL = l.get(id);
    const inS = s.get(id);
    if (inL && inS) {
      if (!inB && !same(inL, inS)) {
        // Both sides added a roof area with this id: keep the server's, move ours to a free id below.
        roofs.push(inS);
        moved.push(inL);
      } else roofs.push({ ...mergeFields(obj(inB), inL, inS), id } as RoofAnswers);
    } else if (inL) {
      // Only here: new on this phone, or deleted on the server (kept if this phone changed it).
      if (!inB || !same(inL, inB)) roofs.push(inL);
    } else if (inS) {
      // Only on the server: new there (kept), or deleted on this phone (deleted).
      if (!inB) roofs.push(inS);
    }
  }
  for (const r of moved) {
    const used = new Set(roofs.map((x) => x.id));
    let free: string | null = null;
    for (let n = 1; n <= MAX_ROOFS && !free; n++) if (!used.has(`r${n}`)) free = `r${n}`;
    if (free) {
      renamedRoofs[r.id] = free;
      roofs.push({ ...r, id: free });
    } else {
      // No free id left: fold it into the server's area with the same id rather than lose it.
      const i = roofs.findIndex((x) => x.id === r.id);
      if (i >= 0) roofs[i] = { ...roofs[i], ...mergeFields({}, r, roofs[i]), id: r.id } as RoofAnswers;
    }
  }
  if (roofs.length || 'roofs' in local || 'roofs' in server) out.roofs = roofs;
  return { answers: out as Answers, renamedRoofs };
}

/** The merged answers only (see mergeSurvey). */
export const mergeAnswers = (base: Answers | null | undefined, local: Answers, server: Answers | null | undefined): Answers =>
  mergeSurvey(base, local, server).answers;

import 'server-only';
import { designOf } from './design';
import type { FormCtx, LabelReadResult } from './forms/types';
import { makeCtx } from './rules';
import type { AssignmentRow, Db } from './server';
import type { Stage } from './types';

const SIDES = ['front', 'rear', 'left', 'right'];
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * The rules' context from what the server holds (photos that have arrived, not the phone's queue),
 * so the gate at sign-off and the flags can't count anything that isn't there.
 */
export async function serverCtx(db: Db, a: AssignmentRow): Promise<FormCtx> {
  const [{ data: p }, { data: surveys }, { data: photos }, { data: reads }, { data: signoffs }] = await Promise.all([
    db.from('crm_projects').select('*').eq('id', a.project_id).maybeSingle(),
    db.from('crm_surveys').select('answers').eq('project_id', a.project_id).eq('type', 'solar').neq('status', 'cancelled').order('updated_at', { ascending: false }).limit(1),
    db.from('crm_photos').select('slot').eq('assignment_id', a.id),
    db.from('site_reads').select('key, status, result').eq('assignment_id', a.id),
    db.from('site_signoffs').select('stage').eq('assignment_id', a.id),
  ]);
  const project = (p ?? {}) as Record<string, unknown>;
  const sys = (project.system ?? {}) as Record<string, unknown>;
  const s1 = ((surveys?.[0] as { answers?: Record<string, unknown> } | undefined)?.answers ?? {}).S1;
  const counts: Record<string, number> = {};
  for (const ph of (photos ?? []) as { slot: string | null }[]) if (ph.slot) counts[ph.slot] = (counts[ph.slot] ?? 0) + 1;
  const address = [...String(project.address ?? '').split(/\n/).map((l) => l.trim()).filter(Boolean), str(project.postcode)].filter(Boolean).join(', ');
  return makeCtx({
    trade: a.trade,
    answers: a.answers,
    design: designOf(sys),
    system: { kwp: num(sys.kwp), panel_count: num(sys.panel_count), panel_model: str(sys.panel_model), inverter_model: str(sys.inverter_model), battery_model: str(sys.battery_model) },
    products: (Array.isArray(project.products) ? project.products : []) as string[],
    sides: Array.isArray(s1) ? (s1 as string[]).filter((x) => SIDES.includes(x)) : [],
    photos: counts,
    reads: ((reads ?? []) as { key: string; status: string; result: LabelReadResult | null }[]).map((r) => ({ key: r.key, status: r.status, result: r.result })),
    address,
    signed: ((signoffs ?? []) as { stage: Stage }[]).map((x) => x.stage),
  });
}

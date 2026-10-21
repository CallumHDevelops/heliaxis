import 'server-only';
import { DOCS_BUCKET } from '@/lib/crm/server';
import type { Db } from '@/lib/site/server';
import { buildPdf } from '@/lib/subcontractors/pdf-engine';
import { libraryGaps } from './facts';
import type { LibraryItem, LibraryKind, ModelDetails } from './inputs';

/**
 * The product library for handover packs (SPEC 4.6): a manufacturer's datasheet, manual, warranty,
 * start-up and shutdown procedure, or a company guide, uploaded once and attached to every job with
 * that model. What a library row says about itself (handover.sql's columns), cleaned from the
 * office's form, and the compacted copy made at upload so packs never squeeze a 40 MB manual again.
 */

const KINDS: LibraryKind[] = ['datasheet', 'manual', 'warranty', 'procedure', 'guide'];
const SLOTS = ['CC4', 'CC5', 'CCMH'];
const TECH = ['solar', 'battery', 'ev', 'heatpump'];
const text = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** The handover columns from a request, only those it names (so the rest of a row is left alone). */
export function libraryFields(b: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('kind' in b) out.kind = KINDS.includes(b.kind as LibraryKind) ? b.kind : null;
  if ('handover_slot' in b) out.handover_slot = SLOTS.includes(String(b.handover_slot)) ? String(b.handover_slot) : null;
  if ('technologies' in b) out.technologies = (Array.isArray(b.technologies) ? b.technologies : []).map(String).filter((t) => TECH.includes(t));
  if ('models' in b) {
    const list = Array.isArray(b.models) ? b.models : String(b.models ?? '').split(/\n|;/);
    out.models = [...new Set(list.map((m) => text(m, 120)).filter(Boolean))].slice(0, 30);
  }
  if ('every_pack' in b) out.every_pack = b.every_pack === true;
  if ('details' in b && b.details && typeof b.details === 'object') {
    const details: Record<string, ModelDetails> = {};
    for (const [model, d] of Object.entries(b.details as Record<string, Record<string, unknown>>).slice(0, 30)) {
      const m = text(model, 120);
      if (!m || !d || typeof d !== 'object') continue;
      const every = text((d.interval as Record<string, unknown> | undefined)?.every, 80);
      const source = text((d.interval as Record<string, unknown> | undefined)?.source, 160);
      details[m] = {
        ...(text(d.ena_id, 60) ? { ena_id: text(d.ena_id, 60) } : {}),
        // An interval prints on F49 with where it came from, so both are needed.
        ...(every && source ? { interval: { every, source } } : {}),
        ...(Array.isArray(d.aliases) ? { aliases: d.aliases.map((a) => text(a, 120)).filter(Boolean).slice(0, 10) } : {}),
      };
    }
    out.details = details;
  }
  return out;
}

/** A smaller copy of a big PDF (pdf-engine re-compresses its photos), kept beside it. Never throws. */
export async function compactLibraryFile(db: Db, id: string, path: string, mime: string | null): Promise<void> {
  try {
    if (mime !== 'application/pdf') return;
    const { data } = await db.storage.from(DOCS_BUCKET).download(path);
    if (!data || data.size < 2 * 1024 * 1024) return;
    const out = await buildPdf([{ bytes: new Uint8Array(await data.arrayBuffer()), mime, name: path.split('/').pop() || 'manual.pdf' }]);
    if (out.keptOriginal || out.bytes.length >= data.size * 0.9) return;
    const compact = `library/compact/${id}.pdf`;
    const up = await db.storage.from(DOCS_BUCKET).upload(compact, out.bytes, { contentType: 'application/pdf', upsert: true });
    if (!up.error) await db.from('crm_library').update({ compact_path: compact }).eq('id', id);
  } catch {
    // The original is used instead.
  }
}

const UPCOMING = ['won', 'design', 'ready', 'install_booked', 'installing'];
const MODEL_KEYS = ['panel_model', 'inverter_model', 'battery_model', 'ev_charger_model', 'heat_pump_model', 'optimiser_model'];

/** "Library gaps" (SPEC 4.6): models on jobs not installed yet with no manual or datasheet, so they're filled before the day. */
export async function upcomingGaps(db: Db): Promise<{ model: string; jobs: { id: string; ref: string | null }[] }[]> {
  const [{ data: jobs }, { data: lib }] = await Promise.all([
    db.from('crm_projects').select('id, project_ref, system').in('stage', UPCOMING).limit(500),
    db.from('crm_library').select('*').is('archived_at', null),
  ]);
  const all = ((lib ?? []) as Record<string, unknown>[]).map(
    (r): LibraryItem => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      kind: (r.kind as LibraryKind) ?? null,
      models: Array.isArray(r.models) ? (r.models as string[]) : [],
      slot: (r.handover_slot as string | null) ?? null,
      technologies: [],
      every_pack: false,
      details: (r.details as LibraryItem['details']) ?? {},
      storage_path: String(r.storage_path ?? ''),
      compact_path: null,
      mime: null,
      size: null,
    })
  );
  const byModel = new Map<string, { id: string; ref: string | null }[]>();
  for (const j of (jobs ?? []) as { id: string; project_ref: string | null; system: Record<string, unknown> | null }[]) {
    const models = MODEL_KEYS.map((k) => j.system?.[k]).filter((m): m is string => typeof m === 'string' && !!m.trim());
    for (const m of libraryGaps(all, models.map((x) => x.trim()))) byModel.set(m, [...(byModel.get(m) ?? []), { id: j.id, ref: j.project_ref }]);
  }
  return [...byModel].map(([model, list]) => ({ model, jobs: list })).sort((a, b) => b.jobs.length - a.jobs.length);
}

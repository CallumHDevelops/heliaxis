import 'server-only';
import { createHash } from 'node:crypto';
import { DOCS_BUCKET, ensureDocsBucket, fingerprintDocument } from '@/lib/crm/server';
import { canonicalJson } from '@/lib/subcontractors/hashing';
import type { Db } from '@/lib/site/server';

/**
 * Generated documents on a job (SPEC 5.5): every version is a crm_documents row with the same
 * generated_key (F43, RF_REPORT, PO-0123), its version number and an inputs_hash (sha256 of the
 * canonical JSON of what it was made from).
 *
 * saveGenerated():
 * 1. same inputs as the current version → nothing new (it's returned as it is);
 * 2. different, but the current version is already visible to the customer → not replaced: it's
 *    out of date, and the office regenerates it on purpose;
 * 3. otherwise the new version is uploaded to crm-docs/projects/<id>/generated/<KEY>-v<n>.pdf,
 *    inserted, the previous version archived (kept, never shown), and fingerprinted.
 */

export type GeneratedDoc = {
  id: string;
  project_id: string;
  name: string;
  storage_path: string;
  version: number;
  inputs_hash: string | null;
  visible: boolean;
  archived_at: string | null;
  generated_key: string;
  handover_slot: string | null;
  release: string;
};

export type SaveGenerated = {
  key: string;
  /** "HX-0042 Roofer report.pdf": the file name the office and customer see (v2 is added by the store). */
  name: string;
  bytes: Uint8Array;
  /** What the document was made from; hashed to decide whether anything changed. */
  inputs: unknown;
  category?: string;
  /** The handover pack item it is (Unit 4), if any. */
  slot?: string | null;
  /** 'now': visible as `visible` says; 'with_pack': made visible when the pack is sent. */
  release?: 'now' | 'with_pack';
  visible?: boolean;
  /** Replace a visible version anyway (the office pressed Regenerate). */
  force?: boolean;
  by?: string | null;
};

export type SaveResult =
  | { status: 'same'; doc: GeneratedDoc }
  | { status: 'out_of_date'; doc: GeneratedDoc; inputsHash: string }
  | { status: 'saved'; doc: GeneratedDoc; replaced: GeneratedDoc | null };

export const inputsHash = (inputs: unknown) => createHash('sha256').update(canonicalJson(inputs)).digest('hex');

/** The current (not archived) version of a generated document, if any. */
export async function currentGenerated(db: Db, projectId: string, key: string): Promise<GeneratedDoc | null> {
  const { data } = await db
    .from('crm_documents')
    .select('*')
    .eq('project_id', projectId)
    .eq('generated_key', key)
    .is('archived_at', null)
    .order('version', { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as GeneratedDoc | undefined) ?? null;
}

/** Is a stored version behind what it would be made from now? */
export const isOutOfDate = (doc: Pick<GeneratedDoc, 'inputs_hash'>, inputs: unknown) => doc.inputs_hash !== inputsHash(inputs);

/**
 * Remember that a pack item's document is behind what it would be made from now (handover.sql), so
 * the Handover tab shows it Out of date until the office regenerates it. Before handover.sql: nothing.
 */
async function markOutOfDate(db: Db, projectId: string, slot: string, key: string, hash: string) {
  try {
    const { data, error } = await db.from('handover_slots').select('*').eq('project_id', projectId).eq('slot', slot).maybeSingle();
    if (error) return;
    const prev = (data?.data ?? {}) as Record<string, unknown>;
    await db
      .from('handover_slots')
      .upsert({ project_id: projectId, slot, na: data?.na ?? false, na_reason: data?.na_reason ?? null, note: data?.note ?? null, data: { ...prev, stale: { key, hash, at: new Date().toISOString() } } }, { onConflict: 'project_id,slot' });
  } catch {
    // The document stays as it is either way.
  }
}

const withVersion = (name: string, v: number) => (v > 1 ? name.replace(/(\.pdf)?$/i, ` v${v}.pdf`) : name.endsWith('.pdf') ? name : `${name}.pdf`);

export async function saveGenerated(db: Db, projectId: string, d: SaveGenerated): Promise<SaveResult> {
  const hash = inputsHash(d.inputs);
  const current = await currentGenerated(db, projectId, d.key);
  if (current && current.inputs_hash === hash) return { status: 'same', doc: current };
  if (current && current.visible && !d.force) {
    if (d.slot) await markOutOfDate(db, projectId, d.slot, d.key, hash);
    return { status: 'out_of_date', doc: current, inputsHash: hash };
  }

  const { data: last } = await db.from('crm_documents').select('version').eq('project_id', projectId).eq('generated_key', d.key).order('version', { ascending: false }).limit(1);
  const version = Number((last ?? [])[0]?.version ?? 0) + 1;
  const path = `projects/${projectId}/generated/${d.key.replace(/[^\w-]+/g, '_')}-v${version}.pdf`;
  await ensureDocsBucket();
  const up = await db.storage.from(DOCS_BUCKET).upload(path, d.bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error(`Couldn’t store ${d.name}: ${up.error.message}`);
  const { data: row, error } = await db
    .from('crm_documents')
    .insert({
      project_id: projectId,
      category: d.category ?? 'commissioning',
      name: withVersion(d.name, version),
      storage_path: path,
      mime: 'application/pdf',
      size: d.bytes.length,
      visible: d.visible ?? false,
      uploaded_by: d.by ?? null,
      source: 'generated',
      generated_key: d.key,
      version,
      inputs_hash: hash,
      handover_slot: d.slot ?? null,
      release: d.release ?? 'now',
    })
    .select('*')
    .single();
  if (error || !row) throw new Error(`Couldn’t save ${d.name}: ${error?.message ?? 'no row'}`);
  // Every older version still current, not just the one read above: two saves at once (the cron and
  // the Handover tab, say) would otherwise leave both in the customer's portal. The newest stays.
  if (current) {
    await db
      .from('crm_documents')
      .update({ archived_at: new Date().toISOString(), archived_by: d.by ?? null, visible: false })
      .eq('project_id', projectId)
      .eq('generated_key', d.key)
      .lt('version', version)
      .is('archived_at', null);
  }
  await fingerprintDocument(String(row.id));
  return { status: 'saved', doc: row as GeneratedDoc, replaced: current };
}

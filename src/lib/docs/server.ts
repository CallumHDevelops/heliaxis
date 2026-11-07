import 'server-only';
import { DOCS_BUCKET } from '@/lib/crm/server';
import { HANDOVER_STAGES } from '@/app/admin/crm/[id]/record-shared';
import { handoverSummary, handoverView } from '@/lib/handover/server';
import { inhouseView } from '@/lib/inhouse/server';
import { GROUPS as INHOUSE_GROUPS } from '@/lib/inhouse/slots';
import { loadViews as proposalViews } from '@/lib/proposal/server';
import { GROUPS as PROPOSAL_GROUPS } from '@/lib/proposal/slots';
import { schemaReady } from '@/lib/schema-ready';
import type { Db } from '@/lib/site/server';
import { formPdf } from '@/lib/templates/pdf';
import { formsReady, listForms } from '@/lib/templates/store';
import { uniqueName, zip, zipName, type ZipEntry } from '@/lib/zip';
import { fileNameFor, headlineOf, itemFrom, shown, type AnySlot, type Pack, type PackItem, type PackKey } from './packs';

export type PacksView = { ref: string | null; stage: string; packs: Pack[]; general: number };

const FORMS_GROUP = { key: 'hpforms', title: 'Heat pump forms' };

/** The heat pump forms as In-House line items: signed is done, begun is waiting, not started is needed. */
async function formItems(db: Db, projectId: string, products: string[], ref: string | null): Promise<PackItem[]> {
  if (!(await formsReady(db))) return [];
  const forms = await listForms(db, projectId, products);
  return forms.map((f) => {
    const state: AnySlot['state'] = f.status === 'signed' ? 'complete' : f.status === 'draft' ? 'waiting' : 'missing';
    const why = f.status === 'signed' ? null : f.status === 'draft' ? (f.progress.left ? `${f.progress.left} of ${f.progress.asked} questions still to answer` : 'Answered: ready to sign') : 'Not started';
    return itemFrom({ code: f.code, title: f.title, state, why, group: FORMS_GROUP.key, hidden: false, counted: true, maker: 'office', docs: [] }, ref, { form: true });
  });
}

/**
 * The three packs on a job, as line items for the Docs tab. The Handover pack carries only its headline here: its own
 * tab-sized screen (HandoverTab) draws its items, which have far more to them (the electrician's sign-offs, the payments).
 * Null when there is no such job.
 */
export async function packsView(db: Db, projectId: string): Promise<PacksView | null> {
  const { data: p } = await db.from('crm_projects').select('project_ref, stage, products').eq('id', projectId).maybeSingle();
  if (!p) return null;
  const ref = (p.project_ref as string | null) ?? null;
  const stage = String(p.stage ?? '');
  const products = ((p.products as string[] | null) ?? []).map(String);
  const schema = await schemaReady();

  const [ih, forms, proposal, handover, general] = await Promise.all([
    inhouseView(db, projectId),
    formItems(db, projectId, products, ref),
    schema.proposal ? proposalViews(db, projectId).catch(() => null) : Promise.resolve(null),
    schema.handover && HANDOVER_STAGES.includes(stage) ? handoverSummary(db, projectId).catch(() => null) : Promise.resolve(null),
    db.from('crm_documents').select('id', { count: 'exact', head: true }).eq('project_id', projectId).is('archived_at', null),
  ]);

  const proposalItems = (proposal ?? []).map((v) => itemFrom(v, ref));
  const inhouseItems = [...forms, ...(ih?.views ?? []).map((v) => itemFrom(v, ref))];
  const packs: Pack[] = [
    {
      key: 'proposal',
      title: 'Proposal',
      blurb: 'What the customer is given before they sign.',
      customer: true,
      ready: schema.proposal,
      groups: PROPOSAL_GROUPS,
      items: shown(proposalItems),
      headline: headlineOf(proposalItems),
    },
    {
      key: 'inhouse',
      title: 'In-House',
      blurb: 'Heliaxis’s own file for the job. Internal: never shown or sent to a customer.',
      customer: false,
      ready: true,
      groups: [FORMS_GROUP, ...INHOUSE_GROUPS],
      items: shown(inhouseItems),
      headline: headlineOf(inhouseItems),
    },
    {
      key: 'handover',
      title: 'Handover',
      blurb: 'What the customer is given when the work is done.',
      customer: true,
      ready: schema.handover,
      groups: [],
      items: [],
      headline: handover
        ? { complete: handover.complete, total: handover.total, open: Math.max(0, handover.total - handover.complete), words: handover.words }
        : { complete: 0, total: 0, open: 0, words: schema.handover ? 'Opens at Ready' : 'Not set up yet' },
    },
  ];
  return { ref, stage, packs, general: general.count ?? 0 };
}

/** A pack's files in one ZIP: every document filed to an item, and the forms drawn as PDFs, each named by its document number. */
export async function packZip(db: Db, projectId: string, key: PackKey): Promise<{ ok: true; bytes: Uint8Array; name: string; count: number } | { ok: false; status: number; error: string }> {
  const { data: p } = await db.from('crm_projects').select('project_ref, stage, products').eq('id', projectId).maybeSingle();
  if (!p) return { ok: false, status: 404, error: 'Not found' };
  const ref = (p.project_ref as string | null) ?? null;
  const products = ((p.products as string[] | null) ?? []).map(String);

  let items: PackItem[] = [];
  if (key === 'proposal') items = (await proposalViews(db, projectId)).map((v) => itemFrom(v, ref));
  else if (key === 'inhouse') {
    const ih = await inhouseView(db, projectId);
    items = [...(await formItems(db, projectId, products, ref)), ...(ih?.views ?? []).map((v) => itemFrom(v, ref))];
  } else {
    const h = await handoverView(db, projectId);
    items = (h?.slots ?? []).map((v) => itemFrom(v, ref));
  }
  items = shown(items).filter((i) => i.state !== 'na');

  const ids = items.flatMap((i) => i.docs.map((d) => d.id));
  const { data: rows } = ids.length ? await db.from('crm_documents').select('id, storage_path, created_at').in('id', ids) : { data: [] as { id: string; storage_path: string; created_at: string }[] };
  const stored = new Map((rows ?? []).map((r) => [String(r.id), r]));

  const entries: ZipEntry[] = [];
  const used = new Set<string>();
  let total = 0;
  const LIMIT = 80 * 1024 * 1024;
  for (const item of items) {
    if (item.form) {
      const r = await formPdf(db, projectId, item.code);
      if (!r.ok) continue;
      entries.push({ name: uniqueName(zipName(`${item.docNo} ${item.title}.pdf`), used), data: r.bytes });
      total += r.bytes.length;
      continue;
    }
    // Newest version of each item's documents; a second upload to the same item keeps its own name.
    for (const d of item.docs) {
      const row = stored.get(d.id);
      if (!row?.storage_path) continue;
      const dl = await db.storage.from(DOCS_BUCKET).download(row.storage_path);
      if (dl.error || !dl.data) continue;
      const data = new Uint8Array(await dl.data.arrayBuffer());
      total += data.length;
      if (total > LIMIT) return { ok: false, status: 413, error: 'These files are too big to zip in one go (80 MB at most). Download them one by one.' };
      const orig = row.storage_path as string;
      const label = item.docs.length > 1 ? `${item.title} - ${d.name}` : item.title;
      entries.push({ name: uniqueName(zipName(fileNameFor({ title: label }, item.docNo, orig)), used), data, at: new Date(row.created_at) });
    }
  }
  if (!entries.length) return { ok: false, status: 404, error: 'Nothing in this pack to download yet.' };
  const title = { proposal: 'Proposal pack', inhouse: 'In-House pack', handover: 'Handover pack' }[key];
  return { ok: true, bytes: zip(entries), name: zipName(`${ref ? `${ref} ` : ''}${title}.zip`), count: entries.length };
}

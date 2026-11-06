/**
 * What the In-House pack's catalogue needs to know about a project, built from the project's own rows (the documents
 * filed to its items, the orders and photos, the RAMS). Pure: the database reads are in server.ts and hand these
 * rows over, so the same assembly is tested without one.
 */
import { stageIndex } from '../crm/stages';
import { NO_RAMS, type RamsFacts, type SlotDoc, type StateCtx } from './slots';

export type InhouseRaw = {
  products: string[];
  postcode: string | null;
  stage: string;
  /** Documents filed to an In-House item (crm_documents.inhouse_slot). */
  docs: { id: string; inhouse_slot: string | null; name: string; created_at: string; mime: string | null; size: number | null }[];
  /** Purchase orders on the project that are not cancelled. */
  orders: number;
  /** Photos in the site photo record. */
  photos: number;
  rams?: RamsFacts;
};

export function contextFrom(raw: InhouseRaw): StateCtx {
  const docs: SlotDoc[] = raw.docs
    .filter((d) => d.inhouse_slot)
    .map((d) => ({ id: d.id, slot: String(d.inhouse_slot), name: d.name, source: 'upload', key: null, visible: false, release: 'office', at: d.created_at, version: 1, mime: d.mime, size: d.size, hash: null }));
  return {
    products: raw.products,
    postcode: raw.postcode,
    docs,
    marks: {},
    rams: raw.rams ?? NO_RAMS,
    // A job that has got past the survey stage has been surveyed.
    surveyed: stageIndex(raw.stage) >= stageIndex('surveyed'),
    orders: raw.orders,
    photos: raw.photos,
  };
}

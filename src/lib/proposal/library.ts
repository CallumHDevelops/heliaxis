/**
 * Universal documents in the Proposal pack: the MCS Customer Commitment, the Consumer Code leaflet, the deposit protection
 * details and the complaints procedure are the same on every job. They are added once to the document library and tagged
 * with the pack item they are (crm_library.proposal_slot, supabase/proposal-library.sql); every job's pack then has them,
 * with nothing to upload per job. Pure: the database read is in server.ts.
 */
import type { GenNeed, ProposalCode, ProposalDoc } from './slots';

export const UNIVERSAL: { code: ProposalCode; title: string }[] = [
  { code: 'HX-PP-05', title: 'MCS Customer Commitment' },
  { code: 'HX-PP-06', title: 'Consumer Code leaflet' },
  { code: 'HX-PP-07', title: 'Deposit protection' },
  { code: 'HX-PP-08', title: 'Complaints procedure' },
];
export const isUniversal = (code: unknown): code is ProposalCode => UNIVERSAL.some((u) => u.code === code);

export type LibraryRow = { id: string; name: string; proposal_slot: string | null; created_at: string; archived_at?: string | null };

/**
 * The library's files for the pack: each as that item's document on every job. An item we would otherwise make ourselves
 * (the complaints procedure) counts as made once its file is in the library, so it never waits on a generator.
 */
export function libraryDocs(rows: LibraryRow[]): { docs: ProposalDoc[]; gen: Partial<Record<ProposalCode, GenNeed>> } {
  const docs: ProposalDoc[] = [];
  const gen: Partial<Record<ProposalCode, GenNeed>> = {};
  for (const r of rows) {
    if (r.archived_at || !isUniversal(r.proposal_slot)) continue;
    docs.push({ id: r.id, slot: r.proposal_slot, name: r.name, source: 'library', key: null, visible: true, at: r.created_at, version: 1, hash: null });
    gen[r.proposal_slot] = { ready: true, hash: 'library' };
  }
  return { docs, gen };
}

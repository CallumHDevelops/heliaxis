import 'server-only';
import { ukDay } from '@/lib/bank-holidays';
import { COMPLAINTS_TITLE, CONTRACT_TITLE, makeComplaints, makeContract, makeProposalCover, PROPOSAL_COVER_TITLE } from '@/lib/documents/proposal/docs';
import { docFileName } from '@/lib/documents/pdf-kit';
import { inputsHash, saveGenerated } from '@/lib/documents/store';
import { addressLines } from '@/lib/handover/facts';
import { getHandoverSettings } from '@/lib/handover/settings';
import { totalsOf, type QuoteContent } from '@/lib/quotes/types';
import type { Db } from '@/lib/site/server';
import { complaintsInput, contractInput, coverInput, type Made, type ProposalFacts } from './inputs';
import { SLOTS, type GenNeed, type ProposalCode } from './slots';

/**
 * The proposal pack's own documents, made from the job (HX-PP-01 covering letter, HX-PP-04 contract
 * of sale with its cancellation form, HX-PP-08 complaints procedure), each made again only when what
 * it's made from changes. A contract the customer has signed is never made again. The quotation the
 * office sent is filed as HX-PP-02, and its MCS performance estimate pages count for HX-PP-03.
 */

type Gen = { key: ProposalCode; title: string; category: string; input: (f: ProposalFacts) => Made<unknown>; make: (input: never) => Promise<Uint8Array> };
const GENS: Gen[] = [
  { key: 'HX-PP-01', title: PROPOSAL_COVER_TITLE, category: 'proposal', input: coverInput, make: makeProposalCover as Gen['make'] },
  { key: 'HX-PP-04', title: CONTRACT_TITLE, category: 'contract', input: contractInput, make: makeContract as Gen['make'] },
  { key: 'HX-PP-08', title: COMPLAINTS_TITLE, category: 'proposal', input: complaintsInput, make: makeComplaints as Gen['make'] },
];
/** Hashed without the day it's made, so it's made again only when its data changes. */
const hashed = (key: string, input: unknown) => ({ key, input: { ...(input as object), issued: undefined } });
const hashOf = (key: string, input: unknown) => inputsHash(hashed(key, input));

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Everything the documents are made from. Null: no such job. */
export async function proposalFacts(db: Db, projectId: string): Promise<ProposalFacts | null> {
  const { data: p } = await db.from('crm_projects').select('*').eq('id', projectId).maybeSingle();
  if (!p) return null;
  const [{ data: c }, { data: owner }, { data: quotes }, { data: signedDocs }, settings] = await Promise.all([
    db.from('enquiries').select('name, postcode').eq('id', String(p.enquiry_id)).maybeSingle(),
    p.owner_id ? db.from('profiles').select('full_name').eq('id', String(p.owner_id)).maybeSingle() : Promise.resolve({ data: null }),
    db.from('crm_quotes').select('number, title, status, content, valid_until, deposit_pence, document_id, sent_at, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(20),
    db.from('crm_documents').select('id').eq('project_id', projectId).in('category', ['quote', 'contract']).not('signed_outside_at', 'is', null).limit(1),
    getHandoverSettings(),
  ]);
  const qs = (quotes ?? []) as Record<string, unknown>[];
  const sent = qs.filter((q) => q.status === 'sent' || q.status === 'accepted').sort((a, b) => String(b.sent_at ?? '').localeCompare(String(a.sent_at ?? '')));
  const q = sent[0] ?? qs[0] ?? null;
  const t = q?.content ? totalsOf(q.content as QuoteContent) : null;
  const name = String(c?.name ?? '').trim();
  const products = ((p.products as string[] | null) ?? []).map(String);
  const postcode = str(p.postcode) ?? str(c?.postcode);
  return {
    today: ukDay(new Date()),
    ref: str(p.project_ref),
    customer: { name, first: name.split(/\s+/)[0] || '' },
    address: addressLines(str(p.address), postcode),
    postcode,
    products,
    owner: str((owner as { full_name?: string } | null)?.full_name),
    quote:
      q && t
        ? {
            number: str(q.number),
            title: str(q.title),
            on: ukDay(String(q.sent_at ?? q.created_at)),
            validUntil: str(q.valid_until),
            net: t.net,
            vat: t.vat,
            gross: t.gross,
            byRate: t.byRate,
            depositPence: Number(q.deposit_pence) > 0 ? Number(q.deposit_pence) : p.deposit_amount ? Math.round(Number(p.deposit_amount) * 100) : null,
            hasEstimate: !!(q.content as QuoteContent).proposal?.options?.length,
          }
        : null,
    installOn: str(p.install_at) ? ukDay(String(p.install_at)) : null,
    signed: !!p.accepted_at || !!(signedDocs ?? []).length,
    warrantyYears: settings.warrantyYears,
    contents: SLOTS.filter((s) => s.code !== 'HX-PP-01' && !s.optional && s.applies({ products }) === null).map((s) => s.title),
  };
}

/** What each of our documents needs, or the hash of what it would be made from now. */
export function proposalNeeds(f: ProposalFacts): Partial<Record<ProposalCode, GenNeed>> {
  const out: Partial<Record<ProposalCode, GenNeed>> = {};
  for (const g of GENS) {
    const m = g.input(f);
    out[g.key] = m.ok ? { ready: true, hash: hashOf(g.key, m.input) } : { ready: false, why: m.why, fix: m.fix };
  }
  return out;
}

/** The sent quotation's own PDF, filed as the pack's quotation (HX-PP-02) if it isn't filed yet. */
async function fileQuote(db: Db, projectId: string): Promise<void> {
  const { data: qs } = await db.from('crm_quotes').select('document_id, status, sent_at').eq('project_id', projectId).in('status', ['sent', 'accepted']).order('sent_at', { ascending: false }).limit(1);
  const docId = (qs ?? [])[0]?.document_id as string | undefined;
  if (!docId) return;
  const { data: filed } = await db.from('crm_documents').select('id').eq('project_id', projectId).eq('proposal_slot', 'HX-PP-02').is('archived_at', null).limit(1);
  if ((filed ?? []).length) return;
  await db.from('crm_documents').update({ proposal_slot: 'HX-PP-02' }).eq('id', docId).eq('project_id', projectId).is('proposal_slot', null);
}

/**
 * Make what can be made now: each document whose inputs changed (a new version; the store archives
 * the old one). Never the contract once the customer has signed. Best-effort: a fault here never
 * stops the Docs tab or the customer's page loading.
 */
export async function refreshProposal(db: Db, projectId: string, by: string | null = null): Promise<string[]> {
  const made: string[] = [];
  const f = await proposalFacts(db, projectId);
  if (!f) return made;
  await fileQuote(db, projectId).catch(() => null);
  const { data: docs } = await db.from('crm_documents').select('id, generated_key, inputs_hash, version').eq('project_id', projectId).in('generated_key', GENS.map((g) => g.key)).is('archived_at', null);
  for (const g of GENS) {
    if (g.key === 'HX-PP-04' && f.signed) continue;
    const m = g.input(f);
    if (!m.ok) continue;
    const hash = hashOf(g.key, m.input);
    const cur = (docs ?? []).filter((d) => d.generated_key === g.key).sort((a, b) => Number(b.version) - Number(a.version))[0];
    if (cur?.inputs_hash === hash) continue;
    const r = await saveGenerated(db, projectId, {
      key: g.key,
      name: docFileName(f.ref, '', g.title),
      bytes: await g.make(m.input as never),
      inputs: hashed(g.key, m.input),
      category: g.category,
      slot: null,
      release: 'now',
      visible: false,
      force: true,
      by,
    });
    if (r.status === 'saved') {
      await db.from('crm_documents').update({ proposal_slot: g.key }).eq('id', r.doc.id);
      made.push(g.key);
    }
  }
  return made;
}

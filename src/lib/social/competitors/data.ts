import 'server-only';
import { parseKv, toKv } from '@/lib/kv-json';
import { createAdminClient } from '@/lib/supabase/admin';
import { SEED_GEO_PROMPTS, SEED_SUGGESTED, SEED_TRACKED, seedKeywords } from './seed';

export type Competitor = {
  id: string;
  name: string;
  is_self: boolean;
  website: string | null;
  base_location: string | null;
  scope: string;
  facebook_url: string | null;
  instagram_username: string | null;
  trustpilot_url: string | null;
  google_place_id: string | null;
  tracked: boolean;
  notes: string | null;
};

const LEGAL_KEY = 'social-phase4-legal';
export type LegalSignOff = { signed_by: string; signed_at: string; version: number };

export async function getLegalSignOff(): Promise<LegalSignOff | null> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', LEGAL_KEY).maybeSingle();
    const v = parseKv<LegalSignOff>(data?.value);
    return v.signed_at && v.signed_by ? (v as LegalSignOff) : null;
  } catch {
    return null;
  }
}

export async function saveLegalSignOff(s: LegalSignOff) {
  const { error } = await createAdminClient().from('cms_kv').upsert({ key: LEGAL_KEY, value: toKv(s), updated_at: new Date().toISOString() });
  if (error) throw new Error(`Could not save: ${error.message}`);
}

/** True when the Phase 4 tables exist (social-insights.sql has been run). */
export async function competitorTablesReady(): Promise<boolean> {
  try {
    const { error } = await createAdminClient().from('social_competitor').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * First visit: puts Heliaxis itself, the six tracked competitors, the suggestions, the 40 search terms and the ten
 * AI-answer questions in. Safe to call again: it only fills in what is missing. The tracked six are marked as
 * approved by whoever opened the page first (the brief named them); the suggestions are not tracked until approved.
 */
export async function ensureSeed(actorId: string | null): Promise<void> {
  const db = createAdminClient();
  const { count } = await db.from('social_competitor').select('id', { count: 'exact', head: true });
  if (!count) {
    const now = new Date().toISOString();
    await db.from('social_competitor').insert({ name: 'Heliaxis', is_self: true, website: 'https://heliaxis.co.uk', base_location: 'Newport, South Wales', tracked: true, tracked_since: now.slice(0, 10) });
    await db.from('social_competitor').insert(
      SEED_TRACKED.map((c) => ({ name: c.name, base_location: c.base_location, website: c.website ?? null, notes: c.notes ?? 'From the brief. Unverified: check the details.', tracked: true, tracked_since: now.slice(0, 10), approved_by: actorId, approved_at: now }))
    );
    await db.from('social_competitor_suggestion').insert(SEED_SUGGESTED.map((c) => ({ name: c.name, base_location: c.base_location, evidence: [{ url: '', note: 'From the brief (25 Oct 2026 research). Unverified.' }], found_by: 'baseline-research' })));
  }
  const { count: kw } = await db.from('social_seo_keyword').select('id', { count: 'exact', head: true });
  if (!kw) await db.from('social_seo_keyword').insert(seedKeywords());
  const { count: gp } = await db.from('social_geo_prompt').select('id', { count: 'exact', head: true });
  if (!gp) await db.from('social_geo_prompt').insert(SEED_GEO_PROMPTS);
}

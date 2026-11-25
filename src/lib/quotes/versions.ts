import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanContent, totalsOf, type QuoteContent } from './types';

/**
 * The version history of a draft quote (supabase/quote-versions.sql). A change is always a new version: nothing is
 * written over a version that exists. The meta holds the design inputs the quote was made from, so a change to the
 * panel count can re-run the design checks.
 */

export type QuoteMeta = {
  customerType: 'domestic' | 'commercial';
  systemType: 'grid-tied' | 'off-grid';
  panelSku: string | null;
  panelCount: number | null;
  inverterSku: string | null;
  batterySku: string | null;
  batteryCount: number;
  dailyLoadKwh: number | null;
  peakLoadKw: number | null;
  generatorBackup: boolean;
  kwp: number | null;
};

export type QuoteVersion = { version: number; title: string; content: QuoteContent; validUntil: string | null; meta: Partial<QuoteMeta>; summary: string | null; changes: string[]; totalGrossPence: number; createdAt: string };

export const VERSIONS_NOT_READY = 'Quote versions aren’t set up yet: supabase/quote-versions.sql needs running in Supabase before I can change a quote (I won’t overwrite one without keeping the old version).';
const missingTable = (e: { message: string; code?: string }) => e.code === '42P01' || /does not exist|schema cache|PGRST205/i.test(e.message);

type Row = { version: number; title: string; content: unknown; valid_until: string | null; meta: Partial<QuoteMeta> | null; summary: string | null; changes: string[] | null; total_gross_pence: number | null; created_at: string };
const toVersion = (r: Row): QuoteVersion => ({ version: r.version, title: r.title, content: cleanContent(r.content), validUntil: r.valid_until, meta: r.meta ?? {}, summary: r.summary, changes: r.changes ?? [], totalGrossPence: r.total_gross_pence ?? totalsOf(cleanContent(r.content)).gross, createdAt: r.created_at });
const COLS = 'version, title, content, valid_until, meta, summary, changes, total_gross_pence, created_at';

export async function listVersions(db: SupabaseClient, quoteId: string): Promise<{ versions: QuoteVersion[] } | { error: string }> {
  const { data, error } = await db.from('crm_quote_versions').select(COLS).eq('quote_id', quoteId).order('version', { ascending: false });
  if (error) return { error: missingTable(error) ? VERSIONS_NOT_READY : `Couldn't read the versions: ${error.message}` };
  return { versions: (data as Row[]).map(toVersion) };
}

export type NewVersion = { title: string; content: QuoteContent; validUntil: string | null; meta: Partial<QuoteMeta>; summary: string | null; changes: string[]; by: string | null };

/** Save the next version number after the latest. Fails rather than overwriting if two saves race for the same number. */
export async function saveVersion(db: SupabaseClient, quoteId: string, v: NewVersion): Promise<{ version: number } | { error: string }> {
  const { data: last, error: e1 } = await db.from('crm_quote_versions').select('version').eq('quote_id', quoteId).order('version', { ascending: false }).limit(1);
  if (e1) return { error: missingTable(e1) ? VERSIONS_NOT_READY : e1.message };
  const version = Number(last?.[0]?.version ?? 0) + 1;
  const { error } = await db.from('crm_quote_versions').insert({ quote_id: quoteId, version, title: v.title, content: v.content, valid_until: v.validUntil, meta: v.meta, summary: v.summary, changes: v.changes, total_gross_pence: totalsOf(v.content).gross, created_by: v.by });
  if (error) return { error: error.code === '23505' ? 'Someone else changed this quote at the same moment. Try again.' : error.message };
  return { version };
}

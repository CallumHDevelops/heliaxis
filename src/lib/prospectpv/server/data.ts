/** Server-only loaders for the admin screens. Every read runs as the signed-in user (RLS applies). */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assetPublicUrl } from '../images';
import type { AssetUrls } from '../letterData';
import { parseAdminSettings, type AdminSettings } from '../settings';
import type { LetterData, PackageRow } from '../types';

type Db = SupabaseClient;

const fail = (what: string, e: { message: string }) => new Error(`Couldn’t load ${what}: ${e.message}`);

export async function loadSettings(db: Db): Promise<AdminSettings> {
  const { data, error } = await db.from('pv_settings').select('key, value');
  if (error) throw fail('settings', error);
  return parseAdminSettings(Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value])));
}

export async function loadRawSettings(db: Db): Promise<Record<string, unknown>> {
  const { data, error } = await db.from('pv_settings').select('key, value');
  if (error) throw fail('settings', error);
  return Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value]));
}

export type AssetRow = { slot: string; storage_path: string | null; alt_text: string | null };

export async function loadAssets(db: Db): Promise<AssetRow[]> {
  const { data, error } = await db.from('pv_letter_assets').select('slot, storage_path, alt_text').order('slot');
  if (error) throw fail('images', error);
  return (data ?? []) as AssetRow[];
}

export function publicAssetUrl(path: string): string {
  return assetPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '', path);
}

export function assetUrls(rows: AssetRow[]): AssetUrls {
  return Object.fromEntries(rows.filter((r) => r.storage_path).map((r) => [r.slot, publicAssetUrl(r.storage_path!)])) as AssetUrls;
}

export async function loadPackages(db: Db): Promise<PackageRow[]> {
  const { data, error } = await db.from('pv_packages').select('*').order('min_panels').order('display_order');
  if (error) throw fail('packages', error);
  return (data ?? []) as PackageRow[];
}

export type ExtraAdminRow = { id: string; key: string; name: string; description: string | null; price: number | null; active: boolean; display_order: number };

export async function loadExtras(db: Db): Promise<ExtraAdminRow[]> {
  const { data, error } = await db.from('pv_extras').select('id, key, name, description, price, active, display_order').order('display_order');
  if (error) throw fail('extras', error);
  return (data ?? []).map((r) => ({ ...r, price: r.price === null ? null : Number(r.price) })) as ExtraAdminRow[];
}

export type TemplateRow = { template_key: number; name: string; version: number; copy_blocks: Record<string, string>; enabled: boolean };

export async function loadTemplates(db: Db): Promise<TemplateRow[]> {
  const { data, error } = await db.from('pv_letter_templates').select('template_key, name, version, copy_blocks, enabled').order('template_key').order('version', { ascending: false });
  if (error) throw fail('templates', error);
  // Latest version of each template.
  const seen = new Set<number>();
  return ((data ?? []) as TemplateRow[]).filter((t) => (seen.has(t.template_key) ? false : (seen.add(t.template_key), true)));
}

// --- Letters ---------------------------------------------------------------

export type LetterFilters = { q?: string; show?: 'all' | 'viewed' | 'unviewed' | 'booked'; template?: number; source?: 'manual' | 'scan'; page?: number };
export const PAGE_SIZE = 40;

export type LetterListRow = {
  id: string;
  code: string;
  uprn: number;
  address: { line1: string; line2: string | null; town: string; postcode: string };
  packageName: string | null;
  panels: number | null;
  templateKey: number;
  createdAt: string;
  views: number;
  booked: boolean;
  source: 'manual' | 'scan';
};

const CODE = /^[2-9A-HJ-NP-Za-hj-np-z]{8}$/;
/** Characters with meaning inside a PostgREST filter, removed from search text. */
const cleanQ = (q: string) => q.replace(/[,()*%\\:"']/g, ' ').trim().slice(0, 60);

export const displayUprn = (uprn: number | string) => (Number(uprn) < 0 ? `M${Math.abs(Number(uprn))}` : String(uprn));

type Embedded = { address_line1: string; address_line2: string | null; town: string; postcode: string };

export async function listLetters(db: Db, f: LetterFilters): Promise<{ rows: LetterListRow[]; total: number; page: number }> {
  const q = cleanQ(f.q ?? '');
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const searchAddress = q !== '' && !CODE.test(q);
  const select = [
    'id, short_code, uprn, template_key, created_at, view_count, source, printed_values',
    `pv_properties${searchAddress ? '!inner' : ''}(address_line1, address_line2, town, postcode)`,
    'pv_packages(name)',
    `pv_responses${f.show === 'booked' ? '!inner' : ''}(type)`,
  ].join(', ');
  let query = db.from('pv_letters').select(select, { count: 'exact' }).order('created_at', { ascending: false });
  if (q && CODE.test(q)) query = query.eq('short_code', q.toUpperCase());
  if (searchAddress) {
    query = query.or(`address_line1.ilike.%${q}%,postcode.ilike.%${q}%,town.ilike.%${q}%`, { referencedTable: 'pv_properties' });
  }
  if (f.show === 'viewed') query = query.gt('view_count', 0);
  if (f.show === 'unviewed') query = query.eq('view_count', 0);
  if (f.show === 'booked') query = query.eq('pv_responses.type', 'booking');
  if (f.template) query = query.eq('template_key', f.template);
  if (f.source) query = query.eq('source', f.source);
  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw fail('letters', error);

  type Raw = {
    id: string; short_code: string; uprn: number; template_key: number; created_at: string; view_count: number; source: 'manual' | 'scan';
    printed_values: LetterData | null; pv_properties: Embedded | Embedded[] | null; pv_packages: { name: string } | { name: string }[] | null;
    pv_responses: { type: string }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const rows = ((data ?? []) as unknown as Raw[]).map((r): LetterListRow => {
    const a = one(r.pv_properties);
    return {
      id: r.id, code: r.short_code, uprn: Number(r.uprn),
      address: { line1: a?.address_line1 ?? r.printed_values?.address.line1 ?? '', line2: a?.address_line2 ?? null, town: a?.town ?? '', postcode: a?.postcode ?? '' },
      packageName: one(r.pv_packages)?.name ?? r.printed_values?.package.name ?? null,
      panels: r.printed_values?.estimate.panelCount ?? null,
      templateKey: r.template_key, createdAt: r.created_at, views: r.view_count,
      booked: (r.pv_responses ?? []).some((x) => x.type === 'booking'), source: r.source,
    };
  });
  return { rows, total: count ?? rows.length, page };
}

export type LetterDetail = {
  id: string; code: string; uprn: number; templateKey: number; templateVersion: number; createdAt: string; expiresAt: string;
  source: 'manual' | 'scan'; views: number; firstViewedAt: string | null; lastViewedAt: string | null; campaignName: string;
  data: LetterData; packageName: string | null;
  assessment: { storeys: number | null; elevation_width_m: number | null; scaffold_est: number | null; panel_count: number | null } | null;
  responses: { id: string; type: string; payload: Record<string, unknown>; createdAt: string }[];
};

export async function getLetter(db: Db, id: string): Promise<LetterDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db
    .from('pv_letters')
    .select('id, short_code, uprn, campaign_id, template_key, template_version, created_at, expires_at, source, view_count, first_viewed_at, last_viewed_at, printed_values, pv_campaigns(name), pv_packages(name), pv_responses(id, type, payload, created_at)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw fail('the letter', error);
  if (!data) return null;
  const r = data as unknown as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: a } = await db.from('pv_roof_assessments').select('storeys, elevation_width_m, scaffold_est, panel_count').eq('campaign_id', r.campaign_id).eq('uprn', r.uprn).maybeSingle();
  const one = (v: any) => (Array.isArray(v) ? v[0] : v); // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: r.id, code: r.short_code, uprn: Number(r.uprn), templateKey: r.template_key, templateVersion: r.template_version,
    createdAt: r.created_at, expiresAt: r.expires_at, source: r.source, views: r.view_count, firstViewedAt: r.first_viewed_at,
    lastViewedAt: r.last_viewed_at, campaignName: one(r.pv_campaigns)?.name ?? '', data: r.printed_values as LetterData,
    packageName: one(r.pv_packages)?.name ?? null,
    assessment: a ? { storeys: a.storeys, elevation_width_m: a.elevation_width_m === null ? null : Number(a.elevation_width_m), scaffold_est: a.scaffold_est === null ? null : Number(a.scaffold_est), panel_count: a.panel_count } : null,
    responses: ((r.pv_responses ?? []) as any[]) // eslint-disable-line @typescript-eslint/no-explicit-any
      .map((x) => ({ id: x.id, type: x.type, payload: x.payload ?? {}, createdAt: x.created_at }))
      .sort((x, y) => y.createdAt.localeCompare(x.createdAt)),
  };
}

export { overlayImages as withCurrentImages } from '../images';

import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestMention } from '../ingest';
import { platformGet } from '../readonlyGuard';
import type { NormalisedMention } from '../types';

/**
 * Trustpilot reviews, read through the public Business Units API with the API key (no password or secret is
 * needed to read published reviews). Polled every 15 minutes by the every-minute job. Read only.
 */

export type TrustpilotReview = {
  id?: string;
  stars?: number;
  title?: string;
  text?: string;
  createdAt?: string;
  updatedAt?: string;
  consumer?: { id?: string; displayName?: string };
  companyReply?: unknown;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

export function normaliseTrustpilotReview(r: TrustpilotReview, now = new Date()): NormalisedMention | null {
  const id = str(r.id);
  if (!id) return null;
  const title = str(r.title);
  const body = str(r.text);
  const stars = typeof r.stars === 'number' && r.stars >= 1 && r.stars <= 5 ? Math.round(r.stars) : null;
  const created = r.createdAt && !Number.isNaN(Date.parse(r.createdAt)) ? new Date(r.createdAt).toISOString() : now.toISOString();
  return {
    platform: 'trustpilot',
    platformId: id,
    platformPostId: null,
    postPermalink: null,
    commentPermalink: `https://www.trustpilot.com/reviews/${id}`,
    parentPlatformId: null,
    kind: 'review',
    authorDisplayName: str(r.consumer?.displayName) || null,
    authorPlatformId: str(r.consumer?.id) || null,
    authorIsOwn: false,
    text: [title, body].filter(Boolean).join(' — '),
    rating: stars,
    createdAt: created,
    removed: false,
    raw: r,
  };
}

const POLL_EVERY_MS = 14 * 60_000;

/** Fetches the newest reviews and saves any that are new or changed. Skips if polled in the last 14 minutes. */
export async function pollTrustpilot(now = Date.now()): Promise<{ polled: boolean; reviews?: number; error?: string }> {
  const key = process.env.TRUSTPILOT_API_KEY;
  const unit = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
  if (!key || !unit) return { polled: false };
  const db = createAdminClient();
  const { data: st } = await db.from('social_connector_status').select('updated_at').eq('source', 'trustpilot').maybeSingle();
  if (st?.updated_at && now - Date.parse(st.updated_at) < POLL_EVERY_MS) return { polled: false };

  const stamp = new Date(now).toISOString();
  const r = await platformGet<{ reviews?: TrustpilotReview[] }>(`https://api.trustpilot.com/v1/business-units/${encodeURIComponent(unit)}/reviews?orderBy=createdat.desc&perPage=20`, key, { apikey: key });
  if (!r.ok) {
    await db.from('social_connector_status').upsert({ source: 'trustpilot', status: r.status === 401 || r.status === 403 ? 'red' : 'amber', last_error: r.error.slice(0, 300), last_error_at: stamp, updated_at: stamp }, { onConflict: 'source' });
    return { polled: true, error: r.error };
  }
  let n = 0;
  for (const raw of r.data.reviews ?? []) {
    const m = normaliseTrustpilotReview(raw, new Date(now));
    if (!m) continue;
    await ingestMention(m).catch(() => undefined);
    n++;
  }
  await db.from('social_connector_status').upsert({ source: 'trustpilot', status: 'green', last_success_at: stamp, last_error: null, updated_at: stamp }, { onConflict: 'source' });
  return { polled: true, reviews: n };
}

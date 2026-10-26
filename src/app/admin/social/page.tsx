import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { schemaReady } from '@/lib/schema-ready';
import { AdminShell } from '@/components/admin/AdminShell';
import { ago, byUrgency, PLATFORM_LABEL, SEVERITY_LABEL, STATUS_LABEL, TYPE_LABEL } from './labels';
import './social.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Social monitoring · Heliaxis',
  robots: { index: false, follow: false },
};

type Row = {
  id: string;
  platform: string;
  kind: string;
  text: string;
  severity: string | null;
  comment_type: string | null;
  status: string;
  author_display_name: string | null;
  created_at: string;
  removed_at_source: boolean;
};

const FILTERS = [
  { key: 'open', label: 'To do' },
  { key: 'critical', label: 'Critical and High' },
  { key: 'quotes', label: 'Quote requests' },
  { key: 'done', label: 'Done' },
  { key: 'ignored', label: 'Ignored by the AI' },
] as const;

/**
 * Operations › Social monitoring › Inbox. Comments and reviews that need a person, most urgent first.
 * Nothing here posts, hides or deletes anything on a platform: replies are copied and posted by hand.
 */
export default async function SocialMonitoringPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const session = await requirePortal('social_monitoring');
  if (!session) redirect('/admin');
  const ready = await schemaReady();
  const isAdmin = session.profile.role === 'admin';
  const { view = 'open' } = await searchParams;

  let conn: { lastIngest: string | null; lastRejected: string | null; statuses: { source: string; status: string; last_error: string | null }[] } | null = null;
  let rows: Row[] = [];
  let safetyIds = new Set<string>();
  let counts = { open: 0, critical: 0, quotes: 0 };
  if (ready.social) {
    const db = createAdminClient();
    if (isAdmin) {
      const [ing, rej, st] = await Promise.all([
        db.from('social_ingest_event').select('received_at').eq('source', 'meta-webhook').order('id', { ascending: false }).limit(1).maybeSingle(),
        db.from('social_ingest_event').select('received_at').eq('source', 'meta-webhook-rejected').order('id', { ascending: false }).limit(1).maybeSingle(),
        db.from('social_connector_status').select('source, status, last_error'),
      ]);
      conn = { lastIngest: ing.data?.received_at ?? null, lastRejected: rej.data?.received_at ?? null, statuses: (st.data ?? []) as { source: string; status: string; last_error: string | null }[] };
    }
    const { data } = await db
      .from('social_mention')
      .select('id, platform, kind, text, severity, comment_type, status, author_display_name, created_at, removed_at_source')
      .eq('is_synthetic', false)
      .eq('author_is_own', false)
      .eq('hidden_from_queue', false)
      .order('created_at', { ascending: false })
      .limit(400);
    const all = (data ?? []) as Row[];
    const isOpen = (r: Row) => r.status !== 'posted' && r.status !== 'dismissed' && r.severity !== 'ignore';
    const open = all.filter(isOpen);
    counts = {
      open: open.length,
      critical: open.filter((r) => r.severity === 'critical' || r.severity === 'high').length,
      quotes: open.filter((r) => r.comment_type === 'quote_request').length,
    };
    rows =
      view === 'ignored'
        ? all.filter((r) => r.severity === 'ignore').slice(0, 100)
        : view === 'done'
        ? all.filter((r) => !isOpen(r) && r.severity !== 'ignore').slice(0, 100)
        : view === 'critical'
          ? open.filter((r) => r.severity === 'critical' || r.severity === 'high')
          : view === 'quotes'
            ? open.filter((r) => r.comment_type === 'quote_request')
            : open;
    rows = [...rows].sort(view === 'done' || view === 'ignored' ? (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) : byUrgency);
    if (rows.length) {
      const { data: cls } = await db.from('social_classification').select('mention_id, safety_related').in('mention_id', rows.map((r) => r.id)).eq('safety_related', true);
      safetyIds = new Set((cls ?? []).map((c) => c.mention_id as string));
    }
  }

  return (
    <AdminShell active="social">
      <div className="sm-page">
        <header className="sm-head">
          <div>
            <h1>Social monitoring</h1>
            <p className="sm-sub">Comments and reviews about Heliaxis. Replies are copied and posted by hand: nothing is ever posted, hidden or deleted for you.</p>
          </div>
          <span className="sm-headlinks">
            <Link href="/admin/social/insights" className="sm-btn">
              Insights
            </Link>
            <Link href="/admin/social/competitors" className="sm-btn">
              Competitors
            </Link>
            <Link href="/admin/social/costs" className="sm-btn">
              Costs and savings
            </Link>
          </span>
        </header>

        {!ready.social ? (
          <p className="sm-empty">
            Social monitoring isn&apos;t set up in the database yet.
            {isAdmin ? (
              <>
                {' '}
                Run <code>social-monitoring.sql</code> from the <Link href="/admin">dashboard setup to-dos</Link> (it&apos;s safe to run twice).
              </>
            ) : (
              ' Ask an admin to finish the setup.'
            )}
          </p>
        ) : (
          <>
            {conn && (
              <p className="sm-sub sm-conn">
                {conn.lastIngest ? `Last comment delivery from Meta: ${ago(conn.lastIngest)}.` : 'No comment has reached Heliaxis from Meta yet: check the webhook to-do.'}
                {conn.lastRejected ? ` A delivery was rejected ${ago(conn.lastRejected)} (signature check failed: check META_APP_SECRET).` : ''}
                {conn.statuses.filter((c) => c.status !== 'green').map((c) => ` ${PLATFORM_LABEL[c.source] ?? c.source}: ${c.status}${c.last_error ? ` (${c.last_error})` : ''}.`)}
              </p>
            )}
            <nav className="sm-tabs" aria-label="Filter">
              {FILTERS.map((f) => (
                <Link key={f.key} href={f.key === 'open' ? '/admin/social' : `/admin/social?view=${f.key}`} className={view === f.key || (f.key === 'open' && !FILTERS.some((x) => x.key === view)) ? 'sm-tab on' : 'sm-tab'}>
                  {f.label}
                  {f.key !== 'done' && f.key !== 'ignored' && <span>{counts[f.key]}</span>}
                </Link>
              ))}
            </nav>

            {rows.length === 0 ? (
              <p className="sm-empty">{view === 'done' ? 'Nothing finished yet.' : view === 'ignored' ? 'Nothing has been ignored.' : 'Nothing waiting. New comments and reviews will appear here, and you will be notified of anything risky.'}</p>
            ) : (
              <ul className="sm-list">
                {rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/social/review/${r.id}`} className={`sm-row is-${r.severity ?? 'medium'}`}>
                      <span className={`sm-sev is-${r.severity ?? 'medium'}`}>{SEVERITY_LABEL[r.severity ?? 'medium']}</span>
                      <span className="sm-main">
                        <b>{r.text.replace(/\s+/g, ' ').slice(0, 160) || '(no text)'}</b>
                        <small>
                          {PLATFORM_LABEL[r.platform] ?? r.platform} {r.kind === 'review' ? 'review' : r.kind === 'reply' ? 'reply' : 'comment'}
                          {r.author_display_name ? ` · ${r.author_display_name}` : ''} · {ago(r.created_at)}
                          {r.removed_at_source ? ' · removed at source' : ''}
                        </small>
                      </span>
                      {safetyIds.has(r.id) && <span className="sm-tag is-safety">Safety</span>}
                      {r.comment_type && <span className="sm-tag">{TYPE_LABEL[r.comment_type]}</span>}
                      {view === 'done' && <span className="sm-tag">{STATUS_LABEL[r.status]}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}

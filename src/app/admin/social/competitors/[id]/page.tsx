import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { competitorTablesReady } from '@/lib/social/competitors/data';
import { METRICS } from '@/lib/social/competitors/league';
import { recordFigures, updateCompetitor } from '../actions';
import '../../social.css';
import '../competitors.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Competitor · Heliaxis', robots: { index: false, follow: false } };

export default async function CompetitorPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requirePortal('social_monitoring');
  if (!s || s.profile.role !== 'admin') redirect('/admin/social/competitors');
  if (!(await competitorTablesReady())) redirect('/admin/social/competitors');
  const { id } = await params;
  const db = createAdminClient();
  const { data: c } = await db.from('social_competitor').select('*').eq('id', id).maybeSingle();
  if (!c) notFound();
  const { data: hist } = await db.from('social_competitor_snapshot').select('date, metric, value, source, method, unavailable_reason').eq('competitor_id', id).order('date', { ascending: false }).limit(60);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AdminShell active="social">
      <div className="sm-page cp">
        <p className="sm-back"><Link href="/admin/social/competitors">← Competitors</Link></p>
        <h1>{c.name}</h1>
        <p className="sm-sub">{c.base_location ?? ''}{c.notes ? ` · ${c.notes}` : ''}</p>

        <section className="sm-card">
          <h2>Enter figures you have checked by hand</h2>
          <p className="sm-sub">Look at their public pages (Instagram, Facebook, Google, Trustpilot) and type in what you see. Leave a box empty if you did not check it. If a figure is hidden or not available, say why in the second box instead of leaving a zero. Say where you found it so we can check it later.</p>
          <form action={recordFigures} className="cp-form">
            <input type="hidden" name="id" value={c.id} />
            <label>Date checked<input className="sm-input" type="date" name="date" defaultValue={today} /></label>
            <label>Where you found it<input className="sm-input" name="source" placeholder="e.g. their Google listing, screenshot saved" /></label>
            {METRICS.map((m) => (
              <label key={m.key}>
                {m.label}
                <input className="sm-input" name={`m:${m.key}`} inputMode="decimal" placeholder={m.unit === '%' ? 'percent' : 'number'} />
                <input className="sm-input" name={`u:${m.key}`} placeholder="or why it is unavailable" />
              </label>
            ))}
            <button className="sm-btn is-primary">Save figures</button>
          </form>
        </section>

        <section className="sm-card">
          <h2>Their links</h2>
          <form action={updateCompetitor} className="cp-form">
            <input type="hidden" name="id" value={c.id} />
            <label>Website<input className="sm-input" name="website" defaultValue={c.website ?? ''} /></label>
            <label>Base (town)<input className="sm-input" name="base_location" defaultValue={c.base_location ?? ''} /></label>
            <label>Instagram username<input className="sm-input" name="instagram_username" defaultValue={c.instagram_username ?? ''} /></label>
            <label>Facebook page link<input className="sm-input" name="facebook_url" defaultValue={c.facebook_url ?? ''} /></label>
            <label>Trustpilot page link<input className="sm-input" name="trustpilot_url" defaultValue={c.trustpilot_url ?? ''} /></label>
            <label>Notes<input className="sm-input" name="notes" defaultValue={c.notes ?? ''} /></label>
            <button className="sm-btn">Save links</button>
          </form>
        </section>

        {(hist ?? []).length > 0 && (
          <section className="sm-card">
            <h2>What has been recorded</h2>
            <ul className="cp-list">
              {(hist ?? []).map((h, i) => (
                <li key={i}>
                  <div>
                    <b>{METRICS.find((m) => m.key === h.metric)?.label ?? h.metric}: {h.value != null ? h.value : 'Unavailable'}</b>
                    <small>{h.date} · {h.method === 'manual' ? 'entered by hand' : h.method} · {h.value == null ? h.unavailable_reason : h.source}</small>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AdminShell>
  );
}

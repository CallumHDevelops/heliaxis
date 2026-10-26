import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { competitorTablesReady, ensureSeed } from '@/lib/social/competitors/data';
import { addCompetitor, decideSuggestion, toggleTracked } from '../actions';
import '../../social.css';
import '../competitors.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Manage competitors · Heliaxis', robots: { index: false, follow: false } };

export default async function ManagePage() {
  const s = await requirePortal('social_monitoring');
  if (!s || s.profile.role !== 'admin') redirect('/admin/social/competitors');
  if (!(await competitorTablesReady())) redirect('/admin/social/competitors');
  await ensureSeed(s.user.id);
  const db = createAdminClient();
  const [{ data: comps }, { data: sugg }] = await Promise.all([
    db.from('social_competitor').select('id, name, base_location, website, tracked, is_self').eq('is_self', false).order('tracked', { ascending: false }).order('name'),
    db.from('social_competitor_suggestion').select('id, name, base_location, evidence').eq('status', 'pending').order('name'),
  ]);

  return (
    <AdminShell active="social">
      <div className="sm-page cp">
        <p className="sm-back"><Link href="/admin/social/competitors">← Competitors</Link></p>
        <h1>Manage competitors</h1>
        <p className="sm-sub">Nothing is tracked until you approve it. Switching one off keeps its history.</p>

        <section className="sm-card">
          <h2>Tracked and switched off</h2>
          <ul className="cp-list">
            {(comps ?? []).map((c) => (
              <li key={c.id}>
                <div>
                  <b><Link href={`/admin/social/competitors/${c.id}`}>{c.name}</Link></b>
                  <small>{c.base_location ?? ''}{c.website ? ` · ${c.website}` : ' · website not added yet'}</small>
                </div>
                <form action={toggleTracked}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="on" value={c.tracked ? 'no' : 'yes'} />
                  <button className="sm-btn">{c.tracked ? 'Stop tracking' : 'Track again'}</button>
                </form>
              </li>
            ))}
          </ul>
        </section>

        <section className="sm-card">
          <h2>Suggestions to approve</h2>
          <p className="sm-sub">Companies from the brief’s research. They have not been checked: look each one up before you approve it.</p>
          {(sugg ?? []).length === 0 ? (
            <p className="sm-sub">No suggestions waiting.</p>
          ) : (
            <ul className="cp-list">
              {(sugg ?? []).map((g) => (
                <li key={g.id}>
                  <div>
                    <b>{g.name}</b>
                    <small>{g.base_location ?? ''}</small>
                  </div>
                  <span className="sm-inline">
                    <form action={decideSuggestion}>
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="approve" value="yes" />
                      <button className="sm-btn is-primary">Approve and track</button>
                    </form>
                    <form action={decideSuggestion}>
                      <input type="hidden" name="id" value={g.id} />
                      <input type="hidden" name="approve" value="no" />
                      <button className="sm-btn">Reject</button>
                    </form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="sm-card">
          <h2>Add one</h2>
          <form action={addCompetitor} className="cp-form">
            <label>Business name<input className="sm-input" name="name" required /></label>
            <label>Website<input className="sm-input" name="website" placeholder="https://" /></label>
            <label>Base (town)<input className="sm-input" name="base_location" /></label>
            <label>Instagram username<input className="sm-input" name="instagram_username" placeholder="without the @" /></label>
            <label>Facebook page link<input className="sm-input" name="facebook_url" /></label>
            <label>Trustpilot page link<input className="sm-input" name="trustpilot_url" /></label>
            <button className="sm-btn is-primary">Add and track</button>
          </form>
        </section>
      </div>
    </AdminShell>
  );
}

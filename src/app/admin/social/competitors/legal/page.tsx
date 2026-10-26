import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requirePortal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminShell } from '@/components/admin/AdminShell';
import { getLegalSignOff } from '@/lib/social/competitors/data';
import { signOffLegal } from '../actions';
import '../../social.css';
import '../competitors.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Legal check · Heliaxis', robots: { index: false, follow: false } };

const ROWS: [string, string, string][] = [
  ['Heliaxis’s own Facebook, Instagram, Trustpilot and Search Console data', 'Our own accounts, through their official APIs', 'On from the start'],
  ['Competitor Instagram followers and post counts', 'Instagram’s official “Business Discovery” feature, which exists for this purpose', 'Off until signed off'],
  ['Competitor Google rating and review count', 'Google Places lookups, a few a month. Google’s terms may not allow keeping this data long term, so history is entered by hand', 'Off until signed off. By hand always allowed'],
  ['Competitor Facebook followers and posts', 'Needs Meta’s approval we do not have', 'By hand only, monthly'],
  ['Competitor Trustpilot rating and review count', 'Trustpilot’s terms may not allow collecting rivals’ data at scale', 'By hand only, monthly'],
  ['Competitor website changes (prices, finance, offers)', 'A polite weekly check of a few public pages: it names itself, obeys robots.txt, one request every 5 seconds, at most 20 pages per site. Text kept for internal use only', 'Off until signed off'],
  ['Search rankings', 'Our own positions from Google Search Console. Competitors: a monthly check by hand. No paid rank tracker', 'Search Console on once connected. By hand always allowed'],
  ['AI answers (does an AI assistant name us?)', 'Claude with web search through our own Anthropic account, a few questions a month, labelled “API sample”', 'On once signed off. A few pounds a month at most'],
];

export default async function LegalPage() {
  const s = await requirePortal('social_monitoring');
  if (!s) redirect('/admin');
  const isAdmin = s.profile.role === 'admin';
  const legal = await getLegalSignOff();
  let who = '';
  if (legal) {
    const { data } = await createAdminClient().from('profiles').select('full_name, email').eq('id', legal.signed_by).maybeSingle();
    who = data?.full_name || data?.email || 'an admin';
  }
  return (
    <AdminShell active="social">
      <div className="sm-page cp cp-legal">
        <p className="sm-back"><Link href="/admin/social/competitors">← Competitors</Link></p>
        <h1>Legal check</h1>
        <p className="sm-sub">Before Heliaxis collects anything automatically about other businesses, read this and sign it off. This is a plain-English summary of the position as understood when this was built. <b>It is not legal advice.</b> If you want certainty on any line, ask a solicitor before signing.</p>

        <section className="sm-card">
          <h2>The rules we follow</h2>
          <ul>
            <li>Public information only. Nothing behind a login, no fake accounts, nothing private.</li>
            <li>Each platform’s own terms: official APIs where they exist, and by hand where they do not.</li>
            <li>No scraping that a site’s terms forbid. Where a site’s terms forbid collecting at scale (Trustpilot, Facebook), a person checks by hand once a month.</li>
            <li>Personal data (reviewers’ names and so on) about other businesses’ customers is not collected or stored. We keep business-level figures and our own notes.</li>
            <li>Every figure shows where it came from and when. If we cannot find it reliably, it says “Unavailable”.</li>
          </ul>
        </section>

        <section className="sm-card">
          <h2>What is collected, and how</h2>
          <table>
            <thead><tr><th>Information</th><th>How</th><th>Switched on</th></tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="sm-card">
          <h2>Sign-off</h2>
          {legal ? (
            <p>Signed off by <b>{who}</b> on {new Date(legal.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. The automated collection above is allowed. Entering figures by hand was never blocked.</p>
          ) : isAdmin ? (
            <form action={signOffLegal} className="sm-inline" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
              <label className="sm-inline">
                <input type="checkbox" name="agree" value="yes" required />
                <span>I have read this. I understand it is not legal advice, and I am happy for Heliaxis to collect the information above in the ways described.</span>
              </label>
              <button className="sm-btn is-primary">Sign off</button>
            </form>
          ) : (
            <p className="sm-sub">An admin needs to sign this off.</p>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

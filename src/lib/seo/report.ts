import 'server-only';
import { emailShell, esc } from '@/lib/email-brand';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAccess } from '@/lib/portals';
import type { WeeklyResult } from './server';
import { siteBase } from './server';

/** The people who should get the weekly report: approved admins, and anyone with Analytics. */
export async function reportPeople() {
  const { data } = await createAdminClient().from('profiles').select('*').eq('status', 'approved');
  return (data ?? []).filter((p) => p.role === 'admin' || canAccess(p, 'analytics'));
}

/** The weekly email: what was checked, what changed, what needs a decision. */
export function reportEmail(r: WeeklyResult): { subject: string; html: string; text: string } {
  const s = r.audit.summary;
  const c = r.change;
  const trend = c.scoreBefore === null ? 'first check' : c.scoreNow > c.scoreBefore ? `up from ${c.scoreBefore}` : c.scoreNow < c.scoreBefore ? `down from ${c.scoreBefore}` : 'same as last week';
  const list = (xs: string[], none: string) => (xs.length ? `<ul style="margin:6px 0 14px;padding-left:20px">${xs.slice(0, 12).map((x) => `<li>${esc(x)}</li>`).join('')}${xs.length > 12 ? `<li>and ${xs.length - 12} more</li>` : ''}</ul>` : `<p style="margin:6px 0 14px;color:#6E6A5E">${none}</p>`);
  const top = [...r.audit.pages.flatMap((p) => p.findings.filter((f) => f.severity === 'high').map((f) => `${p.path}: ${f.message}`)), ...r.audit.site.filter((f) => f.severity === 'high').map((f) => `Site: ${f.message}`)];
  const subject = `Website health ${s.score}/100 (${trend}): ${r.proposals.length ? `${r.proposals.length} fix${r.proposals.length > 1 ? 'es' : ''} to approve` : 'nothing to approve'}`;
  const body = `
<p>This week's check of ${s.pages} pages on ${esc(siteBase().replace(/^https?:\/\//, ''))}. <b>${s.score}%</b> of pages have no high or medium problem (${trend}).</p>
<p style="margin:0"><b>${s.high} high, ${s.medium} medium, ${s.low} low</b> problems found.</p>
<h3 style="margin:18px 0 0">Fixed since last week</h3>${list(c.fixed, c.scoreBefore === null ? 'This is the first check, so there is nothing to compare yet.' : 'Nothing was fixed this week.')}
<h3 style="margin:18px 0 0">New this week</h3>${list(c.appeared, 'No new problems.')}
<h3 style="margin:18px 0 0">Changes you approved this week</h3>${list(r.appliedThisWeek.map((p) => `${p.path}: new title and description`), 'None.')}
<h3 style="margin:18px 0 0">Waiting for you</h3>${list(r.proposals.map((p) => `${p.path}: suggested title and description`), 'No new suggestions.')}
${top.length ? `<h3 style="margin:18px 0 0">The serious ones</h3>${list(top, '')}` : ''}
<p style="font-size:13px;color:#6E6A5E">Nothing on the website changes until you approve it. Open the report to approve or dismiss each suggestion.</p>`;
  const text = `${subject}\n\n${s.pages} pages checked. ${s.high} high, ${s.medium} medium, ${s.low} low.\n\nFixed: ${c.fixed.length}. New: ${c.appeared.length}. Suggestions waiting: ${r.proposals.length}.\n\n${siteBase()}/admin/analytics/seo`;
  return { subject, html: emailShell('Website health, this week', body, { href: `${siteBase()}/admin/analytics/seo`, label: 'Open the report' }, 'SEO and AI report', 'Sent every Monday by the Heliaxis system.'), text };
}

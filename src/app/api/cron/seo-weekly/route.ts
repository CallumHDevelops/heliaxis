import { NextResponse } from 'next/server';
import { notify } from '@/lib/notify';
import { msConfigured, sendMail } from '@/lib/ms365';
import { runWeekly } from '@/lib/seo/server';
import { reportEmail, reportPeople } from '@/lib/seo/report';
import { queueGeoRun } from '@/lib/social/competitors/geo-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/**
 * Every Monday (vercel.json): check the whole site, compare with last week, draft fixes for titles and descriptions, and tell the
 * team: an email with the report and a push. On the first Monday of the month it also starts the AI-answer check. Nothing on the website changes here.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const r = await runWeekly();
  const people = await reportPeople();
  const mail = reportEmail(r);
  let emailed = 0;
  if (msConfigured()) {
    for (const p of people) {
      if (!/^\S+@\S+\.\S+$/.test(String(p.email ?? ''))) continue;
      try {
        await sendMail({ to: p.email as string, subject: mail.subject, text: mail.text, html: mail.html });
        emailed++;
      } catch {
        // One failing address doesn't stop the rest.
      }
    }
  }
  await Promise.all(people.map((p) => notify({ userId: p.id as string, kind: 'seo_report', title: `Website health ${r.audit.summary.score}/100`, body: r.proposals.length ? `${r.proposals.length} suggested fixes are waiting for you.` : 'Weekly SEO and AI report is ready.', href: '/admin/analytics/seo', tag: 'seo-weekly' })));
  const first = new Date().getDate() <= 7;
  const geo = first ? await queueGeoRun().catch(() => ({ queued: 0, reason: 'failed' })) : null;
  return NextResponse.json({ ok: true, pages: r.audit.summary.pages, score: r.audit.summary.score, proposals: r.proposals.length, emailed, geo });
}

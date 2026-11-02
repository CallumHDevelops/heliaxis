import { after } from 'next/server';
import { crmSession, json } from '@/lib/crm/server';
import { salesReport } from '@/lib/crm/sales-report';
import { adSpendConfigured, adSpendFigures } from '@/lib/meta-ads';
import { afterReports } from '@/lib/meta-ad-ids';

export const dynamic = 'force-dynamic';
// Meta can be slow the first time a period is asked for (after that it's cached).
export const maxDuration = 60;

/**
 * Sales numbers for a period: by source / campaign, by person, the funnel, response times and Meta
 * ad spend. ?refresh=1 ("Refresh from Meta"): Meta's ad names and today's figures asked for now.
 */
export async function GET(req: Request) {
  const s = await crmSession();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const url = new URL(req.url);
  const days = Math.min(730, Math.max(7, Number(url.searchParams.get('days')) || 90));
  const refresh = url.searchParams.get('refresh') === '1';
  // Asked for alongside the CRM's own numbers; never throws.
  const spending = adSpendFigures(days, { refresh });
  // Once this has answered: older leads' ads from Meta's Lead API, for the next load (never throws).
  // A Refresh skips the 5-minute gap only when Meta was really asked (not 'wait' or 'paused').
  if (adSpendConfigured())
    after(async () => {
      const f = await spending;
      await afterReports({ force: f.state === 'ok' && f.refresh === 'done' });
    });
  try {
    const report = await salesReport(days, spending, adSpendConfigured());
    return json({
      ...report,
      /** Admins get the CSV export buttons (GET /api/crm/export). */
      canExport: s.profile.role === 'admin',
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Could not build the report' }, 500);
  }
}

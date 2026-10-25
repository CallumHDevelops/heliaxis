import { defaultTemplate } from '@/lib/whatsapp/api';
import { cleanFirst, tidyAdName, withAdMessage, type AdKey } from '@/lib/whatsapp/first-messages-shared';
import { adRows, autoFirstInVercel, getFirstMessages, saveFirstMessages } from '@/lib/whatsapp/first-messages';
import { getSettings } from '@/lib/whatsapp/settings';
import { fetchTemplates } from '@/lib/whatsapp/templates';
import { customerSendable, jobProblem, JOBS } from '@/lib/whatsapp/templates-shared';
import { json, session } from '@/lib/whatsapp/routes';

export const dynamic = 'force-dynamic';

const FIRST = JOBS.find((j) => j.key === 'firstContact')!;

/**
 * WhatsApp templates → First messages: whether first messages to new Meta leads go by themselves, how
 * long after the lead comes in, and a template for each ad (video) that's brought leads lately.
 * Anyone with Enquiries can look; only admins change anything (it's what new leads receive).
 */
export async function GET() {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  const [first, wa] = await Promise.all([getFirstMessages(), getSettings()]);
  return json({
    isAdmin: s.profile.role === 'admin',
    first,
    inVercel: autoFirstInVercel(),
    quietHold: wa.firstContactQuietHours,
    general: wa.firstContactTemplate || defaultTemplate().name || '',
    ads: await adRows(first),
  });
}

/**
 * Admins: { auto?, minMinutes?, maxMinutes? } and/or { ad: { name, was, ids, template } } (template ''
 * = back to the general first message). A template must be approved and able to do the job.
 */
export async function PUT(req: Request) {
  const s = await session();
  if (!s) return json({ error: 'unauthorized' }, 401);
  if (s.profile.role !== 'admin') return json({ error: 'Only admins can change first messages.' }, 403);
  const b = await req.json().catch(() => ({}));
  const first = await getFirstMessages();
  let byAd = first.byAd;

  if (b.ad && typeof b.ad === 'object') {
    const strings = (v: unknown) => (Array.isArray(v) ? v.slice(0, 50).map((x) => String(x ?? '')) : []);
    const ad: AdKey = { name: tidyAdName(b.ad.name), was: strings(b.ad.was).map(tidyAdName).filter(Boolean), ids: strings(b.ad.ids) };
    const template = typeof b.ad.template === 'string' ? b.ad.template.trim() : '';
    if (!ad.name) return json({ error: 'Which ad is that?' }, 400);
    if (template) {
      const list = await fetchTemplates();
      if (!list.ok) return json({ error: list.problem.message }, 400);
      const lang = defaultTemplate().lang;
      const t = customerSendable(list.items).find((x) => x.name === template && x.language === lang);
      if (!t) return json({ error: `“${template}” isn’t an approved template in ${lang} yet.` }, 400);
      const problem = jobProblem(FIRST, t, lang);
      if (problem) return json({ error: problem }, 400);
    }
    byAd = withAdMessage(byAd, ad, template);
  }

  const next = cleanFirst({
    ...first,
    ...(typeof b.auto === 'boolean' ? { auto: b.auto } : {}),
    ...(b.minMinutes !== undefined ? { minMinutes: b.minMinutes } : {}),
    ...(b.maxMinutes !== undefined ? { maxMinutes: b.maxMinutes } : {}),
    byAd,
  });
  try {
    await saveFirstMessages(next);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Not saved' }, 500);
  }
  return json({ first: next, ads: await adRows(next) });
}

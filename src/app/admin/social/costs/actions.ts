'use server';

import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth';
import { saveAssumptions, loadAssumptions } from '@/lib/social/assumptions';

const num = (f: FormData, k: string, fallback: number, max = 100000) => {
  const n = Number(String(f.get(k) ?? '').replace(/[£,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
};

/** Admins change the assumptions the Costs report uses. */
export async function saveCostAssumptions(f: FormData) {
  const s = await requirePortal('social_monitoring');
  if (!s || s.profile.role !== 'admin') throw new Error('Only an admin can change these');
  const cur = await loadAssumptions();
  const fixed: Record<string, number> = {};
  for (const name of Object.keys(cur.fixed_costs_gbp)) fixed[name] = num(f, `fixed:${name}`, cur.fixed_costs_gbp[name]);
  await saveAssumptions({
    ...cur,
    usd_to_gbp: num(f, 'usd_to_gbp', cur.usd_to_gbp, 5),
    ai_monthly_cap_gbp: num(f, 'ai_monthly_cap_gbp', cur.ai_monthly_cap_gbp, 10000),
    staff_hourly_cost_gbp: num(f, 'staff_hourly_cost_gbp', cur.staff_hourly_cost_gbp, 500),
    minutes_to_check_one_comment: num(f, 'minutes_to_check_one_comment', cur.minutes_to_check_one_comment, 120),
    minutes_to_write_one_reply: num(f, 'minutes_to_write_one_reply', cur.minutes_to_write_one_reply, 240),
    minutes_to_review_a_draft: num(f, 'minutes_to_review_a_draft', cur.minutes_to_review_a_draft, 120),
    minutes_checking_platforms_per_day: num(f, 'minutes_checking_platforms_per_day', cur.minutes_checking_platforms_per_day, 600),
    days_checked_per_month: num(f, 'days_checked_per_month', cur.days_checked_per_month, 31),
    fixed_costs_gbp: fixed,
    comparison_tool_monthly_gbp: num(f, 'comparison_tool_monthly_gbp', cur.comparison_tool_monthly_gbp, 100000),
  });
  revalidatePath('/admin/social/costs');
}

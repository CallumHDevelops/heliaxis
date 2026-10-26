'use server';

import { revalidatePath } from 'next/cache';
import { getSessionProfile } from '@/lib/auth';
import { loadValueAssumptions, saveValueAssumptions } from '@/lib/value/collect';
import type { BenefitKey } from '@/lib/value/model';

const num = (v: FormDataEntryValue | null, fallback: number, max = 100000) => {
  const n = Number(String(v ?? '').replace(/[£,\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : fallback;
};

/** Admins only: the assumptions behind the Added value page. */
export async function saveValue(f: FormData) {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved' || profile.role !== 'admin') throw new Error('Only an admin can change these');
  const cur = await loadValueAssumptions();
  const minutes = { ...cur.minutes };
  for (const k of Object.keys(minutes) as BenefitKey[]) minutes[k] = num(f.get(`m:${k}`), cur.minutes[k], 600);
  const costs = Object.fromEntries(Object.keys(cur.costs_gbp).map((k) => [k, num(f.get(`c:${k}`), cur.costs_gbp[k])]));
  const tools = Object.fromEntries(Object.keys(cur.replaced_tools_monthly_gbp).map((k) => [k, num(f.get(`t:${k}`), cur.replaced_tools_monthly_gbp[k])]));
  await saveValueAssumptions({
    ...cur,
    staff_hourly_cost_gbp: num(f.get('hourly'), cur.staff_hourly_cost_gbp, 500),
    whatsapp_template_pence: num(f.get('wa'), cur.whatsapp_template_pence, 100),
    metis_monthly_gbp: num(f.get('metis'), cur.metis_monthly_gbp),
    usd_to_gbp: num(f.get('fx'), cur.usd_to_gbp, 5),
    minutes,
    costs_gbp: costs,
    replaced_tools_monthly_gbp: tools,
  });
  revalidatePath('/admin/value');
}

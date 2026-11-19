import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchSession } from '@/lib/search/server';
import { estimateRun } from '@/lib/search/serp-run';
import { budget } from '@/lib/search/server';
import { can } from '@/lib/search/settings';
import { SearchShell } from './SearchShell';
import '../crm/crm.css';
import './search.css';

export const dynamic = 'force-dynamic';

/** Search: the SEO & GEO Command Centre, its own product inside HAP (spec §10). */
export default async function SearchLayout({ children }: { children: ReactNode }) {
  const s = await searchSession();
  if (!s) redirect('/admin');
  const db = createAdminClient();
  const [{ count }, est, b, towns] = await Promise.all([
    db.from('seo_action').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    estimateRun('mobile', db).catch(() => ({ searches: 0, usd: 0 })),
    budget('dataforseo', db).catch(() => ({ vendor: 'dataforseo', spent: 0, cap: 0, left: 0 })),
    db.from('seo_keyword').select('town, service').eq('active', true),
  ]);
  const townList = [...new Set((towns.data ?? []).map((t) => t.town).filter(Boolean) as string[])].sort();
  const services = [...new Set((towns.data ?? []).map((t) => t.service).filter(Boolean) as string[])].sort();
  return (
    <AdminShell active="search" fluid>
      <SearchShell
        needsYou={count ?? 0}
        canSpend={can.spend(s.role)}
        canOverride={can.overrideCap(s.role)}
        run={{ searches: est.searches, usd: est.usd, spent: b.spent, cap: b.cap }}
        towns={townList}
        services={services}
      >
        {children}
      </SearchShell>
    </AdminShell>
  );
}

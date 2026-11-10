/** ProspectPV home: every letter, searchable. */
import type { Metadata } from 'next';
import { AdminShell } from '@/components/prospectpv/admin/AdminShell';
import { LettersView } from '@/components/prospectpv/admin/LettersView';
import { requireStaff } from '@/lib/prospectpv/server/auth';
import { listLetters, PAGE_SIZE, type LetterFilters } from '@/lib/prospectpv/server/data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Letters · ProspectPV', robots: { index: false, follow: false } };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LettersPage({ searchParams }: { searchParams: SP | Promise<SP> }) {
  const { db } = await requireStaff();
  const sp = await searchParams;
  const show = one(sp.show);
  const source = one(sp.source);
  const template = Number(one(sp.template));
  const filters: LetterFilters = {
    q: one(sp.q)?.slice(0, 80),
    show: show === 'viewed' || show === 'unviewed' || show === 'booked' ? show : 'all',
    template: [1, 2, 3, 4, 5].includes(template) ? template : undefined,
    source: source === 'manual' || source === 'scan' ? source : undefined,
    page: Number(one(sp.page)) || 1,
  };
  const [list, all] = await Promise.all([
    listLetters(db, filters),
    db.from('pv_letters').select('id', { count: 'exact', head: true }),
  ]);
  return (
    <AdminShell active="letters">
      <LettersView rows={list.rows} total={list.total} page={list.page} pageSize={PAGE_SIZE} filters={filters} hasLetters={(all.count ?? 0) > 0} />
    </AdminShell>
  );
}

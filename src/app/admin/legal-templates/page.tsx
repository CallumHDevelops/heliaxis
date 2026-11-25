import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/auth';
import { AdminShell } from '@/components/admin/AdminShell';
import { createAdminClient } from '@/lib/supabase/admin';
import { readApprovals } from '@/lib/templates/approval';
import { legalStatus } from '@/lib/templates/legal';
import { TEMPLATES } from '@/lib/templates/registry';
import { setTemplateApproval } from './actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Legal templates · Heliaxis', robots: { index: false, follow: false } };

const LABEL = { approved: 'Approved', draft: 'DRAFT — awaiting legal review', changed: 'Wording changed since it was approved: awaiting legal review', not_required: '' } as const;

/**
 * The fixed contract wording that needs a solicitor's sign-off (the off-grid pack, HX-OG-01 to 06). Until an admin approves
 * a template here it prints "DRAFT — awaiting legal review" and cannot be signed. Approval is tied to the exact wording:
 * change a word and it goes back to draft. Admins only; Metis can't approve.
 */
export default async function LegalTemplatesPage() {
  const { user, profile } = await getSessionProfile();
  if (!user || profile?.status !== 'approved') redirect('/login');
  if (profile.role !== 'admin') redirect('/admin?denied=1');
  const approvals = await readApprovals(createAdminClient());
  const rows = TEMPLATES.filter((t) => t.legalReview);
  return (
    <AdminShell active="sales">
      <div className="crm-wrap" style={{ maxWidth: 880, margin: '0 auto', padding: '16px' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>Legal templates</h1>
        <p style={{ margin: '0 0 16px', color: '#6e6a5e' }}>
          The wording of these documents is fixed: Metis only fills in the names, address, system, price and dates. Have your solicitor review each one, then approve it here. Until it is approved it prints “DRAFT — awaiting legal review” and cannot be signed.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.map((t) => {
            const st = legalStatus(t, approvals);
            const a = approvals[t.code];
            return (
              <form key={t.code} action={setTemplateApproval} style={{ display: 'flex', gap: 12, alignItems: 'center', border: '1px solid #d9d4ca', borderRadius: 10, padding: '12px 14px', background: '#fffdf8' }}>
                <input type="hidden" name="code" value={t.code} />
                <input type="hidden" name="approved" value={st === 'approved' ? '0' : '1'} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{t.code} · {t.title}</div>
                  <div style={{ fontSize: 13, color: st === 'approved' ? '#3f7d4e' : '#b3261e' }}>{LABEL[st]}</div>
                  {a?.approved && st === 'approved' && <div style={{ fontSize: 12, color: '#6e6a5e' }}>Approved {new Date(a.at).toLocaleDateString('en-GB')}</div>}
                </div>
                <button type="submit" className={st === 'approved' ? 'crm-btn crm-btn--ghost' : 'crm-btn crm-btn--solar'}>
                  {st === 'approved' ? 'Withdraw approval' : 'Approve this wording'}
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}

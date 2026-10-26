import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { requirePortal } from '@/lib/auth';
import { readEstimatorSettings } from '@/lib/estimator/settings';
import { EstimatorSettingsForm } from './EstimatorSettingsForm';
import '../../crm/crm.css';
import '../quotes/quotes.css';

export const dynamic = 'force-dynamic';

/** Sales › Estimator: the prices and assumptions behind the website's solar estimator. Admins only. */
export default async function EstimatorAdmin() {
  const session = await requirePortal('crm');
  if (!session || session.profile.role !== 'admin') redirect('/admin?denied=1');
  const settings = await readEstimatorSettings();
  return (
    <AdminShell active="sales" fluid>
      <div className="crm crmh qb-page">
        <Link href="/admin/sales/quotes" className="crm-back">
          ← Quotes
        </Link>
        <div className="crmh-head">
          <div className="crmh-head__l">
            <h1 className="crmh-h1">Solar estimator</h1>
            <span className="crmh-sum">The prices and assumptions behind heliaxis.co.uk/solar-estimator</span>
          </div>
          <div className="crmh-head__r">
            <a href="/solar-estimator" target="_blank" rel="noreferrer" className="crm-btn crm-btn--ghost">
              Open the estimator
            </a>
          </div>
        </div>
        <EstimatorSettingsForm initial={settings} />
      </div>
    </AdminShell>
  );
}

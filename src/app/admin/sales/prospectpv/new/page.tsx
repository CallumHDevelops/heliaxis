/** Create a letter for an address. */
import type { Metadata } from 'next';
import { AdminShell } from '@/components/prospectpv/admin/AdminShell';
import { readiness } from '@/lib/prospectpv/readiness';
import { requireStaff } from '@/lib/prospectpv/server/auth';
import { assetUrls, loadAssets, loadPackages, loadSettings, loadTemplates } from '@/lib/prospectpv/server/data';
import { NewLetterScreen } from '../_screens';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'New letter · ProspectPV', robots: { index: false, follow: false } };

export default async function NewLetterPage() {
  const { db } = await requireStaff();
  const [settings, packages, templates, assets] = await Promise.all([loadSettings(db), loadPackages(db), loadTemplates(db), loadAssets(db)]);
  return (
    <AdminShell active="new">
      <div className="pva-head">
        <div><h1>New letter</h1><p>Enter an address and roof details. You get a print-ready letter with its own QR code and landing page.</p></div>
      </div>
      <NewLetterScreen
        packages={packages.filter((p) => p.active)}
        templates={templates.filter((t) => t.enabled).map((t) => ({ template_key: t.template_key, name: t.name }))}
        settings={settings}
        readiness={readiness({ settings, hasAccreditations: !!assetUrls(assets).accreditations })}
      />
    </AdminShell>
  );
}

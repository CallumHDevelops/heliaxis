/**
 * ProspectPV inside the Heliaxis admin: Heliaxis's own shell (header, Sales menu, dock) with ProspectPV's tabs under it.
 * Server component.
 */
import type { ReactNode } from 'react';
import { AdminShell as HeliaxisShell } from '@/components/admin/AdminShell';
import { ADMIN_CSS } from './adminCss';

export const ADMIN_TABS = [
  { id: 'letters', label: 'Letters', href: '/admin/sales/prospectpv' },
  { id: 'map', label: 'Map', href: '/admin/sales/prospectpv/map' },
  { id: 'new', label: 'New letter', href: '/admin/sales/prospectpv/new' },
  { id: 'packages', label: 'Packages', href: '/admin/sales/prospectpv/packages' },
  { id: 'estimator', label: 'Estimator', href: '/admin/sales/prospectpv/estimator' },
  { id: 'settings', label: 'Settings', href: '/admin/sales/prospectpv/settings' },
] as const;
export type AdminTab = (typeof ADMIN_TABS)[number]['id'];

export function AdminShell({ active, children }: { active: AdminTab; children: ReactNode }) {
  return (
    <HeliaxisShell active="sales" fluid>
      <div className="pva">
        <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
        <nav className="pva-nav" aria-label="ProspectPV">
          {ADMIN_TABS.map((t) => (
            <a key={t.id} href={t.href} aria-current={t.id === active ? 'page' : undefined}>{t.label}</a>
          ))}
        </nav>
        <div className="pva-main">{children}</div>
      </div>
    </HeliaxisShell>
  );
}

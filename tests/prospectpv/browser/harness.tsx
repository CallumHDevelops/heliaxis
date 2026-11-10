/**
 * Browser harness for the Map screen: the real component, with in-memory stand-ins
 * for the two server actions so a test can draw, check and save without a server.
 * Bundled by tests/browser/map.browser.test.ts.
 */
import { createRoot } from 'react-dom/client';
import '@/app/admin/crm/crm.css';
import { ADMIN_CSS } from '@/components/prospectpv/admin/adminCss';
import { MapScreen } from '@/components/prospectpv/map/MapScreen';
import { buildEstimate } from '@/lib/prospectpv/mapEstimate';
import { DEFAULT_LIMITS } from '@/lib/prospectpv/mapArea';

declare global { interface Window { __calls: { estimate: unknown[]; save: unknown[] }; __homes: number } }
window.__calls = { estimate: [], save: [] };
window.__homes = 412;

createRoot(document.getElementById('root')!).render(
  <div className="pva">
    <style dangerouslySetInnerHTML={{ __html: ADMIN_CSS }} />
    <div className="pva-main">
    <MapScreen
      center={[-3.1791, 51.4816]}
      zoom={15}
      limits={{ ...DEFAULT_LIMITS, max_area_ha: 50 }}
      showTiles={false}
      actions={{
        estimate: async (area) => {
          window.__calls.estimate.push(area);
          const estimate = buildEstimate({ homesFound: window.__homes, solarCallsThisMonth: 0, freeCallsPerMonth: 10000, costPerCallGbp: null, monthlyCapGbp: null, spentThisMonthGbp: 0, maxHomesPerScan: 2000 });
          return { ok: true, estimate, areaHa: 1, shapes: 1 };
        },
        save: async (raw) => { window.__calls.save.push(raw); return { ok: true, campaignId: 'c-1', areaHa: 1 }; },
      }}
    />
    </div>
  </div>,
);

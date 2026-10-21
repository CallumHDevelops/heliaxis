'use client';

import type { SiteForm } from '@/lib/site/forms/types';
import type { PackRecord } from '@/lib/site/offline';
import { SyncLine, TopBar } from './bits';
import { go } from './nav';

/** P11: after signing. The sign-off's own screen (the PO, what you'll be paid) arrives with the sign-off route (1I). */
export function DoneScreen({ rec, form }: { rec: PackRecord; form: SiteForm }) {
  return (
    <>
      <TopBar title="Signed" onBack={() => go(`/portal/site/job/${rec.id}`)} />
      <SyncLine />
      <main className="sa-main">
        <div className="sa-card sa-signed">
          <h2>Signed ✓</h2>
          <p>{form.title}: signed on this phone. It will send when you have signal.</p>
        </div>
        <button type="button" className="sa-btn sa-btn-2" onClick={() => go(`/portal/site/job/${rec.id}`)}>
          Back to the job
        </button>
      </main>
    </>
  );
}

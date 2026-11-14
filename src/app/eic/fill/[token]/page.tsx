import type { Metadata } from 'next';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { createAdminClient } from '@/lib/supabase/admin';
import { readByToken } from '@/lib/eic-manual/request';
import { EicEditor } from '@/app/admin/eic/[id]/EicEditor';
import '@/app/admin/eic/eic-manual.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Electrical certificate', robots: { index: false, follow: false } };

/**
 * An installer's personal link (sent from Operations › EIC certificates › Request information): the certificate's questions one at a time,
 * with nothing to log in to. Private: no-store, noindex and no-referrer (next.config.ts). A wrong or withdrawn link says so.
 */
export default async function FillInEic({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const row = await readByToken(createAdminClient(), token).catch(() => null);
  return (
    <div className="crm em-public">
      <header className="em-public__head">
        <BrandLogo width={128} priority />
        <span>Electrical certificate</span>
      </header>
      {row ? (
        <EicEditor id="" admin={false} token={token} />
      ) : (
        <div className="em-guide">
          <h2 className="em-guide__q">This link isn’t working</h2>
          <p className="em-guide__hint">It may have been withdrawn or mistyped. Please ask Heliaxis to send it again.</p>
        </div>
      )}
    </div>
  );
}

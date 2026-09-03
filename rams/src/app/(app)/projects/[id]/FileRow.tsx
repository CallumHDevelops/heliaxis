'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

/**
 * Files live in a private bucket, so the download link has to be minted on
 * demand as a short-lived signed URL rather than rendered into the page.
 */
export function DownloadFileButton({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="quiet"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const supabase = createClient();
        const { data } = await supabase.storage
          .from('project-files')
          .createSignedUrl(path, 120, { download: name });
        if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
        setBusy(false);
      }}
    >
      {busy ? 'Opening…' : 'Download'}
    </Button>
  );
}

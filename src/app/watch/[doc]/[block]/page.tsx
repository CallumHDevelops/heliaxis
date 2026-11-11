import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BrandLogo } from '@/components/theme/BrandLogo';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/crm/server';
import { readWriteup } from '@/lib/writeups/server';
import { VIDEO_BUCKET } from '@/lib/writeups/video';
import './watch.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Watch the video', robots: { index: false, follow: false } };

/** Where a video element's QR code leads: the video, with its sub-title. Not indexed; the two ids in the link are the key. */
export default async function Watch({ params }: { params: Promise<{ doc: string; block: string }> }) {
  const { doc, block } = await params;
  if (!isUuid(doc) || !/^[\w-]{1,16}$/.test(block)) notFound();
  const w = await readWriteup(doc).catch(() => null);
  const b = w?.content.blocks.find((x) => x.id === block);
  if (!w || !b || b.type !== 'video' || !b.path) notFound();
  const { data } = await createAdminClient().storage.from(VIDEO_BUCKET).createSignedUrl(b.path, 60 * 60 * 3);
  return (
    <main className="wv">
      <header className="wv-head">
        <BrandLogo width={128} priority />
      </header>
      {data?.signedUrl ? (
        <video className="wv-video" src={data.signedUrl} controls playsInline preload="metadata" />
      ) : (
        <p className="wv-miss">This video isn’t available right now. Please try again in a moment.</p>
      )}
      {b.caption.trim() && <h1 className="wv-cap">{b.caption.trim()}</h1>}
      <p className="wv-foot">Heliaxis</p>
    </main>
  );
}

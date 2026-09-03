import { headers } from 'next/headers';
import { PrintButton } from '@/components/report/PrintButton';
import { RamsReport } from '@/components/report/RamsReport';
import { Spark } from '@/components/brand/Spark';
import { formatDateTime, relativeTime } from '@/lib/format';
import { loadSharedReport } from '@/lib/report';
import { resolveShareToken } from '@/lib/share';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Shared document',
  robots: { index: false, follow: false, nocache: true },
};

const MESSAGES: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'Link not recognised',
    body: 'This link is not valid. Check you have the whole address, or ask Heliaxis for a new one.',
  },
  expired: {
    title: 'This link has expired',
    body: 'Shared documents are available for a limited time. Ask Heliaxis to send you a fresh link.',
  },
  revoked: {
    title: 'This link has been withdrawn',
    body: 'Access to this document was revoked by Heliaxis. Get in touch if you still need it.',
  },
  view_limit: {
    title: 'View limit reached',
    body: 'This link was set to allow a limited number of views and has now been used up.',
  },
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headerList = await headers();

  const result = await resolveShareToken(token, {
    ip: headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: headerList.get('user-agent'),
  });

  if (!result.ok) {
    const message = MESSAGES[result.reason] ?? MESSAGES.not_found;
    return <ShareNotice title={message.title} body={message.body} />;
  }

  const data = await loadSharedReport(result.link.rams_id);
  if (!data) {
    return <ShareNotice title={MESSAGES.not_found.title} body={MESSAGES.not_found.body} />;
  }

  return (
    <div className="min-h-dvh bg-paper-2 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-5 max-w-[210mm] px-4">
        <div className="crosshatch relative rounded-[3px] bg-ink px-5 py-4 text-paper">
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="eyebrow eyebrow-d mb-1">
                <Spark size={11} />
                Shared by Heliaxis
              </div>
              <p className="text-[0.95rem] font-extrabold">{data.doc.title}</p>
              <p className="mt-0.5 text-[0.78rem] text-muted-d">
                {data.doc.reference} v{data.doc.version} · Access expires{' '}
                {relativeTime(result.link.expires_at)} ({formatDateTime(result.link.expires_at)})
              </p>
            </div>
            <PrintButton label="Save as PDF" />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[210mm] border border-[color:var(--line)] bg-white print:border-0">
        <RamsReport data={data} />
      </div>

      <p className="no-print mx-auto mt-5 max-w-[210mm] px-4 text-center text-[0.75rem] text-muted">
        This is a controlled document shared under a time-limited link. Do not forward it — ask
        Heliaxis to issue a link directly to anyone else who needs it.
      </p>
    </div>
  );
}

function ShareNotice({ title, body }: { title: string; body: string }) {
  return (
    <main className="crosshatch flex min-h-dvh items-center justify-center bg-ink px-5 py-16">
      <div className="w-full max-w-[26rem] rounded-[3px] border border-[color:var(--line-d)] bg-card p-6 text-center">
        <div className="eyebrow mb-3 justify-center">
          <Spark size={12} />
          Heliaxis RAMS
        </div>
        <h1 className="text-[1.25rem] font-extrabold">{title}</h1>
        <p className="mt-2 text-[0.88rem] text-muted">{body}</p>
      </div>
    </main>
  );
}

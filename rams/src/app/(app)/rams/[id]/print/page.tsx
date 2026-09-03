import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/report/PrintButton';
import { RamsReport } from '@/components/report/RamsReport';
import { requireUser } from '@/lib/auth';
import { loadReport } from '@/lib/report';

export const metadata = { title: 'Preview' };

export default async function PrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/rams/${id}/print`);

  const data = await loadReport(id);
  if (!data) notFound();

  const draft = data.doc.status === 'draft' || data.doc.status === 'in_review';

  return (
    <div className="min-h-dvh bg-paper-2 py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-5 flex max-w-[210mm] flex-wrap items-center gap-3 px-4">
        <Link
          href={`/rams/${id}`}
          className="text-[0.85rem] font-semibold text-muted hover:text-ink hover:underline"
        >
          ← Back to document
        </Link>
        <span className="ml-auto text-[0.8rem] text-muted">
          Use your browser&rsquo;s print dialog and choose &ldquo;Save as PDF&rdquo;.
        </span>
        <PrintButton />
      </div>

      <div className="mx-auto max-w-[210mm] border border-[color:var(--line)] bg-white print:border-0">
        <RamsReport
          data={data}
          watermark={draft ? 'Draft — not approved for issue' : undefined}
        />
      </div>
    </div>
  );
}

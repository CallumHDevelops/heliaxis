import Link from 'next/link';
import type { ReactNode } from 'react';
import { Spark, Wordmark } from '@/components/brand/Spark';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="crosshatch relative flex min-h-dvh items-center justify-center bg-ink px-5 py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60rem 40rem at 78% -10%, rgba(248,188,30,.16), transparent 62%)',
        }}
      />
      <div className="w-full max-w-[26rem]">
        <Link href="/" className="mb-8 flex items-center justify-center">
          <Wordmark tone="light" className="text-[1.4rem]" />
        </Link>

        <div className="rounded-[3px] border border-[color:var(--line-d)] bg-card p-6">
          <div className="eyebrow mb-2">
            <Spark size={12} />
            Heliaxis RAMS
          </div>
          <h1 className="text-[1.35rem] font-extrabold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[0.88rem] text-muted">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-[0.85rem] text-muted-d">{footer}</div>}
      </div>
    </main>
  );
}

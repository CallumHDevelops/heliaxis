import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

// --- Buttons ---------------------------------------------------------------

const BUTTON_BASE =
  'btn-shine inline-flex items-center justify-center gap-2 rounded-[2px] font-semibold ' +
  'transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-2';

const VARIANTS = {
  solar: 'bg-solar text-ink hover:bg-amber',
  dark: 'bg-ink text-paper hover:bg-ink-2',
  ghost: 'border border-[color:var(--line-strong)] text-ink hover:bg-paper-2',
  quiet: 'text-muted hover:text-ink hover:bg-paper-2',
  danger: 'border border-danger/40 text-danger hover:bg-danger/10',
} as const;

const SIZES = {
  sm: 'text-[0.78rem] px-2.5 py-1.5',
  md: 'text-[0.85rem] px-3.5 py-2',
  lg: 'text-[0.95rem] px-5 py-2.5',
} as const;

type ButtonStyleProps = {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
};

export function buttonClass({ variant = 'ghost', size = 'md' }: ButtonStyleProps = {}) {
  return cn(BUTTON_BASE, VARIANTS[variant], SIZES[size]);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<'button'> & ButtonStyleProps) {
  return <button className={cn(buttonClass({ variant, size }), className)} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyleProps) {
  return <Link className={cn(buttonClass({ variant, size }), className)} {...props} />;
}

// --- Surfaces --------------------------------------------------------------

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-[3px] border border-[color:var(--line)] bg-card', className)}
      {...props}
    />
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      {(title || action || eyebrow) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
            {title && <h2 className="text-[0.98rem] font-extrabold">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </Card>
  );
}

// --- Text bits -------------------------------------------------------------

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('eyebrow', className)}>{children}</span>;
}

export function PageHeader({
  title,
  eyebrow,
  description,
  action,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-[1.7rem] font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-muted">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[3px] border border-dashed border-[color:var(--line-strong)] bg-paper-2/50 px-6 py-12 text-center">
      <p className="font-extrabold">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

// --- Badges ----------------------------------------------------------------

const TONES = {
  neutral: 'bg-paper-2 text-muted border-[color:var(--line)]',
  ink: 'bg-ink text-paper border-ink',
  solar: 'bg-solar/25 text-[#6B4A05] border-solar/50',
  ok: 'bg-[#DCEBDF] text-[#1F4A2B] border-[#B6D3BC]',
  warn: 'bg-[#FBEBC2] text-[#6B4A05] border-[#E7CE8C]',
  danger: 'bg-[#F4D2D2] text-[#7A1F1F] border-[#E0AFAF]',
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'mono inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.08em]',
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

// --- Form primitives -------------------------------------------------------

export function Field({
  label,
  hint,
  required,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 flex items-baseline gap-1.5 text-[0.78rem] font-semibold">
        {label}
        {required && <span className="text-amber-2">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[0.73rem] text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn('field', className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn('field', className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn('field', className)} {...props} />;
}

export function Alert({
  tone = 'warn',
  children,
}: {
  tone?: 'warn' | 'danger' | 'ok' | 'neutral';
  children: ReactNode;
}) {
  const map = {
    warn: 'border-[#E7CE8C] bg-[#FBEBC2]/60 text-[#6B4A05]',
    danger: 'border-[#E0AFAF] bg-[#F4D2D2]/60 text-[#7A1F1F]',
    ok: 'border-[#B6D3BC] bg-[#DCEBDF]/60 text-[#1F4A2B]',
    neutral: 'border-[color:var(--line)] bg-paper-2 text-ink',
  } as const;
  return (
    <div className={cn('rounded-[2px] border px-3 py-2 text-[0.85rem]', map[tone])}>{children}</div>
  );
}

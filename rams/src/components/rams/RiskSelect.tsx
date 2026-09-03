'use client';

import { LIKELIHOOD, riskBand, riskScore, SEVERITY } from '@/lib/risk';

/** Likelihood x severity pair with a live score chip. */
export function RiskSelect({
  likelihood,
  severity,
  onChange,
  label,
  disabled,
}: {
  likelihood: number;
  severity: number;
  onChange: (next: { likelihood: number; severity: number }) => void;
  label: string;
  disabled?: boolean;
}) {
  const score = riskScore(likelihood, severity);
  const band = riskBand(score, severity);

  return (
    <div>
      <div className="mono mb-1 text-[0.62rem] uppercase tracking-[0.1em] text-muted">{label}</div>
      <div className="flex items-center gap-1.5">
        <select
          aria-label={`${label} likelihood`}
          className="field px-1.5 py-1 text-[0.76rem]"
          value={likelihood}
          disabled={disabled}
          onChange={(e) => onChange({ likelihood: Number(e.target.value), severity })}
        >
          {LIKELIHOOD.map((l) => (
            <option key={l.value} value={l.value}>
              L{l.value} · {l.label}
            </option>
          ))}
        </select>
        <select
          aria-label={`${label} severity`}
          className="field px-1.5 py-1 text-[0.76rem]"
          value={severity}
          disabled={disabled}
          onChange={(e) => onChange({ likelihood, severity: Number(e.target.value) })}
        >
          {SEVERITY.map((s) => (
            <option key={s.value} value={s.value}>
              S{s.value} · {s.label}
            </option>
          ))}
        </select>
        <span
          className="mono shrink-0 rounded-[2px] px-2 py-1 text-[0.76rem] font-bold"
          style={{ background: band.bg, color: band.fg }}
          title={band.action}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

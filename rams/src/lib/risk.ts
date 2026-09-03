// 5x5 risk scoring — the HSE-standard matrix used throughout the documents.

export const LIKELIHOOD = [
  { value: 1, label: 'Rare', help: 'Very unlikely to occur' },
  { value: 2, label: 'Unlikely', help: 'Could occur, but improbable' },
  { value: 3, label: 'Possible', help: 'Might occur occasionally' },
  { value: 4, label: 'Likely', help: 'Will probably occur' },
  { value: 5, label: 'Almost certain', help: 'Expected to occur' },
] as const;

export const SEVERITY = [
  { value: 1, label: 'Negligible', help: 'No injury / first aid not required' },
  { value: 2, label: 'Minor', help: 'First-aid injury, no lost time' },
  { value: 3, label: 'Moderate', help: 'RIDDOR over-7-day injury' },
  { value: 4, label: 'Major', help: 'Specified injury, long-term harm' },
  { value: 5, label: 'Catastrophic', help: 'Fatality or multiple major injuries' },
] as const;

export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

export type RiskBandInfo = {
  band: RiskBand;
  label: string;
  action: string;
  /** Text colour for the score chip. */
  fg: string;
  /** Background colour for the score chip. */
  bg: string;
};

const BANDS: Record<RiskBand, Omit<RiskBandInfo, 'band'>> = {
  low: {
    label: 'Low',
    action: 'Acceptable. Monitor and maintain existing controls.',
    fg: '#1F4A2B',
    bg: '#DCEBDF',
  },
  medium: {
    label: 'Medium',
    action: 'Tolerable. Apply the listed controls and review before work starts.',
    fg: '#6B4A05',
    bg: '#FBEBC2',
  },
  high: {
    label: 'High',
    action: 'Not acceptable without further control. Supervisor sign-off required.',
    fg: '#7A3908',
    bg: '#F8D8B8',
  },
  critical: {
    label: 'Critical',
    action: 'Stop. Work must not proceed until the risk is reduced.',
    fg: '#7A1F1F',
    bg: '#F4D2D2',
  },
};

/** Score = likelihood x severity, 1..25. */
export function riskScore(likelihood: number, severity: number): number {
  return clamp(likelihood) * clamp(severity);
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, Math.round(n)));
}

/**
 * Band a 1..25 score. A severity of 5 is never "low" however unlikely — a
 * potential fatality always carries at least a medium band so it can't be
 * signed off without controls.
 */
export function riskBand(score: number, severity?: number): RiskBandInfo {
  let band: RiskBand;
  if (score >= 15) band = 'critical';
  else if (score >= 10) band = 'high';
  else if (score >= 5) band = 'medium';
  else band = 'low';

  if (severity === 5 && band === 'low') band = 'medium';

  return { band, ...BANDS[band] };
}

export function bandInfo(band: RiskBand): RiskBandInfo {
  return { band, ...BANDS[band] };
}

export function likelihoodLabel(v: number): string {
  return LIKELIHOOD.find((l) => l.value === clamp(v))?.label ?? '—';
}

export function severityLabel(v: number): string {
  return SEVERITY.find((s) => s.value === clamp(v))?.label ?? '—';
}

/** The 5x5 grid, for rendering the matrix key on the report. */
export function riskMatrix() {
  return SEVERITY.map((sev) => ({
    severity: sev,
    cells: LIKELIHOOD.map((lik) => {
      const score = riskScore(lik.value, sev.value);
      return { likelihood: lik, score, ...riskBand(score, sev.value) };
    }),
  }));
}

/** Highest residual band across a set of hazards — drives the document badge. */
export function overallResidual(
  hazards: { residualLikelihood: number; residualSeverity: number }[]
): RiskBandInfo & { score: number } {
  let worst = 0;
  let worstSeverity = 1;
  for (const h of hazards) {
    const s = riskScore(h.residualLikelihood, h.residualSeverity);
    if (s > worst) {
      worst = s;
      worstSeverity = h.residualSeverity;
    }
  }
  return { score: worst, ...riskBand(worst, worstSeverity) };
}

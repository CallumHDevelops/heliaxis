import { Badge, type BadgeTone } from '@/components/ui';
import type { ProjectStatus, RamsStatus } from '@/lib/types';

const RAMS: Record<RamsStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'warn' },
  approved: { label: 'Approved', tone: 'solar' },
  issued: { label: 'Issued', tone: 'ok' },
  archived: { label: 'Archived', tone: 'neutral' },
};

const PROJECT: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  planning: { label: 'Planning', tone: 'neutral' },
  active: { label: 'Active', tone: 'solar' },
  on_hold: { label: 'On hold', tone: 'warn' },
  complete: { label: 'Complete', tone: 'ok' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

export function RamsStatusBadge({ status }: { status: RamsStatus }) {
  const s = RAMS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const s = PROJECT[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function RiskBadge({ score, band }: { score: number; band: string }) {
  const tone: BadgeTone =
    band === 'critical' ? 'danger' : band === 'high' ? 'warn' : band === 'medium' ? 'solar' : 'ok';
  return (
    <Badge tone={tone}>
      {band} · {score}
    </Badge>
  );
}

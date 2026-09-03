'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Input } from '@/components/ui';
import { categoryLabel, hazardsFor, type HazardTemplate } from '@/lib/content/hazards';
import { riskBand, riskScore } from '@/lib/risk';
import type { HazardEntry, Sector, TechnologyId } from '@/lib/types';

/**
 * Browse the hazard library for this technology and sector, and add entries to
 * the document. Already-added library hazards are shown as such so the author
 * can see coverage at a glance.
 */
export function HazardPicker({
  technology,
  sector,
  existing,
  onAdd,
  onClose,
}: {
  technology: TechnologyId;
  sector: Sector;
  existing: HazardEntry[];
  onAdd: (templates: HazardTemplate[]) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const usedIds = useMemo(
    () => new Set(existing.map((h) => h.libraryId).filter(Boolean) as string[]),
    [existing]
  );

  const available = useMemo(() => hazardsFor(technology, sector), [technology, sector]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(
      (h) =>
        h.hazard.toLowerCase().includes(q) ||
        categoryLabel(h.category).toLowerCase().includes(q) ||
        h.controls.some((c) => c.toLowerCase().includes(q))
    );
  }, [available, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, HazardTemplate[]>();
    for (const h of filtered) {
      const key = categoryLabel(h.category);
      map.set(key, [...(map.get(key) ?? []), h]);
    }
    return [...map.entries()];
  }, [filtered]);

  function confirm() {
    const templates = available.filter((h) => picked.includes(h.id));
    if (templates.length > 0) onAdd(templates);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 sm:items-center sm:p-6">
      <div className="flex max-h-[90dvh] w-full max-w-3xl flex-col rounded-[3px] border border-[color:var(--line)] bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--line)] px-4 py-3">
          <div>
            <div className="eyebrow">Hazard library</div>
            <h2 className="text-[1rem] font-extrabold">Add hazards</h2>
          </div>
          <Button type="button" variant="quiet" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="border-b border-[color:var(--line)] px-4 py-3">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hazards and controls…"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {grouped.length === 0 && (
            <p className="py-8 text-center text-[0.86rem] text-muted">
              No hazards match “{query}”. You can still add one by hand.
            </p>
          )}

          {grouped.map(([category, hazards]) => (
            <section key={category} className="mb-5">
              <h3 className="mono mb-2 text-[0.66rem] uppercase tracking-[0.12em] text-amber-2">
                {category}
              </h3>
              <ul className="space-y-1.5">
                {hazards.map((h) => {
                  const already = usedIds.has(h.id);
                  const on = picked.includes(h.id);
                  const score = riskScore(h.initialLikelihood, h.initialSeverity);
                  const band = riskBand(score, h.initialSeverity);

                  return (
                    <li key={h.id}>
                      <label
                        className={`flex cursor-pointer items-start gap-2.5 rounded-[2px] border p-2.5 transition-colors ${
                          already
                            ? 'border-[color:var(--line)] bg-paper-2/60 opacity-70'
                            : on
                              ? 'border-amber-2 bg-solar/12'
                              : 'border-[color:var(--line)] hover:border-[color:var(--line-strong)]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1 accent-[#C77F04]"
                          checked={on}
                          disabled={already}
                          onChange={() =>
                            setPicked((p) =>
                              p.includes(h.id) ? p.filter((x) => x !== h.id) : [...p, h.id]
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[0.85rem] font-semibold">{h.hazard}</p>
                          <p className="mt-0.5 line-clamp-2 text-[0.76rem] text-muted">
                            {h.controls.length} control{h.controls.length === 1 ? '' : 's'} ·{' '}
                            {h.controls[0]}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className="mono rounded-[2px] px-1.5 py-0.5 text-[0.7rem] font-bold"
                            style={{ background: band.bg, color: band.fg }}
                          >
                            {score}
                          </span>
                          {already && <Badge tone="ok">Added</Badge>}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--line)] px-4 py-3">
          <span className="mono text-[0.76rem] text-muted">
            {picked.length} selected · {available.length} in library
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="solar" onClick={confirm} disabled={picked.length === 0}>
              Add {picked.length > 0 ? picked.length : ''} hazard
              {picked.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

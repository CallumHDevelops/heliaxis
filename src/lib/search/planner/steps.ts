import type { Service } from './words';

/**
 * The monthly keyword research as small steps (spec §7: never one long request), with a pre-flight cost estimate. Pure.
 * Labs prices (Nov 2026, to check against the logged task costs): about $0.01 a task plus $0.0001 a row; search_intent
 * about $0.001 a task plus $0.0001 a keyword.
 */

export const LIMITS = { gapRows: 200, ideaRows: 300, relatedRows: 100, bulkKeywords: 1000, seeds: 200 } as const;
export const LABS = { task: 0.01, row: 0.0001, intentTask: 0.001 } as const;

/** Head terms used to ask Labs for ideas, one set per service we track. */
export const SERVICE_SEEDS: Record<Exclude<Service, 'general'>, string[]> = {
  solar: ['solar panels', 'solar panel installers', 'solar pv installation'],
  battery: ['home battery storage', 'solar battery storage'],
  heat_pump: ['air source heat pump', 'heat pump installers'],
  ev: ['ev charger installation', 'home ev charger'],
  infrared: ['infrared heating panels'],
};

export type Step = { id: string; paid: boolean; estimate: number };

export function researchSteps(rivals: string[], relatedSeeds: string[]): Step[] {
  const rows = (n: number) => Math.round((LABS.task + n * LABS.row) * 10000) / 10000;
  return [
    { id: 'free', paid: false, estimate: 0 },
    ...rivals.map((d) => ({ id: `gap:${d}`, paid: true, estimate: rows(LIMITS.gapRows) })),
    { id: 'ideas', paid: true, estimate: rows(LIMITS.ideaRows) },
    ...relatedSeeds.map((s) => ({ id: `related:${s}`, paid: true, estimate: rows(LIMITS.relatedRows) })),
    { id: 'difficulty', paid: true, estimate: rows(LIMITS.bulkKeywords) },
    { id: 'intent', paid: true, estimate: Math.round((LABS.intentTask + LIMITS.bulkKeywords * LABS.row) * 10000) / 10000 },
  ];
}

export const estimateOf = (steps: Step[]) => Math.round(steps.reduce((a, s) => a + s.estimate, 0) * 100) / 100;

/** The related-keywords seeds: the first head term of each service we track (all services when nothing is tracked). */
export function relatedSeedsFor(services: string[]): string[] {
  const keys = Object.keys(SERVICE_SEEDS) as (keyof typeof SERVICE_SEEDS)[];
  const have = keys.filter((k) => services.includes(k));
  return (have.length ? have : keys).map((k) => SERVICE_SEEDS[k][0]);
}

/** Keyword-ideas seeds: every head term for the services we track, then tracked phrases, up to Labs' 200. */
export function ideaSeedsFor(services: string[], trackedPhrases: string[]): string[] {
  const keys = Object.keys(SERVICE_SEEDS) as (keyof typeof SERVICE_SEEDS)[];
  const have = keys.filter((k) => services.includes(k));
  const heads = (have.length ? have : keys).flatMap((k) => SERVICE_SEEDS[k]);
  return [...new Set([...heads, ...trackedPhrases.map((p) => p.toLowerCase().trim()).filter(Boolean)])].slice(0, LIMITS.seeds);
}

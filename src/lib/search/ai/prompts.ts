/**
 * Question proposals for M6 (spec §5 M6): town × service questions from the Tier 1 areas, plus consideration questions.
 * A person accepts each one; nothing here is asked until it is in ai_prompt. Pure.
 */

export type ProposedPrompt = { prompt: string; town: string | null; service: string | null; kind: 'local' | 'consideration' };

/** Core services, as the old prompts name them, with how a homeowner would ask. */
const ASK: { service: string; match: RegExp; ask: (town: string) => string }[] = [
  { service: 'solar', match: /solar/i, ask: (t) => `Who are the best solar panel installers in ${t}?` },
  { service: 'battery', match: /batter|storage/i, ask: (t) => `Who installs home batteries in ${t}?` },
  { service: 'heat pump', match: /heat pump/i, ask: (t) => `Who can install an air source heat pump in ${t}?` },
  { service: 'ev charger', match: /\bev\b|charg/i, ask: (t) => `Who installs home EV chargers in ${t}?` },
];

export const CONSIDERATION: ProposedPrompt[] = [
  'Is solar worth it in Wales?',
  'Are home batteries worth it in the UK without solar panels?',
  'Is an air source heat pump worth it for an older house in Wales?',
  'How do I choose a good solar installer in South Wales?',
  'Do I need planning permission for solar panels in Wales?',
  'What grants are there for heat pumps in Wales?',
].map((prompt) => ({ prompt, town: null, service: null, kind: 'consideration' as const }));

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Proposals not already asked. Towns: the first town of each Tier 1 area (that is the one the area is named for).
 * Services: the core ones (solar, battery, heat pump) unless the caller passes the Business facts list.
 */
export function proposePrompts(
  areas: { name: string; tier: number; towns: string[] }[],
  existing: string[],
  opts: { services?: string[]; limit?: number } = {},
): ProposedPrompt[] {
  const have = new Set(existing.map(key));
  const services = opts.services?.length ? ASK.filter((a) => opts.services!.some((s) => a.match.test(s))) : ASK.slice(0, 3);
  const towns = [...new Set(areas.filter((a) => a.tier === 1).map((a) => a.towns[0] || a.name).filter(Boolean))];
  const out: ProposedPrompt[] = [];
  for (const s of services) for (const t of towns) out.push({ prompt: s.ask(t), town: t, service: s.service, kind: 'local' });
  out.push(...CONSIDERATION);
  // Skip anything already asked, including the same town and service asked in other words.
  const asked = existing.map(key);
  const fresh = out.filter((p) => {
    if (have.has(key(p.prompt))) return false;
    if (p.kind === 'local' && p.town && p.service) {
      const svc = ASK.find((a) => a.service === p.service)!;
      return !asked.some((e) => e.includes(key(p.town!)) && svc.match.test(e) && /install|compan|firm/.test(e));
    }
    return true;
  });
  return fresh.slice(0, opts.limit ?? 60);
}

/** Cleans a question typed on the page: one line, a question mark, 8 to 300 characters. */
export function cleanPrompt(raw: string): string | null {
  const p = raw.replace(/\s+/g, ' ').trim();
  if (p.length < 8 || p.length > 300) return null;
  return /[?.!]$/.test(p) ? p : `${p}?`;
}

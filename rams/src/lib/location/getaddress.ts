import 'server-only';

/**
 * getAddress.io — PAF-licensed UK address lookup.
 *
 * Two-step: /autocomplete/{term} returns suggestions with an opaque id, then
 * /get/{id} resolves the full address. The key is read server-side only and is
 * never sent to the browser — the client talks to our own /api/location routes.
 *
 * Every function degrades to null / [] when GETADDRESS_API_KEY is unset, so the
 * form stays usable as plain text fields without the integration configured.
 */

const BASE = 'https://api.getaddress.io';

export type AddressSuggestion = {
  id: string;
  label: string;
};

export type ResolvedAddress = {
  /** Street lines only — no town, county or postcode. */
  lines: string[];
  town: string;
  county: string | null;
  postcode: string;
  lat: number | null;
  lng: number | null;
  /** The whole thing on one line, as getAddress formatted it. */
  formatted: string;
};

export function isAddressLookupEnabled(): boolean {
  return !!process.env.GETADDRESS_API_KEY;
}

function key(): string | null {
  return process.env.GETADDRESS_API_KEY || null;
}

export async function autocompleteAddress(term: string): Promise<AddressSuggestion[]> {
  const apiKey = key();
  const query = term.trim();
  if (!apiKey || query.length < 2) return [];

  try {
    const res = await fetch(
      `${BASE}/autocomplete/${encodeURIComponent(query)}?api-key=${encodeURIComponent(apiKey)}&all=true&top=20`,
      { cache: 'no-store' }
    );
    // 429 means we have burned the plan's rate limit; treat as "no suggestions"
    // rather than an error, so the user can still type the address by hand.
    if (!res.ok) return [];

    const body = await res.json();
    const suggestions = Array.isArray(body?.suggestions) ? body.suggestions : [];

    return suggestions
      .map((s: Record<string, unknown>) => ({
        id: typeof s.id === 'string' ? s.id : '',
        label: typeof s.address === 'string' ? s.address : '',
      }))
      .filter((s: AddressSuggestion) => s.id && s.label);
  } catch {
    return [];
  }
}

/** Pull the street lines out of whichever shape the plan returns. */
function streetLines(body: Record<string, unknown>): string[] {
  const formatted = body.formatted_address;
  if (Array.isArray(formatted)) {
    // formatted_address is [line_1..line_4, town_or_city, county]; the last two
    // are captured separately, so drop them and any blanks.
    return formatted
      .slice(0, 4)
      .map((l) => (typeof l === 'string' ? l.trim() : ''))
      .filter(Boolean);
  }

  return ['line_1', 'line_2', 'line_3', 'line_4']
    .map((k) => (typeof body[k] === 'string' ? (body[k] as string).trim() : ''))
    .filter(Boolean);
}

export async function resolveAddress(id: string): Promise<ResolvedAddress | null> {
  const apiKey = key();
  if (!apiKey || !id) return null;

  try {
    const res = await fetch(
      `${BASE}/get/${encodeURIComponent(id)}?api-key=${encodeURIComponent(apiKey)}`,
      { cache: 'no-store' }
    );
    if (!res.ok) return null;

    const body = (await res.json()) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

    const lines = streetLines(body);
    const town = str(body.town_or_city) ?? str(body.locality) ?? '';
    const county = str(body.county) ?? str(body.district);
    const postcode = str(body.postcode) ?? '';

    return {
      lines,
      town,
      county,
      postcode,
      lat: num(body.latitude),
      lng: num(body.longitude),
      formatted: [...lines, town, county, postcode].filter(Boolean).join(', '),
    };
  } catch {
    return null;
  }
}

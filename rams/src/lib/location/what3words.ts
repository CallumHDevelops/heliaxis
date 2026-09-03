import 'server-only';

/**
 * what3words — converts the site coordinates to a three-word address for the
 * report cover, so an ambulance can be directed to the working position rather
 * than to the postcode centroid.
 *
 * Returns null when W3W_API_KEY is unset, which leaves the field as plain text
 * the user can paste into by hand.
 */

export function isWhat3WordsEnabled(): boolean {
  return !!process.env.W3W_API_KEY;
}

export type What3WordsResult = {
  /** Formatted with the leading slashes, as what3words style requires. */
  words: string;
  nearestPlace: string | null;
};

export async function whatThreeWords(
  lat: number,
  lng: number
): Promise<What3WordsResult | null> {
  const apiKey = process.env.W3W_API_KEY;
  if (!apiKey) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  try {
    const url = new URL('https://api.what3words.com/v3/convert-to-3wa');
    url.searchParams.set('coordinates', `${lat},${lng}`);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('language', 'en');
    url.searchParams.set('format', 'json');

    const res = await fetch(url, { next: { revalidate: 604800 } });
    if (!res.ok) return null;

    const body = await res.json();
    const words = typeof body?.words === 'string' ? body.words : null;
    if (!words) return null;

    return {
      words: `///${words}`,
      nearestPlace: typeof body?.nearestPlace === 'string' ? body.nearestPlace : null,
    };
  } catch {
    return null;
  }
}

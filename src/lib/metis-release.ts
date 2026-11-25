/**
 * What the App page needs to offer Metis for Windows and Mac: the version, size and download address of each, read from
 * the update feed that electron-builder writes (latest.yml for Windows, latest-mac.yml for Mac) in the folder
 * METIS_UPDATE_URL points at. The feed is untrusted text from another server, so a file name is only used if it is a plain
 * name, and the download address is always built from our own base.
 */

export type Download = { file: string; url: string; sizeBytes: number | null; sha512: string | null };
export type MetisRelease = { version: string; releasedAt: string | null; windows: Download | null; mac: Download | null };

type Parsed = { version: string; releasedAt: string | null; files: { name: string; size: number | null; sha512: string | null }[] };

/** The few fields we need from electron-builder's feed (it is simple, regular YAML). */
export function parseFeed(text: string): Parsed | null {
  const version = /^version:\s*['"]?([0-9][^\s'"]*)['"]?\s*$/m.exec(text)?.[1];
  if (!version) return null;
  const releasedAt = /^releaseDate:\s*['"]?([^'"\n]+)['"]?\s*$/m.exec(text)?.[1] ?? null;
  const files = text
    .split(/^\s*-\s+url:\s*/m)
    .slice(1)
    .map((block) => {
      const name = block.split(/\r?\n/)[0].trim().replace(/^['"]|['"]$/g, '');
      const size = /^\s*size:\s*(\d+)/m.exec(block)?.[1];
      const sha512 = /^\s*sha512:\s*(\S+)/m.exec(block)?.[1] ?? null;
      return { name, size: size ? Number(size) : null, sha512 };
    });
  return { version, releasedAt, files };
}

/** A plain file name: letters, digits, dots, dashes, underscores, spaces. Anything with a path or odd characters is refused. */
export const safeName = (n: string) => /^[A-Za-z0-9][A-Za-z0-9._ -]{0,120}$/.test(n) && !n.includes('..');

export function downloadFrom(p: Parsed | null, base: string, ext: '.exe' | '.dmg'): Download | null {
  const f = p?.files.find((x) => x.name.toLowerCase().endsWith(ext) && safeName(x.name));
  if (!f) return null;
  return { file: f.name, url: `${base.replace(/\/+$/, '')}/${encodeURIComponent(f.name)}`, sizeBytes: f.size, sha512: f.sha512 };
}

export function releaseFrom(win: string | null, mac: string | null, base: string): MetisRelease | null {
  const w = win ? parseFeed(win) : null;
  const m = mac ? parseFeed(mac) : null;
  const windows = downloadFrom(w, base, '.exe');
  const macDl = downloadFrom(m, base, '.dmg');
  if (!windows && !macDl) return null;
  const version = (windows ? w : m)!.version;
  return { version, releasedAt: ((windows ? w : m) as Parsed).releasedAt, windows, mac: macDl };
}

async function get(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 300 } } as RequestInit);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

/** The published Metis release, or null if none is published (or the feed is not reachable). */
export async function readMetisRelease(): Promise<MetisRelease | null> {
  const base = (process.env.METIS_UPDATE_URL || '').trim();
  if (!/^https:\/\//.test(base)) return null;
  const [win, mac] = await Promise.all([get(`${base.replace(/\/+$/, '')}/latest.yml`), get(`${base.replace(/\/+$/, '')}/latest-mac.yml`)]);
  return releaseFrom(win, mac, base);
}

/**
 * Social monitoring can only READ from the platforms. Meta's comment permissions also allow replying,
 * hiding and deleting, so "read only" is enforced here, in code: every platform request goes through
 * platformGet(), which refuses anything but GET and any host that isn't Meta's. There is deliberately no
 * function in this folder that posts, replies, hides or deletes. (tests/social/readonly.test.ts checks.)
 */

export class ReadOnlyViolation extends Error {}

const HOSTS = new Set(['graph.facebook.com', 'graph.instagram.com']);

export function assertReadOnly(method: string, url: string) {
  const u = new URL(url);
  if (method.toUpperCase() !== 'GET') throw new ReadOnlyViolation(`Social monitoring may only read. Refused ${method.toUpperCase()} ${u.host}${u.pathname}`);
  if (!HOSTS.has(u.host)) throw new ReadOnlyViolation(`Social monitoring may not call ${u.host}`);
}

export type PlatformResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number; code?: number };

/** GET a Meta URL with the token in a header (so it never lands in a URL or log). Never throws on a bad reply. */
export async function platformGet<T>(url: string, token: string): Promise<PlatformResult<T>> {
  assertReadOnly('GET', url);
  try {
    const r = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    const d = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & Record<string, unknown>;
    if (!r.ok) return { ok: false, status: r.status, error: d.error?.message || `Meta returned ${r.status}`, code: d.error?.code };
    return { ok: true, data: d as T };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'Network error' };
  }
}

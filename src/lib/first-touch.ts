/** This visit's first touch from session storage (written by PublicTrackers), sent with enquiries. Browser only. */
export function firstTouch(): unknown {
  try {
    const v = typeof window !== 'undefined' ? window.sessionStorage.getItem('hx_ft') : null;
    return v ? JSON.parse(v) : undefined;
  } catch {
    return undefined;
  }
}

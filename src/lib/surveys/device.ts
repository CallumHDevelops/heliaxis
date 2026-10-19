/**
 * Phone sensors for the survey form: the compass (which way a roof faces), the tilt (roof pitch with
 * the phone laid along a rafter) and keeping the screen on.
 *
 * /admin pages send Permissions-Policy camera=(), microphone=(), geolocation=(); orientation, motion
 * and the Screen Wake Lock aren't covered by it. On iPhone, orientation and motion need permission,
 * asked from a tap (call watchCompass / watchPitch from a click handler).
 *
 * The maths is pure (tested in scripts/test-survey-rules.mjs); the watchers only run in the browser.
 */

export const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassPoint = (typeof COMPASS_POINTS)[number];

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** The nearest of the 8 buttons: 0, 45 … 315. */
export function nearestCompass(deg: number): number {
  return (Math.round(norm(deg) / 45) % 8) * 45;
}

/** "SW" for 225 (or anything nearest it). */
export const compassLabel = (deg: number): CompassPoint => COMPASS_POINTS[nearestCompass(deg) / 45];

/** Pointing the phone AT a roof from the ground: the roof faces back towards you, the opposite way. */
export const roofFacingFromLooking = (deg: number): number => norm(deg + 180);

/**
 * Compass heading (degrees clockwise from north) from an orientation event.
 * iOS gives webkitCompassHeading. Android's absolute alpha runs anticlockwise, so heading is
 * (360 − alpha), then turned by the screen's rotation. Null when the event isn't a real compass.
 */
export function headingFrom(
  e: { alpha?: number | null; absolute?: boolean; webkitCompassHeading?: number | null },
  screenAngle = 0,
  absoluteEvent = false
): number | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) return norm(e.webkitCompassHeading);
  if ((absoluteEvent || e.absolute) && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) return norm(360 - e.alpha + screenAngle);
  return null;
}

/**
 * Roof pitch from gravity with the phone laid along a rafter, long edge down the slope:
 * atan2(|y|, √(x² + z²)), so face up or face down both work. Rounded to 0.5°.
 */
export function pitchFrom(x: number, y: number, z: number): number | null {
  if (![x, y, z].every(Number.isFinite)) return null;
  const g = Math.sqrt(x * x + y * y + z * z);
  if (g < 5) return null; // free fall, or no real reading
  const deg = (Math.atan2(Math.abs(y), Math.sqrt(x * x + z * z)) * 180) / Math.PI;
  return Math.round(deg * 2) / 2;
}

/** Google Maps directions to the site (a plain link out). */
export function directionsUrl(address?: string | null, postcode?: string | null): string | null {
  const dest = [address, postcode].map((s) => (s || '').trim()).filter(Boolean).join(', ');
  return dest ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}` : null;
}

/* ── Browser only ─────────────────────────────────────────────────────────────── */

type PermissionApi = { requestPermission?: () => Promise<'granted' | 'denied' | 'default'> };

async function ask(api: unknown): Promise<boolean> {
  const req = (api as PermissionApi | undefined)?.requestPermission;
  if (typeof req !== 'function') return true; // Android and desktop don't ask
  try {
    return (await req.call(api)) === 'granted';
  } catch {
    return false;
  }
}

const screenAngle = () => {
  const o = (screen as Screen & { orientation?: { angle?: number } }).orientation;
  return typeof o?.angle === 'number' ? o.angle : Number((window as Window & { orientation?: number }).orientation) || 0;
};

/**
 * Live compass headings. Call from a tap (iPhone asks permission). Resolves to a stop function, or
 * null when there's no compass or permission was refused.
 */
export async function watchCompass(onHeading: (deg: number) => void): Promise<(() => void) | null> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return null;
  if (!(await ask(window.DeviceOrientationEvent))) return null;
  const absolute = 'ondeviceorientationabsolute' in window;
  const type = absolute ? 'deviceorientationabsolute' : 'deviceorientation';
  const on = (e: Event) => {
    const h = headingFrom(e as DeviceOrientationEvent & { webkitCompassHeading?: number }, screenAngle(), absolute);
    if (h != null) onHeading(h);
  };
  window.addEventListener(type, on);
  return () => window.removeEventListener(type, on);
}

/** Live pitch readings (degrees). Call from a tap. Null when there's no motion sensor or no permission. */
export async function watchPitch(onPitch: (deg: number) => void): Promise<(() => void) | null> {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return null;
  if (!(await ask(window.DeviceMotionEvent))) return null;
  const on = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (!g) return;
    const p = pitchFrom(g.x ?? NaN, g.y ?? NaN, g.z ?? NaN);
    if (p != null) onPitch(p);
  };
  window.addEventListener('devicemotion', on);
  return () => window.removeEventListener('devicemotion', on);
}

/** Keep the screen on while the survey is open (asked again when the app comes back). Returns a stop function. */
export function keepScreenOn(): () => void {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return () => {};
  let lock: WakeLockSentinel | null = null;
  let stopped = false;
  const get = () => {
    if (stopped || document.visibilityState !== 'visible') return;
    navigator.wakeLock
      .request('screen')
      .then((l) => {
        if (stopped) void l.release().catch(() => {});
        else lock = l;
      })
      .catch(() => {});
  };
  get();
  document.addEventListener('visibilitychange', get);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', get);
    void lock?.release().catch(() => {});
    lock = null;
  };
}

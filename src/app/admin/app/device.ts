/** The four devices the App page offers. */
export type Device = 'mac' | 'windows' | 'ios' | 'android';

export const DEVICES: { id: Device; name: string; caption: string }[] = [
  { id: 'mac', name: 'macOS', caption: 'Mac · Metis app' },
  { id: 'windows', name: 'Windows', caption: 'PC · Metis app' },
  { id: 'ios', name: 'iOS', caption: 'iPhone & iPad' },
  { id: 'android', name: 'Android', caption: 'Phone & tablet' },
];

/**
 * Which device the person is probably on, to start with the right choice selected (they can always pick another). An iPad
 * reports itself as a Mac, so a Mac with a touch screen is an iPad. Anything else (Linux, a Chromebook) gets no guess.
 */
export function detectDevice(userAgent: string, touchPoints = 0): Device | null {
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'ios';
  if (/android/i.test(userAgent)) return 'android';
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'mac';
  if (/Windows/.test(userAgent)) return 'windows';
  return null;
}

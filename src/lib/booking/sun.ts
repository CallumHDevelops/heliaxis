/**
 * Sunset times (NOAA's solar calculator, accurate to a minute or two in the UK), so solar surveys
 * finish while there's still light to see the roof. Pure: loaded straight into node by the tests.
 */

const rad = Math.PI / 180;
const deg = 180 / Math.PI;

/** Sunset in UTC minutes after midnight of that UTC date, worked out for the Julian day `jd`. */
function sunsetMinutes(jd: number, lat: number, lng: number): number {
  const t = (jd - 2451545) / 36525; // Julian centuries since J2000
  const L = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360; // geometric mean longitude
  const M = 357.52911 + t * (35999.05029 - 0.0001537 * t); // mean anomaly
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t); // orbit eccentricity
  const C =
    Math.sin(M * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * M * rad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * M * rad) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const appLong = L + C - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(obliq * rad) * Math.sin(appLong * rad)) * deg;
  const y = Math.tan((obliq / 2) * rad) ** 2;
  const eqTime =
    4 *
    deg *
    (y * Math.sin(2 * L * rad) -
      2 * e * Math.sin(M * rad) +
      4 * e * y * Math.sin(M * rad) * Math.cos(2 * L * rad) -
      0.5 * y * y * Math.sin(4 * L * rad) -
      1.25 * e * e * Math.sin(2 * M * rad));
  const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl * rad)) - Math.tan(lat * rad) * Math.tan(decl * rad);
  const ha = Math.acos(Math.min(1, Math.max(-1, cosH))) * deg; // clamped: never polar in the UK
  const solarNoon = 720 - 4 * lng - eqTime;
  return solarNoon + 4 * ha;
}

/** Sunset (epoch ms) on a date ('YYYY-MM-DD') at a place. */
export function sunsetMs(ymd: string, lat: number, lng: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${ymd}`);
  const midnight = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const jd0 = midnight / 86_400_000 + 2440587.5;
  // Once for noon, then again for the time it gives (the sun moves a little during the day).
  let mins = sunsetMinutes(jd0 + 0.5, lat, lng);
  mins = sunsetMinutes(jd0 + mins / 1440, lat, lng);
  return midnight + Math.round(mins * 60_000);
}

/**
 * WGS84 latitude/longitude to and from UTM metres, and the angle between grid north and true north there. Google's height maps
 * come as GeoTIFFs in UTM, so this places them on the earth. Pure maths (Snyder's series), accurate to centimetres.
 */
const A = 6378137;
const E2 = 0.00669437999014;
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const cm = (zone: number) => -183 + zone * 6;
export const utmZone = (lng: number) => Math.floor((lng + 180) / 6) + 1;

const meridian = (p: number) =>
  A * ((1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * p - ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * p) + ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * p) - ((35 * E2 ** 3) / 3072) * Math.sin(6 * p));

export function toUtm(lat: number, lng: number, zone = utmZone(lng)): { e: number; n: number } {
  const p = rad(lat);
  const N = A / Math.sqrt(1 - E2 * Math.sin(p) ** 2);
  const T = Math.tan(p) ** 2;
  const C = EP2 * Math.cos(p) ** 2;
  const a = rad(lng - cm(zone)) * Math.cos(p);
  const e = K0 * N * (a + ((1 - T + C) * a ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * EP2) * a ** 5) / 120) + 500000;
  const n = K0 * (meridian(p) + N * Math.tan(p) * ((a * a) / 2 + ((5 - T + 9 * C + 4 * C * C) * a ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * EP2) * a ** 6) / 720));
  return { e, n };
}

export function fromUtm(e: number, n: number, zone: number): { lat: number; lng: number } {
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const mu = n / K0 / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const p1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const C1 = EP2 * Math.cos(p1) ** 2;
  const T1 = Math.tan(p1) ** 2;
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(p1) ** 2);
  const R1 = (A * (1 - E2)) / (1 - E2 * Math.sin(p1) ** 2) ** 1.5;
  const D = (e - 500000) / (N1 * K0);
  const lat = p1 - ((N1 * Math.tan(p1)) / R1) * ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * D ** 6) / 720);
  const lng = rad(cm(zone)) + (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * D ** 5) / 120) / Math.cos(p1);
  return { lat: deg(lat), lng: deg(lng) };
}

/** Radians that grid north is turned from true north at a place (positive east of the zone's central meridian). */
export const convergence = (lat: number, lng: number, zone: number) => Math.atan(Math.tan(rad(lng - cm(zone))) * Math.sin(rad(lat)));

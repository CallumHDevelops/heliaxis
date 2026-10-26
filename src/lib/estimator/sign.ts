import 'server-only';
import { createHmac } from 'node:crypto';

/** The signature the roof lookup puts on a picture link, so only buildings we looked up can be fetched (and billed). */
export const signView = (lat: number, lng: number) => createHmac('sha256', process.env.GOOGLE_SOLAR_API_KEY || 'none').update(`${lat.toFixed(5)},${lng.toFixed(5)}`).digest('hex').slice(0, 20);

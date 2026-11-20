/**
 * Where the customer portal lives. In production it has its own address, portal.heliaxis.co.uk: the
 * sign-in page is its home ("/") and a project is "/<token>". The pages themselves stay at /my in the
 * app: the middleware rewrites the portal host onto them, and sends old heliaxis.co.uk/my links there.
 * Locally and on preview deployments the portal is still at /my on the same host. Pure: safe anywhere.
 */

export const CUSTOMER_HOST = 'portal.heliaxis.co.uk';
export const CUSTOMER_ORIGIN = `https://${CUSTOMER_HOST}`;
/** The site whose /my links move to the portal host. */
export const MAIN_HOSTS = ['heliaxis.co.uk', 'www.heliaxis.co.uk'];

const bare = (host: string | null | undefined) => (host ?? '').split(':')[0].toLowerCase();

/** portal.heliaxis.co.uk, or portal.localhost to try it locally. */
export const isCustomerHost = (host: string | null | undefined) => {
  const h = bare(host);
  return h === CUSTOMER_HOST || h === 'portal.localhost';
};
export const isMainHost = (host: string | null | undefined) => MAIN_HOSTS.includes(bare(host));

/** An app path under /my as it reads on the portal host: /my → /, /my/abc → /abc, /my?x → /?x. */
export function onCustomerHost(path: string): string {
  const p = path.replace(/^\/my(?=[/?#]|$)/, '');
  return p.startsWith('/') ? p : `/${p}`;
}

/** In the browser: an app path under /my as this page's host wants it. */
export function portalPathHere(path: string): string {
  return typeof window !== 'undefined' && isCustomerHost(window.location.host) ? onCustomerHost(path) : path;
}

/**
 * The portal's public address for messages: CUSTOMER_PORTAL_URL if set; portal.heliaxis.co.uk for the
 * live site; otherwise this site's /my (local and preview deployments).
 */
export function customerPortalOrigin(siteUrl: string): string {
  const env = process.env.CUSTOMER_PORTAL_URL?.replace(/\/$/, '');
  if (env) return env;
  return isMainHost(siteUrl.replace(/^https?:\/\//, '')) ? CUSTOMER_ORIGIN : `${siteUrl}/my`;
}

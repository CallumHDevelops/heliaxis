// Card deposits (src/lib/stripe.ts): "connected" and the Pay by card button only when Stripe is set up
// all the way, with both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. With the key alone a customer could
// pay but the job would never hear of it (the webhook can't be checked), so it stays off: CRM settings say
// not connected, the portal has no Pay by card, and the deposit route makes no Stripe checkout.
// Usage: node --experimental-strip-types scripts/test-stripe-deposits.mjs
import * as kit from './site-test-kit.mjs';

kit.setup({
  '@/lib/crm/portal': `
    export async function projectByToken(t) { return t === 'tok' ? { id: 'p1', enquiry_id: 'e1', title: 'Solar', deposit_amount: 500, deposit_paid_at: null } : null; }
    export async function projectSigned() { return true; }`,
  '@/lib/crm/server': `${kit.STUBS['@/lib/crm/server']}\nexport const portalUrl = (t) => 'https://heliaxis.test/my/' + t;\nexport async function ensurePortalToken() { return 'portal-token'; }`,
  '@/lib/ms365': `export const msConfigured = () => false; export const mailbox = () => null; export async function sendMail() { return null; }`,
  // The settings route reaches the follow-up sequence (automation.ts), which needs these: not used here.
  '@/lib/crm/booking-link': `export async function ensureBookingToken() { return 'booking-token'; } export const bookingUrl = (t) => 'https://heliaxis.test/book/' + t;`,
  '@/lib/crm/move-stage': 'export async function applyStageEvent() { return { ok: true }; }',
  '@/lib/whatsapp/inbox': 'export async function sendSystem() { return { ok: true }; }',
});
const { eq } = kit;
const { stripeConfigured, verifyStripe } = await import('../src/lib/stripe.ts');
const depositRoute = await import('../src/app/api/my/[token]/deposit/route.ts');
const settingsRoute = await import('../src/app/api/crm/settings/route.ts');

const stripeCalls = [];
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.stripe.com/')) {
    stripeCalls.push(String(init.body));
    return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }), { status: 200 });
  }
  throw new Error('offline in the test');
};
const env = (key, hook) => {
  if (key) process.env.STRIPE_SECRET_KEY = key;
  else delete process.env.STRIPE_SECRET_KEY;
  if (hook) process.env.STRIPE_WEBHOOK_SECRET = hook;
  else delete process.env.STRIPE_WEBHOOK_SECRET;
};
const pay = () => kit.call(depositRoute, '/api/my/tok/deposit', { params: { token: 'tok' } });
const connected = async () => (await kit.call(settingsRoute, '/api/crm/settings', { method: 'GET' })).body.connected.stripe;

env(null, null);
eq('nothing set: off', [stripeConfigured(), await connected()], [false, false]);

env('sk_test_123', null);
eq('the secret key alone: still off (payments couldn’t be recorded)', [stripeConfigured(), await connected()], [false, false]);
const half = await pay();
eq('…the deposit route makes no checkout and points to bank details', [half.status, half.body.error, stripeCalls.length], [400, 'Card payments aren’t set up yet. We’ll send you bank details.', 0]);
eq('…and the webhook couldn’t have recorded one anyway', verifyStripe('{}', `t=${Math.floor(Date.now() / 1000)},v1=abc`), false);

env(null, 'whsec_123');
eq('the webhook secret alone: off', stripeConfigured(), false);

env('sk_test_123', 'whsec_123');
eq('both set: connected', [stripeConfigured(), await connected()], [true, true]);
const full = await pay();
eq('…the customer gets a Stripe checkout for the deposit, tagged with the job', [full.status, full.body.url, /metadata%5Bproject_id%5D=p1/.test(stripeCalls[0] ?? '')], [200, 'https://checkout.stripe.test/cs_1', true]);

kit.done();

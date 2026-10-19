import 'server-only';

/**
 * Which Vercel environment variables the live site can see, grouped by feature. Names only:
 * values never leave the server. Used by /admin/setup/env.
 */

export type EnvVar = {
  /** One name, or alternatives ("A|B" = either is fine). */
  name: string;
  secret: boolean;
  optional?: boolean;
  /** Where the value comes from. */
  hint: string;
};
export type EnvGroup = { title: string; what: string; vars: EnvVar[] };

export const ENV_GROUPS: EnvGroup[] = [
  {
    title: 'Core',
    what: 'The site and database. Already working if you can see this page.',
    vars: [
      { name: 'NEXT_PUBLIC_SUPABASE_URL', secret: false, hint: 'Supabase → Project settings → API' },
      { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', secret: false, hint: 'Supabase → Project settings → API' },
      { name: 'SUPABASE_SERVICE_ROLE_KEY', secret: true, hint: 'Supabase → Project settings → API' },
      { name: 'CRON_SECRET', secret: true, hint: 'Any long random text, also used by the Supabase cron job' },
      { name: 'NEXT_PUBLIC_SITE_URL', secret: false, hint: 'https://heliaxis.co.uk' },
    ],
  },
  {
    title: 'Metis (Claude)',
    what: 'The assistant.',
    vars: [{ name: 'ANTHROPIC_API_KEY', secret: true, hint: 'console.anthropic.com → API keys' }],
  },
  {
    title: 'Phone notifications',
    what: 'Push notifications to the app.',
    vars: [
      { name: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', secret: false, hint: 'From Claude → Generate keys' },
      { name: 'VAPID_PRIVATE_KEY', secret: true, hint: 'From Claude → Generate keys' },
      { name: 'VAPID_SUBJECT', secret: false, hint: 'mailto:callum@heliaxis.co.uk' },
    ],
  },
  {
    title: 'Answers for Claude',
    what: 'Lets the answer boxes on Claude’s questions (From Claude card) post where Claude can read them.',
    vars: [
      { name: 'GITHUB_ANSWERS_TOKEN', secret: true, optional: true, hint: 'GitHub → fine-grained token, heliaxis repo only, Issues: read and write' },
      { name: 'GITHUB_ANSWERS_REPO', secret: false, optional: true, hint: 'Defaults to CallumHDevelops/heliaxis' },
    ],
  },
  {
    title: 'One-tap sign-in to RAMS',
    what: 'Opens RAMS from the Heliaxis menu already signed in, for anyone with an approved RAMS account under the same email.',
    vars: [
      { name: 'RAMS_SUPABASE_URL', secret: false, optional: true, hint: 'RAMS Supabase project → Project settings → API → Project URL' },
      { name: 'RAMS_SUPABASE_SERVICE_ROLE_KEY', secret: true, optional: true, hint: 'RAMS Supabase project → Project settings → API → service_role key' },
    ],
  },
  {
    title: 'One-tap sign-in to the social studio',
    what: 'Opens Social media studio from the Heliaxis menu already signed in, for anyone with a studio account under the same email.',
    vars: [
      { name: 'SOCIAL_SUPABASE_URL', secret: false, optional: true, hint: 'Social studio Supabase project → Project settings → Data API → Project URL' },
      { name: 'SOCIAL_SUPABASE_SERVICE_ROLE_KEY', secret: true, optional: true, hint: 'Social studio Supabase project → Project settings → API Keys → service_role key' },
    ],
  },
  {
    title: 'Android app notifications',
    what: 'Native notifications in the Android app (Firebase). Without it the app falls back to the phone notifications above.',
    vars: [
      { name: 'FIREBASE_SERVICE_ACCOUNT', secret: true, hint: 'Firebase → Project settings → Service accounts → Generate new private key (paste the whole file)' },
    ],
  },
  {
    title: 'WhatsApp',
    what: 'The WhatsApp inbox, smart replies, chasers and reminders.',
    vars: [
      { name: 'WHATSAPP_TOKEN', secret: true, hint: 'Business Settings → System users → Generate token' },
      { name: 'WHATSAPP_PHONE_NUMBER_ID', secret: false, hint: 'Meta app → WhatsApp → API setup (your real number)' },
      { name: 'WHATSAPP_BUSINESS_ACCOUNT_ID', secret: false, hint: 'Meta app → WhatsApp → API setup' },
      { name: 'META_APP_SECRET', secret: true, hint: 'Meta app → App settings → Basic → App secret' },
      { name: 'META_WEBHOOK_VERIFY_TOKEN', secret: true, hint: 'The same word you typed into Meta’s webhook “Verify token”' },
      { name: 'NEXT_PUBLIC_WHATSAPP_NUMBER', secret: false, hint: 'Your number as 447…, for the portal’s WhatsApp button' },
      { name: 'WHATSAPP_TEMPLATE_LANG', secret: false, optional: true, hint: 'en_GB (the default if missing)' },
      { name: 'WHATSAPP_DEFAULT_TEMPLATE', secret: false, optional: true, hint: 'Name of your first-message template, e.g. enquiry_intro' },
      { name: 'WHATSAPP_AUTO_FIRST_MESSAGE', secret: false, optional: true, hint: 'true = message new Meta leads automatically' },
      { name: 'META_PAGE_ACCESS_TOKEN', secret: true, optional: true, hint: 'Only if lead-ad leads don’t come through with the system-user token' },
    ],
  },
  {
    title: 'Microsoft 365 email',
    what: 'Sending from hello@ inside the CRM and picking up replies.',
    vars: [
      { name: 'MS_TENANT_ID', secret: false, hint: 'Entra → App registrations → Heliaxis CRM → Directory (tenant) ID' },
      { name: 'MS_CLIENT_ID', secret: false, hint: 'Entra → Heliaxis CRM → Application (client) ID' },
      { name: 'MS_CLIENT_SECRET', secret: true, hint: 'Entra → Heliaxis CRM → Certificates & secrets → Value' },
      { name: 'MS_MAILBOX', secret: false, hint: 'hello@heliaxis.co.uk' },
    ],
  },
  {
    title: 'Website emails',
    what: 'Quote-form confirmations, sign-in emails and alerts.',
    vars: [
      { name: 'RESEND_API_KEY|HELIAXIS_RESEND_API_KEY|Heliaxis_Resend_API_Key', secret: true, hint: 'resend.com → API keys' },
      { name: 'ADMIN_EMAIL', secret: false, optional: true, hint: 'Where enquiry alerts go' },
    ],
  },
  {
    title: 'Card deposits (Stripe)',
    what: 'Optional.',
    vars: [
      { name: 'STRIPE_SECRET_KEY', secret: true, optional: true, hint: 'Stripe → Developers → API keys' },
      { name: 'STRIPE_WEBHOOK_SECRET', secret: true, optional: true, hint: 'Stripe → Webhooks → your endpoint → Signing secret' },
    ],
  },
  {
    title: 'Meta Ads conversions',
    what: 'Optional. Sends survey booked / quote sent / won back to Meta.',
    vars: [
      { name: 'META_PIXEL_ID', secret: false, optional: true, hint: 'Events Manager → your dataset ID' },
      { name: 'META_CAPI_TOKEN', secret: true, optional: true, hint: 'Events Manager → Settings → Conversions API → Generate access token' },
    ],
  },
  {
    title: 'AI blog writer',
    what: 'The CMS’s AI blog and page writer.',
    vars: [
      { name: 'OPENROUTER_API_KEY|AI_API_KEY|OPENAI_API_KEY', secret: true, optional: true, hint: 'Whichever AI provider the blog writer uses' },
    ],
  },
];

export const envSet = (name: string) => name.split('|').some((n) => !!process.env[n]?.trim());

export function envReport() {
  return ENV_GROUPS.map((g) => ({
    ...g,
    vars: g.vars.map((v) => ({ ...v, set: envSet(v.name) })),
  }));
}

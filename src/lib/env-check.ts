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
    what: 'Opens Social media studio from the Heliaxis menu already signed in, for anyone with Social media studio access in Users. Their studio account is set up the first time they open it.',
    vars: [
      { name: 'SOCIAL_SUPABASE_URL', secret: false, optional: true, hint: 'Social studio Supabase project → Project settings → Data API → Project URL' },
      { name: 'SOCIAL_SUPABASE_SERVICE_ROLE_KEY', secret: true, optional: true, hint: 'Social studio Supabase project → Project settings → API Keys → service_role key' },
    ],
  },
  {
    title: 'Social monitoring',
    what: 'Comments and reviews about Heliaxis on Facebook, Instagram, Trustpilot and Google. It reuses the Meta, Anthropic and notification keys above. Everything here is optional until its source is switched on.',
    vars: [
      { name: 'META_SOCIAL_TOKEN', secret: true, optional: true, hint: 'Business settings → System users → Generate token (comment, Page and Instagram read permissions)' },
      { name: 'META_PAGE_ID', secret: false, optional: true, hint: 'The Facebook Page to watch (Page → About → Page ID)' },
      { name: 'META_IG_USER_ID', secret: false, optional: true, hint: 'The linked Instagram professional account ID' },
      { name: 'META_IG_TOKEN', secret: true, optional: true, hint: 'Meta app → Instagram → API setup with Instagram login → Generate token (lasts 60 days)' },
      { name: 'META_IG_APP_SECRET', secret: true, optional: true, hint: 'Meta app → Instagram → API setup with Instagram login → Instagram app secret' },
      { name: 'GOOGLE_BP_CLIENT_ID', secret: false, optional: true, hint: 'Google Cloud → APIs & Services → Credentials (Business Profile API)' },
      { name: 'GOOGLE_BP_CLIENT_SECRET', secret: true, optional: true, hint: 'Same page as the client ID' },
      { name: 'GOOGLE_BP_REFRESH_TOKEN', secret: true, optional: true, hint: 'Created once with the admin-only Connect Google button in Social monitoring settings' },
      { name: 'GOOGLE_BP_LOCATION', secret: false, optional: true, hint: 'The Business Profile location, e.g. accounts/123/locations/456' },
      { name: 'TRUSTPILOT_API_KEY', secret: true, optional: true, hint: 'Trustpilot Business → Integrations → API' },
      { name: 'TRUSTPILOT_API_SECRET', secret: true, optional: true, hint: 'Same page as the API key' },
      { name: 'TRUSTPILOT_BUSINESS_UNIT_ID', secret: false, optional: true, hint: 'Trustpilot Business → your business unit ID' },
      { name: 'SOCIAL_REVIEW_MAILBOX', secret: false, optional: true, hint: 'The Microsoft 365 mailbox that gets Google and Trustpilot review emails, e.g. reviews@heliaxis.co.uk' },
      { name: 'SOCIAL_AUTHOR_PEPPER', secret: true, optional: true, hint: 'Any long random text. Used to hash commenter ids so repeat commenters can be spotted without storing who they are' },
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
    title: 'Survey booking',
    what: 'Optional. Google drive times for booking (the app estimates them without it) and a bot check on the website booking form.',
    vars: [
      { name: 'GOOGLE_MAPS_API_KEY', secret: true, optional: true, hint: 'Google Cloud → APIs & Services → Credentials (Routes API only)' },
      { name: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY', secret: false, optional: true, hint: 'Cloudflare → Turnstile → Add widget' },
      { name: 'TURNSTILE_SECRET_KEY', secret: true, optional: true, hint: 'Cloudflare → Turnstile → Add widget' },
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
    title: 'Ad spend in reports',
    what: 'Optional. Read-only access to your Meta ad account, for cost per lead and per sale.',
    vars: [
      { name: 'META_ADS_TOKEN', secret: true, optional: true, hint: 'Business settings → System users → Generate new token (ads_read)' },
      { name: 'META_AD_ACCOUNT_ID', secret: false, optional: true, hint: 'Ads Manager → your ad account number (act_…)' },
      { name: 'META_ADS_GRAPH_VERSION', secret: false, optional: true, hint: 'Leave unset (v26.0) unless Reports says Meta has retired it' },
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

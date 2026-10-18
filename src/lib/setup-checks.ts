import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCrmSettings } from '@/lib/crm/crm-settings';
import type { GuideKey, SqlFile } from '@/lib/setup-files';

/**
 * "From Claude" to-dos: setup jobs left over from new features (SQL to run, keys to add in Vercel).
 * Each check looks at the database or the environment, so an item disappears by itself once it's
 * done. Items that can't be checked (`manual`) have a Done button instead.
 *
 * When a change needs setup, add its check here so it lands on the admin's to-do list. Write the
 * steps for someone who has never opened Supabase or Vercel: every click, in order.
 */

export type SetupTodo = {
  id: string;
  title: string;
  /** One line under the title. */
  detail: string;
  /** Step-by-step. Supports **bold**, `code` and [links](https://…). */
  steps: string[];
  /** Values to copy, each with its own Copy button (e.g. Vercel variable names). */
  copies?: { label: string; value: string }[];
  /** A SQL file to copy / view in the app. */
  sql?: SqlFile;
  /** A setup guide to open in the app. */
  guide?: GuideKey;
  /** Shows the "Generate keys" button for phone notifications. */
  vapid?: boolean;
  /** Main button. */
  href?: string;
  hrefLabel?: string;
  /** Lower = more important. */
  order: number;
  optional?: boolean;
  /** Can't be checked automatically: shows a Done button. */
  manual?: boolean;
};

const DONE_KEY = 'setup-done';
const VERCEL_ENV = 'https://vercel.com/dashboard';
const env = (...keys: string[]) => keys.every((k) => !!process.env[k]);

/** The Supabase SQL editor for this project (falls back to the project picker). */
function sqlEditor() {
  const ref = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  return `https://supabase.com/dashboard/project/${ref || '_'}/sql/new`;
}

/** The same three Vercel steps every key needs. */
const VERCEL_STEPS = [
  'Open [Vercel](https://vercel.com/dashboard), sign in and tap the **heliaxis** project.',
  'Tap **Settings** (top menu) → **Environment Variables** (left menu).',
  'For each value below: paste the name into **Key**, the value into **Value**, leave all three environments ticked, and tap **Save**.',
  'Redeploy so the site picks them up: **Deployments** (top menu) → the ⋯ on the top deployment → **Redeploy** → **Redeploy**. It takes about a minute.',
];

/** True if the table (and optionally a column) exists. */
async function has(table: string, column = '*') {
  try {
    const { error } = await createAdminClient().from(table).select(column, { head: true, count: 'exact' }).limit(1);
    return !error;
  } catch {
    return false;
  }
}

/** One-off jobs that can't be checked from here. Bump the id to ask again. */
const MANUAL: SetupTodo[] = [
  {
    id: 'apk-icon-release',
    title: 'Publish a new Android app release',
    detail: 'So phones pick up the new app icon. Website changes reach the app by themselves; only the icon needs a new APK.',
    steps: [
      'On the computer that has Android Studio and the heliaxis code, open a terminal in the heliaxis folder.',
      'Run `git pull` to get the latest code.',
      'Run `node scripts/android-release.mjs --notes "New app icon"`.',
      'Commit and push the changed files (`android/release.json` and `public/app/`). Vercel deploys them.',
      'Everyone’s app then shows an **Update** banner. Tap it to install the new version.',
      'Or ask Claude Code on that computer to “release a new Android app version with the new icon” and it will run these for you.',
    ],
    order: 60,
    manual: true,
  },
];

export async function doneManual(): Promise<string[]> {
  try {
    const { data } = await createAdminClient().from('cms_kv').select('value').eq('key', DONE_KEY).maybeSingle();
    const v = data?.value ? JSON.parse(data.value) : [];
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export async function markManualDone(id: string) {
  if (!MANUAL.some((m) => m.id === id)) return;
  const done = new Set(await doneManual());
  done.add(id);
  await createAdminClient()
    .from('cms_kv')
    .upsert({ key: DONE_KEY, value: JSON.stringify([...done]), updated_at: new Date().toISOString() });
}

export async function setupTodos(): Promise<SetupTodo[]> {
  const [crm, crmV2, assistant, notifications, whatsapp, chasers, done] = await Promise.all([
    has('crm_projects', 'next_step'),
    has('crm_documents'),
    has('assistant_drafts'),
    has('push_subscriptions'),
    has('whatsapp_messages'),
    has('whatsapp_outbox', 'kind'),
    doneManual(),
  ]);
  const settings = crmV2 ? await getCrmSettings() : null;
  const out: SetupTodo[] = [];
  const add = (cond: boolean, t: SetupTodo) => cond && out.push(t);
  const sql = (file: SqlFile, what: string, order: number, after?: string): SetupTodo => ({
    id: `sql-${file}`,
    title: `Run ${file} in Supabase`,
    detail: what,
    steps: [
      ...(after ? [`Do this after **${after}** (it builds on it).`] : []),
      'Tap **Copy SQL** (above).',
      'Tap **Open Supabase**. It opens a new query in the Heliaxis database (sign in if it asks).',
      'Tap in the big editor box and paste (long-press → **Paste** on a phone, Ctrl+V on a computer).',
      'Tap **Run** (bottom right). You should see **Success. No rows returned**.',
      'Come back here and refresh. This item disappears once it’s worked.',
      'It’s safe to run twice, so if you’re unsure whether it worked, just run it again.',
    ],
    sql: file,
    href: sqlEditor(),
    hrefLabel: 'Open Supabase',
    order,
  });

  add(!whatsapp, sql('whatsapp.sql', 'The WhatsApp inbox, smart replies and outbox.', 1));
  add(whatsapp && !chasers, sql('whatsapp-chasers.sql', 'WhatsApp chasers and syncing with the WhatsApp Business app.', 2, 'whatsapp.sql'));
  add(!crm, sql('crm.sql', 'Switches the CRM on: opportunities, the timeline, site photos and tasks on opportunities.', 3));
  add(!crmV2, sql('crm-v2.sql', 'Customer portal, documents, email, reminders and deposits.', 4, 'crm.sql'));
  add(!assistant, sql('assistant.sql', 'Lets Metis save her conversations and drafts.', 5, 'crm.sql'));
  add(!notifications, sql('notifications.sql', 'The notification bell and phone notifications.', 6));

  add(!env('ANTHROPIC_API_KEY'), {
    id: 'env-anthropic',
    title: 'Add your Claude API key (switches Metis on)',
    detail: 'Metis runs on Claude. Roughly 10–30p per message; a few pounds a month for normal use.',
    steps: [
      'Open the [Claude Console](https://console.anthropic.com) and sign in (or sign up with your Heliaxis email).',
      '**Settings → Billing**: add a card and buy some credit ($10 lasts a long time). Turning on auto-reload stops it ever running out.',
      '**Settings → API keys → Create key**, name it `Heliaxis Metis`, then **Copy**. It starts `sk-ant-` and is only shown once.',
      ...VERCEL_STEPS,
    ],
    copies: [{ label: 'Key', value: 'ANTHROPIC_API_KEY' }],
    href: 'https://console.anthropic.com/settings/keys',
    hrefLabel: 'Open Claude Console',
    order: 7,
  });
  add(!env('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'), {
    id: 'env-vapid',
    title: 'Add the phone notification keys',
    detail: 'Three values that let the site send notifications to your phone. Generate them here, then paste them into Vercel.',
    steps: [
      'Tap **Generate keys** (above). Three names and values appear, each with a Copy button.',
      ...VERCEL_STEPS,
      'Then, on each phone: open the app and tap **Turn on** in the notifications banner on the dashboard.',
      'Generate them once only. New keys after people have turned notifications on would mean everyone turning them on again.',
    ],
    vapid: true,
    href: VERCEL_ENV,
    hrefLabel: 'Open Vercel',
    order: 8,
  });
  add(!env('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'), {
    id: 'env-whatsapp',
    title: 'Finish connecting WhatsApp',
    detail: 'Your business is verified and the app exists. What’s left is the phone number, the webhook and four keys.',
    steps: [
      'Open the **WhatsApp guide** below. Steps 2.3 to 2.9 are the part that’s left.',
      'In the [Meta app](https://developers.facebook.com/apps) → **WhatsApp → API setup**: add your business number and verify it by text.',
      'Make a permanent token: **Business Settings → Users → System users** → add one → give it the app and WhatsApp account → **Generate token** (permissions listed in the guide).',
      'Make up a password-like word for the webhook (e.g. `heliaxis-hook-2026`). In the app → **WhatsApp → Configuration**, set the callback URL and that word, then subscribe to **messages**.',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'Callback URL', value: 'https://heliaxis.co.uk/api/meta/webhook' },
      { label: 'Key', value: 'WHATSAPP_TOKEN' },
      { label: 'Key', value: 'WHATSAPP_PHONE_NUMBER_ID' },
      { label: 'Key', value: 'META_APP_SECRET' },
      { label: 'Key', value: 'META_WEBHOOK_VERIFY_TOKEN' },
    ],
    guide: 'whatsapp',
    href: 'https://developers.facebook.com/apps',
    hrefLabel: 'Open Meta',
    order: 9,
  });
  add(!env('NEXT_PUBLIC_WHATSAPP_NUMBER', 'NEXT_PUBLIC_SITE_URL'), {
    id: 'env-portal',
    title: 'Add the customer portal settings',
    detail: 'Makes the portal’s “WhatsApp us” button work and puts the right address in portal links.',
    steps: [
      'Your WhatsApp number goes in international format with no + or spaces: 07700 900123 becomes `447700900123`.',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'Key', value: 'NEXT_PUBLIC_WHATSAPP_NUMBER' },
      { label: 'Key', value: 'NEXT_PUBLIC_SITE_URL' },
      { label: 'Value', value: 'https://heliaxis.co.uk' },
    ],
    href: VERCEL_ENV,
    hrefLabel: 'Open Vercel',
    order: 10,
  });
  if (settings) {
    add(!settings.leadRotation.length, {
      id: 'crm-rotation',
      title: 'Choose who gets new leads',
      detail: 'New leads are handed out in turn and that person gets a notification.',
      steps: [
        'Tap **Open CRM settings**.',
        'Under **New leads → Share new leads between**, tick everyone who should take new leads (e.g. you and Esther).',
        'Set **Alert if a new lead hasn’t been contacted within** (15 minutes is a good start).',
        'Tap **Save** at the bottom.',
      ],
      href: '/admin/crm/settings',
      hrefLabel: 'Open CRM settings',
      order: 11,
    });
    add(!settings.installTemplate || !settings.surveyTemplate || !settings.reviewTemplate, {
      id: 'crm-templates',
      title: 'Create the 3 WhatsApp reminder templates',
      detail: 'Needed for reminders when the customer hasn’t messaged in the last 24 hours (about 2p each).',
      steps: [
        'Open **WhatsApp Manager → Message templates → Create template**.',
        'Category **Utility**, language **English (UK)**. Paste the name, then paste the body below and tap **Submit**.',
        'Do it three times, once for each template. Meta usually approves them within minutes to a few hours.',
        'Then tap **Open CRM settings** and type the names into **Install template**, **Survey template** and the **Review requests** template. Save.',
      ],
      copies: [
        { label: 'Name', value: 'install_reminder' },
        { label: 'Body', value: 'Hi {{1}}, a reminder that your Heliaxis installation is {{2}} — {{3}}. Reply here with any questions.' },
        { label: 'Name', value: 'survey_reminder' },
        { label: 'Body', value: 'Hi {{1}}, a reminder that your Heliaxis survey is {{2}} — {{3}}. Reply here with any questions.' },
        { label: 'Name', value: 'review_request' },
        { label: 'Body', value: 'Hi {{1}}, thank you for choosing Heliaxis! If you’re happy with your installation, would you leave us a quick review? {{2}}' },
      ],
      href: 'https://business.facebook.com/wa/manage/message-templates/',
      hrefLabel: 'Open WhatsApp Manager',
      order: 12,
    });
    add(!settings.reviewUrl, {
      id: 'crm-review',
      title: 'Add your Google review link',
      detail: 'Customers get it a few days after their install is marked Complete.',
      steps: [
        'Search Google for **Heliaxis** while signed in to the Google account that manages the business profile.',
        'On your business panel tap **Ask for reviews** (or **Get more reviews**) → **Copy link**.',
        'Tap **Open CRM settings**, paste it into **Review requests → Google review link** and Save.',
      ],
      href: '/admin/crm/settings',
      hrefLabel: 'Open CRM settings',
      order: 13,
    });
  }
  add(!env('MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_MAILBOX'), {
    id: 'env-ms365',
    title: 'Connect Microsoft 365 email',
    detail: 'So emails send from hello@heliaxis.co.uk inside the CRM, and replies land on the customer.',
    steps: [
      'Open [Microsoft Entra](https://entra.microsoft.com) as the Microsoft 365 admin.',
      '**Identity → Applications → App registrations → New registration**. Name it `Heliaxis CRM`, leave the rest, tap **Register**.',
      'On its overview page, copy the **Application (client) ID** and the **Directory (tenant) ID**.',
      '**Certificates & secrets → New client secret** → 24 months → **Add**, then copy the **Value** (not the ID). It’s only shown once.',
      '**API permissions → Add a permission → Microsoft Graph → Application permissions**: tick `Mail.ReadWrite`, `Mail.Send` and `Calendars.ReadWrite` → **Add**, then **Grant admin consent**.',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'Key', value: 'MS_TENANT_ID' },
      { label: 'Key', value: 'MS_CLIENT_ID' },
      { label: 'Key', value: 'MS_CLIENT_SECRET' },
      { label: 'Key', value: 'MS_MAILBOX' },
      { label: 'Value', value: 'hello@heliaxis.co.uk' },
    ],
    guide: 'crm',
    href: 'https://entra.microsoft.com',
    hrefLabel: 'Open Entra',
    order: 20,
  });
  add(!env('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'), {
    id: 'env-stripe',
    title: 'Connect Stripe for card deposits',
    detail: 'Customers whose job has started can pay their deposit by card from their portal.',
    steps: [
      'Open [Stripe](https://dashboard.stripe.com) → **Developers → API keys** → reveal and copy the **Secret key**.',
      '**Developers → Webhooks → Add endpoint**. Paste the URL below and choose the event `checkout.session.completed`. Then copy the **Signing secret**.',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'Endpoint URL', value: 'https://heliaxis.co.uk/api/stripe/webhook' },
      { label: 'Key', value: 'STRIPE_SECRET_KEY' },
      { label: 'Key', value: 'STRIPE_WEBHOOK_SECRET' },
    ],
    href: 'https://dashboard.stripe.com/apikeys',
    hrefLabel: 'Open Stripe',
    order: 30,
    optional: true,
  });
  add(!env('META_PIXEL_ID', 'META_CAPI_TOKEN'), {
    id: 'env-capi',
    title: 'Send sales back to Meta Ads',
    detail: 'Tells Meta which leads booked surveys and bought, so your ads find more people like them.',
    steps: [
      'Open **Events Manager** → your Pixel / dataset → copy its **ID**.',
      'In the same dataset: **Settings → Conversions API → Generate access token** → copy it.',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'Key', value: 'META_PIXEL_ID' },
      { label: 'Key', value: 'META_CAPI_TOKEN' },
    ],
    guide: 'crm',
    href: 'https://business.facebook.com/events_manager2',
    hrefLabel: 'Open Events Manager',
    order: 31,
    optional: true,
  });
  for (const m of MANUAL) add(!done.includes(m.id), m);
  return out.sort((a, b) => a.order - b.order);
}

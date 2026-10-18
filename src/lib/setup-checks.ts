import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCrmSettings } from '@/lib/crm/crm-settings';

/**
 * "From Claude" to-dos: setup jobs left over from new features (SQL to run, keys to add in Vercel).
 * Each check looks at the database or the environment, so an item disappears by itself once it's
 * done. Items that can't be checked (`manual`) have a Done button instead.
 *
 * When a change needs setup, add its check here so it lands on the admin's to-do list.
 */

export type SetupTodo = {
  id: string;
  title: string;
  detail: string;
  /** Where to do it (shown as a button). */
  href?: string;
  /** Lower = more important. */
  order: number;
  optional?: boolean;
  /** Can't be checked automatically: shows a Done button. */
  manual?: boolean;
};

const DONE_KEY = 'setup-done';
const SQL_EDITOR = 'https://supabase.com/dashboard/project/_/sql/new';
const VERCEL_ENV = 'https://vercel.com/dashboard';
const env = (...keys: string[]) => keys.every((k) => !!process.env[k]);

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
    detail: 'The app icon now matches the social logos. Build and upload a new APK/AAB so phones pick it up.',
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
  const sql = (file: string, what: string, order: number, after?: string) => ({
    id: `sql-${file}`,
    title: `Run ${file} in Supabase`,
    detail: `${what} Open the SQL editor, paste the whole of supabase/${file} from GitHub and press Run.${after ? ` Run it after ${after}.` : ''} Safe to run twice.`,
    href: SQL_EDITOR,
    order,
  });

  add(!whatsapp, sql('whatsapp.sql', 'The WhatsApp inbox, smart replies and outbox.', 1));
  add(whatsapp && !chasers, sql('whatsapp-chasers.sql', 'WhatsApp chasers and app sync.', 2, 'whatsapp.sql'));
  add(!crm, sql('crm.sql', 'Turns the CRM on: opportunities, timeline, site photos, tasks on opportunities.', 3));
  add(!crmV2, sql('crm-v2.sql', 'Customer portal, documents, email, reminders, booking and deposits.', 4, 'crm.sql'));
  add(!assistant, sql('assistant.sql', 'Lets the Claude assistant save conversations and drafts.', 5, 'crm.sql'));
  add(!notifications, sql('notifications.sql', 'Phone notifications (new leads, WhatsApp replies, tasks).', 6));

  add(!env('ANTHROPIC_API_KEY'), {
    id: 'env-anthropic',
    title: 'Add your Claude API key to Vercel',
    detail:
      'console.anthropic.com → API keys → Create key. In Vercel → heliaxis → Settings → Environment Variables add ANTHROPIC_API_KEY, then redeploy. This switches on the assistant.',
    href: 'https://console.anthropic.com/settings/keys',
    order: 7,
  });
  add(!env('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'), {
    id: 'env-vapid',
    title: 'Add the notification keys to Vercel',
    detail:
      'Add NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:callum@heliaxis.co.uk) — the keys Claude generated in chat — then redeploy.',
    href: VERCEL_ENV,
    order: 8,
  });
  add(!env('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'META_APP_SECRET', 'META_WEBHOOK_VERIFY_TOKEN'), {
    id: 'env-whatsapp',
    title: 'Finish connecting WhatsApp',
    detail:
      'Follow WHATSAPP_SETUP.md step 2: add your number in Meta, set the webhook, then add WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN in Vercel.',
    href: 'https://developers.facebook.com/apps',
    order: 9,
  });
  add(!env('NEXT_PUBLIC_WHATSAPP_NUMBER', 'NEXT_PUBLIC_SITE_URL'), {
    id: 'env-portal',
    title: 'Add the portal settings to Vercel',
    detail: 'NEXT_PUBLIC_WHATSAPP_NUMBER (e.g. 447700900123) and NEXT_PUBLIC_SITE_URL (https://heliaxis.co.uk), then redeploy.',
    href: VERCEL_ENV,
    order: 10,
  });
  if (settings) {
    add(!settings.leadRotation.length, {
      id: 'crm-rotation',
      title: 'Choose who gets new leads',
      detail: 'CRM → Settings → Lead sharing. New leads are handed out in turn and that person is alerted.',
      href: '/admin/crm/settings',
      order: 11,
    });
    add(!settings.installTemplate || !settings.surveyTemplate || !settings.reviewTemplate, {
      id: 'crm-templates',
      title: 'Create the 3 WhatsApp reminder templates',
      detail:
        'In WhatsApp Manager create install_reminder, survey_reminder and review_request (wording in CRM_GUIDE.md), then put their names in CRM → Settings.',
      href: '/admin/crm/settings',
      order: 12,
    });
    add(!settings.reviewUrl, {
      id: 'crm-review',
      title: 'Add your Google review link',
      detail: 'CRM → Settings → Reviews. Customers get it a few days after their install is complete.',
      href: '/admin/crm/settings',
      order: 13,
    });
  }
  add(!env('MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'MS_MAILBOX'), {
    id: 'env-ms365',
    title: 'Connect Microsoft 365 email',
    detail: 'So emails send from hello@heliaxis.co.uk and replies land on the customer. Steps in CRM_GUIDE.md section 4.',
    href: 'https://entra.microsoft.com',
    order: 20,
  });
  add(!env('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'), {
    id: 'env-stripe',
    title: 'Connect Stripe for card deposits',
    detail: 'CRM_GUIDE.md section 5.',
    href: 'https://dashboard.stripe.com/apikeys',
    order: 30,
    optional: true,
  });
  add(!env('META_PIXEL_ID', 'META_CAPI_TOKEN'), {
    id: 'env-capi',
    title: 'Send sales back to Meta Ads',
    detail: 'META_PIXEL_ID and META_CAPI_TOKEN, so ads find people who buy. CRM_GUIDE.md section 6.',
    href: 'https://business.facebook.com/events_manager2',
    order: 31,
    optional: true,
  });
  for (const m of MANUAL) add(!done.includes(m.id), m);
  return out.sort((a, b) => a.order - b.order);
}

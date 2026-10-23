import 'server-only';
import { cache } from 'react';
import { fcmConfigured } from '@/lib/fcm';
import { savedAnswers, type SavedAnswer } from '@/lib/claude-answers';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCrmSettings } from '@/lib/crm/crm-settings';
import { msConfigured } from '@/lib/ms365';
import type { GuideKey, SqlFile } from '@/lib/setup-files';

/**
 * "From Claude" to-dos: setup jobs left over from new features (SQL to run, keys to add in Vercel).
 * Each check looks at the database or the environment, so an item disappears by itself once it's
 * done. Items that can't be checked (`manual`) have a Done button instead.
 *
 * When a change needs setup, add its check here so it lands on the admin's to-do list. Write the
 * steps for someone who has never opened Supabase or Vercel: every click, in order.
 *
 * Who sees each one: admins, unless an admin has picked people for it ("Who sees this" on the
 * card). Then only those people see it, admins or members, and they can tick it off.
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
  /** Can't be checked automatically: ticking it removes it. */
  manual?: boolean;
  /** Ticked as done, but the app can't see it yet (e.g. Vercel keys need a redeploy). */
  ticked?: boolean;
  /** 'question': Claude needs an answer (typed into the card, or in the Claude chat). 'tip': a recommendation. */
  kind?: 'question' | 'tip';
  /** A question's saved answer, if any. */
  answer?: { text: string; name: string; at: string; sent: boolean };
  /** Profile ids of the people picked to see it. Empty = every admin (the default). */
  assignees?: string[];
};

/** An approved user, for the "Who sees this" picker. */
export type SetupPerson = { id: string; name: string };

/** { [todoId]: profile ids }. A to-do with no entry is seen by admins. */
export type SetupAssign = Record<string, string[]>;

const DONE_KEY = 'setup-done';
const ASSIGN_KEY = 'setup-assign';
const TODO_ID = /^[a-z0-9.-]{1,60}$/;
const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    const { error } = await createAdminClient().from(table).select(column).limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Can anyone still give themselves a social studio account? null when we can't tell (no studio
 * keys, or its Supabase didn't answer), so the card doesn't nag on a guess.
 */
async function socialSignupsOpen(): Promise<boolean | null> {
  const url = process.env.SOCIAL_SUPABASE_URL;
  const key = process.env.SOCIAL_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const settings = (await res.json()) as { disable_signup?: boolean };
    return settings.disable_signup === false;
  } catch {
    return null;
  }
}

/** A cms_kv setting (stored as JSON), or null if it's missing or unreadable. Never throws. */
async function readKv<T>(key: string): Promise<T | null> {
  try {
    const { data, error } = await createAdminClient().from('cms_kv').select('value').eq('key', key).maybeSingle();
    if (error || !data?.value) return null;
    return JSON.parse(data.value) as T;
  } catch {
    return null;
  }
}

/**
 * A week of "Ask me to confirm" has gone cleanly: at least 5 requests that instant booking would
 * have accepted, and none it wouldn't have or that were turned down.
 */
async function instantBookingReady() {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await createAdminClient()
      .from('survey_bookings')
      .select('would_confirm, cancel_reason')
      .gte('created_at', since)
      .limit(1000);
    if (error || !data) return false;
    const rows = data as { would_confirm: boolean | null; cancel_reason: string | null }[];
    return rows.filter((r) => r.would_confirm === true).length >= 5 && !rows.some((r) => r.would_confirm === false || r.cancel_reason === 'declined');
  } catch {
    return false;
  }
}

/**
 * Pages some to-dos send people to: Surveys → ⚙ booking settings and the Diary, and the WhatsApp
 * permission list. A to-do waits while its page is off here, so nobody is sent to a missing page.
 * Both are live now.
 */
const PAGE_LIVE = { surveySettings: true, waPermission: true };

/** One-off jobs that can't be checked from here. Bump the id to ask again. */
const MANUAL: SetupTodo[] = [
  {
    id: 'q-home-by',
    kind: 'question',
    title: 'After your last survey, do you need to be home by 18:00, or just finished on site by 18:00?',
    detail:
      'We’ve set it as finished on site by 18:00, with the drive home counted towards the day’s driving. If you need to be home by 18:00, the last survey of the day moves earlier (about 16:00 for a customer 35 minutes away).',
    steps: ['Type **on site** or **home** below and tap **Send to Claude**.'],
    order: 2,
    manual: true,
  },
  {
    id: 'q-website-phone',
    kind: 'question',
    title: 'Should the website’s phone number change to 01633 965439?',
    detail: 'The site shows 01633 965205 for calls. We’re adding a WhatsApp button for 01633 965439 and keeping calls on 965205.',
    steps: ['Type **keep** or **change** below and tap **Send to Claude**.'],
    order: 3,
    manual: true,
  },
  {
    id: 'meta-leadgen',
    title: 'Connect Meta lead forms to the CRM',
    detail:
      'So new Facebook and Instagram lead-form leads arrive by themselves, and Enquiries → Import can bring in the last 90 days.',
    steps: [
      'Open the [Meta app dashboard](https://developers.facebook.com/apps) → **Heliaxis CRM**. If **Use cases** (left menu) doesn’t list **Capture & manage ad leads with Marketing API**, tap **Add use cases** (top right), pick it and add it. The `leads_retrieval` permission lives in this use case.',
      'Go to **Use cases** → **Capture & manage ad leads with Marketing API** → **Customize** → **Webhooks**. (The old way, **Webhooks** in the app’s left menu, may still work, but this route is the reliable one.)',
      'Choose **Page** in the drop-down. Paste the callback URL below. For **Verify token**, use the value of `META_WEBHOOK_VERIFY_TOKEN` in Vercel (Settings → Environment Variables). If Vercel hides it as **Sensitive**, make up a new long random value, save it in Vercel as `META_WEBHOOK_VERIFY_TOKEN` and type the same here, then redeploy (**Deployments** → the ⋯ on the top deployment → **Redeploy**) and wait a minute. WhatsApp keeps working: Meta only checks the token when you save.',
      'Tap **Verify and save**. Then find **leadgen** in the list of fields → **Subscribe**.',
      'In [Business Settings](https://business.facebook.com/settings) → **Integrations** → **Leads Access**: pick the Heliaxis Page and give **Heliaxis CRM** access. If **Assign CRM** can’t find it (Meta only lists apps it has reviewed), tap **Restore default access** instead: every app connected to the Page can then get its leads, Zapier included.',
      'In **Users → System users**, check the CRM’s system user has the Facebook Page as an asset (with **Full control**), and that its token includes `leads_retrieval`, `pages_show_list`, `pages_read_engagement` and `pages_manage_metadata`. If not, generate a new token with them, paste it into Vercel as `META_PAGE_ACCESS_TOKEN`, then redeploy (**Deployments** → the ⋯ on the top deployment → **Redeploy**) and wait a minute.',
      'In the Heliaxis app, open **Enquiries → Import** → **Find lead forms**, and tap **Switch on live leads** next to the Heliaxis Page. It should then say **Live leads: On ✓**. Without this, Meta never sends the Page’s new leads to the CRM.',
      'Test it with Meta’s [Lead Ads Testing Tool](https://developers.facebook.com/tools/lead-ads-testing): create a test lead, and it should show **success** under Track status. You’ll get a “Meta test lead arrived ✓” notification; test leads aren’t added to Enquiries.',
      'Then back on **Enquiries → Import**, tap **Import selected** to bring in the last 90 days.',
    ],
    copies: [
      { label: 'Callback URL', value: 'https://heliaxis.co.uk/api/meta/webhook' },
      { label: 'Field', value: 'leadgen' },
    ],
    guide: 'whatsapp',
    href: 'https://developers.facebook.com/apps',
    hrefLabel: 'Open Meta app',
    order: 12,
    manual: true,
  },
  {
    id: 'cron-check',
    title: 'Check the every-minute job is switched on',
    detail:
      'Smart replies, chasers, reminders, follow-ups and alerts all run from a Supabase job that calls the CRM every minute. The app can’t check it for you.',
    steps: [
      'Tap **Open Supabase**, paste the check (first Copy button) and tap **Run**.',
      'You should see **whatsapp-outbox** with `* * * * *` and **active** = true. If so, tick this. You’re done.',
      'If there are no rows: in Supabase go to **Database → Extensions** and switch on **pg_cron** and **pg_net**.',
      'Then copy the second block, replace `YOUR_CRON_SECRET` with your `CRON_SECRET` from Vercel (Settings → Environment Variables), paste it into a new query and **Run**. Run the check again to confirm.',
    ],
    copies: [
      { label: 'Check', value: 'select jobname, schedule, active from cron.job;' },
      {
        label: 'Switch on',
        value:
          "select cron.schedule('whatsapp-outbox', '* * * * *', $$ select net.http_get(url := 'https://heliaxis.co.uk/api/cron/whatsapp-outbox', headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')); $$);",
      },
    ],
    href: sqlEditor(),
    hrefLabel: 'Open Supabase',
    order: 11,
    manual: true,
  },
  {
    id: 'tip-repo-private',
    kind: 'tip',
    title: 'Make the Heliaxis code private on GitHub',
    detail:
      'The website and CRM code is public, so anyone can read how it works. There are no passwords in it, but private is safer. Vercel keeps deploying as before.',
    steps: [
      'Tap **Open GitHub** (above).',
      'Scroll to the bottom (**Danger Zone**) → **Change visibility** → **Change to private**, then confirm.',
    ],
    href: 'https://github.com/CallumHDevelops/heliaxis/settings',
    hrefLabel: 'Open GitHub',
    order: 70,
    optional: true,
    manual: true,
  },
  {
    // Bumped from apk-icon-release: GitHub now builds the app, no Android Studio needed.
    id: 'apk-native-release',
    title: 'Publish the new Android app (GitHub builds it)',
    detail:
      'Brings the new icon and native Android notifications. Do “Set up native Android notifications” first. Then GitHub builds and publishes the app; nobody needs Android Studio.',
    steps: [
      'On the Windows PC that built the app before, open **PowerShell** (Start menu → type PowerShell).',
      'Paste the first PowerShell line below and press Enter. It copies the signing passwords.',
      'Tap **Open GitHub secrets** (above) → **New repository secret**. Name: `ANDROID_KEYSTORE_PROPERTIES`. Paste into **Secret** → **Add secret**.',
      'Back in PowerShell, paste the second line and press Enter. It copies the signing key itself.',
      '**New repository secret** again. Name: `ANDROID_KEYSTORE_BASE64`, paste, **Add secret**.',
      'Open the `google-services.json` you downloaded from Firebase in Notepad, select all, copy. **New repository secret**: name `GOOGLE_SERVICES_JSON`, paste, **Add secret**.',
      'In GitHub tap **Actions** (top menu) → **Android app** (left) → **Run workflow** → branch **main**, notes e.g. `Native notifications and the new icon` → **Run workflow**.',
      'It takes about 5 minutes. A green tick means it’s published; Vercel then deploys it.',
      'Everyone’s app shows an **Update** banner. Install it, open the app, and tap **Allow** when it asks about notifications.',
      'If PowerShell says it can’t find the files, the signing key isn’t on that PC. Tell Claude: a new key works too, but everyone then uninstalls and reinstalls the app once.',
    ],
    copies: [
      { label: 'PowerShell 1', value: 'Get-Content "$HOME\\.heliaxis-secrets\\android-keystore.properties" | Set-Clipboard' },
      {
        label: 'PowerShell 2',
        value: '[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\\.heliaxis-secrets\\heliaxis-android.jks")) | Set-Clipboard',
      },
      { label: 'Secret', value: 'ANDROID_KEYSTORE_PROPERTIES' },
      { label: 'Secret', value: 'ANDROID_KEYSTORE_BASE64' },
      { label: 'Secret', value: 'GOOGLE_SERVICES_JSON' },
    ],
    href: 'https://github.com/CallumHDevelops/heliaxis/settings/secrets/actions',
    hrefLabel: 'Open GitHub secrets',
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

/** Someone ticked (or unticked) a to-do. Manual ones then disappear; checked ones wait for their check. */
export async function markDone(id: string, done = true) {
  if (!TODO_ID.test(id)) return;
  const set = new Set(await doneManual());
  if (done) set.add(id);
  else set.delete(id);
  await createAdminClient()
    .from('cms_kv')
    .upsert({ key: DONE_KEY, value: JSON.stringify([...set]), updated_at: new Date().toISOString() });
}

/** Approved users (one lookup per request): who can be picked, and who still counts when picked. */
const approvedPeople = cache(async (): Promise<SetupPerson[]> => {
  const { data, error } = await createAdminClient().from('profiles').select('id, full_name, email').eq('status', 'approved');
  if (error) throw error;
  return ((data ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((p) => ({ id: p.id, name: p.full_name || p.email || 'Unnamed' }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

/** Everyone an admin can pick under "Who sees this". */
export async function setupPeople(): Promise<SetupPerson[]> {
  return approvedPeople().catch(() => []);
}

async function readAssign(): Promise<SetupAssign> {
  const { data, error } = await createAdminClient().from('cms_kv').select('value').eq('key', ASSIGN_KEY).maybeSingle();
  if (error) throw error;
  let v: unknown = {};
  try {
    v = data?.value ? JSON.parse(data.value) : {};
  } catch {
    // Unreadable: start again.
  }
  const out: SetupAssign = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [id, ids] of Object.entries(v)) if (Array.isArray(ids)) out[id] = ids.map(String);
  }
  return out;
}

/** Who each to-do has been passed to. */
export async function setupAssignments(): Promise<SetupAssign> {
  try {
    return await readAssign();
  } catch {
    return {};
  }
}

/** Is this to-do passed to this person? (Members may only tick those.) */
export async function isAssigned(id: string, profileId: string) {
  return !!(await setupAssignments())[id]?.includes(profileId);
}

/**
 * An admin chose who sees a to-do. Nobody picked = back to admins (the default). Only approved
 * users are kept. Returns who it's saved with.
 */
export async function assignTodo(id: string, userIds: unknown[]): Promise<string[]> {
  if (!TODO_ID.test(id)) return [];
  const approved = new Set((await approvedPeople()).map((p) => p.id));
  const ids = [...new Set(userIds.filter((u): u is string => typeof u === 'string' && PROFILE_ID.test(u) && approved.has(u)))];
  // Strict read: if it fails, don't overwrite everyone else's picks with just this one.
  const map = await readAssign();
  if (ids.length) map[id] = ids;
  else delete map[id];
  await createAdminClient()
    .from('cms_kv')
    .upsert({ key: ASSIGN_KEY, value: JSON.stringify(map), updated_at: new Date().toISOString() });
  return ids;
}

/**
 * What this person should see on the card (`mine`), and for admins the to-dos passed only to other
 * people (`others`), so they can still tick or reassign them.
 */
export async function visibleSetupTodos(profileId: string, isAdmin: boolean): Promise<{ mine: SetupTodo[]; others: SetupTodo[] }> {
  const assign = await setupAssignments();
  // Members only see what's passed to them; skip the checks for everyone else.
  if (!isAdmin && !Object.values(assign).some((ids) => ids.includes(profileId))) return { mine: [], others: [] };
  const mine: SetupTodo[] = [];
  const others: SetupTodo[] = [];
  for (const t of await setupTodos(assign)) {
    const who = t.assignees ?? [];
    if (who.length ? who.includes(profileId) : isAdmin) mine.push(t);
    else if (isAdmin) others.push(t);
  }
  return { mine, others };
}

export async function setupTodos(preloaded?: SetupAssign): Promise<SetupTodo[]> {
  const notificationRefs = has('notifications', 'ref');
  const customerRefs = has('enquiries', 'customer_ref');
  // Projects, surveys and survey booking (crm-v3.sql, surveys.sql, survey-booking.sql), checked alongside the rest.
  const bookingChecks = Promise.all([
    has('crm_projects', 'project_ref'),
    has('crm_surveys'),
    has('survey_bookings'),
    readKv<{ enabled?: boolean; mode?: string }>('survey-booking'),
    readKv<{ requireOptIn?: boolean }>('wa-permission'),
  ]);
  const [crm, crmV2, assistant, notifications, whatsapp, chasers, nativePush, sso, socialSignups, done, assign] = await Promise.all([
    has('crm_projects', 'next_step'),
    has('crm_documents'),
    has('assistant_drafts'),
    has('push_subscriptions'),
    has('whatsapp_messages'),
    has('whatsapp_outbox', 'kind'),
    has('native_push_tokens'),
    has('sso_email_proofs'),
    socialSignupsOpen(),
    doneManual(),
    preloaded ?? setupAssignments(),
  ]);
  const [crmV3, surveys, booking, bookingKv, waKv] = await bookingChecks;
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
  add(
    whatsapp && !(await has('whatsapp_messages', 'media_status')),
    sql('whatsapp-media.sql', 'Shows the photos, videos, voice notes and files customers send on WhatsApp in the chat, and lets you save their photos to the job.', 2, 'whatsapp.sql')
  );
  // Send later and the late-night rule: until it's run, messages go when Send is pressed, as before.
  add(
    whatsapp && chasers && !(await has('whatsapp_outbox', 'reply_noted_at')),
    sql(
      'whatsapp-scheduled.sql',
      'WhatsApp “Send later”, and the late-night rule: a message typed after 20:30 waits until 07:00 the next morning.',
      2,
      'whatsapp-chasers.sql'
    )
  );
  add(!crm, sql('crm.sql', 'Switches the CRM on: opportunities, the timeline, site photos and tasks on opportunities.', 3));
  add(!crmV2, sql('crm-v2.sql', 'Customer portal, documents, email, reminders and deposits.', 4, 'crm.sql'));
  add(
    !crmV3,
    sql(
      'crm-v3.sql',
      'Projects (job numbers, delivery checklists, paperwork), task reminders, WhatsApp permission records. Run this and the three below it now, in order: the new Projects, Surveys and Diary screens appear once they’re done.',
      4,
      'crm-v2.sql'
    )
  );
  add(!(await customerRefs), {
    ...sql(
      'customer-refs.sql',
      'Every customer gets a reference like HX-0042 as soon as they’re added, and their jobs share it: the first job is HX-0042, the next HX-0042-2, and so on. Search for it in Enquiries and WhatsApp. Any job numbers already given out change to match, once.',
      4,
      'crm-v3.sql'
    ),
    title: 'Give every customer a reference',
  });
  add(!surveys, sql('surveys.sql', 'The solar survey tool: survey records, survey photos and drawings.', 4, 'crm-v3.sql'));
  add(
    !booking,
    sql('survey-booking.sql', 'Online survey booking, your diary, and the Outlook copy of surveys, installs and diary entries.', 5, 'surveys.sql')
  );
  // Purchase orders against jobs: every PO screen stays hidden until this has been run.
  const purchaseOrders = crmV3 && (await has('purchase_order_lines'));
  add(
    crmV3 && !purchaseOrders,
    sql('purchase-orders.sql', 'Purchase orders: order the kit for a job from your suppliers, email them the PO as a PDF, and track it to delivery.', 5, 'crm-v3.sql')
  );
  // The site app (trades' job packs, sign-offs, labour POs) and then the handover pack: their tabs and
  // the /portal/site app stay hidden until each has been run (src/lib/schema-ready.ts).
  const site = purchaseOrders && (await has('site_messages')) && (await has('crm_documents', 'handover_slot')) && (await has('purchase_orders', 'review_status'));
  add(
    purchaseOrders && !site,
    sql('site-commissioning.sql', 'Site app: send trades a job pack, collect their sign-offs, raise their POs and review their work.', 5, 'purchase-orders.sql')
  );
  add(
    site && !(await has('handover_packs', 'project_id')),
    sql('handover.sql', 'Handover pack: every document for the customer in one place, and uploads straight into their portal.', 5, 'site-commissioning.sql')
  );
  // Merging duplicate customers and jobs: the Merge buttons say this is needed until it's run.
  add(
    (await customerRefs) && !(await has('crm_merges')),
    sql('merge.sql', 'Merge duplicate customers (someone who came in twice, say from the website and a Meta ad) and their jobs for the same work.', 6, 'customer-refs.sql')
  );
  add(!assistant, sql('assistant.sql', 'Lets Metis save her conversations and drafts.', 5, 'crm.sql'));
  add(!notifications, sql('notifications.sql', 'The notification bell and phone notifications.', 6));
  add(!nativePush, sql('native-push.sql', 'Lets the Android app get native notifications.', 9, 'notifications.sql'));
  add(
    notifications && !(await notificationRefs),
    sql('notifications-ref.sql', 'Clears WhatsApp and new-lead notifications for everyone once the chat is read or the lead contacted.', 9, 'notifications.sql')
  );
  // Deleting customers works without it; until it's run, Enquiries → Import can bring deleted people back.
  add(crm && !(await has('crm_deleted_people')), sql('deleted-customers.sql', 'Stops Enquiries → Import bringing back customers you’ve deleted.', 7, 'crm.sql'));
  // Optional: the notes work without it. The app can't see an index, so this one is ticked by hand.
  const notesIndex = sql('crm-activities-index.sql', 'Makes Latest notes on the CRM home load faster once there are lots of notes. Nothing depends on it.', 38, 'crm.sql');
  add(crm && !done.includes(notesIndex.id), {
    ...notesIndex,
    title: 'Speed up Latest notes on the CRM home',
    steps: notesIndex.steps.map((s) =>
      s.startsWith('Come back here') ? 'Then tick this (**✓ I’ve done this**): the app can’t check this one by itself, so it goes once ticked.' : s
    ),
    optional: true,
    manual: true,
  });
  const chatsIndex = sql(
    'whatsapp-feed-index.sql',
    'Makes the WhatsApp rows in Latest notes on the CRM home load faster once there are lots of messages, imported chats included. Nothing depends on it.',
    39,
    'whatsapp.sql'
  );
  add(whatsapp && crm && !done.includes(chatsIndex.id), {
    ...chatsIndex,
    title: 'Speed up WhatsApp in Latest notes',
    steps: chatsIndex.steps.map((s) =>
      s.startsWith('Come back here') ? 'Then tick this (**✓ I’ve done this**): the app can’t check this one by itself, so it goes once ticked.' : s
    ),
    optional: true,
    manual: true,
  });
  // Light / dark: optional. Without it each device remembers its own choice (src/lib/theme).
  add(
    !(await has('profiles', 'theme_at')),
    {
      ...sql('theme.sql', 'Light and dark mode: each person’s choice (Light, Dark or Match phone) follows them to all their devices. Until it’s run, each device remembers its own.', 40),
      optional: true,
    }
  );
  // The GEO bot (/admin/geo): its screen says this is needed until it's run.
  add(
    !(await has('geo_suggestions')),
    sql('geo.sql', 'AI search visibility: checks whether ChatGPT, Perplexity and Claude name Heliaxis when customers ask them, and suggests website changes so they do.', 30)
  );
  // The CMS report (/admin/cms-report): its screen says this is needed until it's run.
  add(
    !(await has('seo_reports')),
    sql('seo-report.sql', 'The CMS report: what the website ranks for in Google and where, who beats it and why, and how often AI assistants name Heliaxis.', 30)
  );
  // Needed by one-tap sign-in to either app (one email check covers both).
  const ssoApps = [
    env('RAMS_SUPABASE_URL', 'RAMS_SUPABASE_SERVICE_ROLE_KEY') && 'RAMS',
    env('SOCIAL_SUPABASE_URL', 'SOCIAL_SUPABASE_SERVICE_ROLE_KEY') && 'the social studio',
  ].filter(Boolean);
  add(!!ssoApps.length && !sso, sql('sso.sql', `Lets people open ${ssoApps.join(' and ')} without signing in again (each confirms their email once).`, 13));
  const socialRef = (process.env.SOCIAL_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  add(socialSignups === true, {
    id: 'social-signups-off',
    title: 'Make the social studio invite-only',
    detail:
      'Anyone can still give themselves a social studio account. Someone could set one up under a colleague’s email before the colleague does, and get into it once the colleague signs in.',
    steps: [
      'Tap **Open Supabase** and pick the **social studio** project if it asks (not the Heliaxis one, and not RAMS).',
      '**Authentication** (left menu) → **Sign In / Providers** (on older screens, **Providers** or **Settings**).',
      'Turn off **Allow new users to sign up** and tap **Save**. People who already have a studio account can still sign in.',
      'From now on, give people **Social media studio** access in **Users** here. Their studio account is set up the first time they open it from the Heliaxis menu. Taking that access away, or rejecting someone, only removes the button. They can still sign in at the studio itself, so delete them there too (**Manage users** in the studio, or **Authentication** → **Users** in its Supabase).',
      'Come back here and refresh. This item disappears once it’s worked.',
    ],
    href: socialRef ? `https://supabase.com/dashboard/project/${socialRef}/auth/providers` : 'https://supabase.com/dashboard',
    hrefLabel: 'Open Supabase',
    order: 14,
  });
  add(!fcmConfigured(), {
    id: 'env-firebase',
    title: 'Set up native Android notifications',
    detail:
      'A free Firebase project lets the Android app show proper Android notifications (with their own sounds per type) instead of web ones.',
    steps: [
      'Open the [Firebase console](https://console.firebase.google.com) and sign in with a Google account the business will keep.',
      '**Create a project** → name it `Heliaxis` → you can turn **Google Analytics** off → **Create project** → **Continue**.',
      'On the project page tap the **Android** icon (“Add app”). Package name: `uk.co.heliaxis.app` (copy below), nickname `Heliaxis app` → **Register app**.',
      'Tap **Download google-services.json** and keep the file: it goes into GitHub in the next to-do. Then **Next** → **Next** → **Continue to console** (skip the rest).',
      'Tap the ⚙ next to **Project overview** → **Project settings** → **Service accounts** tab → **Generate new private key** → **Generate key**. Another .json file downloads.',
      'Open that second file in Notepad, select all and copy it (all of it, from `{` to `}`). This is the Vercel value: it’s a password, so tick **Sensitive**. This to-do stays until the pasted file is readable.',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'Package name', value: 'uk.co.heliaxis.app' },
      { label: 'Key', value: 'FIREBASE_SERVICE_ACCOUNT' },
    ],
    href: 'https://console.firebase.google.com',
    hrefLabel: 'Open Firebase',
    order: 10,
  });

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
        'Tap **Open WhatsApp templates**, then the **Ready-made** tab.',
        'On **Survey booked / reminder**, **Install booked / reminder** and **Google review request**, tap **Send to Meta for approval**. That’s one tap each; Meta usually approves them within minutes to a few hours.',
        'Once each says **Approved ✓**, tap its **Use for** button (e.g. **Use for “Survey booked + reminders”**). This to-do goes once all three are in use.',
      ],
      href: '/admin/enquiries/templates',
      hrefLabel: 'Open WhatsApp templates',
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
    detail:
      'So emails send from hello@heliaxis.co.uk inside the CRM, replies land on the customer, and survey booking can see your calendar. It only gets access to hello@ and callum@, not every mailbox. Needs a computer and the Microsoft 365 admin sign-in.',
    steps: [
      'Open [Microsoft Entra](https://entra.microsoft.com) as the Microsoft 365 admin.',
      '**Identity → Applications → App registrations → New registration**. Name it `Heliaxis CRM`, choose **Single tenant**, leave Redirect URI blank, tap **Register**.',
      'On its overview page, copy the **Application (client) ID** and the **Directory (tenant) ID** into Notepad.',
      '**Certificates & secrets → New client secret** → 24 months → **Add**, then copy the **Value** (not the Secret ID). It’s only shown once.',
      'Don’t add any **API permissions**: the PowerShell lines below give it just the two mailboxes. If you ticked Mail permissions before, remove them.',
      '**Identity → Applications → Enterprise applications** → search **Heliaxis CRM** → copy its **Object ID** (it’s different from the one on the app registration).',
      'On a Windows PC open **PowerShell** (Start menu → type PowerShell) and paste the PowerShell lines below one at a time, pressing Enter after each. Say **Y** or **A** if it asks to install. Line 2 opens a Microsoft sign-in; line 3 asks for the two IDs.',
      'After line 6, every row should say **True** under **InScope**. If not, send Claude a screenshot.',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'PowerShell 1', value: 'Install-Module ExchangeOnlineManagement -Scope CurrentUser' },
      { label: 'PowerShell 2', value: 'Connect-ExchangeOnline' },
      {
        label: 'PowerShell 3',
        value:
          '$app = Read-Host "Application (client) ID"; $obj = Read-Host "Enterprise app Object ID"; New-ServicePrincipal -AppId $app -ObjectId $obj -DisplayName "Heliaxis CRM"',
      },
      {
        label: 'PowerShell 4',
        value:
          'New-ManagementScope -Name "Heliaxis CRM mailboxes" -RecipientRestrictionFilter "PrimarySmtpAddress -eq \'hello@heliaxis.co.uk\' -or PrimarySmtpAddress -eq \'callum@heliaxis.co.uk\'"',
      },
      {
        label: 'PowerShell 5',
        value:
          '"Application Mail.ReadWrite","Application Mail.Send","Application Calendars.ReadWrite" | ForEach-Object { New-ManagementRoleAssignment -App $app -Role $_ -CustomResourceScope "Heliaxis CRM mailboxes" }',
      },
      { label: 'PowerShell 6', value: 'Test-ServicePrincipalAuthorization -Identity $app -Resource hello@heliaxis.co.uk' },
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
  add(!env('RAMS_SUPABASE_URL', 'RAMS_SUPABASE_SERVICE_ROLE_KEY'), {
    id: 'env-rams-sso',
    title: 'Open RAMS without signing in again',
    detail: 'Two keys from the RAMS database let the Heliaxis menu open RAMS already signed in.',
    steps: [
      'Open [Supabase](https://supabase.com/dashboard) and pick the **RAMS** project (not the Heliaxis one).',
      '**Project settings** (cog, bottom left) → **API**.',
      'Copy the **Project URL**. That’s the value for `RAMS_SUPABASE_URL`.',
      'Under **Project API keys**, reveal and copy the **service_role** key. That’s `RAMS_SUPABASE_SERVICE_ROLE_KEY`, and it’s a password: tick **Sensitive** in Vercel.',
      ...VERCEL_STEPS,
      'It works for anyone with an approved RAMS account under the same email as their Heliaxis login. Then run sso.sql (it appears on this card). The first time each person taps RAMS, they confirm their email once with a code we email them. Anyone else still sees the RAMS sign-in.',
    ],
    copies: [
      { label: 'Key', value: 'RAMS_SUPABASE_URL' },
      { label: 'Key', value: 'RAMS_SUPABASE_SERVICE_ROLE_KEY' },
    ],
    href: 'https://supabase.com/dashboard',
    hrefLabel: 'Open Supabase',
    order: 40,
    optional: true,
  });
  add(!env('SOCIAL_SUPABASE_URL', 'SOCIAL_SUPABASE_SERVICE_ROLE_KEY'), {
    id: 'env-social-sso',
    title: 'Open the social studio without signing in again',
    detail:
      'Two keys from the social studio’s database let the Heliaxis menu open Social media studio already signed in. The first time each person taps it, they type in a code we email them, unless they’ve already done that for RAMS.',
    steps: [
      'Open [Supabase](https://supabase.com/dashboard) and pick the **social studio** project (not the Heliaxis one, and not RAMS).',
      '**Project Settings** (cog, bottom left) → **Data API** (on some screens just **API**).',
      'Copy the **Project URL**. That’s the value for `SOCIAL_SUPABASE_URL`.',
      'Still in Project Settings, open **API Keys** (on older screens it’s further down the same page). Find the **service_role** key (if there’s a **Legacy API keys** tab, it’s on that tab), reveal it and copy it. That’s `SOCIAL_SUPABASE_SERVICE_ROLE_KEY`, and it’s a password: tick **Sensitive** in Vercel.',
      ...VERCEL_STEPS,
      'Then run sso.sql if it appears on this card. From then on, staff with **Social media studio** access in **Users** get a studio account automatically the first time they open it, under the same email as their Heliaxis login. Anyone who already has a studio account under that email keeps it. If that account is blocked, or its email was never confirmed, they see the studio’s own sign-in instead. When someone leaves or loses Social media studio access, also delete them in the studio’s **Manage users**. Removing access here doesn’t sign them out of the studio.',
    ],
    copies: [
      { label: 'Key', value: 'SOCIAL_SUPABASE_URL' },
      { label: 'Key', value: 'SOCIAL_SUPABASE_SERVICE_ROLE_KEY' },
    ],
    href: 'https://supabase.com/dashboard',
    hrefLabel: 'Open Supabase',
    order: 41,
    optional: true,
  });
  add(!env('GITHUB_ANSWERS_TOKEN'), {
    id: 'env-github-answers',
    title: 'Let Claude read the answers you type here',
    detail:
      'Claude can’t see this app’s database, but it can read GitHub. One key lets the answer boxes on Claude’s questions post to an “Answers for Claude” issue that Claude reads.',
    steps: [
      'Tap **Open GitHub** (above). It opens a new fine-grained token (sign in if asked).',
      '**Token name** `Heliaxis answers`, **Expiration** 1 year.',
      '**Repository access** → **Only select repositories** → pick **heliaxis**.',
      '**Permissions** → **Repository permissions** → **Issues** → **Read and write**. Leave everything else as it is.',
      'Tap **Generate token** and copy it. It’s a password: in Vercel tick **Sensitive**.',
      ...VERCEL_STEPS,
      'While the heliaxis code is public on GitHub, answers will be public too, and the card asks before posting. Making it private (see the recommended to-do) fixes that.',
    ],
    copies: [{ label: 'Key', value: 'GITHUB_ANSWERS_TOKEN' }],
    href: 'https://github.com/settings/personal-access-tokens/new',
    hrefLabel: 'Open GitHub',
    order: 3,
  });
  add(!env('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'), {
    id: 'env-stripe',
    title: 'Connect Stripe for card deposits',
    detail: 'Customers can pay their deposit by card straight after signing their quote.',
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
  add(booking && PAGE_LIVE.surveySettings && !bookingKv?.enabled, {
    id: 'booking-setup',
    title: 'Check your survey booking rules and switch it on',
    detail:
      'We’ve set it up from your answers: surveys start from 08:30 and finish by 18:00; Saturdays finish by 12:00 and only for customers within 30 minutes of home (NP26 5ST); drive + 15 min buffer + 15 min coffee between appointments; at most 4 a day; nothing for the next working day after 15:00; solar 1 hr, heat pump 1 hr, both 1½ hrs.',
    steps: [
      'Tap **Open booking settings**.',
      'Check your hours, home postcode and the cut-off.',
      'Put anything coming up that isn’t in the CRM into **Surveys → Diary → + Add to my diary** (site visits, meetings, time off), with a postcode.',
      'Leave **Ask me to confirm** on for the first week.',
      'Switch **Online booking** on and tap **Save**.',
    ],
    href: '/admin/surveys/settings',
    hrefLabel: 'Open booking settings',
    order: 14,
  });
  add(booking && !!bookingKv?.enabled && !done.includes('booking-website-link'), {
    id: 'booking-website-link',
    kind: 'tip',
    title: 'Add “Book a survey” to your website',
    detail: 'Customers can book themselves at heliaxis.co.uk/book-a-survey.',
    steps: [
      '**CMS → Menu**.',
      'Add **Book a free survey** → `/book-a-survey`.',
      '**Publish**.',
      'Optional: add `{booking_link}` to your follow-up messages in CRM settings.',
    ],
    copies: [
      { label: 'Menu link', value: '/book-a-survey' },
      { label: 'Message tag', value: '{booking_link}' },
    ],
    href: '/admin/cms',
    hrefLabel: 'Open the CMS',
    order: 15,
    manual: true,
  });
  add(booking && PAGE_LIVE.surveySettings && msConfigured() && !done.includes('booking-diary-review'), {
    id: 'booking-diary-review',
    kind: 'tip',
    title: 'See what your Outlook diary says, and copy your dates into Outlook',
    detail:
      'Now Outlook is connected, the app can read your last 10 weeks and suggest settings, and put your upcoming surveys and installs into Outlook.',
    steps: [
      '**Surveys → ⚙ → What your diary says**; use any suggestion that looks right.',
      '**Surveys → Diary → Copy these dates into Outlook**: untick any you already put in Outlook by hand, then tap **Copy**.',
      'In Outlook, mark holidays and days off as **Away** (not Free), or bookings won’t avoid them.',
    ],
    href: '/admin/surveys/settings',
    hrefLabel: 'Open booking settings',
    order: 15,
    manual: true,
  });
  add(booking && bookingKv?.mode === 'request' && (await instantBookingReady()), {
    id: 'booking-go-instant',
    title: 'Switch survey booking to instant?',
    detail:
      'Over the last week, every request would have been booked correctly without you. Instant booking confirms straight away and puts it in your Outlook.',
    steps: ['**Surveys → ⚙ → Book instantly** → **Save**.'],
    href: '/admin/surveys/settings',
    hrefLabel: 'Open booking settings',
    order: 15,
  });
  add(crmV3 && PAGE_LIVE.waPermission && !waKv?.requireOptIn, {
    id: 'wa-permission-review',
    title: 'Check who’s agreed to WhatsApp messages',
    detail:
      'Automatic WhatsApps (reminders, follow-ups) should only go to customers who’ve agreed. Some customers with open jobs have no permission recorded yet.',
    steps: [
      'Tap **Open the list**.',
      'Tap **They agreed** for anyone who has (they messaged you first, ticked the box, or said yes on the phone).',
      'Then switch on **Only send automatic WhatsApps to customers who’ve agreed**. Anyone who replies STOP is already never messaged.',
    ],
    href: '/admin/crm/whatsapp-permission',
    hrefLabel: 'Open the list',
    order: 16,
  });
  add(crmV3 && !done.includes('wa-optin-policy'), {
    id: 'wa-optin-policy',
    kind: 'tip',
    title: 'Check your Meta lead forms ask for WhatsApp permission',
    detail: 'Leads from Meta forms are marked as agreed only if the form asks.',
    steps: [
      'In Meta Ads Manager, open each lead form → **Privacy policy / Custom disclaimer** and check there’s a WhatsApp consent line.',
      'If not, remove `META_LEADS_WHATSAPP_OPT_IN` from Vercel (or set it to `false`) until there is.',
    ],
    href: 'https://adsmanager.facebook.com',
    hrefLabel: 'Open Ads Manager',
    order: 17,
    manual: true,
  });
  add(!env('GOOGLE_MAPS_API_KEY'), {
    id: 'env-google-routes',
    title: 'Better drive times for survey booking (Google Maps)',
    detail:
      'Optional. Without it the app estimates drive times itself, erring on the long side. The app never uses more than 300 lookups a day, inside Google’s free allowance.',
    steps: [
      'Open [Google Cloud console](https://console.cloud.google.com) with the business Google account.',
      'Create a project called **Heliaxis**.',
      '**APIs & Services → Library → Routes API → Enable** (it asks for a billing account; the free monthly allowance applies).',
      '**Credentials → Create credentials → API key**, then **Edit API key → Restrict key → Routes API → Save**.',
      '**IAM & Admin → Quotas → Routes API**: set a daily cap of **300 elements**, so it can never run up a bill.',
      ...VERCEL_STEPS,
    ],
    copies: [{ label: 'Key', value: 'GOOGLE_MAPS_API_KEY' }],
    href: 'https://console.cloud.google.com',
    hrefLabel: 'Open Google Cloud',
    order: 35,
    optional: true,
  });
  add(booking && !!bookingKv?.enabled && !env('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'), {
    id: 'env-turnstile',
    title: 'Protect the website booking form from bots (free)',
    detail: 'Adds Cloudflare’s “I’m not a robot” check to heliaxis.co.uk/book-a-survey. Without it the form still works, with limits.',
    steps: [
      'Sign up free at [dash.cloudflare.com](https://dash.cloudflare.com).',
      '**Turnstile → Add widget**: name `Heliaxis booking`, hostname `heliaxis.co.uk`, mode **Managed** → **Create**.',
      'Copy the **Site key** and **Secret key**.',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'Key', value: 'NEXT_PUBLIC_TURNSTILE_SITE_KEY' },
      { label: 'Key', value: 'TURNSTILE_SECRET_KEY' },
    ],
    href: 'https://dash.cloudflare.com',
    hrefLabel: 'Open Cloudflare',
    order: 36,
    optional: true,
  });
  add(!(await has('enquiries', 'meta_ad_id')), {
    ...sql('ad-spend.sql', 'Records which Meta ad each new lead came from, so Reports can show each ad’s spend beside its leads and sales, even when two ads share a name or one is renamed.', 38),
    optional: true,
  });
  add(!env('META_ADS_TOKEN', 'META_AD_ACCOUNT_ID'), {
    id: 'env-meta-ads',
    title: 'Show ad spend in your reports (cost per lead and per sale)',
    detail: 'The report needs read-only access to your Meta ad account. It’s the only thing it waits on.',
    steps: [
      '[Meta Business settings](https://business.facebook.com/settings) → **Users → System users** → your system user (or **Add**, role Admin).',
      '**Add assets → Ad accounts** → your ad account → **View performance**.',
      '**Generate new token** → your app → tick **ads_read** → copy the token.',
      'In Ads Manager, copy your ad account number (`act_…`).',
      ...VERCEL_STEPS,
    ],
    copies: [
      { label: 'Key', value: 'META_ADS_TOKEN' },
      { label: 'Key', value: 'META_AD_ACCOUNT_ID' },
    ],
    href: 'https://business.facebook.com/settings',
    hrefLabel: 'Open Business settings',
    order: 37,
    optional: true,
  });
  // Copies: these are set per request below.
  for (const m of MANUAL) add(!done.includes(m.id), { ...m });
  // Ticked but not detected yet: keep it, greyed, at the bottom.
  for (const t of out) if (done.includes(t.id)) t.ticked = true;
  const answers = out.some((t) => t.kind === 'question') ? await savedAnswers().catch(() => ({})) : {};
  for (const t of out) {
    const a = (answers as Record<string, SavedAnswer>)[t.id];
    if (t.kind === 'question' && a) t.answer = { text: a.text, name: a.name, at: a.at, sent: a.sent };
  }
  // Who sees it. Someone no longer approved drops off; with nobody left it goes back to admins.
  // (If the lookup fails, keep the picks as they are.)
  const approved = Object.keys(assign).length
    ? await approvedPeople().then((ps) => new Set(ps.map((p) => p.id)), () => null)
    : null;
  for (const t of out) t.assignees = (assign[t.id] ?? []).filter((id) => !approved || approved.has(id));
  return out.sort((a, b) => Number(!!a.ticked) - Number(!!b.ticked) || a.order - b.order);
}

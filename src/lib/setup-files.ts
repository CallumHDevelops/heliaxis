import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Setup files admins can open from the app (they live in the repo, not on GitHub's website for
 * them). Only these names can be read. Bundled into the deployment via next.config.ts.
 */
export const SQL_FILES = ['whatsapp.sql', 'whatsapp-chasers.sql', 'crm.sql', 'crm-v2.sql', 'assistant.sql', 'notifications.sql', 'notifications-ref.sql', 'whatsapp-media.sql', 'native-push.sql', 'sso.sql', 'deleted-customers.sql', 'crm-v3.sql', 'customer-refs.sql', 'surveys.sql', 'survey-booking.sql', 'crm-activities-index.sql', 'ad-spend.sql', 'whatsapp-feed-index.sql', 'purchase-orders.sql', 'whatsapp-scheduled.sql', 'merge.sql', 'site-commissioning.sql', 'handover.sql', 'theme.sql'] as const;
export type SqlFile = (typeof SQL_FILES)[number];

export const GUIDES = {
  whatsapp: { file: 'WHATSAPP_SETUP.md', title: 'WhatsApp & Meta Lead Ads setup' },
  crm: { file: 'CRM_GUIDE.md', title: 'CRM setup' },
} as const;
export type GuideKey = keyof typeof GUIDES;

export const isSqlFile = (s: string): s is SqlFile => (SQL_FILES as readonly string[]).includes(s);
export const isGuide = (s: string): s is GuideKey => s in GUIDES;

export async function readSql(file: SqlFile) {
  return readFile(path.join(process.cwd(), 'supabase', file), 'utf8');
}

export async function readGuide(key: GuideKey) {
  return readFile(path.join(process.cwd(), GUIDES[key].file), 'utf8');
}

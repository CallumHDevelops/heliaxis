import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Which of the three Projects / Surveys / Booking SQL files have been run, so new screens and
 * sections can stay hidden until their tables exist. Server pages pass the result to client
 * components as a prop.
 */
export type SchemaReady = { crmV3: boolean; surveys: boolean; booking: boolean };

const TTL = 60_000;
let cached: { at: number; value: SchemaReady } | null = null;
let pending: Promise<SchemaReady> | null = null;

/**
 * True if the table (and optionally a column) can be read. Reads at most one row: a HEAD request
 * can't see a missing table (supabase-js turns PostgREST's bodiless 404 into a success).
 */
async function has(table: string, column = 'id') {
  try {
    const { error } = await createAdminClient().from(table).select(column).limit(1);
    return !error;
  } catch {
    return false;
  }
}

async function check(): Promise<SchemaReady> {
  const [crmV3, surveys, bookings, diary] = await Promise.all([
    has('crm_projects', 'project_ref'), // crm-v3.sql
    has('crm_surveys'), // surveys.sql
    has('survey_bookings'), // survey-booking.sql
    has('diary_entries'),
  ]);
  return { crmV3, surveys, booking: bookings && diary };
}

/** Cached in memory for 60 s, so a `false` is checked again a minute after the SQL is run. Never throws. */
export async function schemaReady(): Promise<SchemaReady> {
  if (cached && Date.now() - cached.at < TTL) return cached.value;
  pending ??= check()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

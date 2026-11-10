/**
 * Server-only Supabase client with the service role, used by the public landing routes to call the pv_* functions
 * and by server code that writes the API log. Never import from client code.
 * Uses Heliaxis's own service-role helper.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  return (client ??= createAdminClient());
}

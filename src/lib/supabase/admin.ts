import { createClient } from '@supabase/supabase-js';

// Service-role client. Bypasses RLS — use ONLY in server code, and always after
// verifying the caller is an approved admin. Never import this into client code.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

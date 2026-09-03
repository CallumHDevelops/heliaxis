import 'server-only';
import { createClient } from '@supabase/supabase-js';

/**
 * Service-role client. Bypasses RLS entirely — only ever used server-side, and
 * only after the caller has been authorised. Two legitimate uses here:
 *   1. Admin user management (approving accounts).
 *   2. Serving a shared RAMS to an anonymous visitor who holds a valid token.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

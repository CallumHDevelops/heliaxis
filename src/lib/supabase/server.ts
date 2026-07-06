import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server (server component / action / route handler) Supabase client.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Throws in a Server Component render (read-only cookies) — safe to ignore;
          // session refresh happens in middleware instead.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* no-op */
          }
        },
      },
    }
  );
}

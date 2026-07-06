// Reads bug reports / feature requests from Supabase so they can be triaged.
// Usage (Node 20+):  node --env-file=.env.local scripts/read-feedback.mjs [status]
//   optional [status] filters to open|in_progress|fixed|wontfix (default: all)
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  console.error('Run with:  node --env-file=.env.local scripts/read-feedback.mjs');
  process.exit(1);
}

const filter = process.argv[2];
const supabase = createClient(url, key, { auth: { persistSession: false } });

let q = supabase.from('feedback').select('*').order('created_at', { ascending: false });
if (filter) q = q.eq('status', filter);

const { data, error } = await q;
if (error) {
  console.error('Query failed:', error.message);
  process.exit(1);
}

if (!data?.length) {
  console.log(filter ? `No "${filter}" reports.` : 'No reports yet.');
} else {
  console.log(`${data.length} report(s):\n`);
  for (const r of data) {
    console.log(`[${r.status.toUpperCase()}] (${r.type}) ${r.title}`);
    if (r.detail) console.log(`  ${r.detail}`);
    if (r.page_url) console.log(`  page: ${r.page_url}`);
    console.log(`  id: ${r.id} · ${new Date(r.created_at).toLocaleString('en-GB')}\n`);
  }
}

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Simple env loader
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (m) {
    let value = m[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    env[m[1]] = value.trim();
  }
});

async function run() {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data } = await supabase
    .from('cms_kv')
    .select('value')
    .eq('key', 'heliaxis-cms-published')
    .maybeSingle();
  if (!data?.value) {
    console.log("No published CMS value found.");
    return;
  }
  const state = JSON.parse(data.value);
  console.log("Published Menu:", JSON.stringify(state?.site?.menu, null, 2));
}

run();

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
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
  const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data } = await s.from('cms_kv').select('key, value');
  if (!data) { console.log("No data"); return; }
  data.forEach(r => {
    try {
      const v = JSON.parse(r.value);
      console.log('Key:', r.key, 'Menu length:', v.site?.menu?.length);
      console.log('Menu items:', JSON.stringify(v.site?.menu, null, 2));
    } catch(e) {
      console.log('Key:', r.key, 'Error parsing');
    }
  });
}
run();

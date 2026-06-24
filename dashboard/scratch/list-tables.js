const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl && fs.existsSync('.env.local')) {
  const env = fs.readFileSync('.env.local', 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const knownTables = ['candidates', 'employees', 'tasks', 'van_thu', 'attendance', 'invoices', 'suppliers', 'system_settings', 'recruitment_needs'];
  for (const t of knownTables) {
    const { data: selectData, error: selectErr } = await supabase.from(t).select('*').limit(1);
    if (!selectErr) {
      console.log(`Table exists: ${t}`);
    } else {
      console.log(`Table does NOT exist: ${t} (${selectErr.message})`);
    }
  }
}

main();

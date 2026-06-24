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
  console.log("=== ALLOWED USERS ===");
  const { data: allowed, error: allowedErr } = await supabase
    .from('allowed_users')
    .select('*');
  if (allowedErr) console.error(allowedErr);
  else console.log(JSON.stringify(allowed, null, 2));

  console.log("\n=== EMPLOYEES CONTAINING QUYNH OR NGAN ===");
  const { data: emps, error: empsErr } = await supabase
    .from('employees')
    .select('id, name, employee_code, email, department, role');
  if (empsErr) {
    console.error(empsErr);
  } else {
    const filtered = emps.filter(e => 
      e.name.toLowerCase().includes('quỳnh') || 
      e.name.toLowerCase().includes('quynh') || 
      e.name.toLowerCase().includes('ngân') || 
      e.name.toLowerCase().includes('ngan')
    );
    console.log(JSON.stringify(filtered, null, 2));
  }
}

main();

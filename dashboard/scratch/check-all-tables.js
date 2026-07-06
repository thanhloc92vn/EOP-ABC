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

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const tables = [
  'employees',
  'tasks',
  'candidates',
  'attendance',
  'business_trips',
  'invoices',
  'suppliers',
  'clerical_documents',
  'admin_monthly_reports',
  'contracts',
  'attendance_justifications',
  'recruitment_needs'
];

async function main() {
  console.log("=== ROW COUNTS FOR ALL SUPABASE TABLES ===");
  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`Table '${table}': Error - ${error.message}`);
      } else {
        console.log(`Table '${table}': ${count} rows`);
      }
    } catch (err) {
      console.log(`Table '${table}': Exception - ${err.message}`);
    }
  }
}

main().catch(console.error);

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = "";
let supabaseAnonKey = "";
const envPath = "d:/Antigravity/PM - HCNS - TNEC/dashboard/.env.local";
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const columnsToTest = [
  'metadata',
  'extra',
  'data',
  'details',
  'allowance',
  'probation_salary',
  'official_salary',
  'probation_end_date',
  'signed_at',
  'effective_date',
  'insurance_salary',
  'notes_extra'
];

async function main() {
  console.log("=== TESTING ADDITIONAL COLUMNS ===");
  for (const col of columnsToTest) {
    const { error } = await supabase
      .from('contracts')
      .select(col)
      .limit(1);
      
    if (error) {
      console.log(`❌ Column [${col}]: DOES NOT EXIST (Error: ${error.message})`);
    } else {
      console.log(`✅ Column [${col}]: EXISTS`);
    }
  }
}

main();

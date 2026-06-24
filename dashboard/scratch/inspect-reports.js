const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const projectEnvPath = '.env.local';
let supabaseUrl = '';
let supabaseAnonKey = '';

if (fs.existsSync(projectEnvPath)) {
  const env = fs.readFileSync(projectEnvPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data: reports, error } = await supabase.from('admin_monthly_reports').select('*');
  if (error) {
    console.error(error);
    return;
  }
  console.log(`Total report rows: ${reports.length}`);
  reports.forEach(r => {
    console.log(JSON.stringify(r));
  });
}

main();

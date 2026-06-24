const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = '';
let supabaseAnonKey = '';

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("Attempting to update Nguyễn Thị Hồng Hạnh's date of birth in employees table...");
  const { data, error } = await supabase
    .from('employees')
    .update({ date_of_birth: '1983-06-02' })
    .eq('employee_code', '3722')
    .select();
    
  if (error) {
    console.error('Update error:', error.message);
  } else {
    console.log('Update result:', data);
  }
}

main().catch(console.error);

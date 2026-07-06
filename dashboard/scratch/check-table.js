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

async function main() {
  console.log('Testing connection to attendance_justifications table...');
  const { data, error } = await supabase
    .from('attendance_justifications')
    .select('*')
    .limit(1);

  if (error) {
    console.error('Error (table probably does not exist):', error.message);
  } else {
    console.log('Success! Table exists. Sample data:', data);
  }

  console.log('Testing connection to attendance_explanations table...');
  const { data: data2, error: error2 } = await supabase
    .from('attendance_explanations')
    .select('*')
    .limit(1);

  if (error2) {
    console.error('Error (table probably does not exist):', error2.message);
  } else {
    console.log('Success! Table exists. Sample data:', data2);
  }
}

main().catch(console.error);

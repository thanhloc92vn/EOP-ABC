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

console.log('Querying justifications from:', supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data, error } = await supabase
    .from('attendance_justifications')
    .select('*');

  if (error) {
    console.error('Error:', error.message);
  } else {
    console.log('Justifications data in DB:', JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);

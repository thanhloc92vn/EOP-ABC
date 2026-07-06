const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const envPath = path.join(__dirname, '..', '.env.local');

if (!supabaseUrl && fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data, error, count } = await supabase
    .from('contracts')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching count:', error);
  } else {
    console.log(`Current contract count in Supabase: ${count}`);
  }
}

main().catch(console.error);

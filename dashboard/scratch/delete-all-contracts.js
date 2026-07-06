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

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase URL or Anon Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log('Deleting all rows from contracts table in Supabase...');
  // Since we are using anon key, let's see if delete works.
  // In Supabase, standard RLS might allow deleting if we match everything.
  // To delete all rows using anon key under postgrest, we can use eq/neq or match a range.
  // Standard way: .neq('id', '0') or delete all.
  const { data, error } = await supabase
    .from('contracts')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows where id is not 0 (which is all rows)

  if (error) {
    console.error('Error deleting contracts:', error);
  } else {
    console.log('Successfully deleted all rows from contracts table!');
  }
}

main().catch(console.error);

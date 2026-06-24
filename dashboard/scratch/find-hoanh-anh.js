const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let supabaseUrl = '';
let supabaseAnonKey = '';

try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    if (line.includes('NEXT_PUBLIC_SUPABASE_URL')) {
      supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    }
    if (line.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY')) {
      supabaseAnonKey = line.split('=')[1].trim().replace(/['"]/g, '');
    }
  }
} catch (e) {
  console.error("Error reading .env.local file:", e);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .ilike('name', '%Hoành%');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Found employees with Hoành in name:', JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);

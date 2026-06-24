const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

let supabaseUrl = '';
let supabaseAnonKey = '';

try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
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
    .or("name.ilike.%Quyên%,employee_code.eq.005897");

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Found employees:', JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);

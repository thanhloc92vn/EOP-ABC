const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const supabaseUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/)[1].trim();
const supabaseAnonKey = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/)[1].trim();

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data, error } = await supabase.from('employees').select('employee_code, name, department, role, email');
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('Total employees:', data.length);
  console.log('Employees list:');
  data.forEach(e => {
    if (e.name.toLowerCase().includes('lộc') || e.name.toLowerCase().includes('loc')) {
      console.log('MATCH:', e);
    }
  });
  console.log('First 5 employees:', data.slice(0, 5));
}

check();

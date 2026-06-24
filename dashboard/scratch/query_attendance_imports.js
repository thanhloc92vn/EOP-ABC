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
  console.log('Querying public.attendance_imports...');
  const { data, error } = await supabase
    .from('attendance_imports')
    .select('month, year, file_name, parsed_data');
    
  if (error) {
    console.error('Error:', error.message);
    return;
  }
  
  console.log(`Success! Found ${data.length} imports.`);
  const employeeNames = new Set();
  
  data.forEach((imp, i) => {
    console.log(`\nImport [${i+1}] - Month: ${imp.month} | File: ${imp.file_name}`);
    const parsed = imp.parsed_data;
    let count = 0;
    if (Array.isArray(parsed)) {
      parsed.forEach(emp => {
        const name = emp.name || emp.Name || emp["Họ tên"] || emp["Họ và tên"] || "";
        if (name) {
          employeeNames.add(name);
          count++;
          if (name.toLowerCase().includes('hạnh') || name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes('hanh')) {
            console.log(`  -> Match: ${JSON.stringify(emp)}`);
          }
        }
      });
    }
    console.log(`  Total rows in this import: ${count}`);
  });
  
  console.log('\n--- ALL UNIQUE EMPLOYEE NAMES FROM TIMESHEET IMPORTS ---');
  console.log(Array.from(employeeNames).sort());
}

main().catch(console.error);

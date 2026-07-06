const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

let supabaseUrl = "";
let supabaseAnonKey = "";
const envPath = "d:/Antigravity/PM - HCNS - TNEC/dashboard/.env.local";
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  console.log("=== SELECTING EMPLOYEES MATCHING HƯƠNG OR HÀ ===");
  const { data, error } = await supabase
    .from('employees')
    .select('id, name, department, role, employee_code')
    .or('name.ilike.%Hương%,name.ilike.%Hà%');
    
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Employees found:", data.length);
    console.log("Employees:", JSON.stringify(data, null, 2));
  }
}

main();

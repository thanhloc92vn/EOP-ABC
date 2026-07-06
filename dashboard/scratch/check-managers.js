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
  const { data: emps, error } = await supabase
    .from('employees')
    .select('*');

  if (error) {
    console.error('Error fetching employees:', error.message);
    return;
  }

  console.log(`Total employees in DB: ${emps.length}`);

  // Find anyone with "Đào" or "Dao" in name
  const daoEmps = emps.filter(e => e.name.toLowerCase().includes('đào') || e.name.toLowerCase().includes('dao'));
  console.log('Employees containing "Đào" or "Dao":', daoEmps.map(e => ({ name: e.name, department: e.department, role: e.role })));

  // Find anyone in "Phòng Hành chính Nhân sự" or similar
  const hcnsEmps = emps.filter(e => e.department && (e.department.toLowerCase().includes('hành chính') || e.department.toLowerCase().includes('hcns')));
  console.log('\nHCNS Department Employees:', hcnsEmps.map(e => ({ name: e.name, department: e.department, role: e.role })));
}

main().catch(console.error);

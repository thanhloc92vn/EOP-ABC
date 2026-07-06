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
  console.log("=== CHECKING EXPIRING CONTRACTS ===");
  const { data: allContracts, error } = await supabase
    .from('contracts')
    .select('*');
  
  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Total contracts:", allContracts.length);
  
  const today = new Date("2026-06-26"); // Using the current mock date
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(today.getDate() + 30);

  const expiringContracts = allContracts.filter(c => {
    if (c.expiration_date) {
      const expDate = new Date(c.expiration_date);
      return expDate >= today && expDate <= thirtyDaysLater;
    }
    if (c.probation_end_date) {
      const probDate = new Date(c.probation_end_date);
      return probDate >= today && probDate <= thirtyDaysLater;
    }
    return false;
  });

  console.log(`Expiring contracts within 30 days (from 2026-06-26): ${expiringContracts.length}`);
  expiringContracts.slice(0, 5).forEach(c => {
    console.log(`- ${c.employee_name} (${c.employee_code}): Expiration=${c.expiration_date}, ProbationEnd=${c.probation_end_date}, Type=${c.type}`);
  });
}

main().catch(console.error);

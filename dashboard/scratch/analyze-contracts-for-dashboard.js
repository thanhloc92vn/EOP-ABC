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
  console.log("=== ANALYZING CONTRACTS FOR HR METRICS ===");
  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('*');
  
  if (error) {
    console.error("Error:", error);
    return;
  }

  console.log("Total contracts in database:", contracts.length);

  // 1. Contract Types
  const types = {};
  contracts.forEach(c => {
    types[c.type] = (types[c.type] || 0) + 1;
  });
  console.log("\nContract Types Distribution:", types);

  // 2. Probation vs Official
  const probationCount = contracts.filter(c => c.type === 'Thử việc' || c.status === 'Thử việc' || c.probation_end_date !== null).length;
  const officialCount = contracts.filter(c => c.type && c.type !== 'Thử việc').length;
  console.log(`Probation count: ${probationCount}`);
  console.log(`Official count: ${officialCount}`);

  // 3. Onboard date distribution (New hires in June 2026)
  // Let's check how many contracts have onboard_date in June 2026 (or year 2026)
  const june2026Hires = contracts.filter(c => {
    if (!c.onboard_date) return false;
    const onboard = new Date(c.onboard_date);
    return onboard.getFullYear() === 2026 && onboard.getMonth() === 5; // 5 is June (0-indexed)
  });
  console.log(`New hires in June 2026: ${june2026Hires.length}`);

  // 4. Welfare values (allowances, performance_bonus, base_salary_insurance)
  let totalAllowances = 0;
  let totalBonus = 0;
  let totalInsuranceSalary = 0;
  let hasAllowances = 0;
  let hasBonus = 0;

  contracts.forEach(c => {
    if (c.allowances) {
      totalAllowances += Number(c.allowances);
      hasAllowances++;
    }
    if (c.performance_bonus) {
      totalBonus += Number(c.performance_bonus);
      hasBonus++;
    }
    if (c.base_salary_insurance) {
      totalInsuranceSalary += Number(c.base_salary_insurance);
    }
  });

  console.log(`\nAllowances sum: ${totalAllowances.toLocaleString('vi-VN')} đ (Across ${hasAllowances} contracts)`);
  console.log(`Performance bonus sum: ${totalBonus.toLocaleString('vi-VN')} đ (Across ${hasBonus} contracts)`);
  console.log(`Insurance salary sum: ${totalInsuranceSalary.toLocaleString('vi-VN')} đ`);

  // Let's print a sample contract of type 'Thử việc'
  const probationSample = contracts.find(c => c.type === 'Thử việc');
  if (probationSample) {
    console.log("\nSample Probation Contract:", JSON.stringify(probationSample, null, 2));
  } else {
    console.log("\nNo contract has type = 'Thử việc'");
  }
}

main().catch(console.error);

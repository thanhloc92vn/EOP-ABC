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
  console.log("=== CALCULATING MONTHLY COSTS BY BLOCK ===");
  const { data: reports, error } = await supabase
    .from('admin_monthly_reports')
    .select('*');
  
  if (error) {
    console.error("Error:", error);
    return;
  }

  // Calculate for month 6 (June) and month 5 (May)
  let officeM6 = 0, projectM6 = 0;
  let officeM5 = 0, projectM5 = 0;

  reports.forEach(r => {
    const m6Val = Number(r.m6 || 0);
    const m5Val = Number(r.m5 || 0);
    
    if (r.category_type === 'office') {
      officeM6 += m6Val;
      officeM5 += m5Val;
    } else if (r.category_type === 'project') {
      projectM6 += m6Val;
      projectM5 += m5Val;
    }
  });

  console.log(`\nMonth 6 (June 2026):`);
  console.log(`  - Office Block Cost:  ${officeM6.toLocaleString('vi-VN')} đ`);
  console.log(`  - Project Block Cost: ${projectM6.toLocaleString('vi-VN')} đ`);
  console.log(`  - Total Cost:         ${(officeM6 + projectM6).toLocaleString('vi-VN')} đ`);

  console.log(`\nMonth 5 (May 2026):`);
  console.log(`  - Office Block Cost:  ${officeM5.toLocaleString('vi-VN')} đ`);
  console.log(`  - Project Block Cost: ${projectM5.toLocaleString('vi-VN')} đ`);
  console.log(`  - Total Cost:         ${(officeM5 + projectM5).toLocaleString('vi-VN')} đ`);
}

main().catch(console.error);

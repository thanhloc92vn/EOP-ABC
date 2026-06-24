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

// ==== INPUT: Paste the LATEST data from Admin's browser here ====
const OFFICE_NEEDS = {
  "HCNS": 4,
  "Phòng QLDA": 1,
  "ATLĐ": 1,
  "Kế hoạch": 1,
  "Kỹ thuật 1": 1
};

const PROJECT_NEEDS = {
  "Vàm Lẽo": 3,
  "RXT": 2,
  "Mã Đà": 1
};
// ================================================================

async function main() {
  console.log("Pushing office needs to Supabase...");
  const { error: e1 } = await supabase
    .from('recruitment_needs')
    .upsert({ id: 'office_manual_needs', data: OFFICE_NEEDS, updated_at: new Date().toISOString() });
  
  if (e1) {
    console.error("Failed to push office needs:", e1);
  } else {
    console.log("✅ Office needs pushed:", OFFICE_NEEDS);
  }

  console.log("Pushing project needs to Supabase...");
  const { error: e2 } = await supabase
    .from('recruitment_needs')
    .upsert({ id: 'project_manual_needs', data: PROJECT_NEEDS, updated_at: new Date().toISOString() });
  
  if (e2) {
    console.error("Failed to push project needs:", e2);
  } else {
    console.log("✅ Project needs pushed:", PROJECT_NEEDS);
  }

  // Verify
  const { data } = await supabase.from('recruitment_needs').select('*');
  console.log("\n📋 Current Supabase data:");
  console.log(JSON.stringify(data, null, 2));
}

main();

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
  console.log("--- FETCHING VPP_INVENTORY_CATALOG ---");
  const { data: catalogData, error: catalogErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('title', 'VPP_INVENTORY_CATALOG')
    .limit(1);

  if (catalogErr) {
    console.error("Catalog error:", catalogErr);
  } else if (catalogData && catalogData.length > 0) {
    const supplies = JSON.parse(catalogData[0].notes || '[]');
    console.log(`Total supplies in catalog: ${supplies.length}`);
    console.log("Sample catalog items:", supplies.slice(0, 10));
  } else {
    console.log("No VPP_INVENTORY_CATALOG found.");
  }

  console.log("\n--- FETCHING COMPLETED VPP REQUESTS (status = completed or title like VPP:%) ---");
  const { data: reqData, error: reqErr } = await supabase
    .from('tasks')
    .select('*')
    .ilike('title', 'VPP:%');

  if (reqErr) {
    console.error("Requests error:", reqErr);
  } else {
    console.log(`Total VPP requests: ${reqData.length}`);
    const completed = reqData.filter(t => t.status === 'completed');
    console.log(`Completed/Allocated VPP requests: ${completed.length}`);
    completed.forEach(t => {
      console.log(`- ID: ${t.id} | Title: ${t.title} | Status: ${t.status} | Notes: ${t.notes}`);
    });
  }
}

main().catch(console.error);

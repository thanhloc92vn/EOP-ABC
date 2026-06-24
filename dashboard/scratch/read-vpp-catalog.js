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

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase credentials!");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('title', 'VPP_INVENTORY_CATALOG');
  
  if (error) {
    console.error(error);
    return;
  }
  
  if (data && data.length > 0) {
    const catalog = JSON.parse(data[0].notes || "[]");
    console.log("Catalog size:", catalog.length);
    fs.writeFileSync('scratch/catalog_items.json', JSON.stringify(catalog, null, 2));
    console.log("Written catalog to scratch/catalog_items.json");
  } else {
    console.log("No catalog found in DB.");
  }
}

main();

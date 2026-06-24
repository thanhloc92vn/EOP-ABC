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

const cleanInvoiceDescription = (desc) => {
  let clean = desc || "";
  
  // Safe JSON parse if needed
  if (clean.startsWith("{\"")) {
    try {
      const parsed = JSON.parse(clean);
      clean = parsed.mission || clean;
    } catch (e) {}
  }

  // Remove common prefixes case-insensitively
  clean = clean.replace(/^(thanh toan chi phi|thanh toan|chi phi)\s+/i, "");

  // Remove month indicators like "thang 04/2026", "T04/2026", "thang 04", "T04", "thang 5", "T5"
  clean = clean.replace(/(thang\s+\d{1,2}\/\d{4}|T\d{1,2}\/\d{4})/gi, "");
  clean = clean.replace(/(thang\s+\d{1,2}|T\d{1,2})/gi, "");
  
  // Remove trailing company names or hyphens
  clean = clean.replace(/\s*-\s*CÔNG TY.*/i, "");
  clean = clean.replace(/\s*-\s*CTY.*/i, "");
  clean = clean.replace(/\s*-\s*CO PHAN.*/i, "");

  // Trim extra spaces and capitalize first letter
  clean = clean.replace(/\s+/g, " ").trim();
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  
  return clean;
};

async function main() {
  const { data: invoices } = await supabase.from('invoices').select('*');
  
  console.log("=== CLEANING INVOICE DESCRIPTIONS ===");
  invoices.forEach(inv => {
    console.log(`Original: "${inv.description}"`);
    console.log(`Cleaned:  "${cleanInvoiceDescription(inv.description)}"\n`);
  });
}

main().catch(console.error);

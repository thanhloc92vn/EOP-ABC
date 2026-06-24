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

const cleanInvoiceDesc = (desc) => {
  let clean = desc || "";
  
  // Remove common prefixes case-insensitively
  clean = clean.replace(/^(thanh toan chi phi|thanh toan|chi phi|tt chi phi|tt cp|tt)\s+/i, "");
  clean = clean.replace(/^(thanh toán chi phí|thanh toán|chi phí)\s+/i, "");

  // Remove month indicators with diacritics
  clean = clean.replace(/(tháng\s+\d{1,2}\/\d{4}|thang\s+\d{1,2}\/\d{4}|T\d{1,2}\/\d{4})/gi, "");
  clean = clean.replace(/(tháng\s+\d{1,2}|thang\s+\d{1,2}|T\d{1,2})/gi, "");
  
  // Remove trailing company suffixes
  clean = clean.replace(/\s*-\s*(công ty|cty|cổ phần|cp|tnhh|co phan).*/i, "");

  // Trim extra spaces and capitalize
  clean = clean.replace(/\s+/g, " ").trim();
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  
  return clean || "Chi phí khác";
};

// Check if description or beneficiary matches any project keyword
const getCategoryType = (desc, supplier) => {
  const fullText = (desc + " " + supplier).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");

  const projectKeywords = ["ca na", "rach xuyen tam", "vam leo", "tinh lo 8", "tra vinh", "tay ninh"];
  if (projectKeywords.some(kw => fullText.includes(kw))) {
    return "project";
  }
  return "office";
};

async function main() {
  const { data: rawInvoices } = await supabase.from('invoices').select('*');
  
  // Unpack invoices (checking for grouped JSON)
  const items = [];
  rawInvoices.forEach(inv => {
    const desc = inv.description || "";
    if (desc.startsWith("{\"")) {
      try {
        const parsed = JSON.parse(desc);
        const groupItems = parsed.items || [];
        groupItems.forEach(item => {
          items.push({
            id: `${inv.id}-${item.number}`,
            type: inv.number && inv.number.startsWith("HD-DK-") ? "recurring" : "invoice",
            date: item.date || inv.date,
            desc: item.desc,
            amount: Number(item.amount),
            supplier: inv.beneficiary_name || ""
          });
        });
      } catch (e) {
        items.push({
          id: inv.id,
          type: inv.number && inv.number.startsWith("HD-DK-") ? "recurring" : "invoice",
          date: inv.date,
          desc: desc,
          amount: Number(inv.amount),
          supplier: inv.beneficiary_name || ""
        });
      }
    } else {
      items.push({
        id: inv.id,
        type: inv.number && inv.number.startsWith("HD-DK-") ? "recurring" : "invoice",
        date: inv.date,
        desc: desc,
        amount: Number(inv.amount),
        supplier: inv.beneficiary_name || ""
      });
    }
  });

  console.log(`Unpacked into ${items.length} items.`);

  // Group by clean description and category type
  const groups = {};
  items.forEach(item => {
    // Determine month
    let monthNum = 6; // default
    if (item.date) {
      const parts = item.date.split("-");
      if (parts.length >= 2) {
        monthNum = parseInt(parts[1]);
      }
    }

    const cleanDesc = cleanInvoiceDesc(item.desc);
    const catType = getCategoryType(item.desc, item.supplier);
    const key = `${catType}::${cleanDesc}`;

    if (!groups[key]) {
      groups[key] = {
        content: cleanDesc,
        category_type: catType,
        m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0
      };
    }
    groups[key][`m${monthNum}`] += item.amount;
  });

  console.log("\n=== DYNAMICALLY GENERATED ROWS ===");
  Object.values(groups).forEach((g, i) => {
    const total = Array.from({ length: 12 }, (_, idx) => g[`m${idx + 1}`]).reduce((a, b) => a + b, 0);
    const months = Array.from({ length: 12 }, (_, idx) => g[`m${idx + 1}`] > 0 ? `T${idx+1}:${g[`m${idx + 1}`].toLocaleString('vi-VN')}` : null).filter(Boolean).join(', ');
    console.log(`[${g.category_type.toUpperCase()}] ${g.content} | Total: ${total.toLocaleString('vi-VN')} đ | ${months}`);
  });
}

main().catch(console.error);

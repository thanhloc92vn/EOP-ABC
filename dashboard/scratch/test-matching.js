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

const normalizeText = (text) => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
};

const findMatchingRow = (rows, desc, supplier) => {
  const normDesc = normalizeText(desc || "");
  const normSupplier = normalizeText(supplier || "");
  const fullText = normDesc + " " + normSupplier;

  // Improved rules with normalized keys and refined keywords
  const rules = [
    { key: "van phong pham", keywords: ["van phong pham", "vpp", "but bi", "giay a4", "kep buom", "tem nhan", "bang keo", "bia ho so"] },
    { key: "photo, in an", keywords: ["photo", "in an", "muc in", "thue may photo", "photocopy"] },
    { key: "hoa chat, vat dung ve sinh", keywords: ["ve sinh", "hoa chat ve sinh", "nuoc lau san", "xa bong", "giay ve sinh", "rua chen"] },
    { key: "ccdc, phan mem ho tro", keywords: ["ccdc", "do dung van phong", "pin", "o cam", "trans can", "pickle ball", "le khoi cong", "hoa khai truong", "tivi 55 inch", "cap hdmi"] },
    // Removed raw "bay" to prevent matching "hai bon bay" (247). Added "may bay", "ve may bay", etc.
    { key: "vmb", keywords: ["vmb", "ve may bay", "vietnam airlines", "vietjet", "bamboo airways", "may bay", "ve may"] },
    // Added "thue can ho"
    { key: "thue nha, van phong", keywords: ["thue nha", "thue vp", "thue van phong", "phong ban giam doc", "pgd", "tien thue nha", "thue can ho"] },
    // Added "dien sinh hoat", "dien luc"
    { key: "dien vp", keywords: ["dien vp", "tien dien", "evn", "dien luc", "dien sinh hoat"] },
    // Added "nuoc uong", "nuoc binh", "vihawa"
    { key: "nuoc (nuoc uong)", keywords: ["tien nuoc", "nuoc khoang", "lavie", "vinh hao", "aquafina", "nuoc sinh hoat", "nuoc uong", "nuoc binh", "vihawa"] },
    // Added "cuoc chuyen phat"
    { key: "chuyen phat nhanh", keywords: ["chuyen phat", "cpn", "buu dien", "viettel post", "giaohangnhanh", "dhl", "fedex", "shopee express", "grabexpress", "cuoc chuyen phat"] },
    { key: "xang dau, cau pha", keywords: ["xang dau", "dau diezel", "gui xe", "rua xe", "cau duong", "ve xe", "nhien lieu"] },
    { key: "sua chua, bao duong o to", keywords: ["sua chua o to", "bao duong o to", "thay nho", "lop xe", "sam xe", "phu tung o to"] },
    { key: "thue xe o to", keywords: ["thue xe o to", "thue xe thang", "thue o to"] },
    { key: "dang kiem, phi duong bo", keywords: ["dang kiem", "duong bo", "phi duong bo"] },
    { key: "qua tang doi tac", keywords: ["qua tang", "qua doi tac", "hoa tang"] },
    { key: "ca na", keywords: ["ca na"] },
    { key: "rach xuyen tam", keywords: ["rach xuyen tam"] },
    { key: "vam leo", keywords: ["vam leo", "au thuyen vam leo"] },
    { key: "tinh lo 8", keywords: ["tinh lo 8"] },
    { key: "tra vinh", keywords: ["tra vinh"] },
    { key: "tay ninh", keywords: ["tay ninh"] }
  ];

  for (const rule of rules) {
    if (rule.keywords.some(kw => fullText.includes(kw))) {
      // Normalize rule.key so that commas and parentheses don't prevent match
      const normRuleKey = normalizeText(rule.key);
      const found = rows.find(r => normalizeText(r.content).includes(normRuleKey));
      if (found) return found;
    }
  }

  for (const row of rows) {
    const normContent = normalizeText(row.content);
    if (normContent.length > 4 && (normDesc.includes(normContent) || normSupplier.includes(normContent))) {
      return row;
    }
  }
  return null;
};

const getInvoiceDesc = (desc) => {
  if (desc && desc.startsWith("{\"")) {
    try {
      const parsed = JSON.parse(desc);
      return parsed.mission || "";
    } catch (e) {
      return desc;
    }
  }
  return desc || "";
};

async function main() {
  const { data: rows } = await supabase.from('admin_monthly_reports').select('*');
  const { data: invoices } = await supabase.from('invoices').select('*');

  console.log(`Loaded ${rows.length} report rows, ${invoices.length} invoices.\n`);

  invoices.forEach(inv => {
    const desc = getInvoiceDesc(inv.description);
    const supplier = inv.beneficiary_name || "";
    const matched = findMatchingRow(rows, desc, supplier);
    console.log(`Invoice: ${inv.number} | Desc: ${desc.substring(0, 50)} | Supplier: ${supplier} | Amount: ${Number(inv.amount).toLocaleString('vi-VN')} đ`);
    if (matched) {
      console.log(`  -> MATCHED: [${matched.category_type.toUpperCase()}] STT ${matched.stt} - ${matched.content}\n`);
    } else {
      console.log(`  -> NO MATCH FOUND\n`);
    }
  });
}

main().catch(console.error);

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

const cleanInvoiceDesc = (description) => {
  let clean = description || "";
  clean = clean.replace(/^(thanh toán chi phí|thanh toán|chi phí|tt chi phí|tt cp|tt)\s+/i, "");
  clean = clean.replace(/^(thanh toan chi phi|thanh toan|chi phi)\s+/i, "");
  clean = clean.replace(/(tháng\s+\d{1,2}\/\d{4}|thang\s+\d{1,2}\/\d{4}|T\d{1,2}\/\d{4})/gi, "");
  clean = clean.replace(/(tháng\s+\d{1,2}|thang\s+\d{1,2}|T\d{1,2})/gi, "");
  clean = clean.replace(/\s*-\s*(công ty|cty|cổ phần|cp|tnhh|co phan).*/i, "");
  clean = clean.replace(/\s+/g, " ").trim();
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
  }
  return clean || "Chi phí khác";
};

const getProjectName = (description, supplier) => {
  const fullText = (description + " " + supplier).toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d");

  if (fullText.includes("vam leo")) {
    return "BĐH dự án Vàm Lẽo";
  }
  if (fullText.includes("tinh lo 8")) {
    return "BĐH dự án Tỉnh Lộ 8";
  }
  if (fullText.includes("rach xuyen tam")) {
    return "BĐH dự án Rạch Xuyên Tâm";
  }
  if (fullText.includes("tay ninh")) {
    return "BĐH dự án Tây Ninh";
  }
  if (fullText.includes("ca na")) {
    return "BĐH dự án Cà Ná";
  }
  if (fullText.includes("tra vinh")) {
    return "BĐH dự án Trà Vinh";
  }
  return null;
};

async function main() {
  console.log("Loading invoices from Supabase...");
  const { data: rawInvoices, error: invErr } = await supabase.from('invoices').select('*');
  if (invErr) throw invErr;

  console.log(`Loaded ${rawInvoices.length} invoices. Unpacking...`);

  const unpackedItems = [];
  rawInvoices.filter(inv => !inv.number || !inv.number.startsWith("HD-DK-")).forEach(inv => {
    const desc = inv.description || "";
    if (desc.startsWith("{\"")) {
      try {
        const parsed = JSON.parse(desc);
        const groupItems = parsed.items || [];
        groupItems.forEach((item) => {
          unpackedItems.push({
            date: item.date || inv.date || "",
            desc: item.desc || "",
            amount: Number(item.amount) || 0,
            supplier: inv.beneficiary_name || "",
            project_name: inv.project_name || item.project_name
          });
        });
      } catch (e) {
        unpackedItems.push({
          date: inv.date || "",
          desc: desc,
          amount: Number(inv.amount) || 0,
          supplier: inv.beneficiary_name || "",
          project_name: inv.project_name
        });
      }
    } else {
      unpackedItems.push({
        date: inv.date || "",
        desc: desc,
        amount: Number(inv.amount) || 0,
        supplier: inv.beneficiary_name || "",
        project_name: inv.project_name
      });
    }
  });

  // Extract recurring payments (pendingPayments state in React is populated from invoices where number starts with HD-DK-)
  // In our React app, pendingPayments has elements mapped from recurringInvs
  const recurringInvs = rawInvoices.filter(row => row.number && row.number.startsWith("HD-DK-"));
  recurringInvs.forEach(p => {
    let dateStr = "";
    if (p.date) {
      const parts = p.date.split("-");
      if (parts.length >= 2) {
        dateStr = `${p.date}`; // already YYYY-MM-DD
      }
    }
    unpackedItems.push({
      date: dateStr,
      desc: p.description || "",
      amount: Number(p.amount) || 0,
      supplier: p.beneficiary_name || "",
      project_name: p.project_name
    });
  });

  console.log(`Total active items to process: ${unpackedItems.length}`);

  const getStandardProjectName = (projName, description, supplier) => {
    const name = (projName || "").trim();
    if (name) {
      const lowerNormalized = name.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[đĐ]/g, "d");
      
      if (lowerNormalized === "van phong hcm") {
        return null;
      }
      
      if (lowerNormalized.includes("vam leo")) return "BĐH dự án Vàm Lẽo";
      if (lowerNormalized.includes("tinh lo 8")) return "BĐH dự án Tỉnh Lộ 8";
      if (lowerNormalized.includes("rach xuyen tam")) return "BĐH dự án Rạch Xuyên Tâm";
      if (lowerNormalized.includes("tay ninh")) return "BĐH dự án Tây Ninh";
      if (lowerNormalized.includes("ca na")) return "BĐH dự án Cà Ná";
      if (lowerNormalized.includes("tra vinh")) return "BĐH dự án Trà Vinh";
      if (name.startsWith("BĐH ")) return name;
      return `BĐH dự án ${name}`;
    }
    return getProjectName(description, supplier);
  };

  const groups = {};

  unpackedItems.forEach(item => {
    if (!item.date) return;
    if (!item.date.includes("2026")) return;
    
    let monthNum = 0;
    if (item.date.includes("-")) {
      const parts = item.date.split("-");
      monthNum = parseInt(parts[1]);
    }
    if (monthNum < 1 || monthNum > 12) return;

    const projName = getStandardProjectName(item.project_name, item.desc, item.supplier);
    const categoryType = projName ? "project" : "office";
    const contentName = projName || cleanInvoiceDesc(item.desc);
    const key = `${categoryType}::${contentName}`;

    if (!groups[key]) {
      groups[key] = {
        content: contentName,
        category_type: categoryType,
        m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0
      };
    }
    groups[key][`m${monthNum}`] += item.amount;
  });

  console.log("\nMerging and syncing with admin_monthly_reports table...");
  const { data: dbRows, error: fetchErr } = await supabase.from("admin_monthly_reports").select("*");
  if (fetchErr) throw fetchErr;

  const currentDbRows = dbRows || [];
  const finalRows = [];
  const usedIds = new Set();

  Object.values(groups).forEach(g => {
    const existing = currentDbRows.find(r => 
      r.category_type === g.category_type && 
      normalizeText(r.content) === normalizeText(g.content)
    );

    if (existing) {
      finalRows.push({
        ...existing,
        ...g
      });
      usedIds.add(existing.id);
    } else {
      finalRows.push({
        id: `new-${Date.now()}-${Math.random()}`,
        stt: "",
        content: g.content,
        category_type: g.category_type,
        m1: g.m1, m2: g.m2, m3: g.m3, m4: g.m4, m5: g.m5, m6: g.m6,
        m7: g.m7, m8: g.m8, m9: g.m9, m10: g.m10, m11: g.m11, m12: g.m12,
        notes: ""
      });
    }
  });

  currentDbRows.forEach(r => {
    if (!usedIds.has(r.id)) {
      if (r.is_custom || (r.notes && r.notes.trim().length > 0)) {
        finalRows.push({
          ...r,
          m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0
        });
        usedIds.add(r.id);
      }
    }
  });

  // Assign STT
  const officeRows = finalRows.filter(r => r.category_type === "office");
  officeRows.forEach((r, idx) => { r.stt = String(idx + 1); });

  const projectRows = finalRows.filter(r => r.category_type === "project");
  projectRows.forEach((r, idx) => { r.stt = String(idx + 1); });

  const toUpdate = finalRows.filter(r => !r.id.startsWith("new-"));
  const toInsert = finalRows.filter(r => r.id.startsWith("new-"));
  const toDelete = currentDbRows.filter(r => !usedIds.has(r.id));

  console.log(`Deletions: ${toDelete.length} rows.`);
  console.log(`Updates: ${toUpdate.length} rows.`);
  console.log(`Inserts: ${toInsert.length} rows.`);

  const deletePromises = toDelete.map(row => supabase.from("admin_monthly_reports").delete().eq("id", row.id));
  await Promise.all(deletePromises);

  const updatePromises = toUpdate.map(row => 
    supabase.from("admin_monthly_reports").update({
      stt: row.stt,
      m1: row.m1, m2: row.m2, m3: row.m3, m4: row.m4, m5: row.m5, m6: row.m6,
      m7: row.m7, m8: row.m8, m9: row.m9, m10: row.m10, m11: row.m11, m12: row.m12
    }).eq("id", row.id)
  );
  await Promise.all(updatePromises);

  const insertPromises = toInsert.map(async (row) => {
    const { id, ...payload } = row;
    const { data, error } = await supabase.from("admin_monthly_reports").insert({ ...payload, is_custom: false }).select();
    if (error) throw error;
    if (data && data[0]) {
      row.id = data[0].id;
    }
  });
  await Promise.all(insertPromises);

  console.log("\n=== COMPLETED SYNC OF DATABASE ===");
  finalRows.forEach(row => {
    const total = Array.from({ length: 12 }, (_, idx) => row[`m${idx + 1}`]).reduce((a, b) => a + b, 0);
    console.log(`[${row.category_type.toUpperCase()}] STT ${row.stt} - ${row.content} | Total: ${total.toLocaleString('vi-VN')} đ`);
  });
}

main().catch(console.error);

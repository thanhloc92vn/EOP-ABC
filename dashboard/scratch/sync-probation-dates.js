// Sync "NGÀY KÝ HĐ THỬ VIỆC" (TỪ NGÀY / ĐẾN NGÀY) from DANH_SACH_01/02.xlsx
// into contracts.probation_start_date / probation_end_date, matched by employee_code.
// Usage: node scratch/sync-probation-dates.js          (dry run)
//        node scratch/sync-probation-dates.js --apply  (write to DB)
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

const APPLY = process.argv.includes('--apply');

let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const envPath = path.join(__dirname, '..', '.env.local');
if (!supabaseUrl && fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

function toISODate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // exceljs returns UTC-based dates for date cells
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // yyyy-mm-dd
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

async function readExcel(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 6) return; // headers occupy rows 1-6
    const code = row.getCell(3).text ? String(row.getCell(3).text).trim() : '';
    const name = row.getCell(4).text ? String(row.getCell(4).text).trim() : '';
    const from = toISODate(row.getCell(7).value); // G: TỪ NGÀY
    const to = toISODate(row.getCell(8).value);   // H: ĐẾN NGÀY
    if (!code || !/^\d+$/.test(code)) return; // skip section headers like "BAN GIÁM ĐỐC"
    if (!from && !to) return;
    rows.push({ code, name, from, to, src: path.basename(file) });
  });
  return rows;
}

async function main() {
  const files = [
    path.join(__dirname, 'DANH_SACH_01.xlsx'),
    path.join(__dirname, 'DANH_SACH_02.xlsx'),
  ];
  const excelRows = [];
  for (const f of files) excelRows.push(...(await readExcel(f)));
  console.log(`Excel: ${excelRows.length} dòng có Từ/Đến ngày HĐTV`);

  // last occurrence wins if duplicated
  const byCode = new Map();
  for (const r of excelRows) byCode.set(r.code, r);

  const { data: contracts, error } = await supabase
    .from('contracts')
    .select('id, employee_code, employee_name, probation_start_date, probation_end_date');
  if (error) throw error;
  console.log(`DB: ${contracts.length} hợp đồng`);

  let updates = 0, unmatchedExcel = new Set(byCode.keys());
  for (const c of contracts) {
    const code = (c.employee_code || '').toString().trim();
    const ex = byCode.get(code);
    if (!ex) continue;
    unmatchedExcel.delete(code);
    const patch = {};
    if (ex.from && ex.from !== c.probation_start_date) patch.probation_start_date = ex.from;
    if (ex.to && ex.to !== c.probation_end_date) patch.probation_end_date = ex.to;
    if (Object.keys(patch).length === 0) continue;
    updates++;
    console.log(`${APPLY ? 'UPDATE' : '[dry] would update'} ${code} ${ex.name}: ` +
      `start ${c.probation_start_date || '—'} -> ${patch.probation_start_date || c.probation_start_date || '—'}, ` +
      `end ${c.probation_end_date || '—'} -> ${patch.probation_end_date || c.probation_end_date || '—'}`);
    if (APPLY) {
      const { error: upErr } = await supabase.from('contracts').update(patch).eq('id', c.id);
      if (upErr) console.error(`  !! Lỗi update ${code}:`, upErr.message);
    }
  }
  console.log(`\nTổng: ${updates} dòng cần cập nhật.`);
  if (unmatchedExcel.size) {
    console.log(`Mã NV có trong Excel nhưng không khớp hợp đồng nào trong DB (${unmatchedExcel.size}):`,
      [...unmatchedExcel].join(', '));
  }
  console.log(APPLY ? 'ĐÃ GHI VÀO DB.' : 'Dry run — chưa ghi gì. Chạy lại với --apply để ghi.');
}

main().catch(e => { console.error(e); process.exit(1); });

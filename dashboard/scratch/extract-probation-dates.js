// Extract "NGÀY KÝ HĐ THỬ VIỆC" (TỪ/ĐẾN) from DANH_SACH_01/02.xlsx
// into public/sync/probation-dates.json for the one-time in-app sync button.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

function toISODate(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
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
    if (rowNumber < 6) return;
    const code = row.getCell(3).text ? String(row.getCell(3).text).trim() : '';
    const name = row.getCell(4).text ? String(row.getCell(4).text).trim() : '';
    const from = toISODate(row.getCell(7).value); // G: TỪ NGÀY
    const to = toISODate(row.getCell(8).value);   // H: ĐẾN NGÀY
    if (!code || !/^\d+$/.test(code)) return;
    if (!from && !to) return;
    rows.push({ code, name, from, to });
  });
  return rows;
}

(async () => {
  const rows = [];
  for (const f of ['DANH_SACH_01.xlsx', 'DANH_SACH_02.xlsx']) {
    rows.push(...(await readExcel(path.join(__dirname, f))));
  }
  const outDir = path.join(__dirname, '..', 'public', 'sync');
  fs.mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, 'probation-dates.json');
  fs.writeFileSync(out, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`Wrote ${rows.length} rows to ${out}`);
  for (const r of rows.slice(0, 5)) console.log(' sample:', JSON.stringify(r));
})();

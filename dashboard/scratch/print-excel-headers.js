const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'DANH_SACH_01.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const csv = XLSX.utils.sheet_to_csv(sheet);
const lines = csv.split('\n');

console.log(`=== PRINTING ALL DETECTED GROUP HEADERS ===`);
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const cells = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
  const nonEmpty = cells.filter(c => c.length > 0);
  if (nonEmpty.length > 0 && nonEmpty.length <= 3) {
    for (const cell of nonEmpty) {
      const lower = cell.toLowerCase();
      if (
        lower.startsWith("p. ") ||
        lower.startsWith("p.") ||
        lower.startsWith("phòng ") ||
        lower.startsWith("ban ") ||
        lower.startsWith("tổ ") ||
        lower.startsWith("đội ") ||
        lower.startsWith("bch ") ||
        lower.startsWith("bđh ") ||
        lower.startsWith("da ") ||
        lower.startsWith("dự án ") ||
        lower.includes("giám đốc") ||
        lower.includes("chỉ huy") ||
        lower.includes("điều hành") ||
        lower.includes("công trình")
      ) {
        console.log(`Line ${i + 1}: ${line}`);
      }
    }
  }
}

const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'DANH_SACH_02.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const csv = XLSX.utils.sheet_to_csv(sheet);
const lines = csv.split('\n');

console.log(`=== PRINTING FIRST 35 LINES OF CSV ===`);
for (let i = 0; i < Math.min(lines.length, 35); i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}

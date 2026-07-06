const XLSX = require('xlsx');
const path = require('path');

function searchCodes(filename) {
  const filePath = path.join(__dirname, filename);
  console.log(`\n=== Searching codes in ${filename} ===`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  
  const codes = ['6377', '5804', '5595', '5730'];
  data.forEach((row, idx) => {
    const values = Object.values(row).map(v => String(v));
    const found = codes.filter(c => values.includes(c));
    if (found.length > 0) {
      console.log(`Row ${idx + 2}: found codes ${found.join(', ')} -> ${JSON.stringify(row)}`);
    }
  });
}

searchCodes('DANH_SACH_01.xlsx');
searchCodes('DANH_SACH_02.xlsx');

const XLSX = require('xlsx');
const path = require('path');

function inspectFile(filename) {
  const filePath = path.join(__dirname, filename);
  console.log(`\n=== Inspecting ${filename} ===`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet);
  console.log(`Total rows: ${data.length}`);
  
  // Find if any row has name matching "Hương"
  const matches = data.filter(row => {
    const values = Object.values(row).map(v => String(v).toLowerCase());
    return values.some(v => v.includes('hương'));
  });
  
  if (matches.length > 0) {
    console.log(`Found matches for 'Hương':`);
    matches.forEach(m => console.log(JSON.stringify(m)));
  } else {
    console.log(`No matches for 'Hương' found.`);
  }
}

try {
  inspectFile('DANH_SACH_01.xlsx');
} catch (e) {
  console.error("Error inspecting DANH_SACH_01.xlsx:", e.message);
}

try {
  inspectFile('DANH_SACH_02.xlsx');
} catch (e) {
  console.error("Error inspecting DANH_SACH_02.xlsx:", e.message);
}

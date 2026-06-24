const XLSX = require("xlsx");
const path = require("path");

const templatePath = path.join(__dirname, "..", "public", "templates", "phieu_cap_phat_vpp.xlsx");

try {
  const workbook = XLSX.readFile(templatePath);
  console.log("Sheet Names:", workbook.SheetNames);
  
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  // Read first 25 rows and 10 columns
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:J25");
  for (let r = 0; r <= Math.min(25, range.e.r); r++) {
    let rowCells = [];
    for (let c = 0; c <= Math.min(10, range.e.c); c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[cellRef];
      rowCells.push(cellRef + ": " + (cell ? cell.v : ""));
    }
    console.log(`Row ${r + 1}:`, rowCells.join(" | "));
  }
} catch (err) {
  console.error("Error reading file:", err);
}

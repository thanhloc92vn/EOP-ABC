const XLSX = require("xlsx");
const path = require("path");

const templatePath = path.join(__dirname, "..", "public", "templates", "phieu_cap_phat_vpp.xlsx");

try {
  const workbook = XLSX.readFile(templatePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:G50");
  for (let r = 25; r <= Math.min(50, range.e.r); r++) {
    let rowCells = [];
    for (let c = 0; c <= Math.min(6, range.e.c); c++) {
      const cellRef = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[cellRef];
      rowCells.push(cellRef + ": " + (cell ? cell.v : ""));
    }
    console.log(`Row ${r + 1}:`, rowCells.join(" | "));
  }
} catch (err) {
  console.error("Error reading file:", err);
}

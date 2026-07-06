const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'DANH_SACH_02.xlsx');
const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const sheet = workbook.Sheets[sheetName];
const csv = XLSX.utils.sheet_to_csv(sheet);
const allLines = csv.split('\n');
const csvLines = allLines.filter(line => line.replace(/,/g, "").trim().length > 0);

const isLineGroupHeader = (line) => {
  const cells = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
  const nonEmpty = cells.filter(c => c.length > 0);
  if (nonEmpty.length === 0) return false;
  if (nonEmpty.length > 3) return false;

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
      return true;
    }
  }
  return false;
};

const isLineHeaderOrSubHeader = (line) => {
  const lower = line.toLowerCase();
  if (
    lower.includes("họ tên") ||
    lower.includes("họ và tên") ||
    lower.includes("mã nhân viên") ||
    lower.includes("từ ngày") ||
    lower.includes("đến ngày") ||
    lower.includes("ngày hiệu lực") ||
    lower.includes("ngày hết hạn") ||
    lower.includes("ngày ký") ||
    lower.includes("ngày nhận việc") ||
    lower.includes("mức lương") ||
    lower.includes("phụ cấp") ||
    lower.includes("thu nhập")
  ) {
    return true;
  }
  return false;
};

// Scan all CSV lines to map active group/department headers
const activeGroupHeaders = [];
let currentGroupHeader = "";
for (let idx = 0; idx < csvLines.length; idx++) {
  const line = csvLines[idx];
  if (isLineGroupHeader(line)) {
    currentGroupHeader = line;
  }
  activeGroupHeaders.push(currentGroupHeader);
}

// Find header row index
let headerRowIndex = 0;
for (let idx = 0; idx < Math.min(csvLines.length, 15); idx++) {
  if (isLineHeaderOrSubHeader(csvLines[idx]) && !isLineGroupHeader(csvLines[idx])) {
    headerRowIndex = idx;
    break;
  }
}

console.log(`headerRowIndex: ${headerRowIndex}`);

console.log(`=== PRINTING csvLines INDEXES & ACTIVE HEADERS ===`);
for (let i = 0; i < csvLines.length; i++) {
  const isHeader = isLineGroupHeader(csvLines[i]);
  console.log(`Index ${i}: ${csvLines[i].slice(0, 40)} -> GroupHeader? ${isHeader} -> Active: ${activeGroupHeaders[i]}`);
}

const XLSX = require("xlsx");
const path = require("path");

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

function inspectFile(filename) {
  const filePath = path.join(__dirname, filename);
  console.log(`\n================ INSPECTING ${filename} ================`);
  try {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    const allLines = csv.split("\n");
    const csvLines = allLines.filter(line => line.replace(/,/g, "").trim().length > 0);
    
    let headerRowIndex = -1;
    for (let idx = 0; idx < Math.min(csvLines.length, 15); idx++) {
      if (isLineHeaderOrSubHeader(csvLines[idx]) && !isLineGroupHeader(csvLines[idx])) {
        headerRowIndex = idx;
        break;
      }
    }
    
    if (headerRowIndex !== -1) {
      const headerLine = csvLines[headerRowIndex];
      const headerCells = headerLine.split(",").map(c => c.trim().toLowerCase());
      const codeColIdx = headerCells.findIndex(c => c.includes("mã") || c.includes("ma nv") || c.includes("code"));
      const nameColIdx = headerCells.findIndex(c => c.includes("họ") || c.includes("tên") || c.includes("name"));
      console.log(`codeColIdx: ${codeColIdx}, nameColIdx: ${nameColIdx}`);

      const isLineDataRow = (line) => {
        const stripped = line.replace(/,/g, "").trim();
        if (stripped.length === 0) return false;
        
        if (isLineGroupHeader(line)) return false;
        if (isLineHeaderOrSubHeader(line)) return false;
        
        const cells = line.split(",").map(c => c.trim());
        const hasCode = codeColIdx !== -1 && cells[codeColIdx] && cells[codeColIdx].length > 0;
        const hasName = nameColIdx !== -1 && cells[nameColIdx] && cells[nameColIdx].length > 0;
        if (!hasCode && !hasName) return false;
        
        return true;
      };

      const dataLines = csvLines.slice(headerRowIndex + 1);
      let dataCount = 0;
      for (let idx = 0; idx < dataLines.length; idx++) {
        const line = dataLines[idx];
        const lineNum = idx + headerRowIndex + 1;
        if (isLineDataRow(line)) {
          dataCount++;
          console.log(`[DATA ${dataCount}] Line ${lineNum}: ${line.substring(0, 100)}`);
        }
      }
      console.log(`Total counted data rows: ${dataCount}`);
    }
  } catch (err) {
    console.error(err);
  }
}

inspectFile("DANH_SACH_01.xlsx");
inspectFile("DANH_SACH_02.xlsx");

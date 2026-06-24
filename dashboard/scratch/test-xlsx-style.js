const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const templatePath = path.join(__dirname, "..", "public", "templates", "phieu_cap_phat_vpp.xlsx");
const outputPath = path.join(__dirname, "..", "scratch", "test_out.xlsx");

try {
  const workbook = XLSX.readFile(templatePath);
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Modify cell C9
  worksheet['C9'] = { t: 's', v: "Tháng 6 thử nghiệm" };
  
  XLSX.writeFile(workbook, outputPath);
  console.log("Success! Output written to scratch/test_out.xlsx");
} catch (err) {
  console.error("Error:", err);
}

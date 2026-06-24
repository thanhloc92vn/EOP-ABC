const fs = require('fs');
const path = require('path');
const { fillWeeklyReport } = require('./fill_weekly_report');

try {
  // Let's build a mock payload
  const mockData = {
    startDate: "2026-06-01",
    endDate: "2026-06-11",
    officeManualNeeds: {
      "HCNS": 1
    },
    projectManualNeeds: {
      "Vàm Lẽo": 3,
      "Rạch Xuyên Tâm": 1
    },
    candidates: [
      {
        name: "Lê Tấn Phúc",
        department: "Vàm Lẽo",
        role: "Kỹ sư hiện trường thi công",
        status: "hired",
        onboard_date: "2026-06-22"
      },
      {
        name: "Phạm Huy Phúc",
        department: "Rạch Xuyên Tâm",
        role: "CHP/ PGD DA RXT",
        status: "hired",
        onboard_date: "2026-06-16"
      },
      {
        name: "Nguyễn Khánh Linh",
        department: "HCNS",
        role: "Chuyên viên tuyển dụng",
        status: "hired",
        onboard_date: "2026-06-15"
      }
    ]
  };

  const templatePath = path.join(__dirname, '..', 'public', 'templates', 'bao_cao_tuyen_dung_tuan.docx');
  const templateBuffer = fs.readFileSync(templatePath);
  
  const outputBuffer = fillWeeklyReport(mockData, templateBuffer);
  
  const outputPath = path.join(__dirname, 'test_out_js.docx');
  fs.writeFileSync(outputPath, outputBuffer);
  console.log("Successfully generated test_out_js.docx!");
} catch (e) {
  console.error("Error during test runner:", e);
}

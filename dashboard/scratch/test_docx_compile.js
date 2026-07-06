const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

function main() {
  const templatePath = path.join(__dirname, "..", "public", "templates", "bien_ban_hop_template.docx");
  const outputPath = path.join(__dirname, "test_output.docx");
  
  console.log("Reading template from:", templatePath);
  if (!fs.existsSync(templatePath)) {
    console.error("Template does not exist!");
    return;
  }
  
  try {
    const content = fs.readFileSync(templatePath, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    doc.setData({
      doc_number: "Số: 123/2026/BBH/TNE&C",
      location_date: "TP.HCM, ngày 03 tháng 07 năm 2026",
      start_time: "09:00",
      meeting_date_text: "03 tháng 07 năm 2026",
      meeting_location: "Phòng họp A",
      meeting_title: "Họp Giao Ban",
      chair_name: "Huỳnh Giáp Nhân",
      chair_role: "Chủ trì",
      sec_name: "Đoàn Thị Minh Thương",
      sec_role: "Thư ký",
      attendees_text: "Nguyễn Duy Hưng, Phùng Nguyên Khôi",
      end_time: "10:30",
      distribution: "P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS.",
      tasks: [
        { stt: 1, content: "Rà soát Tây Ninh", assignee: "BĐH", coop: "P. QLDA", deadline: "25/05/2026" },
        { stt: 2, content: "Thanh toán Rạch Xuyên Tâm", assignee: "P. KHĐT", coop: "BĐH", deadline: "30/05/2026" }
      ]
    });
    
    console.log("Rendering...");
    doc.render();
    
    const buffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });
    
    fs.writeFileSync(outputPath, buffer);
    console.log("Docx generated successfully at:", outputPath);
  } catch (err) {
    console.error("Error during compilation:", err);
  }
}

main();

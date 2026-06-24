const mammoth = require("mammoth");
const path = require("path");

const docxPath = path.join(__dirname, "..", "public", "templates", "phieu_cap_phat_vpp.docx");

mammoth.extractRawText({ path: docxPath })
  .then(result => {
    console.log("Extracted Text:\n", result.value);
  })
  .catch(err => {
    console.error("Error extracting text:", err);
  });

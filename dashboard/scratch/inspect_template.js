const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

async function main() {
  const docPath = path.join(__dirname, "..", "public", "templates", "bien_ban_hop.docx");
  console.log("Reading template from:", docPath);
  
  if (!fs.existsSync(docPath)) {
    console.error("Template file does not exist!");
    return;
  }
  
  try {
    const result = await mammoth.extractRawText({ path: docPath });
    const text = result.value;
    console.log("--- START TEMPLATE TEXT ---");
    console.log(text.substring(0, 5000)); // Print first 5000 chars
    console.log("--- END TEMPLATE TEXT ---");
    
    // Search for potential placeholders (e.g., matching {placeholder} or {{placeholder}})
    const placeholders = text.match(/\{[^}]+\}/g);
    console.log("Detected placeholder-like patterns:", placeholders ? [...new Set(placeholders)] : "None");
  } catch (err) {
    console.error("Error reading docx:", err);
  }
}

main();

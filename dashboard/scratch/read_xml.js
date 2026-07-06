const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");

function main() {
  const templatePath = path.join(__dirname, "..", "public", "templates", "bien_ban_hop_template.docx");
  
  if (!fs.existsSync(templatePath)) {
    console.error("Template does not exist!");
    return;
  }
  
  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);
  const docXml = zip.file("word/document.xml").asText();
  
  console.log("XML content around tags:");
  // Let's find tags like {#tasks} or {/tasks}
  const idx = docXml.indexOf("tasks");
  if (idx !== -1) {
    console.log(docXml.substring(Math.max(0, idx - 500), Math.min(docXml.length, idx + 1000)));
  } else {
    console.log("No 'tasks' found in XML!");
  }
}

main();

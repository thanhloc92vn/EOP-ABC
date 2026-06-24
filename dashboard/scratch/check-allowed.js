const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');

try {
  const filePath = path.join(__dirname, 'test_out_js.docx');
  const content = fs.readFileSync(filePath);
  const zip = new PizZip(content);
  const docXml = zip.file("word/document.xml").asText();
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(docXml, "application/xml");
  
  console.log("=== PARAGRAPH 0 RUNS ===");
  const p0 = doc.getElementsByTagName('w:p')[0];
  const runs = p0.getElementsByTagName('w:r');
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    console.log(`Run ${i} text: "${run.textContent || ''}"`);
    console.log(`  has drawing: ${run.getElementsByTagName('w:drawing').length > 0}`);
  }
  
  console.log("\n=== ALL PARAGRAPHS ===");
  const ps = doc.getElementsByTagName('w:p');
  for (let i = 0; i < Math.min(5, ps.length); i++) {
    console.log(`Paragraph ${i}: "${ps[i].textContent || ''}"`);
  }
  
  console.log("\n=== TABLE 0 ROWS ===");
  const table = doc.getElementsByTagName('w:tbl')[0];
  const rows = [];
  for (let i = 0; i < table.childNodes.length; i++) {
    const node = table.childNodes[i];
    if (node.nodeName === 'w:tr') {
      rows.push(node);
    }
  }
  console.log("Number of rows in table 0:", rows.length);
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const cells = rows[i].getElementsByTagName('w:tc');
    const cellTexts = [];
    for (let j = 0; j < cells.length; j++) {
      cellTexts.push(cells[j].textContent.trim());
    }
    console.log(`Row ${i}:`, cellTexts);
  }
} catch (e) {
  console.error(e);
}

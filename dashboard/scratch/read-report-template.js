const fs = require('fs');
const PizZip = require('pizzip');

const file = 'public/templates/bang_tinh_chi_phi_hanh_chinh_nam.docx';

function readDocx() {
  const content = fs.readFileSync(file);
  const zip = new PizZip(content);
  const docXml = zip.file('word/document.xml').asText();
  // strip tags
  const text = docXml.replace(/<[^>]+>/g, ' ');
  fs.writeFileSync('scratch/document_text.txt', text);
  console.log("Document text written to scratch/document_text.txt. Length:", text.length);
  
  // Find placeholders of format {placeholder} or similar
  const matches = text.match(/\{[^}]+\}/g) || [];
  console.log("Found curly brackets placeholders:", [...new Set(matches)]);
}

readDocx();

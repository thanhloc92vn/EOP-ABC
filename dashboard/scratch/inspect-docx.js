const fs = require('fs');
const mammoth = require('mammoth');

const file = 'public/templates/bang_tinh_chi_phi_hanh_chinh_nam.docx';

async function main() {
  const result = await mammoth.convertToHtml({ path: file });
  const html = result.value;
  fs.writeFileSync('scratch/document_html.html', html);
  console.log("Converted docx to HTML in scratch/document_html.html. Length:", html.length);
}

main().catch(console.error);

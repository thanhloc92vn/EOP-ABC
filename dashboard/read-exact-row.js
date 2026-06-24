const fs = require('fs');
const fileContent = fs.readFileSync('d:\\Antigravity\\PM - HCNS - TNEC\\dashboard\\app\\administration\\page.tsx', 'utf8');

const marker = 'VPP cấp phát cho từng Phòng Ban khối Văn Phòng';
const startIndex = fileContent.indexOf(marker);
const block = fileContent.substring(startIndex, startIndex + 35000);

const trStart = block.indexOf('.map((req) => (');
const trEnd = block.indexOf('))', trStart);
const rowContent = block.substring(trStart, trEnd + 2);

console.log("EXACT ROW CODE:");
console.log(rowContent);

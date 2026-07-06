const XLSX = require("xlsx");
const path = require("path");
const OpenAI = require("openai");
const fs = require("fs");

const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "config.json"), "utf8"));
const apiKey = config.openai_api_key;
const openai = new OpenAI({ apiKey });

const SYSTEM_PROMPT = `
Bạn là một AI phân tích dữ liệu hợp đồng lao động chuyên nghiệp cho phòng Hành chính Nhân sự của công ty Trung Nam E&C.
Nhiệm vụ của bạn là đọc và trích xuất bảng theo dõi ký HĐTV, HĐLĐ từ tệp tài liệu (Excel, Word, PDF hoặc hình ảnh) được cung cấp.

Hãy trích xuất và chuyển đổi các thông tin thành định dạng JSON chứa một danh sách các hợp đồng.

Mỗi hợp đồng trong danh sách cần có các trường dữ liệu sau:
1. "stt_ton": Số thứ tự tồn (ví dụ: "1", "2"). Nếu không có, để trống "".
2. "stt": Số thứ tự (ví dụ: 1, 2). Phải là kiểu số hoặc null nếu không có.
3. "employee_code": Mã nhân viên (ví dụ: "3335", "5497", "139").
4. "employee_name": Họ và tên nhân viên (ví dụ: "Huỳnh Giáp Nhân").
5. "onboard_date": Ngày nhận việc (định dạng YYYY-MM-DD, ví dụ: "2025-02-01").
6. "probation_contract_number": Số hợp đồng thử việc / Số HĐTV (ví dụ: "006409/2026/HĐTV/TNE&C").
7. "probation_start_date": Ngày bắt đầu thử việc / Từ ngày (định dạng YYYY-MM-DD, ví dụ: "2026-11-05").
8. "probation_end_date": Ngày kết thúc thử việc / Đến ngày (định dạng YYYY-MM-DD, ví dụ: "2026-10-07").
9. "contract_number": Số hợp đồng lao động / Số HĐLĐ (ví dụ: "003335/2025/HĐLĐ/TNE&C").
10. "type": Loại hợp đồng lao động (ví dụ: "Không xác định thời hạn", "Xác định thời hạn").
11. "sign_date": Ngày hiệu lực HĐLĐ / Ngày ký HĐLĐ (định dạng YYYY-MM-DD, ví dụ: "2026-04-01").
12. "expiration_date": Ngày hết hạn HĐLĐ (định dạng YYYY-MM-DD, ví dụ: "2026-07-13").
13. "base_salary_insurance": Mức lương BHXH (kiểu số nguyên, ví dụ: 5000000. Nếu trống điền null).
14. "performance_bonus": Thưởng hiệu quả công việc (kiểu số nguyên, ví dụ: 1000000. Nếu trống điền null).
15. "allowances": Phụ cấp (kiểu số nguyên, ví dụ: 500000. Nếu trống điền null).
16. "total_income": Tổng thu nhập (kiểu số nguyên, ví dụ: 6500000. Nếu trống điền null).
17. "last_salary_adj_date": Ngày điều chỉnh lương gần nhất (định dạng YYYY-MM-DD, ví dụ: "2026-05-01").
18. "department": Tên phòng ban tương ứng (nếu có tiêu đề nhóm như "BAN GIÁM ĐỐC", "P. HÀNH CHÍNH NHÂN SỰ", "P. VẬT TƯ THIẾT BỊ"... hãy điền tên phòng ban này cho tất cả nhân viên thuộc nhóm đó).

━━━ QUY TẮC PHÂN TÍCH & CHUẨN HOÁ ━━━
- Hãy cố gắng đọc và phân tích kỹ cấu trúc tiêu đề cột và các nhóm phòng ban để gán đúng giá trị.
- Đối với tất cả các ngày (ngày nhận việc, ngày hiệu lực, ngày hết hạn, ngày thử việc, ngày điều chỉnh lương), hãy chuyển sang định dạng YYYY-MM-DD. Ví dụ "1/2/2025" -> "2025-02-01", "06/01/2025" -> "2025-01-06".
- Đối với các số tiền (lương, thưởng, phụ cấp, tổng thu nhập), hãy loại bỏ các ký tự dấu phân cách nghìn (dấu chấm hoặc dấu phẩy) và chuyển sang dạng số nguyên.
- Trả về kết quả CHỈ dạng JSON chứa mảng "contracts" và trường "_data_row_count", không kèm bất kỳ giải thích nào khác.

━━━ QUY TẮC BẮT BUỘC ĐỂ KHÔNG BỎ SÓT NHÂN VIÊN (TUYỆT ĐỐI PHẢI TUÂN THỦ) ━━━
1. ĐẾM CHÍNH XÁC SỐ DÒNG DỮ LIỆU: Trước khi bắt đầu trích xuất, hãy đếm tổng số dòng CSV có chứa dữ liệu nhân viên (bất kỳ dòng nào có ít nhất 1 ô không trống và không phải dòng tiêu đề cột / tiêu đề phòng ban). Ghi nhớ con số này.
2. BẮT BUỘC TRÍCH XUẤT ĐỦ 100% CÁC DÒNG: Mỗi dòng CSV có chứa bất kỳ thông tin nhân viên nào (tên, mã NV, ngày, số hợp đồng, lương...) đều PHẢI được chuyển thành 1 object trong mảng contracts. Số lượng object trong mảng contracts PHẢI BẰNG ĐÚNG số dòng dữ liệu bạn đã đếm ở bước 1.
3. XỬ LÝ CỘT TRỐNG / DÒNG THIẾU THÔNG TIN:
   - Nếu một dòng chỉ có Họ tên hoặc chỉ có Mã nhân viên mà TẤT CẢ các cột khác đều trống → bạn VẪN PHẢI tạo 1 object cho dòng đó.
   - Với mỗi trường dữ liệu trống: điền "" (chuỗi/ngày) hoặc null (số). TUYỆT ĐỐI KHÔNG BỎ QUA dòng đó.
   - Người dùng sẽ tự điền tay các ô trống sau. Việc của bạn là ĐỌC HẾT, không được tự ý lọc bỏ.
4. KHÔNG ĐƯỢC dừng giữa chừng, bỏ phần cuối, hoặc gom nhóm nhiều người thành 1 dòng. Mỗi dòng CSV = 1 object JSON riêng biệt.
5. SAU KHI HOÀN THÀNH: Kiểm tra lại số lượng object trong mảng contracts. Nếu ít hơn số dòng dữ liệu đã đếm ở bước 1, hãy bổ sung cho đến khi đủ.
6. TRƯỜNG "_data_row_count": Luôn trả về trường này ở cấp cao nhất của JSON, ghi nhận số dòng dữ liệu nhân viên bạn đã đếm được. Ví dụ: "_data_row_count": 25.
`.trim();

const countDataRows = (lines, headerLine) => {
  let count = 0;
  for (const line of lines) {
    const stripped = line.replace(/,/g, "").trim();
    if (stripped.length === 0) continue;
    const cells = line.split(",").map(c => c.trim());
    const nonEmpty = cells.filter(c => c.length > 0);
    if (nonEmpty.length <= 2) {
      const first = nonEmpty[0] || "";
      const isNumber = /^\d+$/.test(first);
      const lower = first.toLowerCase();
      const isGroupHeader =
        lower.includes("bch") || lower.includes("đội") || lower.includes("ban") ||
        lower.includes("phòng") || lower.includes("da ") || lower.includes("dự án") ||
        lower.includes("công trình") ||
        (first === first.toUpperCase() && !isNumber && first.length > 3);
      if (isGroupHeader) continue;
    }
    if (line === headerLine) continue;
    count++;
  }
  return count;
};

async function simulateUpload(filename) {
  const filePath = path.join(__dirname, filename);
  console.log(`\n================ SIMULATING ${filename} ================`);
  
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const allLines = csv.split("\n");
  const csvLines = allLines.filter(line => line.replace(/,/g, "").trim().length > 0);
  
  // Find header row
  let headerRowIndex = 0;
  for (let idx = 0; idx < Math.min(csvLines.length, 15); idx++) {
    const line = csvLines[idx].toLowerCase();
    if (
      line.includes("họ và tên") ||
      line.includes("họ tên") ||
      line.includes("nhân viên") ||
      line.includes("ngày nhận việc") ||
      line.includes("ngày vào")
    ) {
      headerRowIndex = idx;
      break;
    }
  }
  
  const headerRows = csvLines.slice(0, headerRowIndex + 1);
  const headerCsv = headerRows.join("\n");
  const dataLines = csvLines.slice(headerRowIndex + 1);
  
  const activeGroupHeaders = [];
  let currentGroupHeader = "";
  for (let idx = 0; idx < csvLines.length; idx++) {
    const line = csvLines[idx];
    const cells = line.split(",").map(c => c.trim());
    const nonEmptyCells = cells.filter(c => c.length > 0);
    if (nonEmptyCells.length >= 1 && nonEmptyCells.length <= 2) {
      const firstCell = nonEmptyCells[0];
      const isNumber = /^\d+$/.test(firstCell);
      const lowerCell = firstCell.toLowerCase();
      const isHeader =
        lowerCell.includes("bch") ||
        lowerCell.includes("đội") ||
        lowerCell.includes("ban") ||
        lowerCell.includes("phòng") ||
        lowerCell.includes("da ") ||
        lowerCell.includes("dự án") ||
        lowerCell.includes("công trình") ||
        (firstCell === firstCell.toUpperCase() && !isNumber && firstCell.length > 3);
      if (isHeader) {
        currentGroupHeader = line;
      }
    }
    activeGroupHeaders.push(currentGroupHeader);
  }
  
  const MAX_ROWS_PER_BATCH = 20;
  let allContracts = [];
  
  for (let i = 0; i < dataLines.length; i += MAX_ROWS_PER_BATCH) {
    const batchLines = dataLines.slice(i, i + MAX_ROWS_PER_BATCH);
    const firstLineIndexInCsv = headerRowIndex + 1 + i;
    const activeHeader = activeGroupHeaders[firstLineIndexInCsv] || "";
    
    let prependedLines = [...batchLines];
    if (activeHeader && !batchLines.includes(activeHeader)) {
      prependedLines = [activeHeader, ...batchLines];
    }
    
    const batchCsv = [headerCsv, ...prependedLines].join("\n");
    const expectedRows = countDataRows(batchLines, headerCsv.split("\n").pop() || "");
    
    console.log(`\nBatch ${Math.floor(i / MAX_ROWS_PER_BATCH) + 1}: expected ~${expectedRows} data rows`);
    console.log("--- BATCH CSV SENT ---");
    console.log(batchCsv);
    console.log("----------------------");
    
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Hãy phân tích tài liệu chứa thông tin theo dõi hợp đồng nhân sự này. Tên file: ${filename}\n\n--- NỘI DUNG SHEET EXCEL ---\n${batchCsv}` }
    ];
    
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        temperature: 0,
        response_format: { type: "json_object" }
      });
      
      const reply = completion.choices[0].message.content;
      console.log("--- AI REPLY ---");
      console.log(reply);
      
      const parsed = JSON.parse(reply);
      const batchContracts = parsed.contracts || [];
      console.log(`AI returned ${batchContracts.length} objects.`);
      allContracts = allContracts.concat(batchContracts);
    } catch (err) {
      console.error("OpenAI error:", err);
    }
  }
  
  console.log(`\nTotal contracts parsed from ${filename}: ${allContracts.length}`);
}

async function run() {
  await simulateUpload("DANH_SACH_01.xlsx");
}

run();

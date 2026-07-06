const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const path = require('path');

let supabaseUrl = "";
let supabaseAnonKey = "";
const envPath = "d:/Antigravity/PM - HCNS - TNEC/dashboard/.env.local";
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
  const matchUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]*)/);
  if (matchUrl) supabaseUrl = matchUrl[1].trim().replace(/['"]/g, '');
  const matchKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]*)/);
  if (matchKey) supabaseAnonKey = matchKey[1].trim().replace(/['"]/g, '');
}

const key = fs.readFileSync(envPath, 'utf8').match(/OPENAI_API_KEY=([^\r\n]*)/)?.[1]?.trim() || process.env.OPENAI_API_KEY;
if (!key) {
  console.error("No OpenAI API key found");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: key });

const SYSTEM_PROMPT = `
Bạn là một AI phân tích dữ liệu hợp đồng lao động chuyên nghiệp cho phòng Hành chính Nhân sự của công ty Trung Nam E&C.
Nhiệm vụ của bạn là đọc và trích xuất bảng theo dõi ký HĐTV, HĐLĐ từ tệp CSV/Excel được cung cấp.

Hãy trích xuất và chuyển đổi các thông tin thành định dạng JSON chứa danh sách các hợp đồng.

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
- Hãy phân tích kỹ cấu trúc tiêu đề cột và các nhóm phòng ban để gán đúng phòng ban cho nhân viên.
- Đối với tất cả các ngày, chuyển sang định dạng YYYY-MM-DD. Ví dụ: "1/2/2025" -> "2025-02-01".
- Đối với các số tiền, loại bỏ dấu phân cách nghìn và chuyển thành số nguyên. Nếu trống điền null.
- Trích xuất ĐẦY ĐỦ từng dòng dữ liệu nhân viên xuất hiện trong bảng CSV. Mỗi dòng tương ứng với một object trong mảng "contracts". Dòng nào thiếu thông tin ở cột nào thì điền "" hoặc null cho cột đó, TUYỆT ĐỐI KHÔNG tự ý lọc bỏ dòng.
- TUYỆT ĐỐI KHÔNG tự bịa ra hoặc phỏng đoán dữ liệu nếu thông tin đó không xuất hiện trong tài liệu. Các trường dữ liệu nào trống hãy điền "" hoặc null để bỏ qua cho người dùng tự điền tay.
- Trả về kết quả CHỈ dạng JSON chứa mảng "contracts", không kèm bất kỳ giải thích nào khác.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "contracts": [
    {
      "stt_ton": "...",
      "stt": 1,
      "employee_code": "...",
      "employee_name": "...",
      "onboard_date": "YYYY-MM-DD",
      "probation_contract_number": "...",
      "probation_start_date": "YYYY-MM-DD",
      "probation_end_date": "YYYY-MM-DD",
      "contract_number": "...",
      "type": "...",
      "sign_date": "YYYY-MM-DD",
      "expiration_date": "YYYY-MM-DD",
      "base_salary_insurance": 5000000,
      "performance_bonus": 1000000,
      "allowances": 500000,
      "total_income": 6500000,
      "last_salary_adj_date": "YYYY-MM-DD",
      "department": "..."
    }
  ]
}
`.trim();

const csvText = `
STT TỔNG,STT,MÃ NHÂN VIÊN,HỌ TÊN,NGÀY NHẬN VIỆC,SỐ HĐTV,NGÀY KÝ HĐ THỬ VIỆC,,SỐ HĐLĐ,LOẠI HĐLĐ,NGÀY KÝ HĐLĐ,,MỨC LƯƠNG BHXH,THƯỞNG HIỆU QUẢ CÔNG VIỆC,PHỤ CẤP,TỔNG THU NHẬP,NGÀY ĐIỀU CHỈNH LƯƠNG GẦN NHẤT
,,,,,,TỪ NGÀY,ĐẾN NGÀY,,,NGÀY HIỆU LỰC,NGÀY HẾT HẠN,,,,,
,,P. TÀI CHÍNH KẾ TOÁN,,,,,,,,,,,,,,
18,7,5595,Nguyễn Thị Hương,11/3/25,005595/2025/HĐTV/TNE&C,11/3/25,1/2/26,005595/2026/HĐLĐ/TNE&C,Xác định thời hạn,03/01/2026,02/01/2027,,,,,
`;

async function main() {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Hãy phân tích tài liệu chứa thông tin theo dõi hợp đồng nhân sự này. Trích xuất danh sách hợp đồng dạng JSON chứa mảng 'contracts':\n${csvText}` }
    ],
    response_format: { type: "json_object" }
  });
  console.log(completion.choices[0].message.content);
}

main().catch(console.error);

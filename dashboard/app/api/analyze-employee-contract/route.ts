/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const SYSTEM_PROMPT = `
Bạn là một AI phân tích hợp đồng lao động chuyên nghiệp cho phòng Hành chính Nhân sự của công ty Trung Nam E&C.
Nhiệm vụ của bạn là đọc nội dung hợp đồng lao động cá nhân (tệp PDF, Word hoặc hình ảnh quét) và trích xuất chính xác các thông tin cần thiết dưới định dạng JSON.

━━━ CÁC TRƯỜNG THÔNG TIN CẦN TRÍCH XUẤT ━━━
1. "employee_name": Họ và tên nhân viên (ví dụ: "Huỳnh Giáp Nhân").
2. "employee_code": Mã nhân viên (nếu có ghi trong hợp đồng, ví dụ: "3335"). Nếu không có, điền rỗng "".
3. "contract_number": Số hợp đồng lao động / Số HĐLĐ (ví dụ: "003335/2025/HĐLĐ/TNE&C").
4. "type": Loại hợp đồng lao động. Phải là một trong các giá trị sau:
   - "Thử việc"
   - "Không xác định thời hạn"
   - "Xác định thời hạn 1 năm"
   - "Xác định thời hạn 2 năm"
   - "Xác định thời hạn 3 năm"
   - "Xác định thời hạn khác"
5. "sign_date": Ngày ký hợp đồng lao động (định dạng YYYY-MM-DD, ví dụ: "2026-04-01").
6. "onboard_date": Ngày nhận việc / Ngày bắt đầu làm việc (định dạng YYYY-MM-DD, ví dụ: "2025-02-01").
7. "probation_contract_number": Số hợp đồng thử việc (nếu có, ví dụ: "006409/2026/HĐTV/TNE&C"). Nếu không có, điền rỗng "".
8. "probation_start_date": Ngày bắt đầu thử việc (định dạng YYYY-MM-DD, ví dụ: "2025-02-01"). Nếu không có, điền rỗng "".
9. "probation_end_date": Ngày kết thúc thử việc (định dạng YYYY-MM-DD, ví dụ: "2025-04-01"). Nếu không có, điền rỗng "".
10. "base_salary_insurance": Mức lương BHXH / Lương cơ bản đóng bảo hiểm (kiểu số nguyên, ví dụ: 5000000. Nếu trống hoặc không nêu rõ, điền null).
11. "performance_bonus": Thưởng hiệu quả công việc / lương hiệu quả (kiểu số nguyên, ví dụ: 1000000. Nếu trống điền null).
12. "allowances": Tổng phụ cấp (ví dụ: phụ cấp cơm, xăng, điện thoại... cộng lại thành một số nguyên. Nếu trống điền null).
13. "total_income": Tổng thu nhập thực tế / Tổng tiền lương ghi trong hợp đồng (gồm lương cơ bản + phụ cấp + thưởng cố định... kiểu số nguyên, ví dụ: 19530000. Nếu trống điền null).
14. "expiration_date": Ngày hết hạn hợp đồng (định dạng YYYY-MM-DD, ví dụ: "2027-04-01"). Nếu là hợp đồng không xác định thời hạn, điền rỗng "".
15. "last_salary_adj_date": Ngày điều chỉnh lương gần nhất (nếu có ghi trong hợp đồng hoặc phụ lục, định dạng YYYY-MM-DD). Nếu không có, điền rỗng "".
16. "department": Phòng ban công tác (ví dụ: "Phòng Hành Chính Nhân Sự"). Nếu không có, điền rỗng "".

━━━ QUY TẮC PHÂN TÍCH & CHUẨN HOÁ ━━━
- Hãy chuẩn hoá tất cả định dạng ngày về YYYY-MM-DD (ví dụ: "ngày 10 tháng 03 năm 2026" hoặc "10/03/2026" đều chuyển thành "2026-03-10").
- Chuẩn hoá các trường tiền tệ về kiểu số nguyên nguyên bản (ví dụ: "18.000.000 VNĐ" hoặc "18,000,000" -> 18000000).
- TUYỆT ĐỐI KHÔNG tự bịa ra hoặc phỏng đoán dữ liệu nếu thông tin đó không xuất hiện trong tài liệu. Các trường dữ liệu nào trống hãy điền "" hoặc null để bỏ qua cho người dùng tự điền tay.
- Trả về kết quả CHỈ dạng JSON, không kèm bất kỳ giải thích nào khác.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "employee_name": "...",
  "employee_code": "...",
  "contract_number": "...",
  "type": "...",
  "sign_date": "YYYY-MM-DD",
  "onboard_date": "YYYY-MM-DD",
  "probation_contract_number": "...",
  "probation_start_date": "YYYY-MM-DD",
  "probation_end_date": "YYYY-MM-DD",
  "base_salary_insurance": 5000000,
  "performance_bonus": 1000000,
  "allowances": 500000,
  "total_income": 6500000,
  "expiration_date": "YYYY-MM-DD",
  "last_salary_adj_date": "YYYY-MM-DD",
  "department": "..."
}
`.trim();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong phần Cài đặt AI." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("contract_file") as File | null;
    const originalFilename = form.get("original_filename") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Thiếu file hợp đồng lao động cần phân tích." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const filenameInfo = originalFilename ? `Tên file tài liệu gốc: "${originalFilename}"` : `Tên file tài liệu: "${file.name}"`;
    const promptText = `Hãy đọc kỹ hợp đồng lao động này, phân tích các điều khoản lương, phụ cấp, chức vụ và thời hạn, sau đó trích xuất thông tin dạng JSON theo đúng cấu trúc yêu cầu.
${filenameInfo}`;

    if (fileType.endsWith(".docx") || fileType.endsWith(".doc")) {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = result.value || "";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN WORD ---\n${text}` },
      ];
    } else if (fileType.endsWith(".png") || fileType.endsWith(".jpg") || fileType.endsWith(".jpeg")) {
      const base64 = fileBuffer.toString("base64");
      const mimeType = fileType.endsWith(".png") ? "image/png" : "image/jpeg";
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: promptText },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
          ],
        },
      ];
    } else if (fileType.endsWith(".pdf")) {
      const base64Pdf = fileBuffer.toString("base64");
      const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o";
      try {
        if (typeof (openai as any).responses?.create === "function") {
          const response = await (openai as any).responses.create({
            model: model === "gpt-4o-mini" ? "gpt-4o-mini" : model,
            input: [{
              role: "user",
              content: [
                { type: "input_text", text: `${SYSTEM_PROMPT}\n\n${promptText}` },
                { type: "input_file", filename: originalFilename || file.name, file_data: `data:application/pdf;base64,${base64Pdf}` },
              ],
            }],
            text: { format: { type: "json_object" } },
          });
          const rawOutput = response.output_text || "{}";
          return NextResponse.json(JSON.parse(rawOutput));
        } else {
          throw new Error("openai.responses.create is not available, falling back to pdf-parse");
        }
      } catch (pdfErr: any) {
        console.warn("openai.responses.create failed, falling back to pdf-parse:", pdfErr);
        try {
          const pdfParse = require("pdf-parse");
          const parsed = await pdfParse(fileBuffer);
          const text = parsed.text || "";
          messages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN PDF ---\n${text}` },
          ];
        } catch (fallbackErr: any) {
          console.error("PDF parse failed:", fallbackErr);
          return NextResponse.json({ error: "Không thể phân tách nội dung file PDF" }, { status: 500 });
        }
      }
    } else if (fileType.endsWith(".txt")) {
      const text = fileBuffer.toString("utf-8");
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG VĂN BẢN TXT ---\n${text}` },
      ];
    } else {
      return NextResponse.json({ error: "Định dạng file không hỗ trợ. Sử dụng PDF, DOCX, PNG, JPG hoặc TXT." }, { status: 400 });
    }

    const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const reply = completion.choices[0]?.message?.content || "{}";
    const extractedData = JSON.parse(reply);

    return NextResponse.json(extractedData);
  } catch (err: any) {
    console.error("Analyze employee contract error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}

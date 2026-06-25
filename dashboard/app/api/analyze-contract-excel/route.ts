/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import * as XLSX from "xlsx";

export const maxDuration = 300;

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

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "_data_row_count": 25,
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

const isLineGroupHeader = (line: string): boolean => {
  const cells = line.split(",").map(c => c.trim().replace(/^["']|["']$/g, ""));
  const nonEmpty = cells.filter(c => c.length > 0);
  if (nonEmpty.length === 0) return false;
  if (nonEmpty.length > 3) return false;

  for (const cell of nonEmpty) {
    const lower = cell.toLowerCase();
    if (
      lower.startsWith("p. ") ||
      lower.startsWith("p.") ||
      lower.startsWith("phòng ") ||
      lower.startsWith("ban ") ||
      lower.startsWith("tổ ") ||
      lower.startsWith("đội ") ||
      lower.startsWith("bch ") ||
      lower.startsWith("bđh ") ||
      lower.startsWith("da ") ||
      lower.startsWith("dự án ") ||
      lower.includes("giám đốc") ||
      lower.includes("chỉ huy") ||
      lower.includes("điều hành") ||
      lower.includes("công trình")
    ) {
      return true;
    }
  }
  return false;
};

const isLineHeaderOrSubHeader = (line: string): boolean => {
  const lower = line.toLowerCase();
  if (
    lower.includes("họ tên") ||
    lower.includes("họ và tên") ||
    lower.includes("mã nhân viên") ||
    lower.includes("từ ngày") ||
    lower.includes("đến ngày") ||
    lower.includes("ngày hiệu lực") ||
    lower.includes("ngày hết hạn") ||
    lower.includes("ngày ký") ||
    lower.includes("ngày nhận việc") ||
    lower.includes("mức lương") ||
    lower.includes("phụ cấp") ||
    lower.includes("thu nhập")
  ) {
    return true;
  }
  return false;
};

const isLineDataRow = (line: string, codeColIdx: number, nameColIdx: number): boolean => {
  const stripped = line.replace(/,/g, "").trim();
  if (stripped.length === 0) return false;

  if (isLineGroupHeader(line)) return false;
  if (isLineHeaderOrSubHeader(line)) return false;

  const cells = line.split(",").map(c => c.trim());
  const hasCode = codeColIdx !== -1 && cells[codeColIdx] && cells[codeColIdx].length > 0;
  const hasName = nameColIdx !== -1 && cells[nameColIdx] && cells[nameColIdx].length > 0;

  if (!hasCode && !hasName) return false;
  return true;
};

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
    const file = form.get("excel_file") as File | null;
    const originalFilename = form.get("original_filename") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Thiếu file danh sách hợp đồng cần phân tích." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const filenameInfo = originalFilename ? `Tên file tài liệu gốc: "${originalFilename}"` : `Tên file tài liệu: "${file.name}"`;
    const promptText = `Hãy phân tích tài liệu chứa thông tin theo dõi hợp đồng nhân sự này. 
${filenameInfo}
Hãy trích xuất danh sách hợp đồng dạng JSON chứa mảng 'contracts' theo đúng các trường được mô tả trong System Prompt.`;

    if (fileType.endsWith(".xlsx") || fileType.endsWith(".xls")) {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      const allLines = csv.split("\n");
      // Only strip lines that are 100% empty (no characters at all after removing commas)
      // Keep lines with any data — even just a name or code — to preserve all employees
      const csvLines = allLines.filter(line => line.replace(/,/g, "").trim().length > 0);
      console.log(`[analyze-contract-excel] Sheet "${sheetName}": ${allLines.length} total CSV lines, ${csvLines.length} non-empty lines after filtering.`);
      const cappedCsv = csvLines.slice(0, 800).join("\n");
      if (csvLines.length > 800) {
        console.warn(`[analyze-contract-excel] Sheet "${sheetName}" has ${csvLines.length} non-empty rows, truncated to 800.`);
      }
      const excelText = `--- SHEET: ${sheetName} ---\n${cappedCsv}\n\n`;
      messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `${promptText}\n\n--- NỘI DUNG SHEET EXCEL ---\n${excelText}` },
      ];
    } else if (fileType.endsWith(".docx") || fileType.endsWith(".doc")) {
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
    } else {
      return NextResponse.json({ error: "Định dạng file không hỗ trợ. Sử dụng XLSX, XLS, PDF, DOCX hoặc ảnh." }, { status: 400 });
    }

    // Use gpt-4o by default for better accuracy when analyzing contract tables.
    const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o";

    // Helper: safely parse JSON, recovering partial arrays if truncated
    const safeParseContracts = (raw: string): any[] => {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed.contracts) ? parsed.contracts : [];
      } catch {
        // Attempt to rescue a truncated JSON array
        try {
          const arrayStart = raw.indexOf("[");
          if (arrayStart === -1) return [];
          let partial = raw.slice(arrayStart);
          // Find the last complete object (ends with "}")
          const lastBrace = partial.lastIndexOf("}");
          if (lastBrace === -1) return [];
          partial = partial.slice(0, lastBrace + 1) + "]";
          const recovered = JSON.parse(partial);
          if (Array.isArray(recovered)) {
            console.warn(`[analyze-contract-excel] Recovered ${recovered.length} contracts from truncated JSON.`);
            return recovered;
          }
        } catch { /* ignore */ }
        return [];
      }
    };

    // Helper function to call OpenAI API with exponential backoff retry mechanism
    async function callOpenAIWithRetry(
      openaiInstance: OpenAI,
      modelName: string,
      msgPayload: OpenAI.Chat.ChatCompletionMessageParam[],
      retries = 3,
      delayMs = 1500
    ): Promise<any> {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const completion = await openaiInstance.chat.completions.create({
            model: modelName,
            messages: msgPayload,
            temperature: 0,
            max_tokens: 16384,
            response_format: { type: "json_object" },
          });
          return completion;
        } catch (err: any) {
          console.warn(`[analyze-contract-excel] Attempt ${attempt} failed: ${err.message || err}`);
          if (attempt === retries) {
            throw err;
          }
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }

    // For large inputs, split into batches of MAX_ROWS_PER_BATCH rows each.
    // We use 20 rows per batch with max_tokens=16000 to ensure the full JSON output is never truncated.
    const MAX_ROWS_PER_BATCH = 20;
    let allContracts: any[] = [];

    // Helper: count actual data rows in a CSV batch (exclude pure header/group-header lines)
    const countDataRows = (lines: string[], codeColIdx: number, nameColIdx: number): number => {
      let count = 0;
      for (const line of lines) {
        if (isLineDataRow(line, codeColIdx, nameColIdx)) {
          count++;
        }
      }
      return count;
    };

    if (messages.length > 0) {
      const userMsg = messages[messages.length - 1];
      const userContent = typeof userMsg.content === "string" ? userMsg.content : "";
      const excelMarker = "--- NỘI DUNG SHEET EXCEL ---";
      const markerIdx = userContent.indexOf(excelMarker);

      if (markerIdx !== -1) {
        // Split the CSV section into batches
        const headerPart = userContent.slice(0, markerIdx + excelMarker.length);
        const csvPart = userContent.slice(markerIdx + excelMarker.length).trim();
        const csvLines = csvPart.split("\n");

        // Find the line that looks like the column headers (usually line containing "Họ và tên", "Họ tên" or "Nhân viên")
        let headerRowIndex = 0;
        for (let idx = 0; idx < Math.min(csvLines.length, 15); idx++) {
          if (isLineHeaderOrSubHeader(csvLines[idx]) && !isLineGroupHeader(csvLines[idx])) {
            headerRowIndex = idx;
            break;
          }
        }

        const headerLine = csvLines[headerRowIndex];
        const headerCells = headerLine.split(",").map(c => c.trim().toLowerCase());
        let codeColIdx = headerCells.findIndex(c => c.includes("mã") || c.includes("ma nv") || c.includes("code"));
        let nameColIdx = headerCells.findIndex(c => c.includes("họ") || c.includes("tên") || c.includes("name"));
        if (codeColIdx === -1) codeColIdx = 2;
        if (nameColIdx === -1) nameColIdx = 3;

        // Keep all title and column header lines at the top of the CSV
        const headerRows = csvLines.slice(0, headerRowIndex + 1);
        const headerCsv = headerRows.join("\n");
        const dataLines = csvLines.slice(headerRowIndex + 1);

        // Scan all CSV lines to map active group/department headers
        const activeGroupHeaders: string[] = [];
        let currentGroupHeader = "";
        for (let idx = 0; idx < csvLines.length; idx++) {
          const line = csvLines[idx];
          if (isLineGroupHeader(line)) {
            currentGroupHeader = line;
          }
          activeGroupHeaders.push(currentGroupHeader);
        }

        // Process batches sequentially to respect rate limits and allow retries
        for (let i = 0; i < dataLines.length; i += MAX_ROWS_PER_BATCH) {
          const batchLines = dataLines.slice(i, i + MAX_ROWS_PER_BATCH);

          // Retrieve active group header for the first line of this batch
          const firstLineIndexInCsv = headerRowIndex + 1 + i;
          const activeHeader = activeGroupHeaders[firstLineIndexInCsv] || "";

          let prependedLines = [...batchLines];
          // Prepend active department header if not already present in this batch
          if (activeHeader && !batchLines.includes(activeHeader)) {
            prependedLines = [activeHeader, ...batchLines];
          }

          const batchCsv = [headerCsv, ...prependedLines].join("\n");
          const batchMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: `${headerPart}\n${batchCsv}` },
          ];

          const batchNumber = Math.floor(i / MAX_ROWS_PER_BATCH) + 1;
          const totalBatches = Math.ceil(dataLines.length / MAX_ROWS_PER_BATCH);
          const expectedRows = countDataRows(batchLines, codeColIdx, nameColIdx);
          console.log(`[analyze-contract-excel] Processing batch ${batchNumber}/${totalBatches} (expected ~${expectedRows} data rows)...`);

          try {
            const completion = await callOpenAIWithRetry(openai, model, batchMessages);
            const reply = completion.choices[0]?.message?.content || "{}";
            let batchContracts = safeParseContracts(reply);
            console.log(`[analyze-contract-excel] Batch ${batchNumber} parsed ${batchContracts.length} contracts (expected ~${expectedRows}).`);

            // Validation & Retry: if AI returned significantly fewer rows than expected, retry once with a stricter prompt
            if (expectedRows > 0 && batchContracts.length < expectedRows) {
              console.warn(`[analyze-contract-excel] Batch ${batchNumber}: AI returned ${batchContracts.length} but expected ~${expectedRows}. Retrying with stricter prompt...`);
              const retryMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: `${headerPart}\n${batchCsv}` },
                {
                  role: "user",
                  content: `⚠️ QUAN TRỌNG: Trong dữ liệu CSV phía trên có CHÍNH XÁC ${expectedRows} dòng chứa dữ liệu nhân viên. Bạn PHẢI trả về ĐÚNG ${expectedRows} object trong mảng "contracts". Mỗi dòng CSV có bất kỳ thông tin gì (dù chỉ có tên hoặc mã NV) đều phải trở thành 1 object. Dòng nào thiếu cột thì điền "" hoặc null. KHÔNG ĐƯỢC BỎ SÓT BẤT KỲ DÒNG NÀO.`
                },
              ];
              try {
                const retryCompletion = await callOpenAIWithRetry(openai, model, retryMessages, 2, 2000);
                const retryReply = retryCompletion.choices[0]?.message?.content || "{}";
                const retryContracts = safeParseContracts(retryReply);
                console.log(`[analyze-contract-excel] Batch ${batchNumber} RETRY parsed ${retryContracts.length} contracts.`);
                // Use whichever result has more contracts (closer to expected)
                if (retryContracts.length > batchContracts.length) {
                  batchContracts = retryContracts;
                }
              } catch (retryErr: any) {
                console.warn(`[analyze-contract-excel] Batch ${batchNumber} retry failed, using original result:`, retryErr.message);
              }
            }

            allContracts = allContracts.concat(batchContracts);
          } catch (err: any) {
            console.error(`[analyze-contract-excel] Batch ${batchNumber} parsing failed completely:`, err);
            throw new Error(`Lỗi khi phân tích gói dữ liệu thứ ${batchNumber}/${totalBatches} của danh sách nhân sự: ${err.message || err}`);
          }
        }
      } else {
        // Non-Excel path (PDF/Word/image): single call with higher token limit
        const completion = await openai.chat.completions.create({
          model,
          messages,
          temperature: 0,
          max_tokens: 16384,
          response_format: { type: "json_object" },
        });

        const reply = completion.choices[0]?.message?.content || "{}";
        allContracts = safeParseContracts(reply);
      }
    }
    // Normalize raw department names from AI to standard DEPARTMENTS_LIST
    const normalizeDepartment = (raw: string | undefined | null) => {
      if (!raw) return "";
      const lower = raw.toLowerCase();
      if (lower.includes("hành chính") || lower.includes("nhân sự") || lower.includes("hcns")) return "Phòng Hành Chính Nhân Sự";
      if (lower.includes("tài chính") || lower.includes("kế toán") || lower.includes("tckt")) return "Phòng Tài Chính Kế Toán";
      if (lower.includes("vật tư") || lower.includes("thiết bị") || lower.includes("vttb")) return "Phòng Vật Tư Thiết Bị";
      if (lower.includes("thị trường")) return "Phòng Thị Trường";
      if (lower.includes("kế hoạch") || lower.includes("đấu thầu") || lower.includes("khđt")) return "Phòng Kế Hoạch Đấu Thầu";
      if (lower.includes("kỹ thuật")) return "Phòng Kỹ Thuật";
      if (lower.includes("an toàn") || lower.includes("hse") || lower.includes("atlđ")) return "Phòng An Toàn Lao Động";
      if (lower.includes("quản lý dự án") || lower.includes("qlda")) return "Phòng Quản Lý Dự Án";
      if (lower.includes("thư ký") || lower.includes("trợ lý")) return "Phòng Thư Ký, Trợ Lý";
      
      // Projects (BĐH)
      if (lower.includes("vàm lẽo") || lower.includes("vàm lẻo")) return "BĐH Vàm Lẽo";
      if (lower.includes("rạch xuyên") || lower.includes("rxt")) return "BĐH Rạch Xuyên Tâm";
      if (lower.includes("thường phước") || lower.includes("thuong phuoc")) return "BĐH Thường Phước";
      if (lower.includes("tây ninh") || lower.includes("xử lý nước thải") || lower.includes("xlnt")) return "BĐH XLNT Tây Ninh";
      if (lower.includes("cà ná") || lower.includes("ca na")) return "BĐH KCN Cà Ná";
      if (lower.includes("chống hạn") || lower.includes("chong han")) return "BĐH Chống Hạn Ninh Thuận";
      if (lower.includes("tỉnh lộ 8") || lower.includes("tl8") || lower.includes("tỉnh lộ 08") || lower.includes("tl 8")) return "BĐH Tỉnh Lộ 8";
      if (lower.includes("mã đà") || lower.includes("ma da")) return "BĐH Cầu Mã Đà";
      if (lower.includes("trà vinh") || lower.includes("tra vinh")) return "BĐH ĐMT Trà Vinh 2";
      if (lower.includes("hương lộ 11") || lower.includes("hl11") || lower.includes("hl 11")) return "BĐH Hương Lộ 11";
      
      return raw;
    };

    allContracts = allContracts.map(c => ({
      ...c,
      department: normalizeDepartment(c.department)
    }));

    console.log(`[analyze-contract-excel] ✅ Total contracts extracted: ${allContracts.length}`);
    return NextResponse.json({ contracts: allContracts });
  } catch (err: any) {
    console.error("Analyze contract excel error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}

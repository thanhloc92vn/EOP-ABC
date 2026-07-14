import { NextRequest, NextResponse } from "next/server";
import { getDepartmentListsServer, type ServerDepartmentLists } from "@/lib/departmentsServer";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";
import OpenAI from "openai";
import * as XLSX from "xlsx";

const buildSystemPrompt = (lists: ServerDepartmentLists, companyName: string) => `
Bạn là AI chuyên phân tích phiếu/file yêu cầu văn phòng phẩm (VPP) của công ty ${companyName}.
Nhiệm vụ của bạn là phân tích văn bản hoặc tệp (Excel, Word, PDF, hình ảnh) được tải lên và trích xuất các thông tin dưới định dạng JSON.

━━━ QUY TẮC ĐỐI CHIẾU NHIỀU SHEET (QUAN TRỌNG) ━━━
Nếu tài liệu Excel có nhiều sheet, bạn phải đối chiếu chéo để chọn đúng sheet cần trích xuất:
1. Đọc tên file gốc và nội dung từng sheet để xác định bộ phận/dự án đang thực sự làm đề xuất.
2. Tìm sheet có thông tin yêu cầu thực tế: Có tên bộ phận cụ thể (ví dụ: từ ô "Bộ phận: Phòng Kế hoạch đấu thầu" thì bộ phận là "Phòng Kế Hoạch Đấu Thầu"), có tên người yêu cầu cụ thể (ví dụ: "Người yêu cầu: Nguyễn Văn A"), và danh sách vật tư được điền số lượng cụ thể > 0.
3. TUYỆT ĐỐI BỎ QUA các sheet chỉ chứa dữ liệu mẫu hoặc ví dụ hướng dẫn tĩnh (thường chứa các món ví dụ như Bút lông dầu đỏ PM04, Thước dẻo, Kim bấm, Khăn giấy Pulppy... với số lượng nhỏ ví dụ 1, 2, 3 nhưng không phải do bộ phận đó đề xuất thực tế).
4. Chỉ trích xuất từ sheet có yêu cầu điền tay thực tế của bộ phận.

━━━ QUY TẮC TRÍCH XUẤT THÔNG TIN ━━━
1. "targetType": Phân loại loại đối tượng yêu cầu. Phải là một trong hai giá trị:
   - "phongban": Nếu đối tượng là một Phòng ban văn phòng.
   - "duan": Nếu đối tượng là một Ban điều hành Dự án công trường.

2. "targetName": Tên phòng ban hoặc dự án yêu cầu thực tế. Bắt buộc phải khớp hoặc ánh xạ gần nhất với danh sách chính thức:
   - Phòng ban: ${[...lists.phongBan, ...lists.banGiamDoc].map(n => `"${n}"`).join(", ")}.
   - Dự án: ${lists.bdh.map(n => `"${n}"`).join(", ")}.

3. "requesterName": Tên người yêu cầu/đề xuất thực tế ghi trên sheet (ví dụ: từ ô "Người yêu cầu: Nguyễn Văn A" -> trích xuất "Nguyễn Văn A"). Nếu không tìm thấy hoặc chỉ có tên ví dụ mẫu tĩnh, để là "".

4. "items": Danh sách các vật tư yêu cầu cấp phát. Mỗi phần tử gồm:
   - "name": Tên vật tư làm sạch (bỏ số thứ tự đầu dòng, ký tự rác...). Đọc đúng nội dung tên văn phòng phẩm gốc, không tự chế thêm từ ngữ.
   - "unit": Đơn vị tính (Ram, Cái, Hộp, Cuốn, Bịch, Xấp, Cục...). Đọc đúng đơn vị trên sheet hoặc dự đoán hợp lý.
   - "qty": Số lượng yêu cầu (kiểu số nguyên dương). CHỈ trích xuất mặt hàng có số lượng > 0. TUYỆT ĐỐI KHÔNG trích xuất các mặt hàng có số lượng để trống hoặc bằng 0.

5. "STT/TT đối chiếu": Chỉ trích xuất các mặt hàng nằm ở các dòng có cột Số thứ tự (STT hoặc TT) được ghi rõ ràng (1, 2, 3...). Hãy đối chiếu kỹ để đảm bảo tên vật tư khớp chính xác với dòng số thứ tự tương ứng.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "targetType": "phongban | duan",
  "targetName": "...",
  "requesterName": "...",
  "items": [
    {
      "name": "...",
      "unit": "...",
      "qty": 10
    }
  ]
}
`.trim();

export async function POST(req: NextRequest) {
  try {
    const deptLists = await getDepartmentListsServer();
    const SYSTEM_PROMPT = buildSystemPrompt(deptLists, (await getTenantConfigServer()).company_name);
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong mục Cài đặt hệ thống hoặc Cấu hình AI VPP." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("vpp_file") as File | null;
    const originalFilename = form.get("original_filename") as string | null;
    const targetFilter = form.get("target_filter") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Thiếu file văn bản cần phân tích." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const filenameInfo = originalFilename ? `Tên file tài liệu gốc: "${originalFilename}"` : `Tên file tài liệu: "${file.name}"`;
    const promptText = `Hãy phân tích tài liệu yêu cầu VPP này. 
${filenameInfo}
Bộ phận đang được chọn làm bộ lọc trên giao diện hiện tại: "${targetFilter || "Tất cả"}".
Hãy trích xuất thông tin dạng JSON gồm: targetType, targetName, requesterName, items.
LƯU Ý QUAN TRỌNG:
1. Đọc đúng nội dung tên văn phòng phẩm và số lượng từ sheet yêu cầu thực tế. Tuyệt đối không tự bịa ra thông tin. Tránh nhầm lẫn với các sheet ví dụ mẫu/hướng dẫn hoặc các món mẫu tĩnh (như Bút lông dầu đỏ, Thước dẻo, Kim bấm...).
2. Nếu tài liệu chứa nhiều sheet, hãy tìm sheet có điền số lượng thực tế khớp với tên file gốc hoặc khớp với thông tin bộ phận/người yêu cầu thực tế được điền tay trong bảng.
3. Nếu có danh mục vật tư dài (dropdown danh mục), chỉ trích xuất các mặt hàng có điền số lượng yêu cầu cụ thể (>0).`;

    if (fileType.endsWith(".xlsx") || fileType.endsWith(".xls")) {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      let excelText = "";
      
      // Filter sheet names to prioritize actual requests if there are multiple sheets
      let validSheets = workbook.SheetNames.filter(name => {
        if (workbook.SheetNames.length <= 1) return true;
        const normalized = name.toLowerCase().trim();
        return !(
          normalized.includes("hướng dẫn") ||
          normalized.includes("huong dan") ||
          normalized.includes("ví dụ") ||
          normalized.includes("vi du") ||
          normalized.includes("mẫu") ||
          normalized.includes("mau") ||
          normalized.includes("template") ||
          normalized.includes("example") ||
          normalized.includes("danh mục") ||
          normalized.includes("danh muc") ||
          normalized.includes("data") ||
          normalized.includes("list") ||
          normalized.includes("bảng giá") ||
          normalized.includes("bang gia") ||
          normalized === "vd" ||
          normalized === "hd"
        );
      });

      // Determine the best sheets to process.
      // We prioritize sheets matching the filename or target filter, but we include other sheets as well
      // so the AI has access to the whole file if the prioritized sheet is empty/template.
      let prioritizedSheets: string[] = [];

      // A. Try matching with filename first (e.g. file "VPP T6- KHDT.xlsx" -> sheet "KHĐT")
      if (originalFilename) {
        const cleanFilename = originalFilename.toLowerCase();
        const filenameDeptMatch = cleanFilename
          .replace(/\.[^/.]+$/, "") // remove extension
          .replace(/vpp/g, "")
          .replace(/tháng/g, "")
          .replace(/\d+/g, "")
          .replace(/[-_]/g, " ")
          .trim();
        
        if (filenameDeptMatch) {
          const words = filenameDeptMatch.split(/\s+/).filter(w => w.length >= 2);
          for (const sheetName of validSheets) {
            const cleanSheetName = sheetName.toLowerCase();
            if (words.some(word => cleanSheetName.includes(word) || word.includes(cleanSheetName))) {
              prioritizedSheets.push(sheetName);
            }
          }
        }
      }

      // B. Try matching with target filter hint if no filename match
      if (prioritizedSheets.length === 0 && targetFilter && targetFilter !== "Tất cả") {
        const hint = targetFilter.toLowerCase().replace("phòng", "").replace("bđh", "").replace("ban điều hành", "").trim();
        if (hint) {
          for (const sheetName of validSheets) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet).toLowerCase();
            if (sheetName.toLowerCase().includes(hint) || csv.includes(hint)) {
              prioritizedSheets.push(sheetName);
            }
          }
        }
      }

      // C. Include all other valid sheets as fallback, so the AI has context on the entire workbook
      const otherSheets = validSheets.filter(s => !prioritizedSheets.includes(s));
      const sheetsToProcess = [...prioritizedSheets, ...otherSheets].slice(0, 5);

      for (const sheetName of sheetsToProcess) {
        const sheet = workbook.Sheets[sheetName];
        
        // Skip hidden rows to avoid parsing items that are hidden by filters in Excel
        if (sheet && sheet["!rows"]) {
          const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
          for (let r = range.s.r; r <= range.e.r; r++) {
            if (sheet["!rows"][r]?.hidden) {
              for (let c = range.s.c; c <= range.e.c; c++) {
                const cellAddress = XLSX.utils.encode_cell({ r, c });
                delete sheet[cellAddress];
              }
            }
          }
        }

        const csv = XLSX.utils.sheet_to_csv(sheet);
        // Filter out empty rows or rows that contain only commas/semicolons/quotes and whitespace
        const cleanCsv = csv
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => {
            const content = line.replace(/[,;"']/g, "").trim();
            return content !== "";
          })
          .join("\n");
        excelText += `--- SHEET: ${sheetName} ---\n${cleanCsv}\n\n`;
      }
      console.log("=== EXCEL TEXT SENT TO AI ===\n", excelText);
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
      const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o-mini";
      try {
        // Try the responses API first (if available in the library)
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
          console.error("pdf-parse fallback failed:", fallbackErr);
          return NextResponse.json({ error: "Lỗi phân tích file PDF: " + (fallbackErr.message || fallbackErr) }, { status: 500 });
        }
      }
    } else {
      return NextResponse.json({ error: "Định dạng file không hỗ trợ. Sử dụng Excel (XLSX/XLS), Word (DOCX/DOC), PDF hoặc ảnh (PNG/JPG)." }, { status: 400 });
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

    if (extractedData.targetName) {
      const name = extractedData.targetName.trim().toLowerCase();
      if (
        name === "hcns" ||
        name === "phòng hcns" ||
        name === "p.hcns" ||
        name === "hành chính nhân sự" ||
        name === "phòng hành chính nhân sự"
      ) {
        extractedData.targetName = "Phòng Hành Chính Nhân Sự";
      } else if (
        name === "tckt" ||
        name === "phòng tckt" ||
        name === "p.tckt" ||
        name === "kế toán" ||
        name === "tài chính kế toán" ||
        name === "phòng tài chính kế toán"
      ) {
        extractedData.targetName = "Phòng Tài Chính Kế Toán";
      } else if (
        name === "qlda" ||
        name === "phòng qlda" ||
        name === "p.qlda" ||
        name === "quản lý dự án" ||
        name === "phòng quản lý dự án"
      ) {
        extractedData.targetName = "Phòng Quản Lý Dự Án";
      } else if (
        name === "vật tư" ||
        name === "phòng vật tư" ||
        name === "vật tư thiết bị" ||
        name === "phòng vật tư thiết bị"
      ) {
        extractedData.targetName = "Phòng Vật Tư Thiết Bị";
      } else if (
        name === "khđt" ||
        name === "phòng khđt" ||
        name === "kế hoạch đấu thầu" ||
        name === "phòng kế hoạch đấu thầu"
      ) {
        extractedData.targetName = "Phòng Kế Hoạch Đấu Thầu";
      }
    }

    return NextResponse.json(extractedData);
  } catch (err: any) {
    console.error("Analyze VPP document error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}

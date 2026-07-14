/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { NextRequest, NextResponse } from "next/server";
import { getDepartmentListsServer } from "@/lib/departmentsServer";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";
import OpenAI from "openai";
import * as XLSX from "xlsx";

// Danh sách phòng ban đọc động từ bảng `departments` (lib/departmentsServer)

interface ExtractedEmployee {
  employee_code?: string;
  name: string;
  department: string;
  position: string;
  gender?: string;
  start?: string;
  date_of_birth?: string;
  phone?: string;
  email?: string;
  cccd?: string;
  cccd_date?: string;
  cccd_place?: string;
  permanent_address?: string;
  temporary_address?: string;
  degree?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  status?: string;
  notes?: string;
}

function tryDirectExcelParse(sheet: XLSX.WorkSheet): ExtractedEmployee[] | null {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
  if (!rows || rows.length === 0) return null;

  let headerRowIndex = -1;
  const colMapping: { [key: string]: number } = {};

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;
    
    const normalizedCells = Array.from(row).map(cell => String(cell || "").trim().toLowerCase());
    
    const nameIdx = normalizedCells.findIndex(cell => cell && (cell.includes("họ tên") || cell.includes("họ và tên") || cell === "tên" || cell.includes("tên nhân viên")));
    const deptIdx = normalizedCells.findIndex(cell => cell && (cell.includes("phòng ban") || cell.includes("bộ phận") || cell.includes("đơn vị")));
    const codeIdx = normalizedCells.findIndex(cell => cell && (cell.includes("mã") || cell.includes("employee_code") || cell.includes("nv")));

    if (nameIdx !== -1 && (deptIdx !== -1 || codeIdx !== -1)) {
      headerRowIndex = i;
      
      normalizedCells.forEach((cell, idx) => {
        if (!cell) return;
        
        // 1. First prioritize relative/emergency contacts to prevent collision with employee fields (e.g. phone, name)
        if (cell.includes("người thân") || cell.includes("khẩn cấp") || cell.includes("emergency")) {
          if (cell.includes("sđt") || cell.includes("số đt") || cell.includes("điện thoại") || cell.includes("phone")) {
            colMapping["emergency_contact_phone"] = idx;
          } else if (cell.includes("mối quan hệ") || cell.includes("quan hệ") || cell.includes("relationship")) {
            colMapping["emergency_contact_relationship"] = idx;
          } else {
            colMapping["emergency_contact_name"] = idx;
          }
        }
        // 2. Employee fields
        else if (cell.includes("mã nhân viên") || cell.includes("mã nv") || cell === "mã" || cell === "code") {
          colMapping["employee_code"] = idx;
        } else if (cell.includes("họ tên") || cell.includes("họ và tên") || cell === "tên" || cell.includes("tên nhân viên")) {
          colMapping["name"] = idx;
        } else if (cell.includes("phòng ban") || cell.includes("bộ phận") || cell.includes("đơn vị")) {
          colMapping["department"] = idx;
        } else if (cell.includes("chức danh") || cell.includes("chức vụ") || cell === "vị trí" || cell.includes("vai trò") || cell === "role") {
          colMapping["position"] = idx;
        } else if (cell.includes("giới tính")) {
          colMapping["gender"] = idx;
        } else if (cell.includes("nhận việc") || cell.includes("ngày vào") || cell.includes("ngày tuyển") || cell.includes("start")) {
          colMapping["start"] = idx;
        } else if (cell.includes("ngày sinh") || cell.includes("sinh nhật") || cell.includes("dob")) {
          colMapping["date_of_birth"] = idx;
        } else if (cell === "sđt" || cell.includes("điện thoại") || cell === "số đt" || cell === "phone") {
          colMapping["phone"] = idx;
        } else if (cell.includes("cccd") || cell.includes("cmnd") || cell === "identity") {
          colMapping["cccd"] = idx;
        } else if (cell.includes("ngày cấp") || cell.includes("cccd_date")) {
          colMapping["cccd_date"] = idx;
        } else if (cell.includes("nơi cấp") || cell.includes("cccd_place")) {
          colMapping["cccd_place"] = idx;
        } else if (cell.includes("thường trú") || cell.includes("địa chỉ tt") || cell.includes("permanent")) {
          colMapping["permanent_address"] = idx;
        } else if (cell.includes("tạm trú") || cell.includes("địa chỉ kt") || cell.includes("temporary") || cell.includes("địa chỉ trọ")) {
          colMapping["temporary_address"] = idx;
        } else if (cell.includes("bằng cấp") || cell.includes("trình độ") || cell.includes("học vấn") || cell === "degree") {
          colMapping["degree"] = idx;
        } else if (cell === "email" || cell.includes("thư điện tử")) {
          colMapping["email"] = idx;
        } else if (cell.includes("mối quan hệ") || cell === "quan hệ" || cell.includes("relationship")) {
          colMapping["emergency_contact_relationship"] = idx;
        } else if (cell.includes("ghi chú") || cell === "notes") {
          colMapping["notes"] = idx;
        }
      });
      break;
    }
  }

  if (headerRowIndex === -1 || !colMapping["name"]) {
    return null;
  }

  const parsedEmployees: ExtractedEmployee[] = [];
  const mapDept = (val: string) => {
    if (!val) return "Phòng Hành Chính Nhân Sự";
    const clean = val.toLowerCase().replace(/[\s.]/g, ""); // Remove spaces and dots for matching
    
    if (clean.includes("hànhchính") || clean.includes("nhânsự") || clean.includes("hcns")) return "Phòng Hành Chính Nhân Sự";
    if (clean.includes("tàichính") || clean.includes("kếtoán") || clean.includes("tckt")) return "Phòng Tài Chính Kế Toán";
    if (clean.includes("vậttư") || clean.includes("thiếtbị") || clean.includes("vttb")) return "Phòng Vật Tư Thiết Bị";
    if (clean.includes("thịtrường") || clean === "tt") return "Phòng Thị Trường";
    if (clean.includes("dựán") && clean.includes("đầutư")) return "Phòng Dự Án - Đầu Tư";
    if (clean.includes("kỹthuật") || clean === "kt") return "Phòng Kỹ Thuật";
    if (clean.includes("antoàn") || clean.includes("atlđ") || clean.includes("atld")) return "Phòng An Toàn Lao Động";
    if (clean.includes("quảnlýdựán") || clean.includes("qlda") || clean.includes("bql")) return "Phòng Quản Lý Dự Án";
    if (clean.includes("thưký") || clean.includes("trợlý") || clean.includes("ttk") || clean.includes("tl")) return "Phòng Thư Ký, Trợ Lý";
    if (clean.includes("kếhoạchđấuthầu") || clean.includes("khđt") || clean.includes("khdt")) return "Phòng Kế Hoạch Đấu Thầu";
    
    // If it's a Ban Điều Hành or custom project board, return the original trimmed value!
    return val.trim();
  };

  const parseExcelDate = (val: any): string => {
    if (!val) return "";
    if (typeof val === "number") {
      const date = new Date((val - 25569) * 86400 * 1000);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
    const str = String(val).trim();
    const parts = str.split("/");
    if (parts.length === 3) {
      const d = parts[0].padStart(2, "0");
      const m = parts[1].padStart(2, "0");
      const y = parts[2];
      if (y.length === 4) {
        return `${y}-${m}-${d}`;
      }
    }
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return str;
    }
    return str;
  };

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !Array.isArray(row)) continue;

    const rawName = colMapping["name"] !== undefined ? row[colMapping["name"]] : null;
    if (!rawName || String(rawName).trim() === "" || String(rawName).trim() === "STT") {
      continue;
    }

    const name = String(rawName).trim();
    // Skip category header rows (e.g., "BAN GIÁM ĐỐC", "P. HÀNH CHÍNH NHÂN SỰ", "TỔ THƯ KÝ, TRỢ LÝ", "P. VẬT TƯ THIẾT BỊ")
    const nameUpper = name.toUpperCase();
    if (
      nameUpper.includes("BAN GIÁM ĐỐC") ||
      nameUpper.startsWith("P. ") ||
      nameUpper.startsWith("PHÒNG ") ||
      nameUpper.startsWith("TỔ ") ||
      nameUpper.startsWith("BỘ PHẬN ") ||
      (nameUpper === name && name.length > 15)
    ) {
      continue;
    }

    const employee_code = colMapping["employee_code"] !== undefined ? String(row[colMapping["employee_code"]] || "").trim() : "";
    const department = colMapping["department"] !== undefined ? mapDept(String(row[colMapping["department"]] || "")) : "Phòng Hành Chính Nhân Sự";
    const position = colMapping["position"] !== undefined ? String(row[colMapping["position"]] || "").trim() : "Nhân viên";
    const gender = colMapping["gender"] !== undefined ? String(row[colMapping["gender"]] || "").trim() : "";
    const start = colMapping["start"] !== undefined ? parseExcelDate(row[colMapping["start"]]) : "";
    const date_of_birth = colMapping["date_of_birth"] !== undefined ? parseExcelDate(row[colMapping["date_of_birth"]]) : "";
    const phone = colMapping["phone"] !== undefined ? String(row[colMapping["phone"]] || "").trim() : "";
    const email = colMapping["email"] !== undefined ? String(row[colMapping["email"]] || "").trim() : "";
    const cccd = colMapping["cccd"] !== undefined ? String(row[colMapping["cccd"]] || "").trim() : "";
    const cccd_date = colMapping["cccd_date"] !== undefined ? parseExcelDate(row[colMapping["cccd_date"]]) : "";
    const cccd_place = colMapping["cccd_place"] !== undefined ? String(row[colMapping["cccd_place"]] || "").trim() : "";
    const permanent_address = colMapping["permanent_address"] !== undefined ? String(row[colMapping["permanent_address"]] || "").trim() : "";
    const temporary_address = colMapping["temporary_address"] !== undefined ? String(row[colMapping["temporary_address"]] || "").trim() : "";
    const degree = colMapping["degree"] !== undefined ? String(row[colMapping["degree"]] || "").trim() : "";
    const emergency_contact_name = colMapping["emergency_contact_name"] !== undefined ? String(row[colMapping["emergency_contact_name"]] || "").trim() : "";
    const emergency_contact_relationship = colMapping["emergency_contact_relationship"] !== undefined ? String(row[colMapping["emergency_contact_relationship"]] || "").trim() : "";
    const emergency_contact_phone = colMapping["emergency_contact_phone"] !== undefined ? String(row[colMapping["emergency_contact_phone"]] || "").trim() : "";
    const notes = colMapping["notes"] !== undefined ? String(row[colMapping["notes"]] || "").trim() : "";

    parsedEmployees.push({
      employee_code,
      name,
      department,
      position,
      gender,
      start,
      date_of_birth,
      phone: phone || "",
      email: email || "",
      cccd,
      cccd_date,
      cccd_place,
      permanent_address,
      temporary_address,
      degree,
      emergency_contact_name,
      emergency_contact_relationship,
      emergency_contact_phone,
      status: "Chính thức",
      notes
    });
  }

  return parsedEmployees;
}

const buildSystemPrompt = (DEPARTMENTS: string[], companyName: string, companyShort: string) => `
Bạn là một AI phân tích tài liệu và hồ sơ nhân sự chuyên nghiệp cho công ty ${companyName}.
Nhiệm vụ của bạn là đọc và trích xuất danh sách thông tin nhân viên từ tệp tài liệu (Excel, Word, PDF, hình ảnh) được cung cấp.

Hãy trích xuất và chuyển đổi các thông tin thành định dạng JSON chứa một danh sách các nhân viên.

Mỗi nhân viên cần có các trường dữ liệu sau:
1. "employee_code": Mã nhân viên (ví dụ: "NV001", "${companyShort}-001"). Nếu không có, để trống "".
2. "name": Họ và tên đầy đủ của nhân viên. Viết hoa các chữ cái đầu (ví dụ: "Nguyễn Văn A").
3. "department": Tên phòng ban làm việc. PHẢI được ánh xạ chính xác về một trong các phòng ban hợp lệ dưới đây:
   ${JSON.stringify(DEPARTMENTS)}
   *(Ví dụ: "Hành chính nhân sự", "HCNS", "Phòng HCNS" -> "Phòng Hành Chính Nhân Sự"; "Kế toán", "P. Kế toán", "TCKT", "P. TCKT" -> "Phòng Tài Chính Kế Toán"; "Vật tư", "P. Vật tư" -> "Phòng Vật Tư Thiết Bị"; "Dự án", "QLDA", "Quản lý dự án" -> "Phòng Quản Lý Dự Án"; "Kỹ thuật" -> "Phòng Kỹ Thuật"; "An toàn lao động", "ATLĐ" -> "Phòng An Toàn Lao Động"; "Thư ký", "Trợ lý", "Tổ trợ lý" -> "Phòng Thư Ký, Trợ Lý")*
4. "position": Chức vụ / Chức danh (ví dụ: "Chuyên viên tuyển dụng", "Kỹ sư cầu đường", "Trưởng phòng"). Nếu không có, dự đoán hoặc điền "Nhân viên".
5. "gender": Giới tính ("Nam" hoặc "Nữ"). Nếu không rõ, để trống "".
6. "start": Ngày nhận việc / ngày bắt đầu làm việc (định dạng YYYY-MM-DD, ví dụ: "2026-06-01"). Nếu không có, để trống "".
7. "date_of_birth": Ngày sinh (định dạng YYYY-MM-DD, ví dụ: "1995-03-15"). Nếu không có, để trống "".
8. "phone": Số điện thoại liên hệ (ví dụ: "0912345678"). Nếu không có, điền "N/A".
9. "email": Địa chỉ email làm việc (ví dụ: "nguyenvana@gmail.com"). Nếu không có, điền "N/A".
10. "cccd": Số Căn cước công dân / CMND (ví dụ: "079012345678"). Nếu không có, để trống "".
11. "cccd_date": Ngày cấp CCCD (định dạng YYYY-MM-DD, ví dụ: "2021-12-10"). Nếu không có, để trống "".
12. "cccd_place": Nơi cấp CCCD (ví dụ: "Cục Cảnh sát QLHC về trật tự xã hội"). Nếu không có, để trống "".
13. "permanent_address": Địa chỉ thường trú (ví dụ: "123 Đường A, Quận B, TP C"). Nếu không có, để trống "".
14. "temporary_address": Địa chỉ tạm trú (ví dụ: "456 Đường X, Quận Y, TP Z"). Nếu không có, để trống "".
15. "degree": Bằng cấp / Trình độ học vấn (ví dụ: "Đại học", "Cao đẳng", "Thạc sĩ", "Trung cấp"). Nếu không có, để trống "".
16. "emergency_contact_name": Tên người thân liên hệ khẩn cấp (ví dụ: "Nguyễn Văn B"). Nếu không có, để trống "".
17. "emergency_contact_relationship": Mối quan hệ với người thân (ví dụ: "Bố", "Mẹ", "Vợ"). Nếu không có, để trống "".
18. "emergency_contact_phone": Số điện thoại người thân (ví dụ: "0987654321"). Nếu không có, để trống "".
19. "status": Trạng thái làm việc. Phải là một trong hai giá trị sau:
   - "Chính thức"
   - "Thử việc"
   *(Nếu không nêu rõ, mặc định là "Chính thức")*
20. "notes": Ghi chú thêm (nếu có). Nếu không có, để trống "".

━━━ QUY TẮC PHÂN TÍCH ━━━
- Hãy đọc kỹ các tiêu đề cột (STT, Mã NV, Họ tên, Phòng ban, Chức danh, Giới tính, Ngày nhận việc, Ngày sinh, SĐT, CCCD, Ngày cấp, Nơi cấp, Địa chỉ thường trú, Địa chỉ tạm trú, Bằng cấp, Email, Họ tên người thân, Mối quan hệ, Số ĐT người thân, Ghi chú...) để trích xuất đúng dòng thông tin của từng nhân viên.
- Để tối ưu hóa tốc độ và giảm kích thước phản hồi, CHỈ xuất các thuộc tính có giá trị thực tế. Bắt buộc bỏ qua (không ghi vào JSON) các trường trống, null, hoặc không tìm thấy thông tin.
- Trả về kết quả CHỈ dạng JSON chứa mảng "employees", không kèm giải thích bên ngoài.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
{
  "employees": [
    {
      "employee_code": "...",
      "name": "...",
      "department": "...",
      "position": "...",
      "gender": "Nam | Nữ",
      "start": "YYYY-MM-DD",
      "date_of_birth": "YYYY-MM-DD",
      "phone": "...",
      "email": "...",
      "cccd": "...",
      "cccd_date": "YYYY-MM-DD",
      "cccd_place": "...",
      "permanent_address": "...",
      "temporary_address": "...",
      "degree": "...",
      "emergency_contact_name": "...",
      "emergency_contact_relationship": "...",
      "emergency_contact_phone": "...",
      "status": "Chính thức | Thử việc",
      "notes": "..."
    }
  ]
}
`.trim();


export async function POST(req: NextRequest) {
  try {
    const tenantCfg = await getTenantConfigServer();
    const SYSTEM_PROMPT = buildSystemPrompt((await getDepartmentListsServer()).phongBan, tenantCfg.company_name, tenantCfg.company_short);
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong phần Cài đặt AI." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const file = form.get("employee_file") as File | null;
    const originalFilename = form.get("original_filename") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Thiếu file danh sách cần phân tích." }, { status: 400 });
    }

    const openai = new OpenAI({ apiKey });
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    const filenameInfo = originalFilename ? `Tên file tài liệu gốc: "${originalFilename}"` : `Tên file tài liệu: "${file.name}"`;
    const promptText = `Hãy phân tích tài liệu chứa thông tin nhân sự này. 
${filenameInfo}
Hãy trích xuất danh sách nhân viên dạng JSON chứa mảng 'employees'.`;

    if (fileType.endsWith(".xlsx") || fileType.endsWith(".xls")) {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      let excelText = "";
      
      // Find the best sheet to parse based on names matching employee keywords
      let targetSheetName = "";
      const lowerSheetNames = workbook.SheetNames.map(name => name.toLowerCase().trim());
      
      // Priority list for sheet names
      const priorities = [
        "danh sách nhân sự", "danh sách nhân viên", "ds nhân sự", "ds nhân viên",
        "danh sach nhan su", "danh sach nhan vien", "ds nhan su", "ds nhan vien",
        "nhân sự", "nhân viên", "nhan su", "nhan vien", "employees", "employee"
      ];
      
      for (const priority of priorities) {
        const index = lowerSheetNames.findIndex(name => name.includes(priority));
        if (index !== -1) {
          targetSheetName = workbook.SheetNames[index];
          break;
        }
      }
      
      // Fallback to first sheet if none found
      if (!targetSheetName && workbook.SheetNames.length > 0) {
        targetSheetName = workbook.SheetNames[0];
      }
      
      if (targetSheetName) {
        const sheet = workbook.Sheets[targetSheetName];
        
        // 1. Try Direct JS Excel Parsing first (super fast and 100% reliable)
        try {
          const directData = tryDirectExcelParse(sheet);
          if (directData && directData.length > 0) {
            console.log(`[Excel Parser] Direct JS parsing succeeded! Extracted ${directData.length} employees.`);
            return NextResponse.json({ employees: directData });
          }
        } catch (directErr) {
          console.warn("[Excel Parser] Direct JS parsing failed, falling back to AI:", directErr);
        }
        
        // Restrict to columns A-U (columns index 0 to 20) to ignore any extra columns
        if (sheet["!ref"]) {
          try {
            const range = XLSX.utils.decode_range(sheet["!ref"]);
            if (range.e.c > 20) {
              range.e.c = 20;
              sheet["!ref"] = XLSX.utils.encode_range(range);
            }
          } catch (e) {
            console.warn("Error restricting sheet range:", e);
          }
        }
        
        const csv = XLSX.utils.sheet_to_csv(sheet);
        
        // Clean CSV to remove empty rows/columns to prevent AI looping and reduce token usage
        const cleanLines = csv
          .split("\n")
          .map(line => line.trim())
          .filter(line => {
            // Remove line if it only contains commas, semicolons, quotes, or is empty
            const content = line.replace(/[,;"'\s]/g, "");
            return content.length > 0;
          });
          
        if (cleanLines.length > 0) {
          excelText += `--- SHEET: ${targetSheetName} ---\n${cleanLines.join("\n")}\n\n`;
        }
        console.log(`[Excel Parser] Selected sheet "${targetSheetName}" for AI analysis (${cleanLines.length} active rows)`);
      }

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
      max_tokens: 16384, // allow maximum output tokens to prevent cut-offs for large lists
    });

    const reply = completion.choices[0]?.message?.content || "{}";
    let extractedData;
    try {
      extractedData = JSON.parse(reply);
    } catch (parseErr: any) {
      console.error("JSON parse error of OpenAI reply. Reply length:", reply.length);
      console.error("Reply start:", reply.substring(0, 1000));
      console.error("Reply end:", reply.substring(reply.length > 1000 ? reply.length - 1000 : 0));
      throw new Error(`Lỗi cú pháp phản hồi từ AI: ${parseErr.message || parseErr}. Vui lòng thử lại với model gpt-4o.`);
    }

    return NextResponse.json(extractedData);
  } catch (err: any) {
    console.error("Analyze employee document error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi gọi OpenAI API" }, { status: 500 });
  }
}

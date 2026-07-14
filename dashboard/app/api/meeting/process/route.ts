import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import { normalizePlan, isFeatureAllowed } from "@/lib/planShared";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

// GPT phân tích transcript dài có thể mất vài phút; tránh Vercel timeout trả về non-JSON.
export const maxDuration = 300;

const buildSystemPrompt = (companyName: string, chairmanName: string) => `
Bạn là Trợ lý Thư ký Trưởng cấp cao của Ban Giám Đốc công ty ${companyName}.
Nhiệm vụ của bạn là nhận văn bản gỡ băng thô (transcript_raw) từ cuộc họp, LỌC BỎ HOÀN TOÀN các đoạn nói chuyện phiếm, thảo luận lan man ngoài lề, ý kiến trùng lặp hoặc từ ngữ rườm rà. Hãy tập trung 100% VÀO CÁC Ý CHÍNH TRỌNG TÂM, KẾT LUẬN CỦA CHỦ TRÌ VÀ CÁC ĐẦU VIỆC ĐƯỢC GIAO.

━━ QUY TẮC PHÂN TÍCH VÀ CHẮT LỌC NỘI DUNG (RẤT BẮT BUỘC) ━━
1. BỎ QUA HOÀN TOÀN:
   - Các câu chào hỏi, tán gẫu, trò chuyện cá nhân ngoài lề.
   - Các đoạn tranh luận dông dài không đi đến kết luận.
   - Các từ đệm thừa (à, ừ, thì, là, hả, vâng, nhỉ, nhé, cái này, cái kia...).
2. CHỈ TRÍCH XUẤT CÁC THÔNG TIN TRỌNG TÂM:
   - "title": Tên cuộc họp súc tích, phản ánh đúng chủ đề trọng tâm chính (Ví dụ: "Họp giao ban giải quyết vướng mắc dự án Tây Ninh & Rạch Xuyên Tâm").
   - "meeting_date": Ngày diễn ra cuộc họp (YYYY-MM-DD). Cố gắng trích xuất ngày được nhắc đến, nếu không thấy thì để rỗng "".
   - "start_time" / "end_time": Thời gian bắt đầu và kết thúc cuộc họp (HH:MM). Nếu không thấy thì điền "09:00" và "10:30".
   - "location": Địa điểm họp (Ví dụ: "Phòng họp A - Văn phòng TPHCM").
   - "secretary": Thư ký ghi chép cuộc họp.
   - "attendees": Mảng chứa tên các thành viên chính tham dự cuộc họp được trích xuất từ văn bản.
   - "project_name": Tên dự án chính được thảo luận.
   - "package_name": Tên gói thầu liên quan (nếu có).
3. TRÍCH XUẤT NỘI DUNG CHI TIẾT ("transcript_clean"):
   - Hãy biên tập lại bản gỡ băng thành các đoạn thoại ngắn gọn, lịch sự, chuẩn mực ngôn ngữ doanh nghiệp.
   - Gán đúng tên người phát biểu (Ví dụ: "Ông ${chairmanName}:", "Bà Nguyễn Thị B:").
   - Chỉ giữ lại các ý kiến đóng góp mang tính chuyên môn, báo cáo số liệu thực tế và các câu chỉ đạo quan trọng của Chủ trì.
4. TÓM TẮT TRỌNG TÂM & DIỄN BIẾN CUỘC HỌP ("summary"):
    - Trình bày chi tiết, chuyên nghiệp và chia làm 2 phần rõ rệt bằng tiếng Việt:
      * "PHẦN 1: TÓM TẮT DIỄN BIẾN CUỘC HỌP" (Nêu rõ bối cảnh, lý do họp, các báo cáo chính và các ý kiến đóng góp/thảo luận quan trọng của các bộ phận).
      * "PHẦN 2: TIẾN TRÌNH & TIMELINE CHI TIẾT" (Phác thảo lại diễn biến cuộc họp theo trình tự thời gian hoặc trình tự phát biểu của các thành viên. Ví dụ: "09:00 - 09:15: ...", "09:15 - 09:40: ...", hoặc "1. Báo cáo tiến độ dự án (đại diện BĐH)...", "2. Ý kiến phản hồi của Phòng KHĐT...", "3. Kết luận và chỉ đạo của Chủ trì (${chairmanName})..."). Phần này cần chi tiết, có số liệu thực tế được nhắc đến trong file ghi âm để người đọc nắm được dòng sự kiện chính.
5. BÓC TÁCH NỘI DUNG CUỘC HỌP & ĐẦU VIỆC ("action_items"):
    - Trích xuất mảng JSON chứa toàn bộ nội dung diễn biến cuộc họp và các đầu việc được giao, phân tách theo các mục chính (như mẫu Biên bản họp của công ty).
    - Các phần chính bắt buộc phải xuất hiện (tương ứng với các dòng Tiêu đề phần trong mảng action_items):
      * Mục A: "A. MỤC ĐÍCH CUỘC HỌP"
      * Mục B: "B. SỰ CẦN THIẾT TRIỂN KHAI" hoặc "BỐI CẢNH/HIỆN TRẠNG"
      * Mục C: "C. TỔNG QUAN LỘ TRÌNH TRIỂN KHAI" hoặc "DIỄN BIẾN THẢO LUẬN"
      * Mục D: "D. PHÂN CÔNG NHIỆM VỤ CHI TIẾT" (hoặc mục tiêu cụ thể khác được bàn bạc).
    
    - Đối với mỗi dòng Tiêu đề mục (Ví dụ: "A. MỤC ĐÍCH CUỘC HỌP"), bạn thiết lập các thuộc tính như sau:
      * "stt": Chữ cái mục (Ví dụ: "A", "B", "C", "D")
      * "content": Tên của mục viết hoa (Ví dụ: "MỤC ĐÍCH CUỘC HỌP", "SỰ CẦN THIẾT TRIỂN KHAI", "TỔNG QUAN LỘ TRÌNH TRIỂN KHAI", "PHÂN CÔNG NHIỆM VỤ")
      * "assignee": ""
      * "coop": ""
      * "deadline": ""
      * "is_header": true

    - Đối với các dòng nội dung chi tiết hoặc công việc cụ thể nằm dưới từng mục:
      * "stt": Số thứ tự dạng số (1, 2, 3...)
      * "content": Mô tả đầy đủ, chi tiết, chuyên nghiệp nội dung phát biểu, báo cáo của bộ phận, các chỉ đạo/góp ý cốt lõi của sếp (${chairmanName} hoặc người chủ trì). Viết đầy đủ nghiệp vụ dài từ 2-4 câu, KHÔNG tóm tắt sơ sài chung chung.
      * "assignee": Bộ phận hoặc Cá nhân chịu trách nhiệm chính (Ví dụ: "Tất cả", "Mr A", "P. HCNS", "P. MKT", "P. QLDA", "BĐH", "Mr B"). Cố gắng chuẩn hoá tên.
      * "coop": Bộ phận phối hợp (nếu có, ví dụ: "Tất cả", "P. Nhân sự", "Mr A"). Nếu không có thì để "".
      * "deadline": Hạn hoàn thành cụ thể (Ví dụ: "Trước 11/07/2026", "Nắm chủ trương thực hiện", "Đang vận hành").
      * "is_header": false

━━━ ĐỊNH DẠNG ĐẦU RA (JSON CHUẨN) ━━━
{
  "title": "...",
  "meeting_date": "YYYY-MM-DD",
  "start_time": "HH:MM",
  "end_time": "HH:MM",
  "location": "...",
  "secretary": "...",
  "attendees": ["...", "..."],
  "project_name": "...",
  "package_name": "...",
  "transcript_clean": "...",
  "summary": "...",
  "action_items": [
    {
      "stt": "A",
      "content": "MỤC ĐÍCH CUỘC HỌP",
      "assignee": "",
      "coop": "",
      "deadline": "",
      "is_header": true
    },
    {
      "stt": 1,
      "content": "...",
      "assignee": "...",
      "coop": "...",
      "deadline": "...",
      "is_header": false
    }
  ]
}
`.trim();

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng kiểm tra cài đặt." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { meetingId, transcriptRaw } = body;

    if (!meetingId || !transcriptRaw) {
      return NextResponse.json({ error: "Thiếu meetingId hoặc transcriptRaw." }, { status: 400 });
    }

    // RLS on meetings blocks the shared anon client: the UPDATE below would
    // silently match 0 rows and the AI result would never be saved. Use the
    // caller's session token (same pattern as /api/export-template).
    const supabaseToken = req.headers.get("x-supabase-auth");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const dbClient = (supabaseToken && supabaseUrl && supabaseAnonKey)
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${supabaseToken}` } }
        })
      : supabase;

    // GATE GÓI DỊCH VỤ: Biên bản họp AI thuộc gói Enterprise (tenant_config.plan)
    const { data: planRow } = await dbClient
      .from("tenant_config").select("value").eq("key", "plan").maybeSingle();
    if (!isFeatureAllowed(normalizePlan(planRow?.value), "meeting_ai")) {
      return NextResponse.json({
        error: "Tính năng Biên bản họp AI thuộc gói Enterprise. Vui lòng liên hệ Quản trị viên để nâng cấp gói dịch vụ."
      }, { status: 403 });
    }

    // 1. Call OpenAI
    const openai = new OpenAI({ apiKey });
    const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Tên công ty + người chủ trì mặc định lấy từ tenant_config (company_name, chairman_name)
    const tenantCfg = await getTenantConfigServer();
    const SYSTEM_PROMPT = buildSystemPrompt(tenantCfg.company_name, tenantCfg.chairman_name);

    const completion = await openai.chat.completions.create({
      model: model === "gpt-4o-mini" ? "gpt-4o-mini" : model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Hãy chắt lọc các ý chính trọng tâm từ bản gỡ băng sau và trích xuất dữ liệu JSON:\n\n${transcriptRaw}` }
      ],
      temperature: 0.1, // Strict factual focus
      response_format: { type: "json_object" }
    });

    const reply = completion.choices[0]?.message?.content || "{}";
    const ext = JSON.parse(reply);

    // Format date if empty
    const today = new Date().toISOString().split("T")[0];
    const meetingDate = ext.meeting_date || today;

    // 2. Update meetings table with extracted AI details & metadata
    const { data: updatedRows, error: dbError } = await dbClient
      .from("meetings")
      .update({
        title: ext.title || "Cuộc họp giao ban không tên",
        meeting_date: meetingDate,
        start_time: ext.start_time || "09:00",
        end_time: ext.end_time || "10:30",
        location: ext.location || "Văn phòng công ty",
        secretary: ext.secretary || "",
        attendees: ext.attendees || [],
        project_name: ext.project_name || "",
        package_name: ext.package_name || "",
        transcript_clean: ext.transcript_clean || "",
        summary: ext.summary || "",
        action_items: ext.action_items || []
      })
      .eq("id", meetingId)
      .select("id");

    if (dbError) {
      throw new Error(`Lỗi cập nhật CSDL: ${dbError.message}`);
    }

    // RLS chặn sẽ trả về 0 dòng mà không báo lỗi — phải bắt tường minh,
    // nếu không client tưởng thành công nhưng biên bản vẫn trống metadata.
    if (!updatedRows || updatedRows.length === 0) {
      throw new Error("Không lưu được kết quả phân tích vào biên bản (bị chặn bởi quyền truy cập CSDL). Vui lòng đăng nhập lại và thử lần nữa.");
    }

    return NextResponse.json({
      success: true,
      data: ext
    });
  } catch (err: any) {
    console.error("AI processing error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi phân tích AI" }, { status: 500 });
  }
}

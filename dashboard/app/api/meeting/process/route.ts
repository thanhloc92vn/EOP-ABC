import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";

const SYSTEM_PROMPT = `
Bạn là Trợ lý Thư ký Trưởng cấp cao của Ban Giám Đốc Tập đoàn Trung Nam E&C. 
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
   - Gán đúng tên người phát biểu (Ví dụ: "Ông Huỳnh Giáp Nhân:", "Bà Đoàn Thị Minh Thương:").
   - Chỉ giữ lại các ý kiến đóng góp mang tính chuyên môn, báo cáo số liệu thực tế và các câu chỉ đạo quan trọng của Chủ trì.
4. TÓM TẮT TRỌNG TÂM ("summary"):
   - Viết bản tóm tắt từ 1 đến 3 đoạn văn ngắn gọn nêu rõ: Mục đích cuộc họp, các chủ trương chỉ đạo cốt lõi của Chủ trì và các mốc thời gian quan trọng.
5. BÓC TÁCH ĐẦU VIỆC ("action_items"):
   - Trích xuất mảng JSON chứa các nhiệm vụ cụ thể được giao. Mỗi đầu việc phải rõ ràng, không trùng lặp:
     * "stt": Số thứ tự (1, 2, 3...)
     * "content": Nội dung công việc cụ thể, gắn liền với mục tiêu xử lý
     * "assignee": Bộ phận hoặc Cá nhân chịu trách nhiệm chính (Ví dụ: "BĐH", "P. KHĐT", "P. QLDA", "P. VTTB", "Mr Hưng"). Cố gắng chuẩn hóa tên phòng ban/nhân sự.
     * "coop": Bộ phận phối hợp thực hiện (nếu có).
     * "deadline": Hạn hoàn thành cụ thể (Ví dụ: "25/05/2026", "Trước 30/05/2026", "Nắm chủ trương thực hiện").

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
      "stt": 1,
      "content": "...",
      "assignee": "...",
      "coop": "...",
      "deadline": "..."
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

    // 1. Call OpenAI
    const openai = new OpenAI({ apiKey });
    const model = req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o-mini";
    
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
    const { error: dbError } = await supabase
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
      .eq("id", meetingId);

    if (dbError) {
      throw new Error(`Lỗi cập nhật CSDL: ${dbError.message}`);
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

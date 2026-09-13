import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import { normalizePlan, isFeatureAllowed } from "@/lib/planShared";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";
import { normalizeMeetingModel } from "@/lib/meetingModels";

// Phân tích transcript dài có thể mất vài phút; tránh Vercel timeout trả về non-JSON.
export const maxDuration = 300;

type Segment = { speaker: string; start: number; end: number; text: string };

/** Đổi số giây thành HH:MM:SS để đưa mốc giờ thật vào prompt. */
function toClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Dựng transcript đưa cho model: mỗi dòng có MỐC GIỜ THẬT và TÊN NGƯỜI NÓI.
 *
 * Đây là thay đổi cốt lõi so với bản cũ. Trước đây model nhận một khối text
 * phẳng không giờ, không người nói, nhưng lại bị yêu cầu dựng timeline và gán
 * tên người phát biểu — nên nó buộc phải bịa cả hai. Giờ cả hai đều là dữ liệu
 * thật do khâu gỡ băng (diarization) và đồng hồ lúc ghi âm cung cấp.
 */
function buildTimedTranscript(
  segments: Segment[],
  speakerMap: Record<string, string>,
  recordingStartedAt: string | null
): string {
  const base = recordingStartedAt ? new Date(recordingStartedAt) : null;

  return segments
    .map((s) => {
      const name = speakerMap[s.speaker] || s.speaker;
      let stamp: string;
      if (base && !isNaN(base.getTime())) {
        const abs = new Date(base.getTime() + s.start * 1000);
        stamp = abs.toLocaleTimeString("vi-VN", { hour12: false, timeZone: "Asia/Ho_Chi_Minh" });
      } else {
        stamp = toClock(s.start);
      }
      return `[${stamp}] (t=${Math.floor(s.start)}s) ${name}: ${s.text}`;
    })
    .join("\n");
}

/**
 * Ba trạng thái của trục thời gian — phải phân biệt rạch ròi, vì nói dối model
 * ở chỗ này là sinh ra đúng loại bịa mà cả module đang tìm cách loại bỏ:
 *
 *   "clock"    — có mốc giờ đồng hồ thật (ghi âm trong app, biết giờ bấm Ghi).
 *   "relative" — có mốc thời gian nhưng chỉ là khoảng cách tính từ đầu bản ghi
 *                (file tải lên). 00:00 ở đây nghĩa là "phút thứ 0 của file",
 *                KHÔNG phải "cuộc họp bắt đầu lúc 0 giờ". Bản đầu tiên gộp
 *                trạng thái này vào "clock" nên biên bản ghi giờ họp 00:00-00:01.
 *   "none"     — không có mốc nào (biên bản cũ, transcript text thuần).
 */
type TimelineMode = "clock" | "relative" | "none";

const buildSystemPrompt = (
  companyName: string,
  chairmanName: string,
  roster: string[],
  timelineMode: TimelineMode
) => {
  const hasRealTimeline = timelineMode === "clock";
  return `
Bạn là Trợ lý Thư ký Trưởng cấp cao của Ban Giám Đốc công ty ${companyName}.
Nhiệm vụ của bạn là nhận văn bản gỡ băng cuộc họp, LỌC BỎ HOÀN TOÀN các đoạn nói chuyện phiếm, thảo luận lan man ngoài lề, ý kiến trùng lặp hoặc từ ngữ rườm rà. Hãy tập trung 100% VÀO CÁC Ý CHÍNH TRỌNG TÂM, KẾT LUẬN CỦA CHỦ TRÌ VÀ CÁC ĐẦU VIỆC ĐƯỢC GIAO.

━━ QUY TẮC TUYỆT ĐỐI VỀ TÍNH TRUNG THỰC (VI PHẠM LÀ HỎNG BIÊN BẢN) ━━
${roster.length > 0
  ? `• DANH SÁCH NGƯỜI DỰ HỌP ĐÃ ĐƯỢC XÁC NHẬN: ${roster.join("; ")}.
   Chỉ được dùng tên trong danh sách này. TUYỆT ĐỐI KHÔNG bịa ra tên người khác.`
  : `• KHÔNG có danh sách người dự họp được xác nhận.`}
• Nếu không chắc chắn ai là người phát biểu, hãy ghi theo vai trò hoặc bộ phận
  ("Đại diện P. QLDA", "Đại diện Ban điều hành"). TUYỆT ĐỐI KHÔNG tự nghĩ ra một
  cái tên nghe hợp lý. Thà ghi chung chung còn hơn gán sai trách nhiệm cho người thật.
• Mọi số liệu (khối lượng, giá trị, phần trăm, ngày tháng) phải LẤY NGUYÊN từ bản
  gỡ băng. Không làm tròn, không suy diễn, không điền số cho "đẹp biên bản".
• Nếu một thông tin không xuất hiện trong bản gỡ băng, hãy để chuỗi rỗng "".
  TUYỆT ĐỐI KHÔNG điền giá trị phỏng đoán để lấp chỗ trống.
${timelineMode === "clock"
  ? `• Mỗi dòng transcript có dạng [HH:MM:SS] (t=<số giây>) Tên người nói: nội dung.
   Mốc [HH:MM:SS] là GIỜ ĐỒNG HỒ THẬT đã đo được — hãy dùng đúng các mốc này cho
   phần timeline. KHÔNG tự nghĩ ra mốc giờ khác.`
  : timelineMode === "relative"
  ? `• Mỗi dòng transcript có dạng [HH:MM:SS] (t=<số giây>) Tên người nói: nội dung.
   CẢNH BÁO QUAN TRỌNG: mốc [HH:MM:SS] ở đây KHÔNG PHẢI giờ đồng hồ, mà là
   KHOẢNG THỜI GIAN TÍNH TỪ ĐẦU BẢN GHI. "[00:00:00]" nghĩa là "phút thứ 0 của
   file ghi âm", TUYỆT ĐỐI KHÔNG có nghĩa là "cuộc họp bắt đầu lúc 0 giờ".
   Vì vậy: KHÔNG được suy ra giờ họp từ các mốc này, và phần timeline phải ghi
   dạng khoảng thời gian ("Từ phút 00:00 đến 00:37: ..."), không ghi như giờ đồng hồ.`
  : `• Bản gỡ băng này KHÔNG có mốc thời gian. Vì vậy phần timeline phải trình bày
   theo TRÌNH TỰ ("1.", "2.", "3."), TUYỆT ĐỐI KHÔNG được bịa ra giờ cụ thể.`}

━━ QUY TẮC PHÂN TÍCH VÀ CHẮT LỌC NỘI DUNG ━━
1. BỎ QUA HOÀN TOÀN:
   - Các câu chào hỏi, tán gẫu, trò chuyện cá nhân ngoài lề.
   - Các đoạn tranh luận dông dài không đi đến kết luận.
   - Các từ đệm thừa (à, ừ, thì, là, hả, vâng, nhỉ, nhé, cái này, cái kia...).
2. CHỈ TRÍCH XUẤT CÁC THÔNG TIN TRỌNG TÂM:
   - "title": Tên cuộc họp súc tích, phản ánh đúng chủ đề trọng tâm chính (Ví dụ: "Họp giao ban giải quyết vướng mắc dự án Tây Ninh & Rạch Xuyên Tâm").
   - "meeting_date": Ngày diễn ra cuộc họp (YYYY-MM-DD). Chỉ điền nếu được nhắc tới trong bản gỡ băng, nếu không thì để rỗng "".
   - "start_time" / "end_time": Giờ đồng hồ bắt đầu và kết thúc cuộc họp (HH:MM). ${hasRealTimeline
     ? "Lấy từ mốc giờ thật của dòng đầu và dòng cuối."
     : 'CHỈ điền nếu có người NÓI RA trong cuộc họp (ví dụ "bây giờ là 9 giờ rưỡi"). Nếu không ai nhắc tới thì để rỗng "" — TUYỆT ĐỐI KHÔNG lấy mốc thời gian của bản ghi làm giờ họp.'}
   - "location": Địa điểm họp. Không nghe thấy thì để rỗng "".
   - "secretary": Thư ký ghi chép. Không nghe thấy thì để rỗng "".
   - "attendees": Mảng tên các thành viên tham dự${roster.length > 0 ? " (chỉ lấy từ danh sách đã xác nhận ở trên)" : ""}.
   - "project_name": Tên dự án chính được thảo luận. Không rõ thì để rỗng "".
   - "package_name": Tên gói thầu liên quan. Không rõ thì để rỗng "".
3. TRÍCH XUẤT NỘI DUNG CHI TIẾT ("transcript_clean"):
   - Biên tập lại bản gỡ băng thành các đoạn thoại ngắn gọn, lịch sự, chuẩn mực ngôn ngữ doanh nghiệp.
   - Giữ nguyên tên người phát biểu như trong bản gỡ băng (Ví dụ: "Ông ${chairmanName}:").
   - Chỉ giữ lại các ý kiến chuyên môn, báo cáo số liệu thực tế và các câu chỉ đạo quan trọng của Chủ trì.
4. TÓM TẮT TRỌNG TÂM & DIỄN BIẾN CUỘC HỌP ("summary"):
    - Trình bày chi tiết, chuyên nghiệp và chia làm 2 phần rõ rệt bằng tiếng Việt:
      * "PHẦN 1: TÓM TẮT DIỄN BIẾN CUỘC HỌP" (Nêu rõ bối cảnh, lý do họp, các báo cáo chính và các ý kiến đóng góp/thảo luận quan trọng của các bộ phận).
      * "PHẦN 2: TIẾN TRÌNH & TIMELINE CHI TIẾT" (${timelineMode === "clock"
        ? "Dùng đúng các mốc [HH:MM:SS] có trong bản gỡ băng, gom thành từng khối nội dung. Ví dụ: \"09:05 - 09:20: Báo cáo tiến độ...\"."
        : timelineMode === "relative"
        ? "Gom thành từng khối theo KHOẢNG THỜI GIAN của bản ghi. Ví dụ: \"Phút 00:00 - 00:37: Báo cáo tiến độ...\". KHÔNG viết như giờ đồng hồ."
        : "Trình bày theo trình tự phát biểu: \"1. Báo cáo tiến độ dự án...\", \"2. Ý kiến phản hồi của P. KHĐT...\"."} Phần này cần chi tiết, kèm số liệu thực tế được nhắc đến).
5. BÓC TÁCH NỘI DUNG CUỘC HỌP & ĐẦU VIỆC ("action_items"):
    - Trích xuất mảng JSON chứa toàn bộ nội dung diễn biến cuộc họp và các đầu việc được giao, phân tách theo các mục chính (như mẫu Biên bản họp của công ty).
    - Các phần chính bắt buộc phải xuất hiện (tương ứng với các dòng Tiêu đề phần trong mảng action_items):
      * Mục A: "A. MỤC ĐÍCH CUỘC HỌP"
      * Mục B: "B. SỰ CẦN THIẾT TRIỂN KHAI" hoặc "BỐI CẢNH/HIỆN TRẠNG"
      * Mục C: "C. TỔNG QUAN LỘ TRÌNH TRIỂN KHAI" hoặc "DIỄN BIẾN THẢO LUẬN"
      * Mục D: "D. PHÂN CÔNG NHIỆM VỤ CHI TIẾT" (hoặc mục tiêu cụ thể khác được bàn bạc).

    - Đối với mỗi dòng Tiêu đề mục (Ví dụ: "A. MỤC ĐÍCH CUỘC HỌP"):
      * "stt": Chữ cái mục ("A", "B", "C", "D")
      * "content": Tên của mục viết hoa
      * "assignee": "", "coop": "", "deadline": "", "ts": null
      * "is_header": true

    - Đối với các dòng nội dung chi tiết hoặc công việc cụ thể nằm dưới từng mục:
      * "stt": Số thứ tự dạng số (1, 2, 3...)
      * "content": Mô tả đầy đủ, chi tiết, chuyên nghiệp nội dung phát biểu, báo cáo của bộ phận, các chỉ đạo/góp ý cốt lõi của người chủ trì. Viết đầy đủ nghiệp vụ dài từ 2-4 câu, KHÔNG tóm tắt sơ sài chung chung.
      * "assignee": Bộ phận hoặc Cá nhân chịu trách nhiệm chính (Ví dụ: "Tất cả", "P. HCNS", "P. MKT", "P. QLDA", "BĐH"). Chỉ dùng tên người nếu chắc chắn. Không rõ thì để "".
      * "coop": Bộ phận phối hợp. Không có thì để "".
      * "deadline": Hạn hoàn thành CHỈ KHI được nói rõ trong cuộc họp. Không nghe thấy thì để "".
      * "ts": ${timelineMode !== "none"
        ? 'Số giây (t=<số>) của dòng transcript mà bạn căn cứ để viết mục này — để người đọc tua lại đúng đoạn ghi âm kiểm chứng. BẮT BUỘC điền cho mọi dòng không phải tiêu đề.'
        : "null (bản gỡ băng này không có mốc thời gian)."}
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
    { "stt": "A", "content": "MỤC ĐÍCH CUỘC HỌP", "assignee": "", "coop": "", "deadline": "", "ts": null, "is_header": true },
    { "stt": 1, "content": "...", "assignee": "...", "coop": "...", "deadline": "...", "ts": 125, "is_header": false }
  ]
}
`.trim();
};

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

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
    const { meetingId, transcriptRaw, roster } = body;

    if (!meetingId) {
      return NextResponse.json({ error: "Thiếu meetingId." }, { status: 400 });
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

    // GATE GÓI DỊCH VỤ: Biên bản họp AI theo cấu hình gói (tenant_config.plan)
    const { data: planRow } = await dbClient
      .from("tenant_config").select("value").eq("key", "plan").maybeSingle();
    if (!isFeatureAllowed(normalizePlan(planRow?.value), "meeting_ai")) {
      return NextResponse.json({
        error: "Tính năng Biên bản họp AI chưa có trong gói dịch vụ hiện tại. Vui lòng liên hệ Quản trị viên để nâng cấp gói."
      }, { status: 403 });
    }

    // 1. Lấy dữ liệu gỡ băng đã tách người nói (nếu có) để dựng transcript có
    //    mốc giờ thật. Biên bản cũ / file tải lên thủ công thì rơi về text phẳng.
    const { data: meetingRow } = await dbClient
      .from("meetings")
      .select("transcript_raw, transcript_segments, speaker_map, recording_started_at")
      .eq("id", meetingId)
      .maybeSingle();

    const segments: Segment[] = Array.isArray(meetingRow?.transcript_segments)
      ? meetingRow.transcript_segments
      : [];
    const speakerMap: Record<string, string> = (meetingRow?.speaker_map as any) || {};
    const hasRealTimeline = segments.length > 0;
    // Ghi âm trong app mới biết được giờ đồng hồ; file tải lên chỉ có khoảng
    // thời gian tính từ đầu bản ghi.
    const timelineMode: TimelineMode =
      !hasRealTimeline ? "none" : meetingRow?.recording_started_at ? "clock" : "relative";

    const transcriptForModel = hasRealTimeline
      ? buildTimedTranscript(segments, speakerMap, meetingRow?.recording_started_at || null)
      : (transcriptRaw || meetingRow?.transcript_raw || "");

    if (!transcriptForModel || transcriptForModel.trim().length === 0) {
      return NextResponse.json({ error: "Biên bản chưa có nội dung gỡ băng để phân tích." }, { status: 400 });
    }

    // 2. Call OpenAI
    const openai = new OpenAI({ apiKey });
    const model = normalizeMeetingModel(
      req.headers.get("x-openai-model") || process.env.OPENAI_MODEL
    );

    // Tên công ty + người chủ trì mặc định lấy từ tenant_config (company_name, chairman_name)
    const tenantCfg = await getTenantConfigServer();
    const rosterNames: string[] = Array.isArray(roster)
      ? roster.filter((r: any) => typeof r === "string" && r.trim()).map((r: string) => r.trim())
      : [];
    const SYSTEM_PROMPT = buildSystemPrompt(
      tenantCfg.company_name,
      tenantCfg.chairman_name,
      rosterNames,
      timelineMode
    );

    // Lưu ý: dòng 5.6 là model suy luận, KHÔNG truyền `temperature` (mặc định là
    // giá trị duy nhất được chấp nhận). Điều tiết bằng `reasoning_effort` thay thế.
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Hãy chắt lọc các ý chính trọng tâm từ bản gỡ băng sau và trích xuất dữ liệu JSON:\n\n${transcriptForModel}` }
      ],
      reasoning_effort: "high",
      response_format: { type: "json_object" }
    } as any);

    const reply = completion.choices[0]?.message?.content || "{}";
    const ext = JSON.parse(reply);

    // 3. Mốc giờ bắt đầu/kết thúc: ưu tiên giờ đo được thật từ lúc ghi âm, chỉ
    //    dùng giá trị model trích ra khi không có dữ liệu ghi âm. KHÔNG còn điền
    //    cứng "09:00"/"10:30" như bản cũ — thà để trống cho thư ký tự điền.
    let startTime = ext.start_time || "";
    let endTime = ext.end_time || "";

    // Chốt chặn cuối: với file tải lên, các mốc trong transcript là khoảng thời
    // gian chứ không phải giờ đồng hồ. Nếu model vẫn lỡ chép chúng thành giờ họp
    // (kiểu 00:00 - 00:01) thì bỏ đi, để trống cho thư ký điền — biên bản ghi
    // cuộc họp diễn ra lúc 0 giờ là sai rõ ràng.
    if (timelineMode === "relative") {
      const looksLikeOffset = (v: string) => /^0?0:\d{2}$/.test(v.trim());
      if (looksLikeOffset(startTime)) startTime = "";
      if (looksLikeOffset(endTime)) endTime = "";
    }

    if (timelineMode === "clock" && meetingRow?.recording_started_at) {
      const base = new Date(meetingRow.recording_started_at);
      if (!isNaN(base.getTime())) {
        const fmt = (offsetSec: number) =>
          new Date(base.getTime() + offsetSec * 1000).toLocaleTimeString("vi-VN", {
            hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh",
          });
        startTime = fmt(segments[0].start);
        endTime = fmt(segments[segments.length - 1].end);
      }
    }

    // 4. Update meetings table with extracted AI details & metadata
    const { data: updatedRows, error: dbError } = await dbClient
      .from("meetings")
      .update({
        title: ext.title || "Cuộc họp giao ban không tên",
        meeting_date: ext.meeting_date || new Date().toISOString().split("T")[0],
        start_time: startTime,
        end_time: endTime,
        location: ext.location || "",
        secretary: ext.secretary || "",
        attendees: ext.attendees || [],
        project_name: ext.project_name || "",
        package_name: ext.package_name || "",
        transcript_clean: ext.transcript_clean || "",
        summary: ext.summary || "",
        action_items: ext.action_items || [],
        ai_model: model
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
      data: { ...ext, start_time: startTime, end_time: endTime },
      model,
      used_real_timeline: hasRealTimeline,
      timeline_mode: timelineMode
    });
  } catch (err: any) {
    console.error("AI processing error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi phân tích AI" }, { status: 500 });
  }
}

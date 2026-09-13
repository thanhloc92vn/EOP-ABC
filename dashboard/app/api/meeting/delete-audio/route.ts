import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// ============================================================
// DỌN FILE GHI ÂM SAU KHI ĐÃ CÓ BIÊN BẢN
//
// Một cuộc họp 2 tiếng ghi ở opus 32kbps nặng khoảng 29MB. 100 cuộc họp là gần
// 3GB, trong khi gói Supabase miễn phí chỉ có 1GB. Bản gỡ băng thì ngược lại —
// 2 tiếng chỉ khoảng 100KB text. Nên sau khi biên bản đã chốt và xuất Word,
// xoá audio giữ transcript tiết kiệm khoảng 99% dung lượng mà vẫn phân tích lại
// được bất cứ lúc nào, không tốn tiền gỡ băng lần nữa.
//
// HAI CHỐT CHẶN AN TOÀN (không bỏ qua được từ giao diện):
//   1. Biên bản phải ở trạng thái `confirmed` — bản nháp chưa chốt thì còn có
//      thể phải nghe lại, không cho xoá.
//   2. `transcript_raw` phải còn nội dung — để không bao giờ xảy ra trường hợp
//      mất cả audio lẫn bản gỡ băng, tức là mất trắng cuộc họp.
// ============================================================

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const { meetingId } = await req.json();
    if (!meetingId) {
      return NextResponse.json({ error: "Thiếu meetingId." }, { status: 400 });
    }

    const supabaseToken = req.headers.get("x-supabase-auth");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const dbClient = (supabaseToken && supabaseUrl && supabaseAnonKey)
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${supabaseToken}` } }
        })
      : supabase;

    const { data: meeting, error: fetchError } = await dbClient
      .from("meetings")
      .select("id, title, status, transcript_raw, audio_paths, audio_url, audio_deleted_at")
      .eq("id", meetingId)
      .maybeSingle();

    if (fetchError || !meeting) {
      return NextResponse.json(
        { error: `Không tìm thấy biên bản: ${fetchError?.message || "Rỗng"}` },
        { status: 404 }
      );
    }

    if (meeting.audio_deleted_at) {
      return NextResponse.json(
        { error: "File ghi âm của biên bản này đã được dọn trước đó." },
        { status: 400 }
      );
    }

    // ─── Chốt chặn 1: phải đã khoá biên bản ───
    if (meeting.status !== "confirmed") {
      return NextResponse.json({
        error: "Chỉ dọn được file ghi âm của biên bản ĐÃ KHOÁ. Vui lòng bấm \"Khóa biên bản & Tạo Task\" trước, rồi hãy dọn file ghi âm."
      }, { status: 400 });
    }

    // ─── Chốt chặn 2: bản gỡ băng phải còn ───
    if (!meeting.transcript_raw || meeting.transcript_raw.trim().length === 0) {
      return NextResponse.json({
        error: "Biên bản này không còn bản gỡ băng. Xoá file ghi âm sẽ mất trắng nội dung cuộc họp nên hệ thống từ chối thực hiện."
      }, { status: 400 });
    }

    const paths: string[] = Array.isArray(meeting.audio_paths)
      ? meeting.audio_paths.filter((p: any) => typeof p === "string" && p)
      : [];

    if (paths.length === 0) {
      return NextResponse.json({
        error: "Không tìm thấy đường dẫn file ghi âm của biên bản này (có thể là biên bản cũ tạo trước khi hệ thống lưu danh sách file). Vui lòng xoá thủ công trong Supabase Storage."
      }, { status: 400 });
    }

    const { error: removeError } = await dbClient.storage.from("meetings").remove(paths);
    if (removeError) {
      return NextResponse.json(
        { error: `Không xoá được file trong kho lưu trữ: ${removeError.message}` },
        { status: 500 }
      );
    }

    // Giữ nguyên `audio_paths` làm dấu vết những gì đã xoá; xoá `audio_url` để
    // giao diện không còn chào mời một trình phát đã chết.
    const { error: updateError } = await dbClient
      .from("meetings")
      .update({
        audio_url: "",
        audio_deleted_at: new Date().toISOString(),
        audio_deleted_by: auth.caller.email,
      })
      .eq("id", meetingId);

    if (updateError) {
      return NextResponse.json(
        { error: `Đã xoá file nhưng không cập nhật được trạng thái: ${updateError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted_count: paths.length,
      message: `Đã dọn ${paths.length} file ghi âm. Bản gỡ băng và biên bản vẫn được giữ nguyên.`,
    });
  } catch (err: any) {
    console.error("Delete meeting audio error:", err);
    return NextResponse.json({ error: err.message || "Lỗi khi dọn file ghi âm" }, { status: 500 });
  }
}

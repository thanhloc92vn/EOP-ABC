import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";
import { normalizePlan, isFeatureAllowed } from "@/lib/planShared";
import {
  TRANSCRIBE_MODEL,
  OPENAI_AUDIO_MAX_BYTES,
  MAX_KNOWN_SPEAKERS,
} from "@/lib/meetingModels";

// Gỡ băng một đoạn 20 phút mất vài chục giây tới vài phút; mặc định Vercel cắt
// function sớm hơn khiến client nhận trang lỗi HTML/text ("A server error...")
// thay vì JSON.
export const maxDuration = 300;

type DiarizedSegment = {
  speaker: string;
  start: number;
  end: number;
  text: string;
};

/**
 * Phát hiện AI gỡ băng bị lặp vòng (hallucination): đầu ra là rác lặp đi lặp
 * lại, dấu hiệu model không nghe được nội dung thật (file nén quá mức, chất
 * lượng quá thấp, hoặc im lặng kéo dài).
 *
 * QUAN TRỌNG — khác với bản cũ: hàm này CHỈ CẢNH BÁO, không còn được dùng để
 * vứt bỏ nội dung. Trước đây đoạn nào bị gắn cờ là bị loại khỏi transcript,
 * nghĩa là 20 phút họp biến mất khỏi biên bản mà chỉ hiện một dòng log nhỏ.
 * Giờ nội dung luôn được giữ, thư ký tự nhìn và quyết định.
 */
function detectHallucination(text: string): { isHallucination: boolean; warning: string } {
  if (!text || text.length < 50) {
    return { isHallucination: true, warning: "Bản gỡ băng quá ngắn hoặc rỗng. File âm thanh có thể bị hỏng hoặc không có giọng nói." };
  }

  // Chỉ xét các câu đủ dài (>15 ký tự) để bỏ qua các câu đệm ngắn tự nhiên trong hội thoại
  // (VD: "Vâng ạ.", "Dạ đúng rồi.", "Cảm ơn anh.") - những câu này lặp lại nhiều lần là bình thường,
  // không phải dấu hiệu model bị lặp vòng (hallucination).
  const sentences = text.split(/[.!?。]+/).map(s => s.trim()).filter(s => s.length > 15);

  // Cần đủ số lượng câu dài mới xét, tránh báo nhầm với các bản ghi ngắn/ít câu
  if (sentences.length < 15) {
    return { isHallucination: false, warning: "" };
  }

  // Đếm số lần lặp của câu dài xuất hiện nhiều nhất
  const counts: Record<string, number> = {};
  for (const s of sentences) counts[s] = (counts[s] || 0) + 1;
  const uniqueSentences = new Set(sentences);
  const uniqueRatio = uniqueSentences.size / sentences.length;
  const mostRepeated = findMostRepeatedSentence(sentences);
  const mostRepeatedCount = counts[mostRepeated] || 0;

  // Chỉ báo lỗi khi vừa có tỉ lệ trùng lặp cao (< 15% câu độc nhất) VỪA có 1 câu dài lặp lại
  // rất nhiều lần (>= 8 lần) - kết hợp 2 điều kiện để giảm báo sai với các cuộc họp dài, tự nhiên.
  if (uniqueRatio < 0.15 && mostRepeatedCount >= 8) {
    return {
      isHallucination: true,
      warning: `Phát hiện dấu hiệu lặp vòng của AI gỡ băng: chỉ có ${uniqueSentences.size} câu độc nhất trong tổng số ${sentences.length} câu (${(uniqueRatio * 100).toFixed(0)}% độc nhất), trong đó câu "${mostRepeated.substring(0, 80)}..." lặp lại ${mostRepeatedCount} lần. Nguyên nhân thường gặp: micro quá xa người nói, file nén quá mức, hoặc đoạn im lặng dài. Nội dung vẫn được giữ lại — vui lòng đọc kiểm tra đoạn này trong tab Bản gỡ băng.`
    };
  }

  // Check for known hallucination phrases (thường gặp ở nội dung ngoài ngữ cảnh họp, kiểu YouTube outro)
  const hallucinationPhrases = [
    "tạm biệt",
    "hẹn gặp lại",
    "cảm ơn các bạn đã theo dõi",
    "đừng quên like",
    "đăng ký kênh",
    "subscribe",
    "video tiếp theo",
    "thank you for watching",
  ];

  const lowerText = text.toLowerCase();
  for (const phrase of hallucinationPhrases) {
    const regex = new RegExp(phrase, "gi");
    const matches = lowerText.match(regex);
    if (matches && matches.length > 8) {
      return {
        isHallucination: true,
        warning: `Phát hiện dấu hiệu lặp vòng: cụm từ "${phrase}" xuất hiện ${matches.length} lần trong đoạn này — dấu hiệu AI không nghe được nội dung thực tế. Nội dung vẫn được giữ lại để bạn kiểm tra, nhưng nên nghe lại đoạn ghi âm gốc.`
      };
    }
  }

  return { isHallucination: false, warning: "" };
}

function findMostRepeatedSentence(sentences: string[]): string {
  const counts: Record<string, number> = {};
  for (const s of sentences) {
    counts[s] = (counts[s] || 0) + 1;
  }
  let maxSentence = "";
  let maxCount = 0;
  for (const [sentence, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      maxSentence = sentence;
    }
  }
  return maxSentence;
}

/**
 * Nạp mẫu giọng của những người đã chọn thành data URL để truyền vào tham số
 * known_speaker_references. OpenAI nhận tối đa 4 mẫu, mỗi mẫu dài 2-10 giây.
 * Nhờ đó bản gỡ băng ghi thẳng "Huỳnh Giáp Nhân:" thay vì "Speaker 1:".
 */
async function loadKnownSpeakers(
  dbClient: any,
  employeeIds: string[]
): Promise<{ names: string[]; references: string[] }> {
  const names: string[] = [];
  const references: string[] = [];
  if (!employeeIds || employeeIds.length === 0) return { names, references };

  // Đọc qua view `employees_directory` (mọi tài khoản đăng nhập đều select
  // được) chứ không phải bảng gốc `employees` — bảng gốc chỉ mở cho người có
  // quyền xem PII, thư ký thường sẽ không đọc nổi (xem migration 011).
  const { data: rows } = await dbClient
    .from("employees_directory")
    .select("id, name, voice_sample_path")
    .in("id", employeeIds.slice(0, MAX_KNOWN_SPEAKERS))
    .not("voice_sample_path", "is", null);

  for (const row of rows || []) {
    if (!row.voice_sample_path) continue;
    try {
      const { data: sample, error } = await dbClient.storage
        .from("meetings")
        .download(row.voice_sample_path);
      if (error || !sample) continue;

      const base64 = Buffer.from(await sample.arrayBuffer()).toString("base64");
      const mime = sample.type || "audio/webm";
      names.push(row.name);
      references.push(`data:${mime};base64,${base64}`);
    } catch {
      // Mẫu giọng lỗi thì bỏ qua người đó, vẫn gỡ băng bình thường với nhãn máy
    }
  }

  return { names, references };
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  let tempFilePath = "";
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
    const { meetingId, audioPath, offsetSec, knownSpeakerIds } = body;

    if (!meetingId || !audioPath) {
      return NextResponse.json({ error: "Thiếu meetingId hoặc audioPath." }, { status: 400 });
    }

    // Mốc thời gian của đoạn này tính từ lúc bắt đầu ghi âm, dùng để quy các mốc
    // start/end trong đoạn về timeline chung của cả cuộc họp.
    const segmentOffset = Number(offsetSec) || 0;

    // RLS on meetings/storage blocks the shared anon client — use the caller's
    // session token (same pattern as /api/export-template).
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

    // 1. Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await dbClient.storage
      .from("meetings")
      .download(audioPath);

    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return NextResponse.json(
        { error: `Không thể tải file ghi âm từ storage: ${downloadError?.message || "File rỗng"}` },
        { status: 500 }
      );
    }

    // 2. Write to a temporary file in the OS temp directory
    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Trần 25MB là giới hạn cứng của OpenAI, áp dụng cho mọi model gỡ băng kể cả
    // bản mới nhất. Chặn sớm ở đây để báo lỗi rõ ràng thay vì để API trả 413.
    if (buffer.length > OPENAI_AUDIO_MAX_BYTES) {
      return NextResponse.json({
        error: `Đoạn ghi âm nặng ${(buffer.length / (1024 * 1024)).toFixed(1)}MB, vượt trần 25MB mỗi lần gọi của OpenAI. Nếu đây là file tải lên thủ công, hãy cắt nhỏ dưới 20 phút mỗi đoạn — hoặc dùng chức năng Ghi âm trực tiếp trong app để hệ thống tự cắt đoạn.`
      }, { status: 400 });
    }

    const ext = audioPath.split(".").pop() || "webm";
    const tempDir = os.tmpdir();

    const tempFileName = `temp_transcribe_${meetingId}_${Date.now()}.${ext}`;
    tempFilePath = path.join(tempDir, tempFileName);
    fs.writeFileSync(tempFilePath, buffer);

    // 3. Nạp mẫu giọng (nếu có) rồi gọi API gỡ băng có tách người nói
    const { names: knownNames, references: knownRefs } = await loadKnownSpeakers(
      dbClient,
      Array.isArray(knownSpeakerIds) ? knownSpeakerIds : []
    );

    const openai = new OpenAI({ apiKey });
    const fileStream = fs.createReadStream(tempFilePath);

    // KHÔNG truyền `prompt`: model diarization từ chối tham số này
    // ("400 Prompt is not supported for diarization models"). Việc gợi ý từ vựng
    // chuyên ngành chuyển sang khâu AI dựng biên bản (/api/meeting/process),
    // nơi tên công ty và bối cảnh họp vẫn được đưa vào system prompt.
    const params: Record<string, any> = {
      file: fileStream,
      model: TRANSCRIBE_MODEL,
      response_format: "diarized_json",
      // Bắt buộc với audio dài hơn 30 giây.
      chunking_strategy: "auto",
    };
    if (knownNames.length > 0) {
      params.known_speaker_names = knownNames;
      params.known_speaker_references = knownRefs;
    }

    // Các tham số diarization còn mới hơn type định nghĩa trong SDK đang cài,
    // nên gọi qua `any` — payload vẫn đúng chuẩn API.
    const transcription: any = await (openai.audio.transcriptions.create as any)(params);

    // 4. Chuẩn hoá kết quả: dựng danh sách đoạn có người nói + mốc giờ tuyệt đối
    const rawSegments: any[] = Array.isArray(transcription?.segments) ? transcription.segments : [];
    const segments: DiarizedSegment[] = rawSegments
      .filter((s) => (s?.text || "").trim().length > 0)
      .map((s) => ({
        speaker: String(s.speaker ?? "Speaker"),
        // Quy mốc trong đoạn về timeline chung của cả cuộc họp.
        start: Number(s.start ?? 0) + segmentOffset,
        end: Number(s.end ?? 0) + segmentOffset,
        text: String(s.text || "").trim(),
      }));

    // Văn bản phẳng: ưu tiên ghép từ các đoạn đã tách người nói; nếu API chỉ trả
    // text thuần thì dùng luôn text đó.
    const rawText = segments.length > 0
      ? segments.map((s) => `${s.speaker}: ${s.text}`).join("\n")
      : String(transcription?.text || "");

    // 5. Cảnh báo lặp vòng — CHỈ cảnh báo, nội dung luôn được giữ lại
    const hallucinationCheck = detectHallucination(
      segments.length > 0 ? segments.map((s) => s.text).join(" ") : rawText
    );

    // 6. Nối thêm vào biên bản (KHÔNG ghi đè) — mỗi cuộc họp có nhiều đoạn, ghi
    // đè sẽ chỉ còn đoạn cuối nếu tiến trình chết giữa chừng.
    const { data: current } = await dbClient
      .from("meetings")
      .select("transcript_raw, transcript_segments")
      .eq("id", meetingId)
      .maybeSingle();

    const prevText = current?.transcript_raw || "";
    const prevSegments = Array.isArray(current?.transcript_segments) ? current.transcript_segments : [];

    const { error: dbError } = await dbClient
      .from("meetings")
      .update({
        transcript_raw: prevText ? `${prevText}\n${rawText}` : rawText,
        transcript_segments: [...prevSegments, ...segments],
      })
      .eq("id", meetingId);

    if (dbError) {
      throw new Error(`Lỗi cập nhật CSDL: ${dbError.message}`);
    }

    return NextResponse.json({
      success: true,
      text: rawText,
      segments,
      speakers: Array.from(new Set(segments.map((s) => s.speaker))),
      known_speakers_used: knownNames,
      is_hallucination: hallucinationCheck.isHallucination,
      hallucination_warning: hallucinationCheck.warning,
    });
  } catch (err: any) {
    console.error("Transcription API Error:", err);
    return NextResponse.json({ error: err.message || "Lỗi xử lý file âm thanh" }, { status: 500 });
  } finally {
    // Cleanup temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error("Temp file cleanup error:", cleanupErr);
      }
    }
  }
}

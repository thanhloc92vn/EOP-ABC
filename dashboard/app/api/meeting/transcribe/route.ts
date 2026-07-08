import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";

// Whisper trên file ~20MB mất vài phút; mặc định Vercel cắt function sớm hơn
// khiến client nhận trang lỗi HTML/text ("A server error...") thay vì JSON.
export const maxDuration = 300;

/**
 * Detects Whisper hallucination: repetitive garbage output that indicates
 * the model couldn't understand the audio (poor quality, over-compressed, silence).
 * 
 * Common hallucination patterns:
 * - "Tạm biệt, hẹn gặp lại các bạn..." repeated 100+ times
 * - "Cảm ơn các bạn đã theo dõi..." repeated
 * - Very few unique sentences compared to total sentence count
 */
function detectHallucination(text: string): { isHallucination: boolean; warning: string } {
  if (!text || text.length < 50) {
    return { isHallucination: true, warning: "Bản gỡ băng quá ngắn hoặc rỗng. File âm thanh có thể bị hỏng hoặc không có giọng nói." };
  }

  // Chỉ xét các câu đủ dài (>15 ký tự) để bỏ qua các câu đệm ngắn tự nhiên trong hội thoại
  // (VD: "Vâng ạ.", "Dạ đúng rồi.", "Cảm ơn anh.") - những câu này lặp lại nhiều lần là bình thường,
  // không phải dấu hiệu Whisper bị lặp vòng (hallucination).
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
      warning: `Phát hiện lỗi ảo giác (hallucination) của AI gỡ băng! Chỉ có ${uniqueSentences.size} câu độc nhất trong tổng số ${sentences.length} câu (${(uniqueRatio * 100).toFixed(0)}% độc nhất), trong đó câu "${mostRepeated.substring(0, 80)}..." lặp lại ${mostRepeatedCount} lần. Nguyên nhân: File âm thanh bị nén quá mức, chất lượng quá thấp hoặc nhiều đoạn im lặng. Vui lòng kiểm tra lại file ghi âm gốc và tải lên bản chất lượng tốt hơn (bitrate >= 48kbps).`
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
        warning: `Phát hiện lỗi ảo giác (hallucination)! Cụm từ "${phrase}" xuất hiện ${matches.length} lần trong bản gỡ băng. Đây là dấu hiệu Whisper không nghe được nội dung thực tế. Vui lòng kiểm tra lại file ghi âm gốc: đảm bảo giọng nói rõ ràng, bitrate >= 48kbps, và file không bị hỏng.`
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

export async function POST(req: NextRequest) {
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
    const { meetingId, audioPath } = body;

    if (!meetingId || !audioPath) {
      return NextResponse.json({ error: "Thiếu meetingId hoặc audioPath." }, { status: 400 });
    }

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
    const ext = audioPath.split(".").pop() || "mp3";
    const tempDir = os.tmpdir();

    const tempFileName = `temp_transcribe_${meetingId}_${Date.now()}.${ext}`;
    tempFilePath = path.join(tempDir, tempFileName);
    fs.writeFileSync(tempFilePath, buffer);

    // 3. Call OpenAI Whisper API
    const openai = new OpenAI({ apiKey });
    const fileStream = fs.createReadStream(tempFilePath);
    
    // Use a Vietnamese business-meeting prompt hint to guide Whisper (vocabulary only, no sentences to prevent hallucination loops)
    const transcription = await openai.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-1",
      language: "vi",
      prompt: "Trung Nam E&C, họp giao ban, dự án, báo cáo",
    });

    const rawText = transcription.text || "";

    // 4. Detect Whisper hallucination (repetitive garbage output)
    const hallucinationCheck = detectHallucination(rawText);

    // 5. Update meeting raw transcript in DB
    const { error: dbError } = await dbClient
      .from("meetings")
      .update({ transcript_raw: rawText })
      .eq("id", meetingId);

    if (dbError) {
      throw new Error(`Lỗi cập nhật CSDL: ${dbError.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      text: rawText,
      is_hallucination: hallucinationCheck.isHallucination,
      hallucination_warning: hallucinationCheck.warning,
    });
  } catch (err: any) {
    console.error("Transcription API Error:", err);
    return NextResponse.json({ error: err.message || "Lỗi xử lý file âm thanh" }, { status: 500 });
  } finally {
    // 5. Cleanup temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupErr) {
        console.error("Temp file cleanup error:", cleanupErr);
      }
    }
  }
}

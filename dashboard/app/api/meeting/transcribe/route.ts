import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import os from "os";

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

    // 1. Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
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
    
    const transcription = await openai.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-1",
      language: "vi", // Hint Vietnamese for better accuracy
    });

    const rawText = transcription.text || "";

    // 4. Update meeting raw transcript in DB
    const { error: dbError } = await supabase
      .from("meetings")
      .update({ transcript_raw: rawText })
      .eq("id", meetingId);

    if (dbError) {
      throw new Error(`Lỗi cập nhật CSDL: ${dbError.message}`);
    }

    return NextResponse.json({ success: true, text: rawText });
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

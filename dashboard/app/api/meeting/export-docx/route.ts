import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const { meetingId } = body;

    if (!meetingId) {
      return NextResponse.json({ error: "Thiếu meetingId." }, { status: 400 });
    }

    // RLS on meetings only allows authenticated reads — query with the caller's
    // session token (same pattern as /api/export-template), else the shared anon
    // client returns no rows and the export fails with "Cannot coerce...".
    const supabaseToken = req.headers.get("x-supabase-auth");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const dbClient = (supabaseToken && supabaseUrl && supabaseAnonKey)
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${supabaseToken}` } }
        })
      : supabase;

    // 1. Fetch meeting details from Supabase
    const { data: meeting, error: fetchError } = await dbClient
      .from("meetings")
      .select("*")
      .eq("id", meetingId)
      .single();

    if (fetchError || !meeting) {
      return NextResponse.json(
        { error: `Không tìm thấy thông tin cuộc họp: ${fetchError?.message || "Rỗng"}` },
        { status: 404 }
      );
    }

    // 2. Format dates & inputs
    const dateObj = meeting.meeting_date ? new Date(meeting.meeting_date) : new Date();
    const day = String(dateObj.getDate()).padStart(2, "0");
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const year = dateObj.getFullYear();
    
    const meeting_date_text = `${day} tháng ${month} năm ${year}`;
    const location_date = `TP.HCM, ngày ${day} tháng ${month} năm ${year}`;

    // Format list of attendees to a single string: Name (Role)
    const attendeesList = Array.isArray(meeting.attendees) ? meeting.attendees : [];
    const attendeesText = attendeesList.join(", ") || "(Trống)";

    // Prepare tasks list for Docxtemplater loop
    const rawTasks = Array.isArray(meeting.action_items) ? meeting.action_items : [];
    const tasksList = rawTasks.map((t: any, index: number) => ({
      stt: t.stt || (index + 1),
      content: t.content || "",
      assignee: t.assignee || "",
      coop: t.coop || "",
      deadline: t.deadline || "",
    }));

    // 3. Load template
    const templateFileName = "bien_ban_hop_template_1.docx";
    const templatePath = path.join(process.cwd(), "public", "templates", templateFileName);

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: `Không tìm thấy file template Word tại: ${templateFileName}` },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(templatePath, "binary");

    // 4. Initialize docxtemplater and zip
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 5. Fill data
    // Auto-generate a document number if none is set
    const docNumber = meeting.project_name 
      ? `Số: ${day}${month}/${year}/BBH/${meeting.project_name.toUpperCase()}`
      : `Số: ${day}${month}/${year}/BBH/TNE&C`;

    doc.setData({
      doc_number: meeting.doc_number || docNumber,
      location_date: location_date,
      start_time: meeting.start_time || "09:00",
      meeting_date_text: meeting_date_text,
      meeting_location: meeting.location || "Văn phòng công ty",
      meeting_title: meeting.title || "Cuộc họp giao ban",
      chair_name: meeting.chairperson || "Chưa xác định",
      chair_role: "Chủ trì",
      sec_name: meeting.secretary || "Chưa xác định",
      sec_role: "Thư ký",
      attendees_text: attendeesText,
      end_time: meeting.end_time || "10:30",
      distribution: meeting.distribution || "P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS.",
      tasks: tasksList,
      meeting_summary: meeting.summary || "Không có tóm tắt.",
    });

    // 6. Compile document
    doc.render();

    const generatedBuffer = doc.getZip().generate({
      type: "nodebuffer",
      compression: "DEFLATE",
    });

    // 7. Upload generated document to Supabase Storage
    const storageFileName = `documents/bien_ban_hop_${meetingId}.docx`;
    const { error: uploadError } = await dbClient.storage
      .from("meetings")
      .upload(storageFileName, generatedBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage document upload error:", uploadError);
      throw new Error(`Lỗi upload file lên storage: ${uploadError.message}`);
    }

    // 8. Get public URL and save it to the DB.
    // Upsert reuses the same storage path, but Supabase CDN caches public
    // objects (~1h) — version the URL so re-exports don't serve a stale file.
    const { data: { publicUrl: rawPublicUrl } } = dbClient.storage
      .from("meetings")
      .getPublicUrl(storageFileName);
    const publicUrl = `${rawPublicUrl}?v=${Date.now()}`;

    const { error: dbUpdateError } = await dbClient
      .from("meetings")
      .update({ document_url: publicUrl })
      .eq("id", meetingId);

    if (dbUpdateError) {
      console.error("DB update error:", dbUpdateError);
      throw new Error(`Lỗi cập nhật CSDL: ${dbUpdateError.message}`);
    }

    return NextResponse.json({
      success: true,
      documentUrl: publicUrl,
    });
  } catch (err: any) {
    console.error("Export docx error:", err);
    return NextResponse.json({ error: err.message || "Lỗi tạo file Word biên bản" }, { status: 500 });
  }
}

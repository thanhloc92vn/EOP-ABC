import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { supabase } from "@/lib/supabase";
import { fillWeeklyReport } from "../../../scratch/fill_weekly_report";

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { startDate, endDate, officeManualNeeds, projectManualNeeds } = data;
    let candidates = data.candidates;

    // 1. Fetch candidates from Supabase if not provided by client
    if (!candidates || !Array.isArray(candidates)) {
      const { data: dbData, error } = await supabase
        .from("candidates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      candidates = dbData || [];
    }

    // 2. Read template buffer from public directory
    const templatePath = path.join(process.cwd(), "public", "templates", "bao_cao_tuyen_dung_tuan.docx");
    if (!fs.existsSync(templatePath)) {
      throw new Error("Template file not found at " + templatePath);
    }
    const templateBuffer = fs.readFileSync(templatePath);

    // 3. Generate report in-memory using JavaScript
    const payload = {
      startDate,
      endDate,
      candidates,
      officeManualNeeds,
      projectManualNeeds
    };
    const buffer = fillWeeklyReport(payload, templateBuffer);

    // 4. Send document response
    const outputFilename = `Bao_Cao_Tuyen_Dung_Tuan_${startDate || "Start"}_den_${endDate || "End"}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(outputFilename)}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });

  } catch (error: any) {
    console.error("Export weekly recruitment report error:", error);
    return new NextResponse(`Error exporting report: ${error.message || error}`, { status: 500 });
  }
}

import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { docSoVietNam } from "@/lib/wordExporter";

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    const type = searchParams.get("type"); // 'payment' | 'trip'

    if (!taskId || !type) {
      return new NextResponse("Missing taskId or type", { status: 400 });
    }

    // RLS on tasks only allows authenticated reads — query with the caller's
    // session token (same pattern as /api/ai-search), else the shared anon
    // client returns no rows and every export 404s.
    const supabaseToken = request.headers.get("x-supabase-auth");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const dbClient = (supabaseToken && supabaseUrl && supabaseAnonKey)
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: `Bearer ${supabaseToken}` } }
        })
      : supabase;

    // 1. Fetch task from Supabase
    const { data: task, error: taskError } = await dbClient
      .from("tasks")
      .select("notes, assignee, start_date, due_date")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      return new NextResponse("Task not found", { status: 404 });
    }

    // 2. Extract metadata
    if (!task.notes) {
      return new NextResponse("Task notes is empty", { status: 400 });
    }

    let metadata: any;
    const metaMatch = task.notes.match(/<!--METADATA:(.*?)-->/);
    if (metaMatch) {
      metadata = JSON.parse(metaMatch[1]);
    } else {
      // Fallback parsing for old tasks or manually entered tasks
      const days = task.start_date && task.due_date 
        ? Math.max(1, Math.round((new Date(task.due_date).getTime() - new Date(task.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
        : 1;
      const nights = days >= 2 ? days - 1 : 0;
      const hotelRate = 350000;
      
      // Extract destination
      let destination = "Tây Ninh";
      const destMatch = task.notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
      if (destMatch) destination = destMatch[1].trim();
      
      // Extract transport
      let transport = "🚗 Xe công ty";
      const transMatch = task.notes.match(/-\s+\*\*Phương tiện chính\*\*:\s*(.*)/i);
      if (transMatch) transport = transMatch[1].trim();

      // Extract mission
      let mission = "Công tác";
      const missionMatch = task.notes.match(/-\s+\*\*Nhiệm vụ cụ thể\*\*:\s*(.*)/i);
      if (missionMatch) mission = missionMatch[1].trim();

      const totalAmount = days * 120000 + nights * hotelRate;
      
      metadata = {
        employeeName: task.assignee || "Người dùng",
        employeeRole: "Chuyên viên",
        employeeDept: "Hành chính nhân sự",
        destination,
        modalStart: task.start_date || new Date().toISOString(),
        modalEnd: task.due_date || new Date().toISOString(),
        mission,
        transport,
        days,
        nights,
        hotelRate,
        travelEstimate: 0,
        otherExpenses: [],
        totalAmount,
        routes: [
          {
            from: "TPHCM",
            to: destination,
            distance: "",
            date: task.start_date || new Date().toISOString(),
            transport,
            nights,
            reason: ""
          }
        ],
        dateStr: task.start_date ? new Date(task.start_date).toLocaleDateString("vi-VN") : new Date().toLocaleDateString("vi-VN")
      };
    }

    // 3. Select template file path
    const templateFileName = type === "payment" 
      ? "de_nghi_thanh_toan.docx"
      : "phieu_di_cong_tac.docx";

    const templatePath = path.join(process.cwd(), "public", "templates", templateFileName);

    if (!fs.existsSync(templatePath)) {
      return new NextResponse(
        JSON.stringify({ 
          error: "template_not_found", 
          fileName: templateFileName 
        }), 
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Load the template content
    const content = fs.readFileSync(templatePath, "binary");

    // 5. Initialize docxtemplater
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 6. Format data for templates
    const formatNumber = (num: number) => new Intl.NumberFormat("vi-VN").format(num);
    
    const totalAmountVal = Number(metadata.totalAmount) || 0;
    const hotelRateVal = Number(metadata.hotelRate) || 350000;
    const textAmount = docSoVietNam(totalAmountVal);

    // Prepare table items list for payment loop
    const itemsList: any[] = [];
    let counter = 1;

    // Helper to compute individual trip day dates from start date
    const startDate = metadata.modalStart ? new Date(metadata.modalStart) : new Date();
    const getDateForDay = (dayIndex: number) => {
      const d = new Date(startDate);
      d.setDate(d.getDate() + dayIndex);
      return d.toLocaleDateString("vi-VN");
    };

    // Phụ cấp công tác phí items
    const daysVal = Number(metadata.days) || 0;
    for (let i = 0; i < daysVal; i++) {
      itemsList.push({
        tt: counter++,
        soHoaDon: "",
        ngayHoaDon: getDateForDay(i),
        noiDung: `Chi phí công tác (Ngày ${i + 1}/${daysVal})`,
        soTien: formatNumber(120000),
        ghiChu: ""
      });
    }

    // Hotel costs
    const nightsVal = Number(metadata.nights) || 0;
    if (nightsVal > 0) {
      itemsList.push({
        tt: counter++,
        soHoaDon: "",
        ngayHoaDon: `${getDateForDay(0)} - ${getDateForDay(daysVal - 1)}`,
        noiDung: `Chi phí lưu trú (Khách sạn ${nightsVal} đêm)`,
        soTien: formatNumber(nightsVal * hotelRateVal),
        ghiChu: ""
      });
    }

    // Travel estimate
    const travelVal = Number(metadata.travelEstimate) || 0;
    if (travelVal > 0) {
      itemsList.push({
        tt: counter++,
        soHoaDon: "",
        ngayHoaDon: getDateForDay(0),
        noiDung: `Chi phí di chuyển (Vé tàu / xe di chuyển tạm tính)`,
        soTien: formatNumber(travelVal),
        ghiChu: ""
      });
    }

    // Other expenses
    (metadata.otherExpenses || []).forEach((exp: any) => {
      itemsList.push({
        tt: counter++,
        soHoaDon: exp.notes || "",
        ngayHoaDon: getDateForDay(0),
        noiDung: exp.name || "Chi phí phát sinh khác",
        soTien: formatNumber(Number(exp.amount) || 0),
        ghiChu: ""
      });
    });

    // Formatted routes list for đi công tác table loop
    const formattedRoutes = (metadata.routes || []).map((r: any, idx: number) => ({
      idx: idx + 1,
      from: r.from || "",
      to: r.to || "",
      date: r.date ? new Date(r.date).toLocaleDateString("vi-VN") : "",
      transport: r.transport || "Xe Cty",
      distance: r.distance ? `${r.distance}km` : "N/A",
      nights: r.nights || 0,
      reason: r.reason || ""
    }));

    // Data object to merge with the template placeholders
    const templateData = {
      employeeName: metadata.employeeName || "",
      employeeNameUpper: (metadata.employeeName || "").toUpperCase(),
      employeeRole: metadata.employeeRole || "Chuyên viên",
      employeeDept: metadata.employeeDept || "Hành chính nhân sự",
      destination: metadata.destination || "",
      modalStart: metadata.modalStart ? new Date(metadata.modalStart).toLocaleDateString("vi-VN") : "",
      modalEnd: metadata.modalEnd ? new Date(metadata.modalEnd).toLocaleDateString("vi-VN") : "",
      mission: metadata.mission || "",
      transport: metadata.transport || "",
      days: metadata.days || 0,
      nights: metadata.nights || 0,
      travelEstimate: travelVal > 0 ? formatNumber(travelVal) : "0",
      phuCapCongTacPhi: formatNumber(daysVal * 120000),
      tienLuuTru: formatNumber(nightsVal * hotelRateVal),
      totalAmount: formatNumber(totalAmountVal),
      textAmount: textAmount,
      dateDayString: metadata.modalStart ? getFormattedDayString(new Date(metadata.modalStart)) : getCurrentDayString(),
      items: itemsList, // {#items} ... {/items}
      routes: formattedRoutes // {#routes} ... {/routes}
    };

    // Render the document (replace placeholders)
    doc.setData(templateData);
    doc.render();

    // Get the zip document buffer
    const buf = doc.getZip().generate({ type: "nodebuffer" });

    // 7. Send the generated docx file back to the browser
    const outputFilename = type === "payment" 
      ? `Phieu_De_Nghi_Thanh_Toan_${(metadata.employeeName || "User").replace(/\s+/g, "_")}.docx`
      : `Phieu_Di_Cong_Tac_${(metadata.employeeName || "User").replace(/\s+/g, "_")}.docx`;

    return new NextResponse(new Uint8Array(buf), {
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
    console.error("Export template error:", error);
    return new NextResponse(`Error exporting document: ${error.message || error}`, { status: 500 });
  }
}

// Get Vietnamese Date String: e.g. "23 tháng 04 năm 2026"
function getCurrentDayString(): string {
  return getFormattedDayString(new Date());
}

function getFormattedDayString(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day} tháng ${month} năm ${year}`;
}

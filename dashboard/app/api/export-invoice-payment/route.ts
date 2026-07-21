import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { docSoVietNam } from "@/lib/wordExporter";

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { 
      employeeName, 
      employeeDept, 
      mission, 
      projectName, 
      supplierName, 
      bankAccount, 
      bankNameBranch, 
      templateType, 
      items 
    } = body;

    if (!employeeName || !items || !Array.isArray(items)) {
      return new NextResponse("Missing required fields: employeeName or items", { status: 400 });
    }

    const templateFileName = templateType === "payment" ? "de_nghi_thanh_toan.docx" : "phieu_de_nghi_chuyen_tien_templated.docx";
    const templatePath = path.join(process.cwd(), "public", "templates", templateFileName);

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: "template_not_found", fileName: templateFileName },
        { status: 404 }
      );
    }

    // 1. Load the template content
    const content = fs.readFileSync(templatePath, "binary");

    // 2. Initialize docxtemplater
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const formatNumber = (num: number) => new Intl.NumberFormat("vi-VN").format(num);

    let totalAmountVal = 0;
    const itemsList = items.map((item: any, idx: number) => {
      const amt = Number(item.amount) || 0;
      totalAmountVal += amt;

      // format date from YYYY-MM-DD to DD/MM/YYYY if possible
      let formattedDate = item.date || "";
      if (formattedDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const parts = formattedDate.split("-");
        formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }

      return {
        tt: idx + 1,
        soHoaDon: item.number || "",
        ngayHoaDon: formattedDate,
        noiDung: item.desc || "",
        soTien: formatNumber(amt),
        ghiChu: ""
      };
    });

    const textAmount = docSoVietNam(totalAmountVal);

    // Get current Vietnamese date string for Tp.hcm, ngày ...
    const d = new Date();
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const dateDayString = `${day} tháng ${month} năm ${year}`;

    // Prepare merging template variables
    const templateData = {
      employeeName: employeeName || "",
      employeeNameUpper: (employeeName || "").toUpperCase(),
      employeeDept: employeeDept || "Hành chính nhân sự",
      mission: mission || "Thanh toán chi phí hành chính",
      projectName: projectName || "Văn phòng HCM",
      supplierName: supplierName || "",
      bankAccount: bankAccount || "",
      bankNameBranch: bankNameBranch || "",
      totalAmount: formatNumber(totalAmountVal),
      textAmount: textAmount,
      dateDayString: dateDayString,
      items: itemsList // matches {#items} ... {/items}
    };

    // Render placeholders
    doc.setData(templateData);
    doc.render();

    // Generate buffer
    const buf = doc.getZip().generate({ type: "nodebuffer" });

    const docPrefix = templateType === "payment" ? "Phieu_De_Nghi_Thanh_Toan" : "Giay_De_Nghi_Chuyen_Tien";
    const outputFilename = `${docPrefix}_${(employeeName || "User").replace(/\s+/g, "_")}.docx`;

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
    console.error("Export invoice payment error:", error);
    return NextResponse.json({ error: error.message || "Error exporting template" }, { status: 500 });
  }
}

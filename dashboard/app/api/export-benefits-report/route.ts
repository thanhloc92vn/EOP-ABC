import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      monthYear,
      day,
      month,
      year,
      totalAmount,
      items,
      template
    } = body;

    if (!items || !Array.isArray(items)) {
      return new NextResponse("Missing items array", { status: 400 });
    }

    // Whitelist templates để tránh path traversal
    const ALLOWED_TEMPLATES: Record<string, string> = {
      phuc_loi: "bang_theo_doi_phuc_loi.docx",
      che_do: "bang_theo_doi_che_do.docx",
      hieu_hy: "bang_tro_cap_hieu_hy.docx",
    };
    const templateFileName = ALLOWED_TEMPLATES[template as string] || ALLOWED_TEMPLATES.phuc_loi;
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

    // Xoá proofErr markers của Word (tránh tag bị tách qua nhiều run)
    const docXmlFile = zip.file("word/document.xml");
    if (docXmlFile) {
      zip.file("word/document.xml", docXmlFile.asText().replace(/<w:proofErr[^>]*\/>/g, ""));
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const formatNumber = (num: number) => new Intl.NumberFormat("vi-VN").format(num);

    const itemsList = items.map((item: any, idx: number) => {
      const amt = Number(item.amount) || 0;
      return {
        tt: idx + 1,
        name: item.name || "",
        role: item.role || "",
        department: item.department || "",
        benefit: item.benefit || "Sinh nhật",
        amount: formatNumber(amt),
        tenure: item.tenure || "",
        notes: item.notes || ""
      };
    });

    // Prepare merging template variables
    const templateData = {
      monthYear: monthYear || "",
      day: day || "",
      month: month || "",
      year: year || "",
      totalAmount: formatNumber(Number(totalAmount) || 0),
      items: itemsList
    };

    // Render placeholders
    doc.setData(templateData);
    doc.render();

    // Generate buffer
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const outputFilename = `Bang_theo_doi_phuc_loi_thang_${monthYear.replace(/\//g, "_")}.docx`;

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
    console.error("Export benefits report error:", error);
    return NextResponse.json({ error: error.message || "Error exporting template" }, { status: 500 });
  }
}

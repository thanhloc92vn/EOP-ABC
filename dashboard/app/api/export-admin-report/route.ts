import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      year,
      day,
      month,
      officeRows,
      projectRows,
      officeMonthlySubtotals,
      projectMonthlySubtotals,
      officeAnnualSubtotal,
      projectAnnualSubtotal,
      grandMonthlyTotals,
      grandAnnualTotal,
    } = body;

    const templateFileName = "bang_tinh_chi_phi_hanh_chinh_nam_v2.docx";
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

    // Remove Word's proofErr grammar markers that split template tags across runs
    const docXmlPath = "word/document.xml";
    const docXmlFile = zip.file(docXmlPath);
    if (docXmlFile) {
      const cleanedXml = docXmlFile
        .asText()
        .replace(/<w:proofErr[^>]*\/>/g, "");
      zip.file(docXmlPath, cleanedXml);
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const formatNumber = (num: number) => {
      if (num === 0 || !num) return "-";
      return new Intl.NumberFormat("vi-VN").format(num);
    };

    const formatRow = (row: any) => {
      let totalVal = 0;
      const formattedRow: any = {
        stt: row.stt || "",
        content: row.content || "",
        notes: row.notes || "",
      };

      for (let i = 1; i <= 12; i++) {
        const val = Number(row[`m${i}`]) || 0;
        totalVal += val;
        formattedRow[`m${i}`] = formatNumber(val);
      }
      formattedRow.total = formatNumber(totalVal);
      return formattedRow;
    };

    // Strip suffixes for project child rows
    const processedProjectRows = (projectRows || []).map((row: any) => {
      const isChild = row.stt.includes(".");
      let displayContent = row.content || "";
      if (isChild) {
        const parts = displayContent.split(" - BĐH dự án ");
        if (parts.length > 1) {
          displayContent = parts[0];
        } else {
          const partsAlt = displayContent.split(" - BĐH ");
          if (partsAlt.length > 1) {
            displayContent = partsAlt[0];
          }
        }
      }
      return formatRow({ ...row, content: displayContent });
    });

    const processedOfficeRows = (officeRows || []).map((row: any) => formatRow(row));

    const templateData: any = {
      year: year || "2026",
      day: day || "...",
      month: month || "...",
      officeSubtotalName: "CHI PHÍ VP HCM",
      officeAnnualSubtotal: formatNumber(officeAnnualSubtotal || 0),
      projectSubtotalName: "CHI PHÍ BĐH DỰ ÁN",
      projectAnnualSubtotal: formatNumber(projectAnnualSubtotal || 0),
      grandTotalName: "TỔNG CỘNG CPQL PHÁT SINH",
      grandAnnualTotal: formatNumber(grandAnnualTotal || 0),
      officeRows: processedOfficeRows,
      projectRows: processedProjectRows,
    };

    // Format monthly subtotals and grand totals
    for (let i = 1; i <= 12; i++) {
      templateData[`om${i}`] = formatNumber(officeMonthlySubtotals?.[`m${i}`] || 0);
      templateData[`pm${i}`] = formatNumber(projectMonthlySubtotals?.[`m${i}`] || 0);
      templateData[`gm${i}`] = formatNumber(grandMonthlyTotals?.[`m${i}`] || 0);
    }

    // Render placeholders
    doc.setData(templateData);
    doc.render();

    // Generate buffer
    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const outputFilename = `Bang_tinh_chi_phi_hanh_chinh_nam_${year}.docx`;

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
    console.error("Export admin report error:", error);
    return NextResponse.json({ error: error.message || "Error exporting template" }, { status: 500 });
  }
}

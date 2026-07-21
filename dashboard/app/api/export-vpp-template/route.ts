import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";

// Điền phiếu cấp phát VPP trực tiếp trên XML của file .docx mẫu (không gọi python —
// môi trường serverless (Vercel) không có python, trước đây gây lỗi "python: command not found").
// Cách làm mô phỏng đúng hành vi cũ của scratch/fill_docx.py (python-docx): với mỗi đoạn văn/ô bảng,
// gộp toàn bộ text của các <w:r> lại thành 1 chuỗi, tìm & thay thế, rồi ghi lại thành 1 run duy nhất
// (word thường tách 1 câu thành nhiều <w:r> do gạch chân chính tả nên không thể replace thẳng trên XML thô).

const PARA_RE = /<w:p\b(?:\s[^>]*)?\/>|<w:p\b(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;

function xmlUnescape(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getParagraphText(paraXml: string): string {
  // Lưu ý: bắt buộc ranh giới sau "w:t" (space hoặc đóng thẻ ngay), nếu không sẽ
  // khớp nhầm sang <w:tab/>, <w:tbl>... vì các thẻ đó cũng bắt đầu bằng "w:t".
  // <w:tab/> đọc thành ký tự tab để giữ đúng khoảng cách khi dựng lại đoạn văn.
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>/g;
  let result = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(paraXml))) {
    result += m[0].startsWith("<w:tab") ? "\t" : xmlUnescape(m[1]);
  }
  return result;
}

// Gộp cả đoạn văn/ô bảng thành 1 run duy nhất mang nội dung mới, giữ lại định dạng
// (pPr căn lề + rPr font/cỡ chữ lấy từ nội dung gốc) — đúng như python-docx `paragraph.text = ...`.
// Ký tự tab trong newText được dựng lại thành <w:tab/> để không mất khoảng cách canh cột.
function setParagraphText(paraXml: string, newText: string): string {
  const openTagMatch = paraXml.match(/^<w:p\b[^>]*>/);
  if (!openTagMatch) return paraXml; // đoạn văn rỗng dạng tự đóng <w:p .../>, không có nội dung để sửa
  const openTag = openTagMatch[0];
  const pPrMatch = paraXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0] : "";
  const rPrMatch = paraXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : "";
  const segments = newText.split("\t");
  const content = segments
    .map((seg, i) => (i > 0 ? "<w:tab/>" : "") + (seg ? `<w:t xml:space="preserve">${xmlEscape(seg)}</w:t>` : ""))
    .join("");
  const run = `<w:r>${rPr}${content}</w:r>`;
  return `${openTag}${pPr}${run}</w:p>`;
}

type VppItem = { name?: string; unit?: string; qty?: number | string; notes?: string };

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const data = await request.json();
    const { targetName, receiverName, items = [] } = data as {
      targetName: string;
      receiverName?: string;
      items?: VppItem[];
    };

    if (!targetName) {
      return new NextResponse("Missing targetName", { status: 400 });
    }

    const templateFileName = "phieu_cap_phat_vpp.docx";
    const templatePath = path.join(process.cwd(), "public", "templates", templateFileName);

    if (!fs.existsSync(templatePath)) {
      return new NextResponse(
        JSON.stringify({ error: "template_not_found", fileName: templateFileName }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const zip = new PizZip(fs.readFileSync(templatePath));
    const docXmlFile = zip.file("word/document.xml");
    if (!docXmlFile) throw new Error("Không tìm thấy word/document.xml trong file mẫu");
    let xml = docXmlFile.asText();

    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1);
    const monthPadded = month.padStart(2, "0");
    const year = String(now.getFullYear());
    const finalReceiverName = receiverName || "Ngô Xuân Việt";

    // 1. Thay các đoạn văn phần đầu phiếu (tháng yêu cầu / người yêu cầu / bộ phận / ngày lập)
    xml = xml.replace(PARA_RE, (paraXml) => {
      const text = getParagraphText(paraXml);
      if (!text) return paraXml;
      let newText = text;
      let changed = false;
      if (text.includes("Yêu cầu VPP tháng:") && text.includes("Tháng 6")) {
        newText = newText.replace("Tháng 6", `Tháng ${month}`);
        changed = true;
      }
      if (text.includes("Người yêu cầu:") && text.includes("Ngô Xuân Việt")) {
        newText = newText.replace("Ngô Xuân Việt", finalReceiverName);
        changed = true;
      }
      if (text.includes("Bộ phận:") && text.includes("Phòng QLDA")) {
        newText = newText.replace("Phòng QLDA", targetName);
        changed = true;
      }
      if (text.includes("Đề xuất mua các loại văn phòng phẩm") && text.includes("Phòng QLDA")) {
        newText = newText.replace("Phòng QLDA", targetName);
        changed = true;
      }
      if (text.includes("TPHCM, ngày 10 tháng 06 năm 2026")) {
        newText = newText.replace("ngày 10 tháng 06 năm 2026", `ngày ${day} tháng ${monthPadded} năm ${year}`);
        changed = true;
      }
      return changed ? setParagraphText(paraXml, newText) : paraXml;
    });

    // 2. Điền bảng văn phòng phẩm (bảng đầu tiên trong file) — hàng đầu = tiêu đề, hàng cuối = Tổng cộng
    const tblStart = xml.indexOf("<w:tbl>");
    const tblEnd = xml.indexOf("</w:tbl>", tblStart) + "</w:tbl>".length;
    const tblXml = xml.slice(tblStart, tblEnd);
    const rowMatches = [...tblXml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);

    const newRows = rowMatches.map((rowXml, rIdx) => {
      if (rIdx === 0 || rIdx === rowMatches.length - 1) return rowXml; // giữ nguyên hàng tiêu đề & hàng Tổng cộng
      const itemIdx = rIdx - 1;
      const item = items[itemIdx];
      const cells = [...rowXml.matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((m) => m[0]);
      if (cells.length < 7) return rowXml;
      const values = item
        ? [
            String(rIdx),
            item.name || "",
            item.unit || "",
            item.qty !== undefined && item.qty !== null && item.qty !== "" ? String(item.qty) : "",
            "",
            "",
            item.notes || "Đã duyệt cấp phát",
          ]
        : ["", "", "", "", "", "", ""];
      let newRowXml = rowXml;
      cells.forEach((cellXml, cIdx) => {
        const paraMatch = cellXml.match(PARA_RE);
        if (!paraMatch) return;
        const newPara = setParagraphText(paraMatch[0], values[cIdx]);
        newRowXml = newRowXml.replace(paraMatch[0], newPara);
      });
      return newRowXml;
    });

    let newTblXml = tblXml;
    const rowQueue = [...newRows];
    newTblXml = newTblXml.replace(/<w:tr\b[\s\S]*?<\/w:tr>/g, () => rowQueue.shift() as string);
    xml = xml.slice(0, tblStart) + newTblXml + xml.slice(tblEnd);

    zip.file("word/document.xml", xml);
    const buffer = zip.generate({ type: "nodebuffer" });

    const outputFilename = `Phieu_Cap_Phat_VPP_${targetName.replace(/\s+/g, "_")}.docx`;

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
    console.error("Export Word VPP error:", error);
    return new NextResponse(`Error exporting Word: ${error.message || error}`, { status: 500 });
  }
}

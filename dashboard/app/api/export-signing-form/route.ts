import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// ============================================================
// POST /api/export-signing-form — xuất PHIẾU TRÌNH KÝ HỒ SƠ/VĂN BẢN (.docx)
//
// Điền vào phieu_trinh_ky_ho_so_van_ban_template.docx (bản đã gắn tag từ file
// mẫu TL/BM/011 của công ty — letterhead, khung viền, ô ký tên giữ nguyên 100%).
//
// TEMPLATE CÂM, ROUTE DỰNG CHUỖI: mỗi ô giá trị trong phiếu chỉ là MỘT tag, còn
// chuỗi hiển thị đầy đủ ("10.932.743.000 đồng (A)") do route này ghép. Nhờ vậy
// đổi cách trình bày số tiền / hậu tố / tỉ lệ % chỉ sửa ở đây, không phải mở
// Word gắn lại tag — thao tác rất dễ làm hỏng định dạng.
//
// Cùng khuôn export-invoice-payment (docxtemplater + PizZip) đã chạy ổn định.
// ============================================================

const TEMPLATE_FILE = "phieu_trinh_ky_ho_so_van_ban_template.docx";

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));

// Số tiền -> "1.234.000 đồng (A)". Chuỗi rỗng khi không có số: để trống trong
// phiếu vẫn hơn in ra "0 đồng" ở một dòng mà kế toán chưa chốt được con số.
function money(v: unknown, suffix = ""): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return `${fmt(n)} đồng${suffix}`;
}

// "(C) (5%)" — chỉ thêm phần % khi thực sự có tỉ lệ.
function rateSuffix(label: string, rate: unknown, prefix = ""): string {
  const r = rate === null || rate === undefined || rate === "" ? null : Number(rate);
  if (r === null || !Number.isFinite(r)) return ` (${label})`;
  return ` (${label}) (${prefix}${r}%)`;
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const {
      donVi,
      veViec,
      noiDungTrinh,
      dotSo,
      chuDauTu,
      duAn,
      hopDongSo,
      goiThau,
      giaTriHD,
      giaTriNghiemThu,
      giuBaoHanh,
      giuLaiTungLan,
      tyLeGiuLai,
      khauTruTamUng,
      tyLeThuHoi,
      luyKeDaThanhToan,
      tamUngConLai,
      ykienQLDA,
      ykienKHDT,
      ykienGiamDoc,
    } = body;

    const templatePath = path.join(process.cwd(), "public", "templates", TEMPLATE_FILE);
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: "template_not_found", fileName: TEMPLATE_FILE },
        { status: 404 }
      );
    }

    const zip = new PizZip(fs.readFileSync(templatePath, "binary"));
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    // Giá trị đề nghị thanh toán: ưu tiên số do người dùng chốt, không có thì
    // tự tính A-B-C-D. Người lập phiếu vẫn phải được quyền ghi đè — có đợt bị
    // trừ thêm khoản ngoài công thức.
    const num = (v: unknown) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };
    const tinhDeNghi =
      num(giaTriNghiemThu) - num(giuBaoHanh) - num(giuLaiTungLan) - num(khauTruTamUng);
    const deNghi = body.deNghiThanhToan ?? tinhDeNghi;

    // Dùng render(data) chứ không setData() + render(): setData đã bị đánh dấu
    // deprecated, mỗi lần xuất phiếu lại in một vệt cảnh báo kèm stack vào log
    // server. (Route export-invoice-payment cũ vẫn dùng lối cũ — không đụng.)
    doc.render({
      donVi: donVi || "",
      veViec: veViec || "",
      noiDungTrinh: noiDungTrinh || "",
      dotSo: dotSo === null || dotSo === undefined || dotSo === "" ? "" : String(dotSo),

      chuDauTu: chuDauTu || "",
      duAn: duAn || "",
      hopDongSo: hopDongSo || "",
      goiThau: goiThau || "",

      giaTriHD: money(giaTriHD),
      giaTriNghiemThu: money(giaTriNghiemThu, " (A)"),
      giuBaoHanh: money(giuBaoHanh, " (B)"),
      giuLaiTungLan: money(giuLaiTungLan, rateSuffix("C", tyLeGiuLai)),
      khauTruTamUng: money(khauTruTamUng, rateSuffix("D", tyLeThuHoi, "tỉ lệ thu hồi ~ ")),
      // Giữ nguyên chữ "A-B-C-D=" như tờ phiếu giấy để sếp đối chiếu nhanh.
      deNghiThanhToan: deNghi === "" ? "" : `A-B-C-D= ${money(deNghi)}`,
      luyKeDaThanhToan: money(luyKeDaThanhToan),
      tamUngConLai: money(tamUngConLai),

      // Bước 5 mới đổ dữ liệu thật; bây giờ để trống thì phiếu in ra vẫn có
      // 3 ô ý kiến trắng đúng như bản giấy.
      ykienQLDA: ykienQLDA || "",
      ykienKHDT: ykienKHDT || "",
      ykienGiamDoc: ykienGiamDoc || "",
    });

    const buf = doc.getZip().generate({ type: "nodebuffer" });

    const safe = String(hopDongSo || "phieu").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60);
    const outputFilename = `Phieu_Trinh_Ky_${safe}_Dot_${dotSo || "x"}.docx`;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(outputFilename)}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error: unknown) {
    console.error("Export signing form error:", error);
    const msg = error instanceof Error ? error.message : "Error exporting template";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

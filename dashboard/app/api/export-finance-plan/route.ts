// ============================================================
// /api/export-finance-plan — xuất Kế hoạch tài chính ra Excel.
//
// KHÔNG dựng file mới từ đầu: mở thẳng file mẫu của công ty
// (public/templates/TNEC_ke_hoach_tai_chinh_thang.xlsx) rồi ĐIỀN vào, để thừa
// hưởng nguyên định dạng — độ rộng cột, viền, phông chữ, định dạng số tiền.
//
// Bố cục file mẫu (đừng đổi số dòng nếu chưa mở file ra xem):
//   dòng 1..13  bảng tham chiếu STT | TÊN DỰ ÁN (công cụ nhập liệu)
//   dòng 14     ghi chú "TỪ CỘT C->G BẮT BUỘC ĐIỀN" (ô gộp A14:E14)
//   dòng 15     trống
//   dòng 16     tiêu đề bảng dữ liệu, 11 cột A..K
//   dòng 17+    dữ liệu
//
// BẢN XUẤT RA khác file mẫu ở ba chỗ, đều có chủ đích:
//   1. Bỏ dòng 1..15. Bảng tham chiếu dự án và dòng nhắc nhập liệu là công cụ
//      cho người GÕ, không phải nội dung của tờ trình đem ký.
//   2. Thêm phần đầu: tên công ty, phòng ban + họ tên người lập (lấy từ tài
//      khoản đăng nhập, KHÔNG tin dữ liệu client gửi lên), tiêu đề báo cáo, kỳ.
//   3. Thêm phần cuối: dòng cộng, ngày tháng năm, và 4 ô ký —
//      NGƯỜI LẬP PHIẾU / TRƯỞNG BỘ PHẬN / PHÒNG KẾ TOÁN / BAN LÃNH ĐẠO.
//
// File mẫu có 23 sheet dữ liệu cũ theo từng tuần. Bản xuất ra CHỈ giữ 1 sheet:
// giữ cả 23 thì người nhận mở ra thấy toàn số liệu tuần khác, không biết đâu là
// bản đang trình.
//
// Dùng exceljs chứ không phải xlsx (SheetJS bản cộng đồng): đọc-ghi bằng SheetJS
// làm rơi toàn bộ định dạng, xuất ra được cái bảng trần không còn giống mẫu.
// ============================================================

import { requireApiAuth, supabaseForCaller } from "@/lib/apiAuth";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

const TEMPLATE_FILE = "TNEC_ke_hoach_tai_chinh_thang.xlsx";
const TPL_HEADER_ROW = 16;   // dòng tiêu đề bảng trong file mẫu
const TPL_DATA_ROW = 17;     // dòng dữ liệu đầu tiên trong file mẫu
const COL_COUNT = 11;
const DROP_TOP_ROWS = 15;    // bỏ bảng tham chiếu + ghi chú + dòng trống
const HEAD_ROWS = 7;         // số dòng chèn thêm cho phần đầu báo cáo

// Bốn ô ký trải trên 11 cột. Gộp theo nhóm cột thay vì chia đều — độ rộng cột
// đã cố định theo bảng dữ liệu, không kéo lại được cho riêng khối chữ ký.
//
// THỨ TỰ TRÁI SANG PHẢI: cấp cao nhất đứng trước, người lập đứng cuối.
const SIGN_BLOCKS: { from: number; to: number; title: string }[] = [
  { from: 1, to: 4, title: "BAN LÃNH ĐẠO" },
  { from: 5, to: 5, title: "PHÒNG KẾ TOÁN" },
  { from: 6, to: 8, title: "TRƯỞNG BỘ PHẬN" },
  { from: 9, to: 11, title: "NGƯỜI LẬP PHIẾU" },
];

const FONT = "Myriad Pro"; // phông của file mẫu — giữ cho phần thêm vào khớp

type PlanRow = {
  department?: string;
  flow?: string;
  customer?: string;
  content?: string;
  amount?: number;
  project_name?: string;
  fund_source?: string;
  week?: string;
  month?: string;
  pay_date?: string;
};

// Ngày trong file mẫu viết theo kiểu Việt Nam. Ô nhập của trình duyệt trả về
// yyyy-mm-dd nên đổi tại đây, ghi thẳng chuỗi thay vì Date — ghi Date thì Excel
// mỗi máy lại hiển thị theo locale của máy đó.
function dateVN(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

// Route chạy ở múi giờ UTC. Không ép timeZone thì bản xuất trước 7 giờ sáng ghi
// lùi mất một ngày — đúng cái bẫy đã dính ở các route gửi email.
function todayVN(): { d: string; m: string; y: string } {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [y, m, d] = iso.split("-");
  return { d, m, y };
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const rows: PlanRow[] = Array.isArray(body?.rows) ? body.rows : [];
    const month = String(body?.month || "").trim();
    // Năm của KỲ KẾ HOẠCH, không phải năm hiện tại: xuất lại kế hoạch tháng
    // 12/2025 vào tháng 1/2026 mà ghi "năm 2026" là sai kỳ.
    const year = String(body?.year || "").trim();

    if (rows.length === 0) {
      return NextResponse.json({ error: "empty_plan" }, { status: 400 });
    }

    const templatePath = path.join(process.cwd(), "public", "templates", TEMPLATE_FILE);
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: "template_not_found", fileName: TEMPLATE_FILE },
        { status: 404 }
      );
    }

    // ─── Người lập phiếu: tra từ token đã xác minh, KHÔNG nhận từ body ───
    // Client gửi được tên tuỳ ý thì tờ trình ký mất hết giá trị đối chiếu.
    // Tra hụt hồ sơ chỉ làm mất tên trong phần đầu, không được chặn cả bản xuất.
    // Tra hụt thì để TRỐNG, tuyệt đối không rơi về email: một địa chỉ gmail nằm
    // dưới ô "NGƯỜI LẬP PHIẾU" của tờ trình đem ký trông như lỗi in ấn. Trống
    // thì người lập ký tay vào, vẫn dùng được ngay.
    let preparerName = "";
    let preparerDept = "";
    let preparerRole = "";
    try {
      const sb = supabaseForCaller(auth.caller);
      const { data } = await sb
        .from("employees_directory")
        .select("name, role, department")
        // `.ilike` chứ không phải `.like`: email lưu trong danh bạ chỉ cần một
        // chữ hoa là `LIKE` tra không ra.
        .ilike("email", `%${auth.caller.email}%`)
        .limit(2);
      const emp = (data || [])[0] as
        | { name?: string; role?: string; department?: string }
        | undefined;
      if (emp?.name) preparerName = emp.name;
      if (emp?.department) preparerDept = emp.department;
      if (emp?.role) preparerRole = emp.role;
      if (!emp) {
        console.warn(
          `[export-finance-plan] Không có hồ sơ nào chứa email "${auth.caller.email}" ` +
          `trong Danh sách nhân viên — phần đầu và ô ký sẽ để trống tên.`
        );
      }
    } catch {
      /* để trống tên, không chặn bản xuất */
    }

    const tenant = await getTenantConfigServer();
    const today = todayVN();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(templatePath);

    const ws = wb.worksheets[0];
    if (!ws) {
      return NextResponse.json({ error: "template_has_no_sheet" }, { status: 500 });
    }

    // Bỏ các sheet tuần cũ. Duyệt trên BẢN SAO của mảng — removeWorksheet sửa
    // thẳng mảng gốc, vừa duyệt vừa xoá thì nhảy cóc bỏ sót sheet.
    for (const other of [...wb.worksheets]) {
      if (other.id !== ws.id) wb.removeWorksheet(other.id);
    }
    ws.name = month ? `KHTC T${month}` : "KHTC";

    // Chép style của bảng trong mẫu TRƯỚC khi xê dịch dòng.
    const headStyles = Array.from({ length: COL_COUNT }, (_, i) =>
      JSON.parse(JSON.stringify(ws.getRow(TPL_HEADER_ROW).getCell(i + 1).style || {}))
    );
    const cellStyles = Array.from({ length: COL_COUNT }, (_, i) =>
      JSON.parse(JSON.stringify(ws.getRow(TPL_DATA_ROW).getCell(i + 1).style || {}))
    );
    const headHeight = ws.getRow(TPL_HEADER_ROW).height;
    const dataHeight = ws.getRow(TPL_DATA_ROW).height;

    // Ô gộp cũ (A14:E14) phải gỡ trước khi cắt dòng, không thì merge mồ côi
    // bám lại vào vùng khác sau khi mọi thứ trượt lên.
    for (const range of Object.keys((ws as unknown as { _merges: Record<string, unknown> })._merges || {})) {
      try { ws.unMergeCells(range); } catch { /* range đã tan theo dòng bị cắt */ }
    }

    // ─── GỠ 3 THỨ CỦA FILE MẪU TRỎ VÀO VÙNG SẮP BỊ CẮT ───
    // Cả ba đều là công cụ cho người NHẬP LIỆU trên file mẫu, không thuộc về
    // bản báo cáo đem ký — và nguy hiểm hơn: chúng neo theo SỐ DÒNG tuyệt đối,
    // nên sau khi cắt 15 dòng đầu thì trỏ nhầm sang giữa khối chữ ký.
    //
    // 1. Bộ lọc A16:M16 -> hàng nút xổ xuống mọc lù lù giữa phần chữ ký.
    // 2. Ràng buộc chọn dự án trỏ vào $B$2:$B$13 -> vùng đó nay là phần đầu báo
    //    cáo, bấm vào chỉ ra danh sách rác. Trong phần mềm đã có ô chọn dự án
    //    nên bản xuất ra không cần ràng buộc này nữa.
    // 3. Chế độ xem "pageBreakPreview" -> mở file lên thấy chữ "Page 1" mờ to
    //    tướng đè ngang giữa trang.
    ws.autoFilter = "";
    // Xoá THẲNG bộ sưu tập ràng buộc của sheet, không gán undefined cho từng ô:
    // exceljs giữ ràng buộc trong một bảng riêng khoá theo địa chỉ ô, dọn từng ô
    // chỉ trúng những ô còn đúng địa chỉ cũ — đã đo, làm cách đó vẫn sót 4 ô.
    const dvs = (ws as unknown as { dataValidations?: { model?: Record<string, unknown> } })
      .dataValidations;
    if (dvs) dvs.model = {};
    ws.views = [{ state: "normal", showGridLines: true, zoomScale: 85 }];

    // 1. Cắt bỏ phần đầu của mẫu, 2. chèn lại đúng số dòng cho phần đầu báo cáo.
    ws.spliceRows(1, DROP_TOP_ROWS);
    ws.spliceRows(1, 0, ...Array.from({ length: HEAD_ROWS }, () => []));

    const headerRowIdx = HEAD_ROWS + 1;      // dòng tiêu đề bảng
    const firstDataIdx = headerRowIdx + 1;   // dòng dữ liệu đầu tiên

    // ─── PHẦN ĐẦU ───
    const put = (
      rowIdx: number,
      from: number,
      to: number,
      text: string,
      style: Partial<ExcelJS.Style>
    ) => {
      if (to > from) ws.mergeCells(rowIdx, from, rowIdx, to);
      const cell = ws.getRow(rowIdx).getCell(from);
      cell.value = text;
      Object.assign(cell, style);
      return cell;
    };

    const left = { horizontal: "left" as const, vertical: "middle" as const };
    const center = { horizontal: "center" as const, vertical: "middle" as const };

    put(1, 1, 4, (tenant.company_name || "").toUpperCase(), {
      font: { name: FONT, size: 13, bold: true },
      alignment: left,
    });
    put(2, 1, 4, preparerDept ? `Phòng ban: ${preparerDept}` : "", {
      font: { name: FONT, size: 12 },
      alignment: left,
    });

    put(4, 1, COL_COUNT, "BẢNG BÁO CÁO KẾ HOẠCH TÀI CHÍNH", {
      font: { name: FONT, size: 20, bold: true },
      alignment: center,
    });
    ws.getRow(4).height = 30;

    const periodYear = year || today.y;
    put(
      5,
      1,
      COL_COUNT,
      month ? `Tháng ${month} năm ${periodYear}` : `Năm ${periodYear}`,
      { font: { name: FONT, size: 13, italic: true }, alignment: center }
    );

    put(
      6,
      1,
      COL_COUNT,
      preparerName
        ? `Người lập: ${preparerName}${preparerRole ? ` — ${preparerRole}` : ""}` +
          `${preparerDept ? ` — ${preparerDept}` : ""}`
        : "",
      { font: { name: FONT, size: 12 }, alignment: center }
    );

    // Đơn vị tính nằm sát trên góc phải của bảng — chỗ người đọc báo cáo tài
    // chính quen tìm, và tránh hiểu nhầm số tiền là nghìn đồng.
    put(7, 9, COL_COUNT, "Đơn vị tính: VNĐ", {
      font: { name: FONT, size: 11, italic: true },
      alignment: { horizontal: "right", vertical: "middle" },
    });

    // ─── BẢNG DỮ LIỆU ───
    const headRow = ws.getRow(headerRowIdx);
    for (let c = 1; c <= COL_COUNT; c++) headRow.getCell(c).style = headStyles[c - 1];
    if (headHeight) headRow.height = headHeight;

    let tongThu = 0;
    let tongChi = 0;
    rows.forEach((item, i) => {
      const row = ws.getRow(firstDataIdx + i);
      const amount = Number(item.amount) || 0;
      if (item.flow === "thu") tongThu += amount;
      else tongChi += amount;
      const values: (string | number)[] = [
        i + 1,
        item.department || "",
        item.flow === "thu" ? "Thu" : "Chi",
        item.customer || "",
        item.content || "",
        amount,
        item.project_name || "",
        item.fund_source || "",
        item.week || "",
        item.month || "",
        dateVN(item.pay_date),
      ];
      values.forEach((v, ci) => {
        const cell = row.getCell(ci + 1);
        cell.value = v;
        cell.style = cellStyles[ci];
      });
      if (dataHeight) row.height = dataHeight;
      row.commit();
    });

    // Dòng thừa của mẫu nằm dưới vùng vừa ghi: xoá hẳn, không chỉ xoá giá trị —
    // để lại thì khối chữ ký bị đẩy xuống sau một dải ô kẻ viền trống.
    const lastDataIdx = firstDataIdx + rows.length - 1;
    if (ws.rowCount > lastDataIdx) {
      ws.spliceRows(lastDataIdx + 1, ws.rowCount - lastDataIdx);
    }

    // Dòng cộng
    const totalIdx = lastDataIdx + 1;
    const totalRow = ws.getRow(totalIdx);
    for (let c = 1; c <= COL_COUNT; c++) {
      const cell = totalRow.getCell(c);
      cell.style = JSON.parse(JSON.stringify(cellStyles[c - 1]));
      cell.font = { ...(cell.font || {}), bold: true };
    }
    // Ô F là số CHÊNH LỆCH, nên nói rõ ngay trong nhãn kèm tổng thu / tổng chi —
    // để một con số trần dưới cột "Số tiền thanh toán" thì người đọc tưởng đó là
    // tổng các khoản phải chi.
    const vnd = (n: number) => n.toLocaleString("vi-VN");
    ws.mergeCells(totalIdx, 1, totalIdx, 5);
    totalRow.getCell(1).value =
      `TỔNG CỘNG ${rows.length} khoản — Thu: ${vnd(tongThu)} · Chi: ${vnd(tongChi)} · Chênh lệch:`;
    totalRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
    totalRow.getCell(6).value = tongThu - tongChi;
    if (dataHeight) totalRow.height = dataHeight;

    // ─── PHẦN CUỐI: ngày tháng + 4 ô ký ───
    const dateIdx = totalIdx + 2;
    put(
      dateIdx,
      9,
      COL_COUNT,
      `Ngày ${today.d} tháng ${today.m} năm ${today.y}`,
      { font: { name: FONT, size: 12, italic: true }, alignment: center }
    );

    const titleIdx = dateIdx + 1;
    const noteIdx = titleIdx + 1;
    for (const b of SIGN_BLOCKS) {
      put(titleIdx, b.from, b.to, b.title, {
        font: { name: FONT, size: 12, bold: true },
        alignment: center,
      });
      put(noteIdx, b.from, b.to, "(Ký, ghi rõ họ tên)", {
        font: { name: FONT, size: 11, italic: true },
        alignment: center,
      });
    }

    // Chừa khoảng trống để ký tay
    for (let r = noteIdx + 1; r <= noteIdx + 3; r++) ws.getRow(r).height = 22;

    // Tên người lập điền sẵn dưới đúng ô ký của họ (ô cuối cùng bên phải) — ba
    // ô còn lại để trắng, ai ký người đó tự ghi.
    const selfBlock = SIGN_BLOCKS[SIGN_BLOCKS.length - 1];
    put(noteIdx + 4, selfBlock.from, selfBlock.to, preparerName, {
      font: { name: FONT, size: 12, bold: true },
      alignment: center,
    });

    // ─── BỎ ẨN MỌI DÒNG ───
    // Trong file mẫu, 14 dòng đầu (bảng tham chiếu dự án) đang bị ẩn — ai đó đã
    // thu chúng lại trong Excel rồi lưu. Thuộc tính "ẩn" bám theo SỐ THỨ TỰ
    // DÒNG chứ không theo nội dung, nên sau khi cắt 15 dòng rồi chèn 7 dòng đầu
    // báo cáo, mấy cờ ẩn đó rơi trúng dòng tiêu đề bảng và toàn bộ dòng dữ
    // liệu: file mở lên trông như mất sạch số liệu, dù dữ liệu vẫn nằm đủ trong
    // ô. Quét lại toàn sheet là cách duy nhất chắc chắn.
    for (let r = 1; r <= ws.rowCount; r++) ws.getRow(r).hidden = false;
    for (let c = 1; c <= COL_COUNT; c++) ws.getColumn(c).hidden = false;

    // In ra giấy: nằm ngang, ép vừa bề ngang một trang, lặp lại tiêu đề bảng ở
    // mỗi trang — kế hoạch tháng thường dài hơn một trang.
    ws.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    };
    ws.pageSetup.printTitlesRow = `${headerRowIdx}:${headerRowIdx}`;

    const buffer = await wb.xlsx.writeBuffer();
    const fileName =
      `Ke_hoach_tai_chinh${month ? `_T${month}` : ""}${year ? `_${year}` : ""}.xlsx`;

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[export-finance-plan]", message);
    return NextResponse.json({ error: "export_failed", message }, { status: 500 });
  }
}

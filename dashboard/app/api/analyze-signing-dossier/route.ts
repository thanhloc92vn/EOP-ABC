import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

// ============================================================
// POST /api/analyze-signing-dossier — bóc tách hồ sơ thanh toán cho PHIẾU TRÌNH KÝ
//
// Nhận NHIỀU file một lượt (hợp đồng + biên bản nghiệm thu + bảng xác định giá
// trị đề nghị thanh toán) và gửi TẤT CẢ trong MỘT lượt gọi model.
//
// VÌ SAO PHẢI GỬI CHUNG MỘT LƯỢT, KHÔNG BÓC TỪNG FILE RỒI GHÉP:
// 13 trường của tờ phiếu nằm rải ở các hồ sơ khác nhau — hợp đồng cho Chủ đầu
// tư / Gói thầu / Giá trị HĐ, còn A-B-C-D thì nằm ở biên bản nghiệm thu đợt đó.
// Bóc lẻ từng file thì model không biết "giá trị này là của đợt mấy", và khi
// ghép lại rất dễ lấy nhầm số của đợt trước. Cho model nhìn cả bộ một lần thì nó
// đối chiếu chéo được.
//
// KHÔNG TỰ BỊA SỐ: đây là dữ liệu tiền. Trường nào không tìm thấy thì trả null
// và liệt kê trong "thieu" để người lập phiếu tự điền — thà để trống còn hơn
// điền một con số trông có vẻ đúng.
//
// Cùng khuôn analyze-invoice (khoá OpenAI lấy từ header Authorization hoặc env,
// requireApiAuth chặn gọi ẩn danh).
// ============================================================

export const maxDuration = 300; // Bộ hồ sơ nhiều file, đọc lâu hơn 1 hoá đơn

const MAX_FILES = 8;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB tổng, tránh vượt giới hạn payload
// ─── Nhận biết PDF bản SCAN ───
// Phải xét theo TỪNG TRANG, không xét tổng. Một hợp đồng scan 39 trang vẫn rút
// ra được ~689 ký tự (số trang, đầu trang, chữ ký số) — vượt xa mọi ngưỡng tổng
// hợp lý, nên nếu chỉ so tổng thì code tưởng là PDF có chữ rồi gửi đúng mớ rác
// đó cho model, còn tài liệu thật thì model KHÔNG HỀ được nhìn thấy.
// PDF có lớp chữ thật cho ~1.500–3.000 ký tự/trang; scan cho vài chục.
const MIN_PDF_TEXT = 200;
const MIN_CHARS_PER_PAGE = 150;
// Trần ký tự mỗi tệp đưa vào ngữ cảnh. Hợp đồng 60 trang ~ 120k ký tự vẫn lọt,
// nhưng phải chặn để nhiều tệp cộng lại không vượt cửa sổ ngữ cảnh của model.
const MAX_TEXT_PER_FILE = 120000;

type Extracted = Record<string, unknown>;

const buildSystemPrompt = (companyName: string) => `
Bạn là trợ lý phòng Kế hoạch Đấu thầu của công ty ${companyName} (nhà thầu thi công
xây dựng). Nhiệm vụ: đọc BỘ HỒ SƠ đính kèm và bóc tách số liệu để điền vào
"PHIẾU TRÌNH KÝ HỒ SƠ/VĂN BẢN" trình Ban Giám đốc phê duyệt.

━━━ LOẠI TÀI LIỆU BẠN SẼ GẶP ━━━
Đây là hồ sơ NGÀNH XÂY DỰNG. Hợp đồng có thể là một trong các loại:
  • HĐ GIAO KHOÁN (HĐGK)        — khoán nhân công / khoán gọn hạng mục
  • HĐ MUA BÁN (HĐMB)           — cung cấp vật tư, thiết bị
  • HĐ THI CÔNG XÂY DỰNG (HĐTCXD) — thi công xây lắp
  • HĐ THẦU PHỤ (HĐTP), HĐ NGUYÊN TẮC (HĐNT), HĐ THÍ NGHIỆM (HĐTN)
Kèm theo thường có: phụ lục hợp đồng, biên bản nghiệm thu khối lượng hoàn thành,
bảng xác định giá trị đề nghị thanh toán đợt này, đề nghị thanh toán của nhà thầu.

━━━ CÁCH ĐỌC — LÀM ĐÚNG THỨ TỰ NÀY ━━━
ĐỪNG đọc tuần tự từ đầu đến cuối. Hợp đồng xây dựng dài vài chục trang, số liệu
cần tìm nằm gọn trong vài điều khoản. Làm như sau:

BƯỚC 1 — Đọc MỤC LỤC (hoặc danh sách các ĐIỀU) trước tiên.
BƯỚC 2 — Nhảy thẳng tới các điều có tiêu đề liên quan, thường là:
  • "Giá trị hợp đồng" / "Giá hợp đồng" / "Giá trị và giá hợp đồng"
       ➔ lấy giaTriHD (tổng giá trị hợp đồng, thường đã gồm VAT — lấy số
         CUỐI CÙNG sau thuế, không lấy số trước thuế)
  • "Tạm ứng" / "Bảo lãnh tạm ứng" / "Thu hồi tạm ứng"
       ➔ lấy tỉ lệ thu hồi tạm ứng (tyLeThuHoi) và cách khấu trừ mỗi đợt
  • "Thanh toán" / "Giá trị thanh toán" / "Phương thức thanh toán" / "Tiến độ
    thanh toán" / "Hồ sơ thanh toán"
       ➔ lấy tỉ lệ giữ lại mỗi lần nghiệm thu (tyLeGiuLai), thường 5%
  • "Bảo hành" / "Bảo lãnh thực hiện hợp đồng"
       ➔ lấy tỉ lệ/giá trị giữ bảo hành (giuBaoHanh)
BƯỚC 3 — Sang biên bản nghiệm thu / bảng xác định giá trị đợt này để lấy các số
  THỰC TẾ của đợt đang trình: giaTriNghiemThu (A), giuLaiTungLan (C),
  khauTruTamUng (D), luyKeDaThanhToan, tamUngConLai.
BƯỚC 4 — Đối chiếu chéo: nếu hợp đồng ghi giữ lại 5% mà bảng tính ra con số
  khác hẳn, hãy lấy số trong BẢNG (số thực tế của đợt) và ghi mâu thuẫn vào
  trường "ghiChu".

LƯU Ý: hợp đồng cho biết TỈ LỆ và ĐIỀU KIỆN; biên bản nghiệm thu cho biết SỐ
TIỀN THỰC của đợt. Đừng lấy tỉ lệ trong hợp đồng rồi tự nhân ra số tiền — phải
lấy số tiền đã ghi trong hồ sơ nghiệm thu.

━━━ QUY TẮC TỐI QUAN TRỌNG ━━━
1. TUYỆT ĐỐI KHÔNG BỊA SỐ. Đây là số liệu tiền bạc trình Giám đốc ký.
   Không tìm thấy trường nào thì trả null cho trường đó và ghi tên trường vào
   mảng "thieu". Không suy đoán, không lấy số gần đúng, không lấy số của đợt khác.
2. ĐỊNH DẠNG SỐ VIỆT NAM: dấu chấm là phân cách HÀNG NGHÌN, không phải thập phân.
   "205.764.734.000 đồng" ➔ 205764734000 (số nguyên, không dấu, không chữ "đồng").
   "46,5%" hoặc "46.5%" ➔ 46.5 (tỉ lệ trả về dạng số thập phân, không kèm dấu %).
3. CHỈ LẤY SỐ CỦA ĐỢT ĐANG TRÌNH. Hồ sơ hay liệt kê cả các đợt trước để đối
   chiếu — đừng lấy nhầm. Đợt đang trình là đợt có biên bản nghiệm thu mới nhất.

━━━ TỪNG TRƯỜNG ━━━
- "chuDauTu": Tên đầy đủ Chủ đầu tư / Bên A / Bên giao thầu.
  VD "Ban Quản lý Đầu tư và Xây dựng Thủy lợi 10".
- "duAn": Tên CÔNG TRÌNH / DỰ ÁN đầy đủ. Tìm theo thứ tự:
  (1) tiêu đề hợp đồng ở trang bìa — thường có dạng "HỢP ĐỒNG GIAO KHOÁN … công
      trình <TÊN DỰ ÁN>";
  (2) phần "Căn cứ …" ở đầu hợp đồng (căn cứ QĐ phê duyệt dự án <TÊN>);
  (3) Điều 1 "Nội dung công việc" / "Đối tượng hợp đồng";
  (4) dòng "Công trình:" / "Dự án:" trong phần thông tin chung.
  Lấy tên ĐẦY ĐỦ như văn bản ghi, đừng rút gọn.
- "hopDongSo": Số hợp đồng. Lấy đúng chuỗi mã, VD "HD2600063179_2603301653".
- "ngayKyHopDong": Ngày ký hợp đồng, định dạng "DD/M/YYYY" như trong hồ sơ
  (VD "01/4/2026"). Không có thì null.
- "goiThau": Tên gói thầu. Thường có dạng "Gói thầu số XX", "Gói XL01/XL02",
  "Gói thầu XD…". Nằm ở trang bìa, phần "Căn cứ", hoặc Điều 1. Hợp đồng GIAO
  KHOÁN / THẦU PHỤ hay ghi phạm vi công việc thay cho tên gói thầu — khi đó lấy
  phạm vi công việc đó làm goiThau. KHÔNG có thật thì để null, đừng bịa.
- "giaTriHD": Tổng giá trị hợp đồng (số) — lấy ở điều "Giá trị hợp đồng".
  Lấy con số SAU THUẾ (tổng cộng), không lấy dòng trước VAT.
  Có phụ lục điều chỉnh giá thì lấy giá trị SAU điều chỉnh mới nhất.
- "dotSo": Số thứ tự đợt thanh toán đang trình (số nguyên). "Đợt 02" ➔ 2.
- "giaTriNghiemThu": (A) Giá trị khối lượng nghiệm thu hoàn thành CỦA ĐỢT NÀY.
  Lấy ở biên bản nghiệm thu / bảng xác định giá trị đợt này, KHÔNG lấy ở hợp đồng.
- "giuBaoHanh": (B) Giá trị giữ lại bảo hành đợt này. Nhiều hợp đồng chỉ giữ bảo
  hành ở đợt quyết toán cuối, các đợt giữa để 0 — nếu hồ sơ không ghi thì điền 0.
- "giuLaiTungLan": (C) Giá trị giữ lại từng lần nghiệm thu đợt này (điều
  "Thanh toán" quy định tỉ lệ, thường 5% giá trị nghiệm thu).
- "tyLeGiuLai": Tỉ lệ % tương ứng của (C). VD 5. Không ghi thì null.
- "khauTruTamUng": (D) Giá trị khấu trừ/thu hồi tạm ứng đợt này — xem điều
  "Tạm ứng"/"Thu hồi tạm ứng". Đây là tiền TRỪ ĐI, luôn là số dương.
- "tyLeThuHoi": Tỉ lệ % thu hồi tạm ứng của (D). VD 46.5. Không ghi thì null.
- "luyKeDaThanhToan": Luỹ kế giá trị khối lượng hoàn thành ĐÃ thanh toán tính
  đến hết đợt này (cộng dồn các đợt). Không tìm thấy thì null — hệ thống sẽ tự
  cộng từ các đợt đã lưu, ĐỪNG tự cộng nhẩm rồi điền vào.
- "tamUngConLai": Giá trị tạm ứng còn lại CHƯA THU HỒI đến hết đợt này. Số này
  chỉ có ở bảng theo dõi thanh toán / biên bản nghiệm thu. Hợp đồng KHÔNG có nó
  (hợp đồng chỉ ghi tổng tạm ứng ban đầu) -> nếu bộ hồ sơ chỉ có hợp đồng thì
  trả null, ĐỪNG lấy tổng tạm ứng điền vào đây.
- "giaTriTamUng": Tổng giá trị TẠM ỨNG theo hợp đồng (điều "Tạm ứng"). Đây là
  số ghi trong hợp đồng, khác hẳn tamUngConLai ở trên. Không có thì null.
- "tyLeTamUng": Tỉ lệ % tạm ứng theo hợp đồng (VD 30). Không có thì null.
- "thieu": Mảng tên các trường bạn KHÔNG tìm thấy trong hồ sơ.
- "ghiChu": Một câu ngắn nêu điều người lập phiếu cần lưu ý (số liệu mâu thuẫn
  giữa các file, thiếu tài liệu, đợt không rõ ràng...). Không có thì "".

LƯU Ý: KHÔNG tính hộ "Giá trị đề nghị thanh toán" (A-B-C-D) — hệ thống tự tính.

Trả về DUY NHẤT một object JSON, không kèm giải thích, không kèm markdown.

━━━ ĐỊNH DẠNG TRẢ VỀ ━━━
{
  "chuDauTu": "..." hoặc null,
  "duAn": "..." hoặc null,
  "hopDongSo": "..." hoặc null,
  "ngayKyHopDong": "..." hoặc null,
  "goiThau": "..." hoặc null,
  "giaTriHD": 123 hoặc null,
  "dotSo": 2 hoặc null,
  "giaTriNghiemThu": 123 hoặc null,
  "giuBaoHanh": 0 hoặc null,
  "giuLaiTungLan": 123 hoặc null,
  "tyLeGiuLai": 5 hoặc null,
  "khauTruTamUng": 123 hoặc null,
  "tyLeThuHoi": 46.5 hoặc null,
  "luyKeDaThanhToan": 123 hoặc null,
  "tamUngConLai": 123 hoặc null,
  "giaTriTamUng": 123 hoặc null,
  "tyLeTamUng": 30 hoặc null,
  "thieu": ["..."],
  "ghiChu": "..."
}

━━━ NẾU BỘ HỒ SƠ CHỈ CÓ HỢP ĐỒNG ━━━
Hợp đồng KHÔNG chứa số liệu của một đợt thanh toán cụ thể. Khi đó các trường
dotSo, giaTriNghiemThu, giuLaiTungLan, khauTruTamUng, luyKeDaThanhToan,
tamUngConLai đều phải là null — đó là điều BÌNH THƯỜNG, không phải bạn đọc sót.
Hãy ghi vào "ghiChu" câu: "Bộ hồ sơ mới có hợp đồng, chưa có biên bản nghiệm thu
nên chưa có số liệu đợt thanh toán."
`.trim();

const USER_PROMPT =
  "Đây là bộ hồ sơ thanh toán của một hợp đồng xây dựng. Hãy đọc MỤC LỤC / danh " +
  "sách các ĐIỀU trước, nhảy tới các điều về giá trị hợp đồng, tạm ứng và bảo lãnh " +
  "tạm ứng, thanh toán, bảo hành; sau đó lấy số thực tế của đợt này ở biên bản " +
  "nghiệm thu. Trả kết quả theo đúng định dạng JSON đã hướng dẫn.";

// Các trường số — ép kiểu để model trả "1.234" hay "1234 đồng" vẫn ra số.
const NUMERIC = [
  "giaTriHD", "giaTriNghiemThu", "giuBaoHanh", "giuLaiTungLan",
  "khauTruTamUng", "luyKeDaThanhToan", "tamUngConLai", "dotSo",
  "giaTriTamUng",
];
const RATE = ["tyLeGiuLai", "tyLeThuHoi", "tyLeTamUng"];

// Token số ĐẦU TIÊN trong chuỗi. Bắt buộc phải cắt token thay vì lọc hết ký tự
// không phải số: model đôi khi trả nguyên chuỗi hiển thị
// "5.083.257.000 đồng (D) (tỉ lệ thu hồi ~ 46.5%)" — gom hết chữ số sẽ ra
// 5.083.257.000.465, sai gấp nghìn lần mà không có dấu hiệu gì để phát hiện.
const FIRST_NUM = /-?\d[\d.,]*/;

// Dấu chấm trong tiếng Việt vừa là phân cách nghìn ("205.764.734.000") vừa có
// thể là dấu thập phân do model sinh ra kiểu Anh ("46.5"). Phân biệt bằng hình
// dạng: chỉ coi là phân cách nghìn khi mọi nhóm sau dấu chấm đều đúng 3 chữ số.
function parseViNumber(token: string): number | null {
  let s = token;
  if (s.includes(",")) {
    // Có dấu phẩy -> phẩy là thập phân, chấm là phân cách nghìn.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).match(FIRST_NUM);
  return m ? parseViNumber(m[0]) : null;
}

function toRate(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).match(FIRST_NUM);
  if (!m) return null;
  // Tỉ lệ luôn là số nhỏ, không bao giờ có phân cách nghìn -> mọi dấu ngăn đều
  // là thập phân: "46,5%" và "46.5%" cùng ra 46.5.
  const n = Number(m[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normalize(raw: Extracted): Extracted {
  const out: Extracted = { ...raw };
  for (const k of NUMERIC) out[k] = toNumber(raw[k]);
  for (const k of RATE) out[k] = toRate(raw[k]);
  out.thieu = Array.isArray(raw.thieu) ? raw.thieu : [];
  out.ghiChu = typeof raw.ghiChu === "string" ? raw.ghiChu : "";
  return out;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey =
      (authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong Cài đặt AI của Hành chính." },
        { status: 400 }
      );
    }

    const form = await req.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);

    if (files.length === 0) {
      return NextResponse.json(
        { error: "Chưa chọn file hồ sơ nào để phân tích." },
        { status: 400 }
      );
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Tối đa ${MAX_FILES} file mỗi lượt. Bạn đang chọn ${files.length} file.` },
        { status: 400 }
      );
    }

    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      return NextResponse.json(
        {
          error: `Tổng dung lượng ${(total / 1024 / 1024).toFixed(1)}MB vượt giới hạn ${
            MAX_TOTAL_BYTES / 1024 / 1024
          }MB. Bỏ bớt file hoặc nén PDF lại.`,
        },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });
    const systemPrompt = buildSystemPrompt((await getTenantConfigServer()).company_name);
    const model =
      req.headers.get("x-openai-model") || process.env.OPENAI_MODEL || "gpt-4o";

    // ─── Gộp mọi file thành MỘT mảng nội dung cho một lượt gọi ───
    const content: OpenAI.Responses.ResponseInputContent[] = [
      { type: "input_text", text: `${systemPrompt}\n\n${USER_PROMPT}` },
    ];
    const skipped: string[] = [];
    // Nhật ký từng tệp: đọc bằng cách nào, ra bao nhiêu ký tự. Trả về cho giao
    // diện — không có nó thì "AI đọc không ra" là một hộp đen, không biết do
    // model dở, do PDF là bản scan, hay do tệp không được gửi đi.
    const diag: { ten: string; cach: string; kyTu?: number; trang?: number }[] = [];

    for (const file of files) {
      const name = file.name;
      const lower = name.toLowerCase();
      const buf = Buffer.from(await file.arrayBuffer());

      if (lower.endsWith(".pdf")) {
        // RÚT TEXT TRƯỚC, chỉ gửi nguyên tệp khi PDF không có lớp text.
        //
        // Vì sao không gửi thẳng input_file cho mọi PDF: hợp đồng xây dựng dài
        // vài chục trang, gửi dạng tệp thì model đọc rất chọn lọc và hay bỏ sót
        // đúng mấy điều khoản mình cần. Đưa text thô vào ngữ cảnh thì nó thấy
        // TOÀN BỘ, tìm điều khoản chắc hơn hẳn và rẻ hơn nhiều.
        let text = "";
        let pages = 0;
        try {
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: buf });
          const parsed = await parser.getText();
          text = (parsed.text || "").trim();
          pages = parsed.total || 0;
          await parser.destroy();
        } catch {
          // PDF hỏng / mã hoá / bản scan -> để rơi xuống nhánh gửi tệp bên dưới.
        }

        // Mật độ chữ trên mỗi trang mới là thước đo. Không biết số trang thì
        // đành xét tổng (coi như 1 trang).
        const perPage = pages > 0 ? text.length / pages : text.length;
        const coChuThat = text.length >= MIN_PDF_TEXT && perPage >= MIN_CHARS_PER_PAGE;

        if (coChuThat) {
          const clipped = text.length > MAX_TEXT_PER_FILE;
          content.push({
            type: "input_text",
            text: `\n--- NỘI DUNG FILE "${name}" (${pages} trang) ---\n`
              + text.slice(0, MAX_TEXT_PER_FILE)
              + (clipped ? "\n[... đã cắt bớt phần cuối vì quá dài ...]" : ""),
          });
          diag.push({
            ten: name,
            cach: clipped ? "text (cắt bớt vì quá dài)" : "text",
            kyTu: text.length,
            trang: pages,
          });
        } else {
          // PDF bản scan -> gửi nguyên tệp để model đọc bằng thị giác (OCR).
          // Nói trước cho model biết là bản scan: nó sẽ chịu khó đọc ảnh từng
          // trang thay vì tìm lớp text (vốn không có) rồi báo không thấy gì.
          content.push({
            type: "input_text",
            text: `\n--- FILE "${name}" (${pages} trang) là BẢN SCAN, không có lớp chữ. `
              + `Hãy ĐỌC ẢNH từng trang để lấy nội dung. Ưu tiên tìm trang mục lục / danh `
              + `sách các ĐIỀU trước, rồi mở tới các điều về giá trị hợp đồng, tạm ứng, `
              + `thanh toán, bảo hành. ---`,
          });
          content.push({
            type: "input_file",
            filename: name,
            file_data: `data:application/pdf;base64,${buf.toString("base64")}`,
          });
          diag.push({
            ten: name,
            cach: `bản scan (${Math.round(perPage)} ký tự/trang) — đọc bằng ảnh, chậm hơn`,
            kyTu: text.length,
            trang: pages,
          });
        }
      } else if (/\.(png|jpg|jpeg|webp)$/.test(lower)) {
        const mime = lower.endsWith(".png")
          ? "image/png"
          : lower.endsWith(".webp")
          ? "image/webp"
          : "image/jpeg";
        content.push({
          type: "input_image",
          image_url: `data:${mime};base64,${buf.toString("base64")}`,
          detail: "high",
        });
        diag.push({ ten: name, cach: "ảnh — đọc bằng thị giác" });
      } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
        // Word: model không đọc trực tiếp -> rút text rồi chèn vào ngữ cảnh.
        const mammoth = await import("mammoth");
        const text = ((await mammoth.extractRawText({ buffer: buf })).value || "").trim();
        if (text.length < 10) {
          skipped.push(`${name} (Word rỗng hoặc không đọc được text)`);
          continue;
        }
        content.push({
          type: "input_text",
          text: `\n--- NỘI DUNG FILE "${name}" ---\n${text.slice(0, MAX_TEXT_PER_FILE)}`,
        });
        diag.push({ ten: name, cach: "Word — rút text", kyTu: text.length });
      } else if (/\.(xlsx|xls)$/.test(lower)) {
        // Excel: đọc mọi sheet thành text thô. Bảng xác định giá trị thanh toán
        // rất hay ở dạng Excel nên không bỏ qua được.
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "buffer" });
        const parts = wb.SheetNames.map(
          (s) => `# Sheet: ${s}\n${XLSX.utils.sheet_to_csv(wb.Sheets[s])}`
        ).join("\n\n");
        if (parts.trim().length < 10) {
          skipped.push(`${name} (Excel rỗng)`);
          continue;
        }
        content.push({
          type: "input_text",
          text: `\n--- NỘI DUNG FILE "${name}" ---\n${parts.slice(0, MAX_TEXT_PER_FILE)}`,
        });
        diag.push({ ten: name, cach: "Excel — đọc mọi sheet", kyTu: parts.length });
      } else {
        skipped.push(`${name} (định dạng không hỗ trợ)`);
      }
    }

    // Chỉ còn mỗi câu prompt -> không file nào dùng được.
    if (content.length === 1) {
      return NextResponse.json(
        {
          error: "Không đọc được file nào trong số đã chọn.",
          boQua: skipped,
        },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model,
      input: [{ role: "user", content }],
      text: { format: { type: "json_object" } },
    });

    let parsed: Extracted;
    try {
      parsed = JSON.parse(response.output_text || "{}");
    } catch {
      return NextResponse.json(
        { error: "Model trả về dữ liệu không phải JSON hợp lệ. Thử lại hoặc bớt file." },
        { status: 502 }
      );
    }

    const data = normalize(parsed);

    return NextResponse.json({
      data,
      // Trả về để giao diện nói rõ đã đọc file nào, bỏ file nào — người lập
      // phiếu cần biết số liệu này đến từ đâu trước khi trình Giám đốc ký.
      daDoc: files.map((f) => f.name).filter((n) => !skipped.some((s) => s.startsWith(n))),
      boQua: skipped,
      // Nhật ký đọc tệp + model đã dùng. Khi AI bóc ra ít, đây là thứ phân biệt
      // "PDF là bản scan không rút được chữ" với "model đọc được nhưng bỏ sót".
      nhatKy: diag,
      model,
    });
  } catch (error: unknown) {
    console.error("Analyze signing dossier error:", error);
    const msg = error instanceof Error ? error.message : "Lỗi phân tích hồ sơ";

    // 429 = vượt hạn mức token/phút của tài khoản OpenAI, KHÔNG phải hồ sơ sai.
    // Thông báo gốc toàn tiếng Anh kèm link, người dùng đọc không biết làm gì.
    if (/429|rate limit|too large|TPM/i.test(msg)) {
      const need = msg.match(/Requested\s+(\d+)/i)?.[1];
      const limit = msg.match(/Limit\s+(\d+)/i)?.[1];
      return NextResponse.json(
        {
          error:
            "Hồ sơ quá nặng so với hạn mức OpenAI của công ty"
            + (need && limit ? ` (cần ${Number(need).toLocaleString("vi-VN")} token, hạn mức ${Number(limit).toLocaleString("vi-VN")} token/phút)` : "")
            + ". Cách xử lý: bóc tách từng tệp một, hoặc bỏ bớt tệp không cần,"
            + " hoặc chờ 1 phút rồi thử lại. PDF scan nhiều trang tốn token nhất —"
            + " nếu chỉ cần vài trang thì cắt riêng mấy trang đó ra rồi tải lên.",
          maLoi: "rate_limit",
        },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

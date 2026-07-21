import { requireApiAuth } from "@/lib/apiAuth";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Polyfill DOMMatrix cho Node.js (pdfjs-dist v5+ yêu cầu DOMMatrix trong môi trường browser)
if (typeof globalThis.DOMMatrix === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrix = class DOMMatrix {
    m11=1; m12=0; m13=0; m14=0;
    m21=0; m22=1; m23=0; m24=0;
    m31=0; m32=0; m33=1; m34=0;
    m41=0; m42=0; m43=0; m44=1;
    is2D=true; isIdentity=true;
    constructor() {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromMatrix(m: any) { return new (globalThis as any).DOMMatrix(m); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromFloat32Array(a: any) { return new (globalThis as any).DOMMatrix(a); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static fromFloat64Array(a: any) { return new (globalThis as any).DOMMatrix(a); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    multiply(m: any) { void m; return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    translate(x: any, y: any, z?: any) { void x; void y; void z; return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    scale(s: any) { void s; return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rotate(a: any) { void a; return this; }
    inverse() { return this; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transformPoint(p: any) { return p || { x: 0, y: 0 }; }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
    toString() { return "matrix(1, 0, 0, 1, 0, 0)"; }
  };
}

// Cấu hình GlobalWorkerOptions và WorkerMessageHandler cho pdfjs-dist trong Node.js / Next.js
try {
  const path = require("path");
  const pdfjsWorker = require("pdfjs-dist/legacy/build/pdf.worker.mjs");
  (globalThis as any).pdfjsWorker = {
    WorkerMessageHandler: pdfjsWorker.WorkerMessageHandler
  };
  const pdfjs = require("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
} catch (e) {
  console.warn("Failed to set pdfjs worker setup:", e);
}

export const maxDuration = 60; // Vercel max for hobby plan

const SYSTEM_PROMPT = `
Bạn là Chuyên gia Tuyển dụng AI (AI Recruitment Expert).
Nhiệm vụ: Đọc CV ứng viên và thực hiện ĐỒNG THỜI hai việc:
  1. TRÍCH XUẤT thông tin cá nhân theo đúng 16 trường quy định.
  2. CHẤM ĐIỂM mức độ phù hợp với JD (Job Description).

━━━ QUY TẮC TRÍCH XUẤT (extracted_info) ━━━
- Trích xuất chính xác, không suy diễn ngoài CV.
- Trường không có trong CV → điền chính xác chuỗi "N/A".
- Ngày: luôn định dạng YYYY-MM-DD.
- SĐT: Luôn định dạng: 0xxx xxx xxx (ví dụ: 0932 458 213). Bắt buộc có khoảng trắng ngăn cách. Ghi là text (chuỗi), không phải số nguyên.
- Bằng cấp chuẩn hóa về: ĐH | CĐ | Thạc sĩ | THPT | N/A.
- Kinh nghiệm: Tính TỔNG số năm kinh nghiệm làm việc của ứng viên.
  + Định dạng trả về bắt buộc: "X năm" (ví dụ: "1 năm", "3 năm", "10 năm").
  + Nếu là sinh viên mới ra trường hoặc chưa có kinh nghiệm → trả về "Fresher".
  + Nếu không có thông tin trong CV → trả về "N/A".
- Chức danh gần nhất: Tìm vị trí / chức danh công việc GẦN NHẤT (ưu tiên năm mới nhất: 2025 > 2024 > 2023...).
  + Trả về chức danh dạng ngắn gọn (ví dụ: "Nhân viên", "Chuyên viên", "Kỹ sư kết cấu", "Trưởng phòng").
  + Nếu không rõ → trả về "N/A".
- Công ty gần nhất: Tìm tên công ty / tổ chức ứng viên làm việc GẦN NHẤT (ưu tiên năm mới nhất: 2025 > 2024 > 2023...).
  + Trả về tên đầy đủ của công ty (ví dụ: "Công ty TNHH ABC", "Tập đoàn XYZ").
  + Nếu không rõ → trả về "N/A".
- Vị trí ứng tuyển: Vị trí / công việc mà ứng viên MUỐN APPLY (lấy từ CV, không phải từ JD).
  + Tìm trong CV các từ khóa: "Vị trí ứng tuyển", "Mục tiêu nghề nghiệp", "Vị trí mong muốn"...
  + Nếu không ghi rõ → suy từ mục tiêu và kinh nghiệm trong CV (ví dụ: CV toàn đấu thầu → "Kỹ sư Đấu Thầu").
  + CHỈ điền chức danh ngắn gọn (ví dụ: "Kỹ sư kết cấu cầu", "Kế toán tổng hợp", "Nhân viên văn thư").
  + Tuyệt đối KHÔNG sao chép tên phòng ban → chỉ đưa ra chức danh công việc.
- Nguồn: điền nguồn ứng viên được cung cấp.
- Phòng Ban & Người đánh giá: điền "N/A" cho cả hai trường này (hệ thống sẽ tự phân loại sau).

━━━ ĐẶC THÙ NGÀNH XÂY DỰNG – VỊ TRÍ TRỢ LÝ GIÁM ĐỐC ━━━
Khi JD hoặc vị trí ứng tuyển liên quan đến "Trợ lý Giám đốc", "Thư ký Ban Giám đốc", "Assistant to Director" trong công ty xây dựng/hạ tầng/giao thông, áp dụng bộ tiêu chí sau:

► CHUYÊN NGÀNH PHÙ HỢP (chấp nhận):
  - Xây dựng cầu đường, Giao thông, Hạ tầng, Xây dựng dân dụng & công nghiệp
  - Quản lý xây dựng, Công nghệ kỹ thuật xây dựng
  - Kinh tế xây dựng, Kỹ thuật công trình
  - Quản trị kinh doanh, Quản lý dự án (nếu có kinh nghiệm ngành xây dựng)
  - Lưu ý: ĐH/CĐ là yêu cầu tối thiểu – sinh viên chưa tốt nghiệp không đủ điều kiện.

► HARD SKILLS ĐẶC THÙ (cần đối chiếu kỹ trong CV):
  NHÓM 1 – VĂN PHÒNG & CÔNG NGHỆ (bắt buộc):
  - Thành thạo Word, Excel, PowerPoint (tìm kiếm: "soạn thảo văn bản", "báo cáo tổng hợp", "lập bảng biểu", "trình bày slide")
  - Sử dụng công cụ AI: ChatGPT, Copilot, Gemini, hoặc các AI hỗ trợ công việc
  - Email & lịch công tác: quản lý lịch họp, sắp xếp cuộc họp, theo dõi tiến độ công việc
  
  NHÓM 2 – TỔNG HỢP BÁO CÁO & PHỐI HỢP (quan trọng):
  - Tổng hợp báo cáo định kỳ (tuần/tháng/quý)
  - Phân tích dữ liệu, lập bảng theo dõi dự án
  - Soạn thảo văn bản hành chính, công văn, tờ trình
  - Điều phối thông tin giữa các phòng ban / dự án
  
  NHÓM 3 – HIỂU BIẾN NGÀNH XÂY DỰNG (lợi thế lớn):
  - Có kinh nghiệm làm việc tại công ty xây dựng, nhà thầu, tư vấn giám sát, chủ đầu tư
  - Hiểu quy trình dự án xây dựng: lập hồ sơ, giám sát tiến độ, thanh quyết toán
  - Quen thuộc với: hồ sơ thầu, hồ sơ pháp lý, biên bản nghiệm thu
  - Kinh nghiệm trợ lý dự án hoặc trợ lý Ban Giám đốc trong lĩnh vực xây dựng

► SOFT SKILLS ƯU TIÊN:
  - Kỹ năng giao tiếp, phối hợp đa phòng ban
  - Làm việc độc lập, chủ động, cẩn thận, có trách nhiệm
  - Chịu được áp lực công việc
  - Tiếng Anh giao tiếp / đọc hiểu tài liệu (lợi thế)
  - Có thể đi công tác (lợi thế)

► ĐỐI TƯỢNG ƯU TIÊN:
  - Nữ, tuổi 23-35
  - Có kinh nghiệm làm trợ lý/thư ký Ban Giám đốc
  - Có kinh nghiệm quản lý dự án xây dựng
  - Có khả năng giao tiếp tiếng Anh

► CÁCH ĐỌC HIỂU CV ĐỂ ĐỐI CHIẾU:
  1. Đọc phần "Kinh nghiệm làm việc" → Xác định đã từng làm trợ lý/thư ký/PA chưa
  2. Đọc phần "Kỹ năng" → Tìm các phần mềm văn phòng, công cụ AI, kỹ năng tổng hợp báo cáo
  3. Đọc phần "Học vấn" → Kiểm tra chuyên ngành có liên quan xây dựng/kỹ thuật không
  4. Đọc "Mục tiêu nghề nghiệp" → Có định hướng làm trợ lý/hành chính không
  5. Ưu tiên ứng viên có kinh nghiệm THỰC TẾ trong doanh nghiệp ngành xây dựng
  6. KHÔNG loại ngay nếu chuyên ngành không phải xây dựng – cần đánh giá kinh nghiệm thực tế

━━━ QUY TẮC CHẤM ĐIỂM (score) ━━━
Bước 1: Phân tích JD → xác định đây có phải vị trí "Trợ lý Giám đốc ngành xây dựng" không.
  - Nếu CÓ → áp dụng bộ tiêu chí ĐẶC THÙ NGÀNH ở trên.
  - Nếu KHÔNG → áp dụng bộ tiêu chí CHUNG cho các vị trí khác (Hành chính, Nhân sự, Kế toán, Kỹ sư, v.v.) dựa trên yêu cầu trong JD.
Bước 2: Quét toàn bộ CV (không chỉ phần "Kỹ năng") để tìm bằng chứng kỹ năng và kinh nghiệm thực tế.
  - Ưu tiên các kỹ năng được chứng minh qua lịch sử kinh nghiệm làm việc thực tế, không chỉ liệt kê từ khóa.
Bước 3: Tính điểm:
  * Trường hợp 1: Nếu là vị trí Trợ lý GĐ ngành xây dựng:
    - Kỹ năng văn phòng & tổng hợp (Max 30): Word/Excel/PPT + báo cáo + điều phối.
    - Hiểu biết & kinh nghiệm ngành xây dựng (Max 25): từng làm ở DN xây dựng / quen quy trình dự án.
    - Kinh nghiệm trợ lý / thư ký (Max 25): số năm & vị trí phù hợp.
    - Soft skills & ưu tiên (Max 20): giới tính, tuổi, tiếng Anh, công tác, AI tools.
  * Trường hợp 2: Đối với các vị trí tuyển dụng thông thường khác (như Hành chính, Nhân sự, Kế toán, Kỹ sư...):
    - Kinh nghiệm làm việc liên quan (Max 40): Số năm làm việc và độ tương thích với vị trí trong JD (Ví dụ: ứng viên có trên 3 năm kinh nghiệm làm hành chính/nhân sự đúng như JD yêu cầu sẽ nhận 35-40 điểm).
    - Kỹ năng chuyên môn / Hard Skills (Max 25): Mức độ tương thích giữa kỹ năng trong CV với các yêu cầu kỹ thuật/nghiệp vụ cụ thể trong JD (Ví dụ: đặt vé, quản lý thiết bị văn phòng, điều phối xe, lưu trữ hồ sơ, xử lý chứng từ thanh toán).
    - Học vấn / Bằng cấp (Max 15): Trình độ bằng cấp và chuyên ngành có phù hợp với vị trí ứng tuyển.
    - Kỹ năng mềm & Công cụ văn phòng (Max 20): Word, Excel, PowerPoint, giao tiếp, ngoại ngữ, công cụ AI.
Bước 4: Phạt điểm (áp dụng chung):
  - -20 nếu không đạt yêu cầu bằng cấp tối thiểu ghi trong JD.
  - -15 nếu không có kỹ năng làm việc hoặc kinh nghiệm liên quan cơ bản nào.
  - -10 nếu là sinh viên mới ra trường ứng tuyển vào vị trí yêu cầu kinh nghiệm.

ĐIỂM CUỐI CÙNG = (Kinh nghiệm) + (Kỹ năng) + (Học vấn) + (Soft skills) - Phạt (Không âm).
Nếu score >= 70 → Trạng thái = "PASS CV", ngược lại = "FAIL".

━━━ TÍNH NHẤT QUÁN & ĐỊNH HÌNH ĐIỂM SỐ (Consistency & Determinism) ━━━
- Quá trình chấm điểm phải tuyệt đối KHÁCH QUAN, ĐỒNG NHẤT và KHÔNG ĐƯỢC phép thay đổi kết quả ngẫu nhiên giữa các lần chấm.
- Với cùng một hồ sơ CV và mô tả công việc JD, bạn bắt buộc phải tính toán ra số điểm giống nhau 100% trong mọi lần chạy (ví dụ chấm 10 lần đều phải ra cùng một số điểm).
- Thực hiện cộng/trừ điểm một cách cơ học và toán học chuẩn xác theo đúng khung tiêu chí đã quy định, không được tự ý nâng/hạ điểm số dựa trên cảm tính.

━━━ ĐỐI CHIẾU CHI TIẾT JD VS CV (YÊU CẦU BẮT BUỘC) ━━━
Trích xuất song song yêu cầu tiêu chuẩn tuyển dụng từ JD và bằng chứng tìm thấy trong CV để phục vụ đối chiếu chi tiết:
- "jd_requirements":
  + bat_buoc: Các tiêu chí/kỹ năng bắt buộc của vị trí.
  + uu_tien: Các điểm ưu tiên hoặc nice-to-have.
  + hoc_van: Yêu cầu bằng cấp tối thiểu từ JD.
  + kinh_nghiem_yeu_cau: Yêu cầu số năm kinh nghiệm từ JD.
- "cv_evidence":
  + dap_ung: Các bằng chứng CV đáp ứng (kèm trích dẫn nguyên văn câu/cụm từ mô tả trong CV).
  + khong_dap_ung: Các điểm thiếu sót hoặc không tìm thấy trong CV.

━━━ OUTPUT FORMAT (JSON ONLY) ━━━
Trả về duy nhất định dạng JSON sau (không kèm lời dẫn, không bọc trong tag \`\`\`json):
{
  "jd_requirements": {
    "bat_buoc": ["yêu cầu bắt buộc 1", "yêu cầu bắt buộc 2"],
    "uu_tien": ["ưu tiên 1"],
    "hoc_van": "bằng cấp yêu cầu",
    "kinh_nghiem_yeu_cau": "X năm"
  },
  "cv_evidence": {
    "dap_ung": ["yêu cầu X -> bằng chứng: [trích dẫn từ CV]"],
    "khong_dap_ung": ["yêu cầu Y -> Không tìm thấy trong CV"]
  },
  "extracted_info": {
    "stt": null,
    "ngay": "YYYY-MM-DD",
    "ten_ung_vien": "Tên ứng viên",
    "email": "Email",
    "sdt": "Số điện thoại",
    "bang_cap": "Bằng cấp",
    "chuyen_nganh": "Chuyên ngành",
    "kinh_nghiem": "Số năm kinh nghiệm",
    "chuc_danh_gan_nhat": "Chức danh",
    "cong_ty_gan_nhat": "Tên công ty",
    "khu_vuc": "Khu vực",
    "phong_ban": "N/A",
    "vi_tri": "Vị trí ứng tuyển từ CV",
    "trang_thai": "PASS CV | FAIL",
    "nguon": "Nguồn cung cấp",
    "nguoi_danh_gia": "N/A"
  },
  "score": 0,
  "score_breakdown": {
    "kinh_nghiem": {
      "diem": 0,
      "toi_da": 25, // Điền 25 nếu là Trường hợp 1 (Trợ lý GĐ), hoặc 40 nếu là Trường hợp 2 (vị trí khác)
      "ly_do": "Kinh nghiệm làm việc: X/25đ hoặc X/40đ. [Trích dẫn: \\\"...\\\"]"
    },
    "ky_nang": {
      "diem": 0,
      "toi_da": 30, // Điền 30 nếu là Trường hợp 1 (Trợ lý GĐ), hoặc 25 nếu là Trường hợp 2 (vị trí khác)
      "ly_do": "Kỹ năng chuyên môn/văn phòng: X/30đ hoặc X/25đ. [Trích dẫn: \\\"...\\\"]"
    },
    "hoc_van": {
      "diem": 0,
      "toi_da": 25, // Điền 25 nếu là Trường hợp 1 (Trợ lý GĐ), hoặc 15 nếu là Trường hợp 2 (vị trí khác)
      "ly_do": "Học vấn / hiểu biết ngành: X/25đ hoặc X/15đ. [Trích dẫn: \\\"...\\\"]"
    },
    "soft_skill": {
      "diem": 0,
      "toi_da": 20, // Điền 20 cho cả hai trường hợp
      "ly_do": "Soft skills & ưu tiên: X/20đ. [Trích dẫn: \\\"...\\\"]"
    },
    "phat": {
      "diem": 0,
      "toi_da": 0,
      "ly_do": "Lỗi phạt trừ điểm: -Xđ. [Ghi rõ lý do phạt]"
    }
  },
  "matching_skills": ["danh sách kỹ năng khớp"],
  "missing_skills": ["danh sách kỹ năng thiếu"],
  "summary": "Giải thích ngắn gọn cách chấm",
  "recommendation": "Interview | Hold | Reject"
}
`;


// Classification logic (port from department_classifier.py)
const DEPT_KEYWORDS: Record<string, string[]> = {
  "Phòng Kế Hoạch": ["đấu thầu", "dau thau", "dự toán", "du toan", "bóc tách khối lượng", "quyết toán", "quyet toan", "kinh tế xây dựng", "kinh te xay dung", "kế hoạch", "ke hoach"],
  "Phòng Kỹ Thuật": ["shopdrawing", "shop drawing", "kết cấu cầu", "ket cau cau", "kỹ thuật", "ky thuat", "bản vẽ", "ban ve", "thiết kế", "thiet ke", "cầu đường", "cau duong", "thi công", "thi cong"],
  "Phòng ATLĐ": ["hse", "an toàn lao động", "an toan lao dong", "atlđ", "atld", "pccc", "môi trường", "moi truong"],
  "Phòng Vật Tư Thiết Bị": ["vật tư", "vat tu", "cung ứng", "cung ung", "mua hàng", "mua hang", "logistics", "kho", "warehouse", "thiết bị", "thiet bi", "procurement"],
  "Phòng Tài Chính Kế Toán": ["kế toán", "ke toan", "tài chính", "tai chinh", "hạch toán", "hach toan", "công nợ", "cong no", "thuế", "thue", "kiểm toán", "kiem toan"],
  "Phòng Hành Chính Nhân Sự": ["hành chính", "hanh chinh", "nhân sự", "nhan su", "tuyển dụng", "tuyen dung", "văn thư", "van thu", "marketing", "hr", "đào tạo", "dao tao"],
  "Phòng Thư Ký, Trợ Lý": ["thư ký", "thu ky", "trợ lý", "tro ly", "trợ lý giám đốc", "tro ly giam doc", "secretary", "assistant", "administrative assistant"],
  "Phòng Dự Án": ["quản lý dự án", "quan ly du an", "dự án", "du an", "project manager", "project management", "điều phối dự án", "dieu phoi du an"],
  "Phòng QLCC": ["quản lý chất lượng", "quan ly chat luong", "qlcc", "chất lượng công trình", "chat luong cong trinh", "quality control", "qc", "kiểm định", "kiem dinh"],
};
const REVIEWER_MAP: Record<string, string> = {
  "Phòng Kỹ Thuật": "Phó Giám Đốc",
  "Phòng Dự Án": "PP Dự Án",
  "Phòng Vật Tư Thiết Bị": "TP Vật Tư Thiết Bị",
  "Phòng Kế Hoạch": "TP Kế Hoạch",
  "Phòng ATLĐ": "TP ATLĐ",
  "Phòng Hành Chính Nhân Sự": "TP HCNS",
  "Phòng QLCC": "Ban Lãnh Đạo",
  "Phòng Thư Ký, Trợ Lý": "Ban Lãnh Đạo",
  "Phòng Tài Chính Kế Toán": "Kế Toán Trưởng",
};

function classifyDept(jdText: string, viTri = ""): { phong_ban: string; nguoi_danh_gia: string } {
  const combined = (jdText + " " + viTri).toLowerCase();
  const scores: Record<string, number> = {};
  for (const [dept, kws] of Object.entries(DEPT_KEYWORDS)) {
    const count = kws.filter((kw) => combined.includes(kw)).length;
    if (count > 0) scores[dept] = count;
  }
  const phong_ban = Object.keys(scores).length
    ? Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0]
    : "N/A";
  return { phong_ban, nguoi_danh_gia: REVIEWER_MAP[phong_ban] ?? "N/A" };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const auth = await requireApiAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY chưa được cấu hình. Vui lòng nhập trong phần Cài đặt." }, { status: 500 });
    }

    const form = await req.formData();
    const jdText = (form.get("jd_text") as string) || "";
    const nguon = (form.get("nguon") as string) || "N/A";
    const file = form.get("cv_file") as File | null;

    if (!file) return NextResponse.json({ error: "Thiếu file CV." }, { status: 400 });

    const today = new Date().toISOString().slice(0, 10);
    const openai = new OpenAI({ apiKey });

    // ── Extract CV content ────────────────────────────────────────────────
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileType = file.name.toLowerCase();

    let messages: OpenAI.Chat.ChatCompletionMessageParam[];

    if (fileType.endsWith(".pdf")) {
      // Gửi PDF trực tiếp lên OpenAI Responses API (không cần pdf-parse, tương thích Vercel)
      const base64Pdf = fileBuffer.toString("base64");
      const cvPrompt = `--- MÔ TẢ CÔNG VIỆC (JD) ---\n${jdText}\n\nTRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON.`;
      const cvModel = process.env.OPENAI_MODEL || "gpt-4o";
      try {
        const response = await openai.responses.create({
          model: cvModel,
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: `${SYSTEM_PROMPT}\n\n${cvPrompt}` },
              { type: "input_file", filename: file.name, file_data: `data:application/pdf;base64,${base64Pdf}` },
            ],
          }],
          text: { format: { type: "json_object" } },
          temperature: 0,
        });
        const rawJson = response.output_text || "{}";
        const data = JSON.parse(rawJson);

        // ── Override phong_ban + nguoi_danh_gia ───────────────────────────────
        const viTri = data.extracted_info?.vi_tri || "";
        const { phong_ban, nguoi_danh_gia } = classifyDept(jdText, viTri);
        if (data.extracted_info) {
          data.extracted_info.phong_ban = phong_ban;
          data.extracted_info.nguoi_danh_gia = nguoi_danh_gia;
          data.extracted_info.nguon = nguon;
          data.extracted_info.ngay = today;
          if (!viTri || viTri.toUpperCase() === "N/A") {
            const cd = data.extracted_info.chuc_danh_gan_nhat || "";
            data.extracted_info.vi_tri = cd && cd.toUpperCase() !== "N/A" ? cd : "N/A";
          }
        }
        data.file_name = file.name;
        return NextResponse.json(data);
      } catch (pdfErr: unknown) {
        const msg = pdfErr instanceof Error ? pdfErr.message : String(pdfErr);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    } else if (fileType.endsWith(".docx") || fileType.endsWith(".doc")) {
      // Extract text with mammoth then call Responses API
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const cvText = result.value?.trim() || "";

      if (!cvText) {
        return NextResponse.json({ error: "Không thể đọc nội dung file DOCX. File có thể bị lỗi hoặc được bảo vệ bằng mật khẩu." }, { status: 400 });
      }

      const cvModel = process.env.OPENAI_MODEL || "gpt-4o";
      try {
        const response = await openai.responses.create({
          model: cvModel,
          input: [{
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${SYSTEM_PROMPT}\n\n--- MÔ TẢ CÔNG VIỆC (JD) ---\n${jdText}\n\n--- NỘI DUNG CV ---\n${cvText}\n\nTRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON.`,
              },
            ],
          }],
          text: { format: { type: "json_object" } },
          temperature: 0,
        });
        const rawJson = response.output_text || "{}";
        const data = JSON.parse(rawJson);

        const viTri = data.extracted_info?.vi_tri || "";
        const { phong_ban, nguoi_danh_gia } = classifyDept(jdText, viTri);
        if (data.extracted_info) {
          data.extracted_info.phong_ban = phong_ban;
          data.extracted_info.nguoi_danh_gia = nguoi_danh_gia;
          data.extracted_info.nguon = nguon;
          data.extracted_info.ngay = today;
          if (!viTri || viTri.toUpperCase() === "N/A") {
            const cd = data.extracted_info.chuc_danh_gan_nhat || "";
            data.extracted_info.vi_tri = cd && cd.toUpperCase() !== "N/A" ? cd : "N/A";
          }
        }
        data.file_name = file.name;
        return NextResponse.json(data);
      } catch (docxErr: unknown) {
        const msg = docxErr instanceof Error ? docxErr.message : String(docxErr);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    } else if (fileType.endsWith(".png") || fileType.endsWith(".jpg") || fileType.endsWith(".jpeg")) {
      // Vision mode via Responses API
      const base64 = fileBuffer.toString("base64");
      const mimeType = fileType.endsWith(".png") ? "image/png" : "image/jpeg";
      const cvModel = process.env.OPENAI_MODEL || "gpt-4o";
      try {
        const response = await openai.responses.create({
          model: cvModel,
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: `${SYSTEM_PROMPT}\n\n--- MÔ TẢ CÔNG VIỆC (JD) ---\n${jdText}\n\n--- ẢNH CHỤP CV ---\nTRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON.` },
              { type: "input_image", image_url: `data:${mimeType};base64,${base64}`, detail: "high" },
            ],
          }],
          text: { format: { type: "json_object" } },
          temperature: 0,
        });
        const rawJson = response.output_text || "{}";
        const data = JSON.parse(rawJson);

        const viTri = data.extracted_info?.vi_tri || "";
        const { phong_ban, nguoi_danh_gia } = classifyDept(jdText, viTri);
        if (data.extracted_info) {
          data.extracted_info.phong_ban = phong_ban;
          data.extracted_info.nguoi_danh_gia = nguoi_danh_gia;
          data.extracted_info.nguon = nguon;
          data.extracted_info.ngay = today;
          if (!viTri || viTri.toUpperCase() === "N/A") {
            const cd = data.extracted_info.chuc_danh_gan_nhat || "";
            data.extracted_info.vi_tri = cd && cd.toUpperCase() !== "N/A" ? cd : "N/A";
          }
        }
        data.file_name = file.name;
        return NextResponse.json(data);
      } catch (imgErr: unknown) {
        const msg = imgErr instanceof Error ? imgErr.message : String(imgErr);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    } else if (fileType.endsWith(".txt")) {
      const cvText = fileBuffer.toString("utf-8");
      const cvModel = process.env.OPENAI_MODEL || "gpt-4o";
      try {
        const response = await openai.responses.create({
          model: cvModel,
          input: [{
            role: "user",
            content: [
              {
                type: "input_text",
                text: `${SYSTEM_PROMPT}\n\n--- MÔ TẢ CÔNG VIỆC (JD) ---\n${jdText}\n\n--- NỘI DUNG CV ---\n${cvText}\n\nTRÍCH XUẤT ĐẦY ĐỦ 16 TRƯỜNG VÀ CHẤM ĐIỂM. TRẢ VỀ JSON.`,
              },
            ],
          }],
          text: { format: { type: "json_object" } },
          temperature: 0,
        });
        const rawJson = response.output_text || "{}";
        const data = JSON.parse(rawJson);

        const viTri = data.extracted_info?.vi_tri || "";
        const { phong_ban, nguoi_danh_gia } = classifyDept(jdText, viTri);
        if (data.extracted_info) {
          data.extracted_info.phong_ban = phong_ban;
          data.extracted_info.nguoi_danh_gia = nguoi_danh_gia;
          data.extracted_info.nguon = nguon;
          data.extracted_info.ngay = today;
          if (!viTri || viTri.toUpperCase() === "N/A") {
            const cd = data.extracted_info.chuc_danh_gan_nhat || "";
            data.extracted_info.vi_tri = cd && cd.toUpperCase() !== "N/A" ? cd : "N/A";
          }
        }
        data.file_name = file.name;
        return NextResponse.json(data);
      } catch (txtErr: unknown) {
        const msg = txtErr instanceof Error ? txtErr.message : String(txtErr);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    } else {
      return NextResponse.json({ error: "Định dạng file không hỗ trợ. Dùng PDF, DOCX, PNG, JPG, hoặc TXT." }, { status: 400 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

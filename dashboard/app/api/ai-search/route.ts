import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { normalizePlan, isFeatureAllowed } from "@/lib/planShared";
import { getTenantConfigServer } from "@/lib/tenantConfigServer";

export const maxDuration = 60; // Allow enough time for AI response

// ─────────────────────────────────────────────────────────────────────────────
// KHU VỰC CẤM TUYỆT ĐỐI: Lương CBNV & Hợp đồng lao động.
// AI KHÔNG được tìm kiếm / trích xuất các thông tin này cho BẤT KỲ tài khoản nào
// (kể cả Admin / Trưởng phòng HCNS). Mọi câu hỏi chạm vào nhóm này đều bị từ chối.
// ─────────────────────────────────────────────────────────────────────────────
const SALARY_KEYWORDS = [
  "lương", "salary", "thu nhập", "thu nhap", "income",
  "phụ cấp", "phu cap", "allowance", "bảo hiểm", "bao hiem",
  "insurance", "bonus", "thưởng", "thuong", "tiền lương", "tien luong",
  "bhxh", "bhyt", "lương net", "lương gross", "gross", "net", "payroll",
  "bảng lương", "bang luong", "mức lương", "muc luong", "thu nhập cá nhân"
];

const CONTRACT_KEYWORDS = [
  "hợp đồng lao động", "hop dong lao dong", "hđlđ", "hdld",
  "hợp đồng thử việc", "hop dong thu viec", "phụ lục hợp đồng", "phu luc hop dong",
  "hết hạn hợp đồng", "het han hop dong", "gia hạn hợp đồng", "gia han hop dong",
  "loại hợp đồng", "loai hop dong", "hợp đồng", "hop dong", "labor contract", "contract"
];

export async function POST(req: NextRequest) {
  try {
    const { query, history, currentUser, debug } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "Câu hỏi tìm kiếm là bắt buộc" }, { status: 400 });
    }

    const authHeader = req.headers.get("Authorization");
    const apiKey = (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null) || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        error: "Mã khoá OpenAI API Key chưa được cấu hình. Vui lòng nhập trong mục Cài đặt hệ thống."
      }, { status: 500 });
    }

    // Initialize authenticated Supabase client for RLS (mỗi tài khoản chỉ thấy dữ liệu được cấp phép)
    const supabaseToken = req.headers.get("x-supabase-auth");
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

    const dbClient = (supabaseToken && supabaseUrl && supabaseAnonKey)
      ? createClient(supabaseUrl, supabaseAnonKey, {
          global: {
            headers: {
              Authorization: `Bearer ${supabaseToken}`
            }
          }
        })
      : supabase;

    // 0. XÁC MINH DANH TÍNH TỪ TOKEN — không tin `currentUser` do client gửi lên
    //    (client có thể giả mạo isAdmin/name để chiếm quyền xem Lương & PII).
    //    Không có token hợp lệ → từ chối rõ ràng, tránh tình trạng RLS âm thầm
    //    chặn hết dữ liệu rồi AI trả lời "không tìm thấy" gây hiểu lầm.
    if (!supabaseToken) {
      return NextResponse.json({
        error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang và đăng nhập lại để dùng Tìm kiếm AI."
      }, { status: 401 });
    }
    const { data: authData, error: authError } = await dbClient.auth.getUser(supabaseToken);
    const verifiedEmail = authData?.user?.email?.toLowerCase()?.trim() || "";
    if (authError || !verifiedEmail) {
      return NextResponse.json({
        error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng tải lại trang và đăng nhập lại để dùng Tìm kiếm AI."
      }, { status: 401 });
    }

    // GATE GÓI DỊCH VỤ: Tìm kiếm AI thuộc gói Enterprise (tenant_config.plan)
    const { data: planRow } = await dbClient
      .from("tenant_config").select("value").eq("key", "plan").maybeSingle();
    if (!isFeatureAllowed(normalizePlan(planRow?.value), "ai_search")) {
      return NextResponse.json({
        error: "Tính năng Tìm kiếm AI thuộc gói Enterprise. Hệ thống của bạn đang dùng gói thấp hơn — vui lòng liên hệ Quản trị viên để nâng cấp."
      }, { status: 403 });
    }

    // Tra cứu vai trò/phòng ban THẬT từ DB theo email đã xác minh.
    const [{ data: allowedData }, { data: empData }, { data: permData }] = await Promise.all([
      dbClient.from("allowed_users").select("role").ilike("email", verifiedEmail).maybeSingle(),
      dbClient.from("employees_directory").select("name, role, department").ilike("email", `%${verifiedEmail}%`).maybeSingle(),
      dbClient.from("approval_permissions").select("can_view_salary").ilike("email", `%${verifiedEmail}%`).maybeSingle()
    ]);

    const isAdmin = allowedData?.role === "Admin";
    // Tên/chức danh xác minh từ DB — dùng cho phân quyền. Tên client gửi chỉ dùng hiển thị.
    const verifiedName = empData?.name || null;
    const verifiedRole = empData?.role || (isAdmin ? "Admin" : "Nhân viên");
    const verifiedDept = empData?.department || "";
    const displayName = verifiedName || currentUser?.name || verifiedEmail;

    // 1. Phân quyền truy cập thông tin nhạy cảm (PII: CCCD, địa chỉ...) — KHÔNG liên quan tới lương.
    const roleLc = verifiedRole.toLowerCase();
    const deptLc = verifiedDept.toLowerCase();
    const isHRManager = (roleLc.includes("trưởng phòng") || roleLc.includes("truong phong")) &&
                        (deptLc.includes("hành chính") || deptLc.includes("hcns"));
    const hasPiiAccess = isAdmin || isHRManager;

    // Trước đây so khớp cứng theo tên/email — nay đọc từ approval_permissions.can_view_salary
    // để khi bàn giao & khóa tài khoản (employees/page.tsx), quyền tự động chuyển sang
    // người tiếp nhận thay vì bị khóa cứng vào tên người cũ.
    const hasSalaryAccess = !!(isAdmin || permData?.can_view_salary);

    const lowercaseQuery = query.toLowerCase();
    const isSalaryQuery = SALARY_KEYWORDS.some(kw => lowercaseQuery.includes(kw));
    const isContractQuery = CONTRACT_KEYWORDS.some(kw => lowercaseQuery.includes(kw));

    // 2. CHẶN: Lương & Hợp đồng lao động — từ chối với tài khoản không có quyền.
    if ((isSalaryQuery || isContractQuery) && !hasSalaryAccess) {
      return NextResponse.json({
        answer: "🔒 **Khu vực bảo mật tuyệt đối.**\n\nTrợ lý AI **không được phép** tìm kiếm, trích xuất hoặc tiết lộ thông tin liên quan đến **lương / thu nhập của CBNV** và **hợp đồng lao động** đối với tài khoản của bạn.\n\nNếu bạn là Admin hoặc nhân sự được phân quyền đặc biệt, vui lòng đảm bảo bạn đang đăng nhập đúng tài khoản để tra cứu."
      });
    }

    // 3. Truy vấn cơ sở dữ liệu nội bộ để xây dựng Ngữ cảnh.
    //    LƯU Ý: Bảng `contracts` (hợp đồng lao động + lương) hoàn toàn KHÔNG được truy vấn.

    // ─────────────────────────────────────────────────────────────────────────
    // BỘ ĐỊNH TUYẾN THEO NGỮ CẢNH (Smart Router)
    // Giới hạn token/phút của OpenAI là 30.000 TPM → KHÔNG thể nạp toàn bộ bảng
    // vào mỗi request. Phân tích câu hỏi để chỉ nạp đúng nhóm dữ liệu liên quan.
    // ─────────────────────────────────────────────────────────────────────────
    const q = lowercaseQuery;
    // Nguồn regex từng nhóm — dùng chung cho 2 việc: (1) định tuyến chọn bảng,
    // (2) loại "từ kích hoạt" khỏi bộ từ khóa lọc dòng (chữ "công văn" dùng để
    // CHỌN BẢNG chứ không phải giá trị cần tìm ilike trong dữ liệu).
    const ROUTE_PATTERNS: Record<string, string> = {
      employees: "nhân sự|nhan su|nhân viên|nhan vien|phòng ban|phong ban|cccd|địa chỉ|dia chi|email|sđt|số điện thoại|so dien thoai|đội ngũ|doi ngu|ai là|nhân lực|nhan luc|cán bộ|can bo|cbnv|danh sách nv|học vấn|bằng cấp|ngày sinh|sinh nhật|giới tính|trưởng phòng|nhân số|biên chế|thử việc|thu viec|chính thức|chinh thuc",
      candidates: "ứng viên|ung vien|tuyển dụng|tuyen dung|phỏng vấn|phong van|cv|hồ sơ|ho so|recruit|candidate|ứng tuyển|nguồn tuyển|điểm ai|cần tuyển",
      tasks: "công việc|cong viec|task|giao việc|giao viec|tiến độ|tien do|deadline|hạn chót|han chot|đang làm|kanban|tồn đọng|hoàn thành|cần làm|nhiệm vụ|nhiem vu|báo cáo công việc|kế hoạch",
      admin: "chi phí|chi phi|ngân sách|ngan sach|văn phòng phẩm|van phong pham|cost|expense|cpql|chi tiêu|chi tieu|tốn|định mức|vpp|khối văn phòng|khoi van phong|hành chính tổng hợp",
      invoices: "hóa đơn|hoa don|invoice|thanh toán|thanh toan|số tiền|so tien|chi trả|chi tra|payment|thụ hưởng|thu huong|beneficiary|chuyển khoản|chuyen khoan",
      suppliers: "nhà cung cấp|nha cung cap|supplier|nhà thầu|nha thau|đối tác|doi tac|vendor|dịch vụ thuê|dich vu thue",
      clerical: "văn thư|van thu|công văn đến|công văn đi|công văn|cong van|văn bản|van ban|tờ trình|to trinh|quyết định|quyet dinh|trích yếu|trich yeu|hđqt|clerical|số văn bản",
      trips: "đi công tác|công tác|cong tac|business trip|chuyến đi|chuyen di|đi tỉnh|di tinh|nơi đến",
      justifications: "giải trình|giai trinh|chấm công|cham cong|quên chấm|quen cham|đi muộn|di muon|về sớm|ve som|justification|nghỉ phép|nghi phep|đơn nghỉ",
      contracts: "hợp đồng lao động|hạn hợp đồng|hợp đồng|hop dong|hđlđ|hdld|bảng lương|bang luong|lương|luong|thu nhập|thu nhap|thuong|thưởng|phụ cấp|phu cap|thử việc|thu viec|chính thức|chinh thuc",
      suggestions: "góp ý|gop y|kiến nghị|kien nghi|ý kiến|y kien|đóng góp|dong gop|phản hồi|phan hoi",
    };
    const want: Record<string, boolean> = {};
    for (const [k, src] of Object.entries(ROUTE_PATTERNS)) want[k] = new RegExp(src).test(q);
    want.contracts = hasSalaryAccess && want.contracts;

    // Nếu không khớp nhóm nào → mặc định tra cứu Nhân viên + Công việc (phổ biến nhất).
    const anySelected = Object.values(want).some(Boolean);
    if (!anySelected) {
      want.employees = true;
      want.tasks = true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LỌC TRƯỚC, AI SAU (Filter-first)
    // Phân loại câu hỏi:
    //  - Tổng hợp/liệt kê (bao nhiêu, tổng, danh sách...) → nạp danh sách (có giới
    //    hạn) để AI tóm tắt, KHÔNG lọc theo dòng.
    //  - Truy vấn cụ thể (tên người, mã DA-/HD-/NV-, SĐT, email, dự án...) →
    //    LỌC bằng SQL ilike trước, chỉ đưa các dòng khớp cho AI.
    // ─────────────────────────────────────────────────────────────────────────
    const isAggregation = /bao nhiêu|bao nhieu|tổng|tong|thống kê|thong ke|trung bình|trung binh|đếm|\bdem\b|tất cả|tat ca|toàn bộ|toan bo|danh sách|danh sach|liệt kê|liet ke|có ai|co ai|những ai|nhung ai|tình trạng|tinh trang|tổng hợp|tong hop|tỷ lệ|ty le|thống/.test(q);

    // Tách "từ khóa thực thể": CHỈ loại bỏ từ điều hướng/ngữ pháp/cấu trúc.
    // KHÔNG loại các danh từ nghiệp vụ (nhân viên, hành chính, thử việc...) vì chúng
    // có thể chính là GIÁ TRỊ cần lọc (tên phòng ban, trạng thái...).
    const STOPWORDS = new Set([
      "liệt", "kê", "liet", "ke", "danh", "sách", "sach", "cho", "của", "cua", "là", "la",
      "các", "cac", "những", "nhung", "thông", "tin", "thong", "ai", "nào", "nao", "không",
      "khong", "trong", "và", "va", "với", "voi", "có", "co", "bao", "nhiêu", "nhieu",
      "tổng", "tong", "hãy", "hay", "giúp", "giup", "tôi", "toi", "xem", "tìm", "tim",
      "kiếm", "kiem", "về", "ve", "được", "duoc", "bị", "bi", "một", "mot", "này", "nay",
      "đó", "do", "đang", "dang", "sắp", "sap", "thì", "thi", "mà", "ma", "như", "nhu",
      "theo", "tất", "tat", "cả", "ca", "cần", "can", "đi", "ra", "vào", "vao",
      "thế", "the", "sao", "gì", "gi", "thuộc", "thuoc", "phòng", "phong", "ban", "ở", "o",
      "cập", "nhật", "trạng", "thái", "thai", "hiện", "hien", "tại", "tai", "list",
      // Từ chỉ thời gian chung & tính từ so sánh — đã xử lý bằng bộ lọc tháng/sắp xếp,
      // không dùng làm từ khóa ilike (sẽ khớp nhiễu hoặc không khớp gì).
      "tháng", "thang", "tuần", "tuan", "quý", "quy", "hôm", "hom", "ngày", "ngay",
      "mới", "moi", "nhất", "nhat", "đã", "da", "gần", "gan", "đây", "day", "nữa", "nua"
    ]);
    // ── PHÁT HIỆN THÁNG/NĂM trong câu hỏi (dùng chung cho mọi bảng có cột ngày) ──
    const now = new Date();
    let filterMonth: number | null = null;
    const mNum = q.match(/th[áa]ng\s*0?(\d{1,2})/);
    if (mNum) {
      const n = parseInt(mNum[1], 10);
      if (n >= 1 && n <= 12) filterMonth = n;
    } else if (/th[áa]ng\s*(n[àa]y|hi[eệ]n t[aạ]i)|hi[eệ]n nay|g[aầ]n [đd][âa]y/.test(q)) {
      filterMonth = now.getMonth() + 1;
    }
    const yMatch = q.match(/(?:n[ăa]m\s*|[\/\-])\s*(20\d{2})/);
    const filterYear = yMatch ? parseInt(yMatch[1], 10) : now.getFullYear();
    // Khoảng ngày [đầu tháng, cuối tháng] định dạng YYYY-MM-DD cho cột kiểu DATE.
    const monthRange = (): [string, string] | null => {
      if (!filterMonth) return null;
      const mm = String(filterMonth).padStart(2, "0");
      const lastDay = new Date(filterYear, filterMonth, 0).getDate();
      return [`${filterYear}-${mm}-01`, `${filterYear}-${mm}-${String(lastDay).padStart(2, "0")}`];
    };

    // Từ khóa lọc dòng: bỏ từ kích hoạt định tuyến + cụm tháng/năm + stopwords —
    // phần còn lại mới là "thực thể" thật (tên người, tên công ty, số văn bản...).
    let strippedQuery: string = query;
    for (const src of Object.values(ROUTE_PATTERNS)) {
      strippedQuery = strippedQuery.replace(new RegExp(src, "gi"), " ");
    }
    strippedQuery = strippedQuery
      .replace(/th[áa]ng\s*0?\d{1,2}(\s*[\/\-]\s*20\d{2})?/gi, " ")
      .replace(/n[ăa]m\s*20\d{2}/gi, " ");
    const terms = strippedQuery
      .replace(/[?.,!"'():;]/g, " ")
      .split(/\s+/)
      .map((w: string) => w.trim())
      .filter((w: string) => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()))
      .slice(0, 6);

    const entityMode = !isAggregation && terms.length > 0;

    // Truy vấn SINH NHẬT theo tháng (lọc cấu trúc trên date_of_birth).
    const isBirthdayQuery = /sinh nh[aậ]t|sinh nhat|ng[àa]y sinh|ngay sinh/.test(q);
    let birthdayMonth: string | null = null;
    if (isBirthdayQuery) {
      want.employees = true;
      if (filterMonth) birthdayMonth = String(filterMonth).padStart(2, "0");
    }

    // Tạo chuỗi filter OR (ilike) nhiều cột — chỉ dùng khi đang ở chế độ lọc.
    const buildOr = (cols: string[], useFilter: boolean): string | null => {
      if (!useFilter) return null;
      const parts: string[] = [];
      for (const t of terms) {
        const safe = t.replace(/[,()%*]/g, " ").trim();
        if (!safe) continue;
        for (const c of cols) parts.push(`${c}.ilike.%${safe}%`);
      }
      return parts.length ? parts.join(",") : null;
    };
    const withFilter = (qb: any, cols: string[], listLimit: number, useFilter: boolean) => {
      const orStr = buildOr(cols, useFilter);
      if (orStr) return qb.or(orStr).limit(60);
      return qb.limit(listLimit);
    };
    // Áp bộ lọc THÁNG (khi câu hỏi có "tháng N") lên cột ngày kiểu DATE.
    // Nhiều cột ngày → chỉ cần 1 cột rơi vào tháng đó. Fallback thì bỏ lọc.
    const withMonth = (qb: any, dateCols: string[], isFallback: boolean) => {
      const r = monthRange();
      if (!r || isFallback) return qb;
      if (dateCols.length === 1) return qb.gte(dateCols[0], r[0]).lte(dateCols[0], r[1]);
      return qb.or(dateCols.map(c => `and(${c}.gte.${r[0]},${c}.lte.${r[1]})`).join(","));
    };

    // 3.1 Nhân viên — KHÔNG có trường lương. PII (CCCD/địa chỉ) chỉ cấp cho Admin/TP.HCNS.
    // created_at = "Ngày nhận việc" (hệ thống dùng ngày tạo hồ sơ làm ngày nhận việc).
    const employeeFields = hasPiiAccess
      ? "employee_code, name, department, role, gender, date_of_birth, phone, email, cccd, cccd_date, cccd_place, permanent_address, temporary_address, degree, status, notes, created_at"
      : "employee_code, name, department, role, gender, date_of_birth, phone, email, degree, status, created_at";
    // status/degree có trong bộ lọc → bắt được "thử việc", "chính thức", "đại học"...
    const empFilterCols = hasPiiAccess
      ? ["name", "employee_code", "phone", "email", "department", "role", "status", "degree", "cccd"]
      : ["name", "employee_code", "phone", "email", "department", "role", "status", "degree"];

    // Builder riêng cho nhân viên — ưu tiên lọc sinh nhật theo tháng (date_of_birth).
    // Phủ cả 2 định dạng ngày: "YYYY-MM-DD" (chứa "-07-") và "DD/MM/YYYY" (chứa "/07/").
    const buildEmployees = (useFilter: boolean, isFallback: boolean) => {
      // Người KHÔNG có quyền xem PII đọc qua view danh bạ: bảng gốc `employees`
      // đã siết RLS nên với họ nó chỉ trả về đúng hồ sơ của chính mình, khiến
      // AI trả lời "không tìm thấy" cho cả những câu tra cứu vô hại (sinh nhật,
      // ai thuộc phòng nào). View giữ nguyên khả năng tra cứu mà không lộ PII.
      const empSource = hasPiiAccess ? "employees" : "employees_directory";
      const base = dbClient.from(empSource).select(employeeFields as any).order("created_at", { ascending: false });
      if (isBirthdayQuery && birthdayMonth && !isFallback) {
        return base.or(`date_of_birth.ilike.%-${birthdayMonth}-%,date_of_birth.ilike.%/${birthdayMonth}/%`).limit(300);
      }
      return withFilter(base, empFilterCols, 300, useFilter);
    };

    // Chạy toàn bộ truy vấn; `useFilter` quyết định lọc theo dòng hay liệt kê.
    const runQueries = (useFilter: boolean, isFallback: boolean) => Promise.all([
      want.employees ? buildEmployees(useFilter, isFallback) : Promise.resolve({ data: null }),
      want.tasks ? withFilter(withMonth(dbClient.from("tasks").select("title, assignee, status, due_date, start_date, description").order("due_date", { ascending: false, nullsFirst: false }), ["due_date", "start_date"], isFallback), ["title", "assignee", "description", "status"], 120, useFilter) : Promise.resolve({ data: null }),
      want.justifications ? withFilter(withMonth(dbClient.from("attendance_justifications").select("name, department, date, reason, propose, status, approver").order("date", { ascending: false }), ["date"], isFallback), ["name", "department", "reason", "status"], 120, useFilter) : Promise.resolve({ data: null }),
      want.candidates ? withFilter(dbClient.from("candidates").select("name, role, last_position, phone, email, source, status, department, ai_score"), ["name", "role", "last_position", "phone", "email", "department", "status"], 150, useFilter) : Promise.resolve({ data: null }),
      want.admin ? withFilter(dbClient.from("admin_monthly_reports").select("stt, content, category_type, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, notes"), ["content"], 250, useFilter) : Promise.resolve({ data: null }),
      want.invoices ? withFilter(withMonth(dbClient.from("invoices").select("number, date, desc, amount, beneficiary_name, project_name").order("date", { ascending: false }), ["date"], isFallback), ["number", "desc", "beneficiary_name", "project_name"], 150, useFilter) : Promise.resolve({ data: null }),
      want.suppliers ? withFilter(dbClient.from("suppliers").select("name, service, bank, project_name"), ["name", "service", "project_name"], 150, useFilter) : Promise.resolve({ data: null }),
      want.clerical ? withFilter(withMonth(dbClient.from("clerical_documents").select("type, doc_number, doc_date, receive_send_date, summary, sender_receiver, signer_recipient").order("doc_date", { ascending: false }), ["doc_date", "receive_send_date"], isFallback), ["doc_number", "summary", "sender_receiver", "signer_recipient"], 150, useFilter) : Promise.resolve({ data: null }),
      want.trips ? withFilter(withMonth(dbClient.from("business_trips").select("name, dest, from_date, to_date, purpose, status").order("from_date", { ascending: false }), ["from_date", "to_date"], isFallback), ["name", "dest", "purpose", "status"], 120, useFilter) : Promise.resolve({ data: null }),
      want.contracts ? withFilter(dbClient.from("contracts").select("employee_code, employee_name, contract_number, type, sign_date, expiration_date, base_salary_insurance, performance_bonus, allowances, total_income, status"), ["employee_code", "employee_name", "contract_number", "type", "status"], 150, useFilter) : Promise.resolve({ data: null }),
      want.suggestions ? withFilter(dbClient.from("suggestions").select("title, content, department, sender_name, status, response"), ["title", "content", "department", "sender_name", "status"], 120, useFilter) : Promise.resolve({ data: null }),
    ]);

    // KPI TOÀN HỆ THỐNG — đúng công thức Dashboard (app/page.tsx), đếm bằng SQL
    // nên luôn chính xác, không phụ thuộc giới hạn dòng/cắt bớt ngữ cảnh.
    // "Đang thử việc"/"HĐ chính thức" đếm theo LOẠI HĐ (không kèm số tiền lương
    // nên cấp cho mọi tài khoản — giống như Dashboard hiển thị cho mọi người).
    const kpiPromise = Promise.all([
      dbClient.from("employees_directory").select("*", { count: "exact", head: true }),
      dbClient.from("contracts").select("*", { count: "exact", head: true }).eq("type", "Thử việc"),
      dbClient.from("contracts").select("*", { count: "exact", head: true }).neq("type", "Thử việc").neq("type", ""),
      dbClient.from("candidates").select("*", { count: "exact", head: true }).ilike("probation_result", "%nhận%"),
    ]);

    // Lọc trước; nếu KHÔNG ra dòng nào → tự lùi về chế độ liệt kê (fallback) cho AI tự tìm.
    let results: any[] = await runQueries(entityMode, false);
    let usedFilter = entityMode;
    let usedMonthFilter = !!filterMonth;
    const totalRows = results.reduce((n, r) => n + (((r?.data as any[] | null)?.length) || 0), 0);
    if (totalRows === 0 && (entityMode || !!filterMonth)) {
      results = await runQueries(false, true);
      usedFilter = false;
      usedMonthFilter = false;
    }

    const [
      rEmployees, rTasks, rJustifications, rCandidates,
      rAdmin, rInvoices, rSuppliers, rClerical, rTrips, rContracts, rSuggestions
    ] = results;

    const dbEmployees = rEmployees.data as any[] | null;
    const dbTasks = rTasks.data as any[] | null;
    const dbJustifications = rJustifications.data as any[] | null;
    const dbCandidates = rCandidates.data as any[] | null;
    const dbAdminReports = rAdmin.data as any[] | null;
    const dbInvoices = rInvoices.data as any[] | null;
    const dbSuppliers = rSuppliers.data as any[] | null;
    const dbClerical = rClerical.data as any[] | null;
    const dbTrips = rTrips.data as any[] | null;
    const dbContracts = rContracts ? (rContracts.data as any[] | null) : null;
    const dbSuggestions = rSuggestions ? (rSuggestions.data as any[] | null) : null;

    // Log số dòng mỗi nhóm (không log nội dung — tránh lộ dữ liệu nhân sự ra server log).
    const rowCounts = {
      employees: dbEmployees?.length || 0,
      tasks: dbTasks?.length || 0,
      justifications: dbJustifications?.length || 0,
      candidates: dbCandidates?.length || 0,
      adminReports: dbAdminReports?.length || 0,
      invoices: dbInvoices?.length || 0,
      suppliers: dbSuppliers?.length || 0,
      clerical: dbClerical?.length || 0,
      trips: dbTrips?.length || 0,
      contracts: dbContracts?.length || 0,
      suggestions: dbSuggestions?.length || 0,
    };
    console.log("[ai-search] rows:", JSON.stringify(rowCounts), "| usedFilter:", usedFilter, "| terms:", terms.join("|"));

    // 4. Định dạng Ngữ cảnh — NÉN dạng CSV để tiết kiệm token (nhãn cột chỉ ghi 1 lần).
    let context = "";

    // ── KPI TOÀN HỆ THỐNG (luôn có mặt, đặt ĐẦU ngữ cảnh để không bao giờ bị cắt) ──
    try {
      const [kEmp, kProb, kOff, kHired] = await kpiPromise;
      const kpiParts: string[] = [];
      if (kEmp.count !== null) kpiParts.push(`Nhân sự hiện tại: ${kEmp.count}`);
      if (kProb.count !== null) kpiParts.push(`Đang thử việc (HĐ loại "Thử việc"): ${kProb.count}`);
      if (kOff.count !== null) kpiParts.push(`HĐ lao động chính thức: ${kOff.count}`);
      if (kHired.count !== null) kpiParts.push(`Nhân sự mới vào (nhận việc): ${kHired.count}`);
      if (kpiParts.length) {
        context += `### KPI TOÀN HỆ THỐNG (số liệu chính thức trùng Dashboard — ưu tiên dùng cho câu hỏi đếm tổng quan: bao nhiêu nhân sự, bao nhiêu thử việc/chính thức...)\n${kpiParts.join(". ")}.\n\n`;
      }
    } catch { /* KPI lỗi thì bỏ qua, không chặn luồng chính */ }

    // Cắt free-text dài + làm sạch khoảng trắng.
    const clip = (v: any, n = 140): string => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/\s+/g, " ").trim();
      return s.length > n ? s.slice(0, n) + "…" : s;
    };
    // Xuất một khối CSV: tiêu đề + header (1 lần) + các dòng. Ô rỗng để trống (không in "—").
    const toCsv = (title: string, headers: string[], rows: any[][]): string => {
      if (!rows.length) return "";
      const esc = (v: any) => {
        const s = (v === null || v === undefined) ? "" : String(v).replace(/\s+/g, " ").trim();
        return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      let out = `### ${title} (${rows.length} dòng — định dạng CSV)\n`;
      out += headers.join(",") + "\n";
      for (const r of rows) out += r.map(esc).join(",") + "\n";
      return out + "\n";
    };
    const norm = (s: any) => (s && String(s).trim()) || "Chưa xác định";
    const countBy = (rows: any[], key: string) => {
      const m: Record<string, number> = {};
      rows.forEach(r => { const k = norm(r[key]); m[k] = (m[k] || 0) + 1; });
      return Object.entries(m).map(([k, v]) => `${k}=${v}`).join("; ");
    };

    // ── NHÂN VIÊN ──
    if (dbEmployees && dbEmployees.length > 0) {
      // SQL tính sẵn: thống kê đếm để trả lời câu hỏi "bao nhiêu" mà không cần quét từng dòng.
      context += `### THỐNG KÊ NHANH NHÂN VIÊN (đã tính sẵn — ưu tiên dùng cho câu hỏi đếm/tổng hợp)\n`;
      context += `Tổng số: ${dbEmployees.length}. Theo phòng ban: ${countBy(dbEmployees, "department")}. Theo trạng thái: ${countBy(dbEmployees, "status")}\n\n`;
      // created_at = ngày nhận việc; danh sách đã sắp xếp mới nhất → cũ nhất.
      const joinDate = (e: any) => e.created_at ? String(e.created_at).slice(0, 10) : "";
      // Lọc theo người cụ thể → đầy đủ cột; liệt kê → cột tinh gọn.
      if (usedFilter) {
        const headers = ["Mã NV", "Tên", "Phòng", "Chức danh", "Giới tính", "Ngày sinh", "Ngày nhận việc", "ĐT", "Email", "Học vấn", "Trạng thái",
          ...(hasPiiAccess ? ["CCCD", "Ngày cấp", "Nơi cấp", "Thường trú", "Tạm trú", "Ghi chú"] : [])];
        const rows = dbEmployees.map(e => [e.employee_code, e.name, e.department, e.role, e.gender, e.date_of_birth, joinDate(e), e.phone, e.email, e.degree, e.status || "Chính thức",
          ...(hasPiiAccess ? [e.cccd, e.cccd_date, e.cccd_place, clip(e.permanent_address), clip(e.temporary_address), clip(e.notes)] : [])]);
        context += toCsv("DANH SÁCH NHÂN VIÊN (sắp xếp: mới nhận việc nhất ở trên)", headers, rows);
      } else {
        const headers = ["Mã NV", "Tên", "Phòng", "Chức danh", "Ngày sinh", "Ngày nhận việc", "ĐT", "Email", "Trạng thái"];
        const rows = dbEmployees.map(e => [e.employee_code, e.name, e.department, e.role, e.date_of_birth, joinDate(e), e.phone, e.email, e.status || "Chính thức"]);
        context += toCsv("DANH SÁCH NHÂN VIÊN (sắp xếp: mới nhận việc nhất ở trên)", headers, rows);
      }
    }

    // ── ỨNG VIÊN ──
    if (dbCandidates && dbCandidates.length > 0) {
      context += `### THỐNG KÊ NHANH ỨNG VIÊN (đã tính sẵn)\nTổng số: ${dbCandidates.length}. Theo trạng thái: ${countBy(dbCandidates, "status")}\n\n`;
      const headers = ["Ứng viên", "Vị trí", "Phòng", "ĐT", "Email", "Nguồn", "Trạng thái", "Điểm AI"];
      const rows = dbCandidates.map(c => [c.name, c.role || c.last_position, c.department, c.phone, c.email, c.source, c.status, c.ai_score]);
      context += toCsv("DANH SÁCH ỨNG VIÊN TUYỂN DỤNG", headers, rows);
    }

    // ── CÔNG VIỆC ──
    if (dbTasks && dbTasks.length > 0) {
      context += `### THỐNG KÊ NHANH CÔNG VIỆC (đã tính sẵn)\nTổng số: ${dbTasks.length}. Theo trạng thái: ${countBy(dbTasks, "status")}\n\n`;
      const headers = ["Việc", "Giao cho", "Trạng thái", "Bắt đầu", "Hạn chót", "Mô tả"];
      const rows = dbTasks.map(t => [clip(t.title, 100), t.assignee, t.status, t.start_date, t.due_date, clip(t.description, 120)]);
      context += toCsv("DANH SÁCH CÔNG VIỆC", headers, rows);
    }

    // ── CHI PHÍ HÀNH CHÍNH ──
    if (dbAdminReports && dbAdminReports.length > 0) {
      // SQL tính sẵn: tổng theo khối + theo tháng, để AI trả lời "tổng chi phí" chính xác, không cộng tay.
      const office = Array(13).fill(0), project = Array(13).fill(0);
      dbAdminReports.forEach(r => {
        const arr = r.category_type === "project" ? project : office;
        for (let m = 1; m <= 12; m++) arr[m] += Number(r[`m${m}`]) || 0;
      });
      const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
      const monthStr = (a: number[]) => a.slice(1).map((v, i) => v > 0 ? `T${i + 1}=${v}` : "").filter(Boolean).join("; ");
      context += `### THỐNG KÊ NHANH CHI PHÍ HÀNH CHÍNH (VND, đã tính sẵn — ưu tiên dùng cho câu hỏi tổng/so sánh)\n`;
      context += `Tổng Khối Văn phòng cả năm: ${sum(office)} (theo tháng: ${monthStr(office) || "—"})\n`;
      context += `Tổng Khối Dự án cả năm: ${sum(project)} (theo tháng: ${monthStr(project) || "—"})\n\n`;
      // Chi tiết từng đầu mục (chỉ liệt kê tháng có phát sinh)
      const headers = ["Khối", "Đầu mục", "Các tháng có phát sinh (VND)", "Ghi chú"];
      const rows = dbAdminReports.map(r => {
        const months: string[] = [];
        for (let m = 1; m <= 12; m++) { const v = Number(r[`m${m}`]) || 0; if (v > 0) months.push(`T${m}=${v}`); }
        return [r.category_type === "project" ? "Dự án" : "Văn phòng", clip(r.content, 80), months.join(" "), clip(r.notes, 60)];
      });
      context += toCsv("CHI TIẾT CHI PHÍ HÀNH CHÍNH", headers, rows);
    }

    // ── HÓA ĐƠN ──
    if (dbInvoices && dbInvoices.length > 0) {
      const total = dbInvoices.reduce((s, inv) => s + (Number(inv.amount) || 0), 0);
      context += `### THỐNG KÊ NHANH HÓA ĐƠN (đã tính sẵn)\nTổng số hóa đơn: ${dbInvoices.length}. Tổng số tiền: ${total} VND\n\n`;
      const headers = ["Số", "Ngày", "Nội dung", "Số tiền (VND)", "Người thụ hưởng", "Dự án"];
      const rows = dbInvoices.map(inv => [inv.number, inv.date, clip(inv.desc, 100), inv.amount || 0, inv.beneficiary_name, inv.project_name]);
      context += toCsv("DANH SÁCH HÓA ĐƠN / THANH TOÁN", headers, rows);
    }

    // ── NHÀ CUNG CẤP ──
    if (dbSuppliers && dbSuppliers.length > 0) {
      const headers = ["Tên", "Dịch vụ", "Ngân hàng", "Dự án"];
      const rows = dbSuppliers.map(s => [s.name, clip(s.service, 80), s.bank, s.project_name]);
      context += toCsv("DANH SÁCH NHÀ CUNG CẤP", headers, rows);
    }

    // ── VĂN THƯ ──
    if (dbClerical && dbClerical.length > 0) {
      const typeLabel: Record<string, string> = {
        incoming: "VB đến", outgoing_1: "VB đi 1", outgoing_2: "VB đi 2", outgoing_hdqt: "VB HĐQT"
      };
      const clericalByType: Record<string, number> = {};
      dbClerical.forEach(d => { const k = typeLabel[d.type] || norm(d.type); clericalByType[k] = (clericalByType[k] || 0) + 1; });
      const clericalStat = Object.entries(clericalByType).map(([k, v]) => `${k}=${v}`).join("; ");
      context += `### THỐNG KÊ NHANH VĂN THƯ (đã tính sẵn)\nTổng số: ${dbClerical.length}. Theo loại: ${clericalStat}\n\n`;
      const headers = ["Loại", "Số VB", "Ngày VB", "Ngày nhận/gửi", "Trích yếu", "Nơi gửi/nhận", "Người ký/nhận"];
      const rows = dbClerical.map(d => [typeLabel[d.type] || d.type, d.doc_number, d.doc_date, d.receive_send_date, clip(d.summary, 120), clip(d.sender_receiver, 60), clip(d.signer_recipient, 60)]);
      context += toCsv("DANH SÁCH VĂN THƯ", headers, rows);
    }

    // ── CÔNG TÁC ──
    if (dbTrips && dbTrips.length > 0) {
      const headers = ["Nhân sự", "Nơi đến", "Từ ngày", "Đến ngày", "Mục đích", "Trạng thái"];
      const rows = dbTrips.map(t => [t.name, t.dest, t.from_date, t.to_date, clip(t.purpose, 100), t.status]);
      context += toCsv("DANH SÁCH CÔNG TÁC", headers, rows);
    }

    // ── GIẢI TRÌNH CHẤM CÔNG ──
    if (dbJustifications && dbJustifications.length > 0) {
      context += `### THỐNG KÊ NHANH GIẢI TRÌNH CHẤM CÔNG (đã tính sẵn)\nTổng số: ${dbJustifications.length}. Theo trạng thái: ${countBy(dbJustifications, "status")}\n\n`;
      const headers = ["Nhân viên", "Phòng", "Ngày", "Lý do", "Đề xuất", "Trạng thái", "Người duyệt"];
      const rows = dbJustifications.map(j => [j.name, j.department, j.date, clip(j.reason, 100), clip(j.propose, 60), j.status, j.approver]);
      context += toCsv("DANH SÁCH GIẢI TRÌNH CHẤM CÔNG", headers, rows);
    }

    // ── HỢP ĐỒNG LAO ĐỘNG & THÔNG TIN LƯƠNG (Chỉ dành cho tài khoản được phân quyền) ──
    if (hasSalaryAccess && dbContracts && dbContracts.length > 0) {
      // Thống kê tính sẵn để AI trả lời câu đếm ("bao nhiêu thử việc/chính thức") không phải tự cộng tay.
      context += `### THỐNG KÊ NHANH HỢP ĐỒNG LAO ĐỘNG (đã tính sẵn — ưu tiên dùng cho câu hỏi đếm/tổng hợp)\n`;
      context += `Tổng số HĐ đang liệt kê: ${dbContracts.length}. Theo loại HĐ: ${countBy(dbContracts, "type")}. Theo trạng thái: ${countBy(dbContracts, "status")}\n`;
      const today = new Date();
      const in60d = new Date(today.getTime() + 60 * 24 * 3600 * 1000);
      const expiring = dbContracts
        .filter(c => {
          if (!c.expiration_date) return false;
          const d = new Date(String(c.expiration_date).slice(0, 10));
          return !isNaN(d.getTime()) && d >= today && d <= in60d;
        })
        .sort((a, b) => String(a.expiration_date).localeCompare(String(b.expiration_date)))
        .slice(0, 15)
        .map(c => `${c.employee_name} (${String(c.expiration_date).slice(0, 10)})`);
      if (expiring.length) context += `Sắp hết hạn trong 60 ngày tới: ${expiring.join("; ")}\n`;
      context += `\n`;
      const headers = ["Mã NV", "Tên NV", "Số HĐ", "Loại HĐ", "Ngày ký", "Ngày hết hạn", "Lương BH", "Thưởng HS", "Phụ cấp", "Tổng thu nhập", "Trạng thái"];
      const rows = dbContracts.map(c => [
        c.employee_code, c.employee_name, c.contract_number, c.type,
        c.sign_date ? String(c.sign_date).slice(0, 10) : "",
        c.expiration_date ? String(c.expiration_date).slice(0, 10) : "",
        c.base_salary_insurance || 0, c.performance_bonus || 0, c.allowances || 0, c.total_income || 0, c.status
      ]);
      context += toCsv("DANH SÁCH HỢP ĐỒNG LAO ĐỘNG & THÔNG TIN LƯƠNG", headers, rows);
    }

    // ── GÓP Ý & KIẾN NGHỊ ──
    if (dbSuggestions && dbSuggestions.length > 0) {
      context += `### THỐNG KÊ NHANH GÓP Ý & KIẾN NGHỊ (đã tính sẵn)\nTổng số: ${dbSuggestions.length}. Theo trạng thái: ${countBy(dbSuggestions, "status")}\n\n`;
      const headers = ["Tiêu đề", "Nội dung góp ý", "Phòng ban", "Người gửi", "Trạng thái", "Phản hồi"];
      const rows = dbSuggestions.map(s => [s.title, clip(s.content, 120), s.department, s.sender_name, s.status, clip(s.response, 100)]);
      context += toCsv("DANH SÁCH GÓP Ý & KIẾN NGHỊ", headers, rows);
    }

    // ── TRUY VẤN TÀI LIỆU TỪ PYTHON AI SERVER (Semantic Search) ──
    try {
      const searchRes = await fetch(`http://127.0.0.1:8500/search?query=${encodeURIComponent(query)}&limit=5`, {
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (searchRes.ok) {
        const chunks = await searchRes.json();
        if (chunks && chunks.length > 0) {
          let docContext = "\n### TRÍCH LỤC TÀI LIỆU & FILE TRONG HỆ THỐNG (Tìm kiếm theo ngữ nghĩa):\n";
          chunks.forEach((c: any) => {
            docContext += `- File: "${c.file_name}" (Độ trùng khớp: ${Math.round(c.similarity * 100)}%)\n  Nội dung: ${c.content}\n\n`;
          });
          context += docContext;
        }
      }
    } catch (e) {
      console.warn("Python AI Server not running or failed to respond, skipping semantic search.");
    }

    // Ghi chú về bộ lọc tháng để AI trả lời đúng ngữ cảnh thời gian.
    if (context && filterMonth) {
      context = (usedMonthFilter
        ? `(Dữ liệu bên dưới ĐÃ được lọc theo tháng ${filterMonth}/${filterYear} theo yêu cầu của câu hỏi.)\n\n`
        : `(LƯU Ý QUAN TRỌNG: KHÔNG có bản ghi nào trong tháng ${filterMonth}/${filterYear}. Dữ liệu bên dưới là các bản ghi MỚI NHẤT của những tháng khác — hãy thông báo rõ cho người dùng rằng tháng ${filterMonth}/${filterYear} chưa có dữ liệu, rồi mới tham chiếu dữ liệu gần nhất nếu hữu ích.)\n\n`) + context;
    }

    if (!context) {
      context = usedFilter
        ? `(Không tìm thấy bản ghi nào khớp với từ khóa: "${terms.join(", ")}". Hãy thông báo cho người dùng và gợi ý họ kiểm tra lại chính tả hoặc dùng từ khóa khác.)`
        : "(Không có dữ liệu nào được cấp phép hiển thị cho tài khoản này, hoặc hệ thống chưa có dữ liệu cho hạng mục được hỏi.)";
    }

    // 4b. Chốt chặn token: gói OpenAI org chỉ cho 30.000 TPM. Cắt ngữ cảnh nếu quá lớn.
    //     ~28.000 ký tự tiếng Việt ≈ <16k token, cộng prompt + lịch sử + output vẫn an toàn.
    const MAX_CONTEXT_CHARS = 28000;
    if (context.length > MAX_CONTEXT_CHARS) {
      context = context.slice(0, MAX_CONTEXT_CHARS) +
        "\n\n…(Dữ liệu quá nhiều đã được rút gọn. Hãy hỏi cụ thể hơn — ví dụ theo phòng ban, theo tháng, hoặc theo tên — để có kết quả chính xác và đầy đủ hơn.)";
    }

    // 4c. DEBUG MODE (chỉ môi trường dev): trả về ngữ cảnh đã dựng, KHÔNG gọi OpenAI.
    //     Dùng để kiểm thử bộ định tuyến + bộ lọc + RLS mà không tốn token.
    if (debug && process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        debug: true,
        identity: { email: verifiedEmail, name: displayName, role: verifiedRole, department: verifiedDept, isAdmin, hasPiiAccess, hasSalaryAccess },
        router: { want, isAggregation, entityMode, terms, usedFilter, isBirthdayQuery, birthdayMonth, filterMonth, filterYear, usedMonthFilter },
        rowCounts,
        contextChars: context.length,
        context
      });
    }

    // 5. Gọi OpenAI (GPT-4o).
    const openai = new OpenAI({ apiKey });

    const tenantCfg = await getTenantConfigServer();
    const systemPrompt = `Bạn là Trợ lý Trí tuệ Nhân tạo chuyên nghiệp quản lý dữ liệu nội bộ của công ty ${tenantCfg.company_name}.
Nhiệm vụ của bạn là trả lời các câu hỏi tìm kiếm của nhân sự dựa trên dữ liệu hệ thống được cung cấp làm Ngữ cảnh bên dưới.

QUY TẮC BẢO MẬT & VẬN HÀNH QUAN TRỌNG:
1. **Chỉ dùng dữ liệu trong Ngữ cảnh**: Tuyệt đối KHÔNG sử dụng thông tin bên ngoài hệ thống. Nếu dữ liệu không có sẵn, hãy lịch sự trả lời: "Hệ thống không tìm thấy thông tin này trong cơ sở dữ liệu nội bộ."
2. **Không bịa đặt thông tin**: Luôn trả lời trung thực dựa trên các trường thông tin hiển thị trong ngữ cảnh.
3. **BẢO MẬT & PHÂN QUYỀN – Lương & Hợp đồng lao động**:
   - Chỉ tài khoản có quyền truy cập lương ('hasSalaryAccess === true') mới được phép xem, trích xuất hoặc đề cập tới mức lương, thu nhập, thưởng, phụ cấp, bảo hiểm của CBNV, cũng như các nội dung/thời hạn của hợp đồng lao động. Dữ liệu này đã được nạp tự động vào Ngữ cảnh nếu tài khoản này có quyền.
   - Tài khoản đang đăng nhập hiện tại: "${displayName}" (Quyền xem Lương & HĐLĐ: ${hasSalaryAccess ? "ĐÃ CẤP QUYỀN" : "TỪ CHỐI"}).
   - Nếu quyền là TỪ CHỐI, tuyệt đối không tiết lộ. Nếu quyền là ĐÃ CẤP QUYỀN, hãy phản hồi đầy đủ và chính xác dựa trên khối dữ liệu HĐLĐ & Lương được cấp trong Ngữ cảnh.
4. **Phân quyền dữ liệu nhạy cảm (PII)**:
   - Tài khoản đang hỏi: "${displayName}" (Chức vụ: ${verifiedRole || "Chưa rõ"}, Phòng ban: ${verifiedDept || "Chưa rõ"}).
   - Quyền xem PII (CCCD, địa chỉ, ghi chú cá nhân): ${hasPiiAccess ? "ĐÃ CẤP (Admin/Trưởng phòng HCNS)" : "TỪ CHỐI (Nhân viên thông thường)"}.
   - Ngữ cảnh đã được lọc theo đúng quyền của tài khoản này — chỉ trả lời dựa trên những gì hiển thị.
5. **Đọc dữ liệu CSV & số liệu tính sẵn**:
   - Dữ liệu trong Ngữ cảnh được nén ở **định dạng CSV** (dòng đầu mỗi khối là tên cột, các dòng sau là giá trị, ô trống = không có dữ liệu).
   - Với câu hỏi **đếm số lượng / tính tổng / so sánh** (vd: "bao nhiêu người", "tổng chi phí"), hãy **ưu tiên dùng các khối "THỐNG KÊ NHANH (đã tính sẵn)"** — số liệu này đã được hệ thống tính chính xác, KHÔNG tự cộng tay từng dòng để tránh sai sót.
6. **Phong cách trả lời**:
   - Giao tiếp thân thiện, thông minh, chuyên nghiệp như ChatGPT.
   - Luôn tóm tắt nội dung câu trả lời ở phần đầu.
   - Sử dụng định dạng Markdown sinh động (in đậm, danh sách gạch đầu dòng, bảng biểu) để làm nổi bật kết quả. Ưu tiên dùng bảng khi liệt kê danh sách nhân sự, ứng viên, chi phí, hóa đơn, văn thư...`;

    const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      { role: "system", content: `=== NGỮ CẢNH DỮ LIỆU NỘI BỘ ===\n${context}` }
    ];

    // Append history (chỉ giữ 4 lượt gần nhất để tiết kiệm token TPM)
    if (history && Array.isArray(history)) {
      history.slice(-4).forEach((msg: any) => {
        if (msg.role === "user" || msg.role === "assistant") {
          chatMessages.push({ role: msg.role, content: msg.content });
        }
      });
    }

    // Append user query
    chatMessages.push({ role: "user", content: query });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: chatMessages,
      temperature: 0.3,
      max_tokens: 1200
    });

    const answer = completion.choices[0]?.message?.content || "Không có phản hồi từ trợ lý AI.";

    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error("Error in AI Search API:", err);
    const status = err?.status || err?.code;
    const raw = (err?.message || "").toLowerCase();
    if (status === 429 || raw.includes("rate limit") || raw.includes("too large") || raw.includes("tpm")) {
      return NextResponse.json({
        error: "Lượng dữ liệu truy vấn đang vượt giới hạn tốc độ của OpenAI (TPM). Vui lòng hỏi cụ thể hơn (theo phòng ban, theo tháng, theo tên...) hoặc thử lại sau ít giây."
      }, { status: 429 });
    }
    return NextResponse.json({ error: err.message || "Lỗi xử lý tìm kiếm AI" }, { status: 500 });
  }
}

"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect, useMemo, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { fetchApprovalPermissions, normalizeName } from "@/lib/approvers";
import { useDepartments } from "@/lib/departments";
import { useTenantConfig } from "@/lib/tenantConfig";
import { fetchAvatarMap, pickAvatar } from "@/lib/avatar";
import {
  getTenureYears,
  getTenureStr,
  parseLeaveTask,
  computeLeaveQuota,
} from "@/lib/annualLeave";
import {
  User,
  Clock,
  DollarSign,
  Award,
  Building2,
  Phone,
  Mail,
  UserCheck,
  Calendar,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  CheckCircle,
  FileText,
  Briefcase,
  Cake,
  Heart,
  TrendingUp,
  UserMinus,
  Network,
  Download,
  AlertCircle,
  Shield,
  Loader2,
  Gift,
  AlertTriangle,
  Info,
  X,
  Send,
  Eye,
  Settings,
  UploadCloud,
  Trash2,
  RefreshCw,
  Save,
  Edit2,
  Fingerprint,
  Users
} from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, LineChart, Line
} from "recharts";

// --- TYPES ---
interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: string;
  avatar: string;
  kpi: number;
  completed_tasks: number;
  pending_tasks: number;
  created_at: string;
  date_of_birth?: string;
  gender?: string;
  employee_code?: string;
  
  // Additional profile fields matching Excel import
  start?: string;
  cccd?: string;
  cccd_date?: string;
  cccd_place?: string;
  permanent_address?: string;
  temporary_address?: string;
  degree?: string;
  emergency_contact_name?: string;
  emergency_contact_relationship?: string;
  emergency_contact_phone?: string;
  notes?: string;
  /** Tổng phép năm do Admin nhập tay (migration 054). null = để hệ thống tự tính. */
  annual_leave_override?: number | null;
}

interface Contract {
  id: string;
  employee_id?: string;
  stt_ton?: string;
  stt?: number | null;
  employee_code?: string;
  employee_name?: string;
  onboard_date?: string;
  probation_contract_number?: string;
  probation_start_date?: string;
  probation_end_date?: string;
  contract_number: string;
  type: string;
  sign_date: string;
  expiration_date: string;
  base_salary_insurance?: number | null;
  performance_bonus?: number | null;
  allowances?: number | null;
  total_income?: number | null;
  last_salary_adj_date?: string;
  status: string;
  notes?: string;
  created_at?: string;
  employees?: {
    name: string;
    department?: string;
    role?: string;
    employee_code?: string;
  };
  department?: string;
}

// ── Số hợp đồng nội bộ (placeholder) ──────────────────────────────────────
// Cột contracts.contract_number có ràng buộc UNIQUE, nhưng rất nhiều dòng
// chưa có số HĐLĐ thật (đang thử việc, chưa ký chính thức). Với những dòng
// đó ta sinh một số nội bộ DUY NHẤT để chúng vẫn vào DB như bản ghi riêng
// thay vì đụng nhau. Giữ nguyên tiền tố "IMPORT-" vì mọi chỗ hiển thị và
// đối chiếu trong trang này đang nhận diện "số không thật" bằng đúng tiền tố
// đó (ô Số HĐLĐ để trống, không dùng làm số hợp đồng chính thức).
const INTERNAL_CONTRACT_PREFIX = "IMPORT-";
const generateInternalContractNumber = () =>
  `${INTERNAL_CONTRACT_PREFIX}${crypto.randomUUID()}`;
const isInternalContractNumber = (n?: string | null) =>
  !!n && String(n).startsWith(INTERNAL_CONTRACT_PREFIX);

// --- MOCK DATA FOR C&B SUBSECTIONS ---
const MOCK_SALARY_INFO = [
  { id: "1", name: "Nguyễn Văn An", base: 18000000, insurance: 5000000, phone: 300000, lunch: 730000, gas: 500000, total: 19530000 },
  { id: "2", name: "Trần Thị Bích", base: 15000000, insurance: 5000000, phone: 300000, lunch: 730000, gas: 500000, total: 16530000 },
  { id: "3", name: "Lê Thị Chi", base: 14000000, insurance: 4500000, phone: 200000, lunch: 730000, gas: 500000, total: 15430000 },
  { id: "4", name: "Phạm Văn Dũng", base: 22000000, insurance: 6000000, phone: 500000, lunch: 730000, gas: 1000000, total: 24230000 }
];

const MOCK_PROMOTIONS = [
  { name: "Nguyễn Văn An", oldRole: "Nhân viên Marketing", newRole: "Trưởng nhóm Marketing", oldDept: "Phòng HCNS", newDept: "Phòng HCNS", date: "2026-01-01", type: "Thăng chức" },
  { name: "Phạm Văn Dũng", oldRole: "Kỹ sư giám sát", newRole: "Chỉ huy phó", oldDept: "Phòng Dự án", newDept: "Dự án Vàm Lẽo", date: "2026-03-15", type: "Bổ nhiệm" },
  { name: "Lê Thị Chi", oldRole: "Nhân viên C&B bậc 1", newRole: "Nhân viên C&B bậc 2", oldDept: "Phòng HCNS", newDept: "Phòng HCNS", date: "2026-05-01", type: "Tăng bậc" }
];

const MOCK_TERMINATIONS = [
  { name: "Trần Văn A", dept: "Phòng Kỹ thuật", date: "2026-05-31", reason: "Tìm kiếm thử thách mới", status: "Đã bàn giao", allowance: 12000000 },
  { name: "Lê Thị B", dept: "Phòng Kế toán", date: "2026-06-15", reason: "Đi du học nước ngoài", status: "Đang bàn giao (80%)", allowance: 0 }
];

const MOCK_CONCURRENTS = [
  { name: "Phạm Văn Dũng", primary: "Chỉ huy phó Vàm Lẽo", concurrent: "Giám sát ATLĐ dự án Vàm Lẽo", dept: "Khối Dự án", allowance: 3000000, date: "2026-04-01" }
];

// Số bản ghi chấm công máy hiển thị khi thu gọn
const MACHINE_LOGS_PREVIEW_COUNT = 5;

const MOCK_EXPLANATIONS: any[] = [];

const MOCK_LEAVES: any[] = [];

const MOCK_TRAVELS: any[] = [];

// Các loại nghỉ trong đơn xin nghỉ phép được tính là "nghỉ chế độ".
// Giá trị ở đây là nhãn sau khi parseTaskToLeave rút gọn tiêu đề task,
// nên "Nghỉ việc riêng hưởng nguyên lương" ra thành "Việc riêng".
const REGIME_LEAVE_TYPES = [
  "Việc riêng",
  "Nghỉ ốm đau hưởng BHXH",
  "Nghỉ thai sản hưởng BHXH",
  "Nghỉ tai nạn lao động hưởng BHXH",
  "Nghỉ chế độ khác"
];

// Định mức phụ cấp — nguồn thật là bảng `allowance_policies` (migration 041),
// sửa được ngay trên giao diện vì mức có thể dao động theo tháng.
//   kind = "per_day"   -> per_day_amount × days_per_month
//   kind = "threshold" -> đủ threshold_days công thì full_amount, thiếu thì reduced_amount
type AllowancePolicy = {
  code: string;
  name: string;
  target: string;
  kind: "per_day" | "threshold";
  per_day_amount: number | null;
  days_per_month: number | null;
  threshold_days: number | null;
  full_amount: number | null;
  reduced_amount: number | null;
  sort_order: number;
};

// Dự phòng khi chưa chạy migration 041 hoặc mất mạng — khớp đúng mức đang áp
// dụng nên giao diện không bao giờ trống, chỉ là không sửa được.
const ALLOWANCE_FALLBACK: AllowancePolicy[] = [
  { code: "lunch", name: "Cơm trưa văn phòng", target: "Toàn bộ nhân viên chính thức", kind: "per_day", per_day_amount: 35000, days_per_month: 23, threshold_days: null, full_amount: null, reduced_amount: null, sort_order: 1 },
  { code: "fuel", name: "Xăng xe di chuyển", target: "Toàn bộ tài khoản", kind: "threshold", per_day_amount: null, days_per_month: null, threshold_days: 15, full_amount: 100000, reduced_amount: 50000, sort_order: 2 },
  { code: "phone", name: "Điện thoại liên lạc", target: "Toàn bộ tài khoản", kind: "threshold", per_day_amount: null, days_per_month: null, threshold_days: 15, full_amount: 100000, reduced_amount: 50000, sort_order: 3 }
];

const formatVnd = (n: number | null) =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("vi-VN")} đ`;

// Mức tháng in đậm trên thẻ: cơm trưa nhân theo ngày công, hai loại còn lại
// lấy mức của người đủ ngày công.
const allowanceMonthly = (p: AllowancePolicy) =>
  p.kind === "per_day"
    ? (p.per_day_amount || 0) * (p.days_per_month || 0)
    : (p.full_amount || 0);

const MOCK_BHXH_LOGS = [
  { name: "Nguyễn Văn An", code: "0123456789", base: 18000000, SI: 1440000, HI: 270000, UI: 180000, company_total: 3870000, booklet: "Công ty giữ" },
  { name: "Trần Thị Bích", code: "0123456790", base: 15000000, SI: 1200000, HI: 225000, UI: 150000, company_total: 3225000, booklet: "Công ty giữ" },
  { name: "Lê Thị Chi", code: "0123456791", base: 14000000, SI: 1120000, HI: 210000, UI: 140000, company_total: 3010000, booklet: "Công ty giữ" },
  { name: "Phạm Văn Dũng", code: "0123456792", base: 22000000, SI: 1760000, HI: 330000, UI: 220000, company_total: 4730000, booklet: "Công ty giữ" }
];

// ─── ĐỊNH MỨC TRỢ CẤP PHÚC LỢI (bảng `benefit_policies`, migration 047) ───
// Mỗi cấp có 2 phần: tiền mặt (`*_amount`) và hiện vật (`*_gift`, tên hiện vật
// lấy ở `gift_label` của dòng — giỏ hoa / vòng hoa). null = cấp đó không áp
// dụng, hiển thị "—".
type BenefitLevelKey = "exec" | "senior" | "mid" | "junior" | "staff";

type BenefitPolicy = {
  code: string;
  name: string;
  gift_label: string | null;
  sort_order: number;
  updated_at?: string;
  updated_by?: string | null;
} & Record<`${BenefitLevelKey}_amount` | `${BenefitLevelKey}_gift`, number | null>;

const BENEFIT_LEVELS: { key: BenefitLevelKey; label: string }[] = [
  { key: "exec", label: "Điều hành cao cấp" },
  { key: "senior", label: "Quản lý cấp cao" },
  { key: "mid", label: "Quản lý cấp trung" },
  { key: "junior", label: "Quản lý sơ cấp" },
  { key: "staff", label: "CBNV" }
];

const BENEFIT_LEVEL_KEY: Record<string, BenefitLevelKey> = {
  "Điều hành cao cấp": "exec",
  "Quản lý cấp cao": "senior",
  "Quản lý cấp trung": "mid",
  "Quản lý sơ cấp": "junior",
  "CBNV": "staff"
};

// Định mức điều chỉnh 2026 — dùng khi chưa chạy migration 047 hoặc DB lỗi.
const BENEFIT_POLICY_FALLBACK: BenefitPolicy[] = [
  { code: "birthday", name: "Sinh nhật", gift_label: "Giỏ hoa", sort_order: 1,
    exec_amount: 2000000, exec_gift: 1000000, senior_amount: 1000000, senior_gift: 800000,
    mid_amount: 800000, mid_gift: 500000, junior_amount: 600000, junior_gift: null,
    staff_amount: 400000, staff_gift: null },
  { code: "marriage", name: "Kết hôn", gift_label: null, sort_order: 2,
    exec_amount: 5000000, exec_gift: null, senior_amount: 3000000, senior_gift: null,
    mid_amount: 2000000, mid_gift: null, junior_amount: 1000000, junior_gift: null,
    staff_amount: 1000000, staff_gift: null },
  { code: "childbirth", name: "Sinh con", gift_label: null, sort_order: 3,
    exec_amount: 3000000, exec_gift: null, senior_amount: 2000000, senior_gift: null,
    mid_amount: 1000000, mid_gift: null, junior_amount: 700000, junior_gift: null,
    staff_amount: 500000, staff_gift: null },
  { code: "spouse_childbirth", name: "Vợ CBNV sinh con", gift_label: null, sort_order: 4,
    exec_amount: 2000000, exec_gift: null, senior_amount: 1000000, senior_gift: null,
    mid_amount: 800000, mid_gift: null, junior_amount: 600000, junior_gift: null,
    staff_amount: 400000, staff_gift: null },
  { code: "sickness", name: "Ốm đau", gift_label: null, sort_order: 5,
    exec_amount: 2000000, exec_gift: null, senior_amount: 1000000, senior_gift: null,
    mid_amount: 800000, mid_gift: null, junior_amount: 600000, junior_gift: null,
    staff_amount: 400000, staff_gift: null },
  { code: "relative", name: "Thân nhân", gift_label: null, sort_order: 6,
    exec_amount: 2000000, exec_gift: null, senior_amount: 1000000, senior_gift: null,
    mid_amount: null, mid_gift: null, junior_amount: null, junior_gift: null,
    staff_amount: null, staff_gift: null },
  { code: "funeral_immediate", name: "Tử tuất (vợ/chồng, bố mẹ vợ chồng, con hợp pháp)", gift_label: "Vòng hoa", sort_order: 7,
    exec_amount: 3000000, exec_gift: 1500000, senior_amount: 2000000, senior_gift: 1500000,
    mid_amount: 1000000, mid_gift: 1000000, junior_amount: 700000, junior_gift: 1000000,
    staff_amount: 500000, staff_gift: 1000000 },
  { code: "funeral_extended", name: "Tử tuất (ông bà nội ngoại, anh chị em ruột)", gift_label: "Vòng hoa", sort_order: 8,
    exec_amount: 2000000, exec_gift: 1500000, senior_amount: 1000000, senior_gift: 1500000,
    mid_amount: 500000, mid_gift: 1000000, junior_amount: null, junior_gift: 1000000,
    staff_amount: null, staff_gift: 1000000 }
];

// Tiền mặt + hiện vật của một ô (dòng phúc lợi × cấp nhân sự)
const benefitCell = (p: BenefitPolicy | undefined, level: string) => {
  const key = BENEFIT_LEVEL_KEY[level] || "staff";
  return {
    amount: p ? p[`${key}_amount`] : null,
    gift: p ? p[`${key}_gift`] : null,
    giftLabel: p?.gift_label || "Hiện vật"
  };
};

// Chuỗi hiển thị một ô: "2.000.000 đ", "800.000 đ + Giỏ hoa 500.000 đ",
// "Vòng hoa 1.000.000 đ" hoặc "—" khi cấp đó không áp dụng.
const benefitCellText = (p: BenefitPolicy | undefined, level: string) => {
  const c = benefitCell(p, level);
  const parts: string[] = [];
  if (c.amount !== null && c.amount !== undefined) parts.push(`${c.amount.toLocaleString("vi-VN")} đ`);
  if (c.gift !== null && c.gift !== undefined) parts.push(`${c.giftLabel} ${c.gift.toLocaleString("vi-VN")} đ`);
  return parts.length ? parts.join(" + ") : "—";
};

// Số tiền mặc định điền vào phiếu trợ cấp: lấy phần tiền mặt; ô chỉ có hiện
// vật (vòng hoa) thì lấy giá trị hiện vật.
const benefitClaimAmount = (p: BenefitPolicy | undefined, level: string) => {
  const c = benefitCell(p, level);
  return c.amount ?? c.gift ?? 0;
};

const getEmployeeLevel = (role: string): string => {
  if (!role) return "CBNV";
  
  // Normalize: lowercase, remove accents, change 'đ' -> 'd'
  let r = role.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d");
  
  // Replace symbols/punctuation with spaces to make word boundaries clear
  r = r.replace(/[\.\,\/\\\#\!\$\%\^\&\*\;\:\{\}\=\-\_\`\~\(\)]/g, " ").replace(/\s+/g, " ").trim();
  
  const words = r.split(" ");
  const hasWord = (w: string) => words.includes(w);
  const hasPhrase = (p: string) => r.includes(p);
  
  // Exclude staff titles from matching director/manager levels:
  // e.g. "Trợ lý Giám đốc" or "Thư ký GD" are staff roles (CBNV)
  const isStaffTitle = r.includes("tro ly") || r.includes("thu ky") || r.includes("chuyen vien") || r.includes("nhan vien") || r.includes("ky su") || r.includes("chuyên viên") || r.includes("nhân viên") || r.includes("kỹ sư");

  // 1. Điều hành cao cấp: Tổng Giám đốc, Phó Tổng Giám đốc, Ban giám đốc
  if (hasPhrase("tong giam doc") || hasPhrase("pho tong giam doc") || hasPhrase("ban giam doc") || hasWord("tgd") || hasWord("ptgd")) {
    return "Điều hành cao cấp";
  }
  
  // 2. Quản lý cấp trung: Trưởng phòng, phó phòng, Giám đốc BĐH, PGĐ BĐH, Chỉ huy trưởng, CHT, TP, PP
  if (
    hasPhrase("giam doc bdh") || hasPhrase("pgd bdh") || 
    hasPhrase("giam doc ban dieu hanh") || hasPhrase("pho giam doc ban dieu hanh") ||
    hasPhrase("chi huy truong") || hasWord("cht") ||
    (!isStaffTitle && (
      hasPhrase("truong phong") || hasWord("tp") || 
      hasPhrase("pho phong") || hasWord("pp")
    ))
  ) {
    return "Quản lý cấp trung";
  }

  // 3. Quản lý cấp cao: Giám đốc (GĐ), Phó Giám đốc (PGĐ) của tổng công ty/khối
  if (!isStaffTitle) {
    if (hasPhrase("giam doc") || hasWord("gd") || hasPhrase("pho giam doc") || hasWord("pgd")) {
      return "Quản lý cấp cao";
    }
  }

  // 4. Quản lý sơ cấp (Cấp sơ): Tổ trưởng, Chỉ huy phó, CHP, Tổ trưởng
  if (hasPhrase("to truong") || hasWord("to truong") || hasPhrase("chi huy pho") || hasWord("chp")) {
    return "Quản lý sơ cấp";
  }

  return "CBNV";
};

// Công thức phép năm (thâm niên, tích luỹ theo tháng, đọc đơn từ bảng tasks)
// nằm ở lib/annualLeave.ts — trang Lịch dùng chung để chặn đăng ký vượt hạn
// mức; hai nơi tính lệch nhau là chặn một đằng trừ một nẻo.
const getEmployeeTenureYears = (emp: any): number => getTenureYears(emp);
const getEmployeeTenureStr = (emp: any): string => getTenureStr(emp);

const getProposedHolidayBonus = (years: number): number => {
  if (years < 1) return 300000;
  if (years < 3) return 500000;
  if (years < 5) return 1000000;
  return 2000000;
};

const TNEC_HOLIDAYS = [
  { id: "national_day_2026", holiday: "Quốc khánh 2/9", date: "2026-09-02", status: "Kế hoạch", desc: "Thưởng lễ Quốc Khánh theo thâm niên" },
  { id: "liberation_day_2026", holiday: "30/4 & 1/5", date: "2026-04-30", status: "Đã chi trả", desc: "Thưởng ngày Giải phóng & Quốc tế Lao động" },
  { id: "new_year_2026", holiday: "Tết Dương Lịch", date: "2026-01-01", status: "Đã chi trả", desc: "Thưởng Tết Dương Lịch" },
  { id: "womens_day_2026", holiday: "Quốc tế Phụ nữ 8/3", date: "2026-03-08", status: "Đã chi trả", desc: "Thưởng ngày Quốc tế Phụ nữ" },
  { id: "company_anniversary_2026", holiday: "Sinh nhật công ty 23/5", date: "2026-05-23", status: "Đã chi trả", desc: "Thưởng ngày thành lập công ty" },
  { id: "vn_womens_day_2026", holiday: "Ngày Phụ nữ VN 20/10", date: "2026-10-20", status: "Kế hoạch", desc: "Thưởng ngày Phụ nữ Việt Nam" }
];

const HISTORICAL_SALARY_TREND = [
  { name: "T1", "Tổng lương (Tỷ)": 1.45, "Đóng BHXH (Triệu)": 152 },
  { name: "T2", "Tổng lương (Tỷ)": 1.46, "Đóng BHXH (Triệu)": 153 },
  { name: "T3", "Tổng lương (Tỷ)": 1.49, "Đóng BHXH (Triệu)": 158 },
  { name: "T4", "Tổng lương (Tỷ)": 1.51, "Đóng BHXH (Triệu)": 160 },
  { name: "T5", "Tổng lương (Tỷ)": 1.54, "Đóng BHXH (Triệu)": 165 },
  { name: "T6", "Tổng lương (Tỷ)": 1.58, "Đóng BHXH (Triệu)": 170 }
];

// --- CLIENT-SIDE DEPT NORMALIZATION & MATCHING HELPERS ---
const normalizeDeptClient = (raw: string | null | undefined): string => {
  if (!raw) return "";
  const lower = raw.trim().toLowerCase();
  
  // Office departments
  if (lower.includes("ban lãnh đạo") || lower.includes("ban giám đốc") || lower === "blđ" || lower === "bld" || lower === "bgđ" || lower === "bgd") return "Ban Lãnh Đạo";
  if (lower.includes("hành chính") || lower.includes("nhân sự") || lower.includes("hcns")) return "Phòng Hành Chính Nhân Sự";
  if (lower.includes("tài chính") || lower.includes("kế toán") || lower.includes("tckt")) return "Phòng Tài Chính Kế Toán";
  if (lower.includes("vật tư") || lower.includes("thiết bị") || lower.includes("vttb")) return "Phòng Vật Tư Thiết Bị";
  if (lower.includes("thị trường")) return "Phòng Thị Trường";
  if (lower.includes("kế hoạch") || lower.includes("đấu thầu") || lower.includes("khđt")) return "Phòng Kế Hoạch Đấu Thầu";
  if (lower.includes("kỹ thuật")) return "Phòng Kỹ Thuật";
  if (lower.includes("an toàn") || lower.includes("hse") || lower.includes("atlđ")) return "Phòng An Toàn Lao Động";
  if (lower.includes("quản lý dự án") || lower.includes("qlda")) return "Phòng Quản Lý Dự Án";
  if (lower.includes("thư ký") || lower.includes("trợ lý")) return "Phòng Thư Ký, Trợ Lý";

  // Project departments
  if (lower.includes("vàm lẽo") || lower.includes("vàm lẻo")) return "BĐH Vàm Lẽo";
  if (lower.includes("rạch xuyên") || lower.includes("rxt")) return "BĐH Rạch Xuyên Tâm";
  if (lower.includes("thường phước") || lower.includes("thuong phuoc")) return "BĐH Thường Phước";
  if (lower.includes("tây ninh") || lower.includes("xử lý nước thải") || lower.includes("xlnt")) return "BĐH XLNT Tây Ninh";
  if (lower.includes("cà ná") || lower.includes("ca na")) return "BĐH KCN Cà Ná";
  if (lower.includes("chống hạn") || lower.includes("chong han")) return "BĐH Chống Hạn Ninh Thuận";
  if (lower.includes("tỉnh lộ 8") || lower.includes("tl8") || lower.includes("tỉnh lộ 08") || lower.includes("tl 8")) return "BĐH Tỉnh Lộ 8";
  if (lower.includes("mã đà") || lower.includes("ma da")) return "BĐH Cầu Mã Đà";
  if (lower.includes("trà vinh") || lower.includes("tra vinh")) return "BĐH ĐMT Trà Vinh 2";
  if (lower.includes("hương lộ 11") || lower.includes("hl11") || lower.includes("hl 11")) return "BĐH Hương Lộ 11";

  return raw.trim();
};

const cleanName = (name: string) => {
  let cleaned = name.replace(/\([^)]*\)/g, ""); // Strip anything in parentheses like "(5957)"
  return cleaned
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim()
    .replace(/\s+/g, " ");
};

// Gộp mọi giá trị cột Loại HĐLĐ (bảng "Hợp đồng nhân sự") về đúng 3 nhãn hiển
// thị ở ô "Loại hợp đồng" đầu hồ sơ nhân viên. "Xác định thời hạn", "1 năm",
// "2 năm", "3 năm"… đều là hợp đồng CÓ THỜI HẠN. Chỉ đổi cách hiển thị — dữ
// liệu gốc trong bảng theo dõi giữ nguyên, không đụng tới.
const simplifyContractType = (raw?: string | null) => {
  const t = cleanName(raw || "");
  if (!t) return "";
  if (t.includes("thu viec")) return "Thử việc";
  if (t.includes("khong xac dinh")) return "Không xác định thời hạn";
  return "Có thời hạn";
};

const matchEmployee = (rawName: string | undefined | null, rawCode: string | number | undefined | null, employeesList: Employee[]) => {
  if (!rawName && !rawCode) return null;
  
  // 1. Try matching by code (exact match)
  if (rawCode) {
    const codeStr = String(rawCode).trim();
    if (codeStr) {
      const found = employeesList.find(e => e.employee_code && String(e.employee_code).trim() === codeStr);
      if (found) return found;
    }
  }
  
  // 2. Try matching by name (exact clean match after stripping parentheses)
  if (rawName) {
    const cleanedSearch = cleanName(rawName);
    if (cleanedSearch) {
      const found = employeesList.find(e => e.name && cleanName(e.name) === cleanedSearch);
      if (found) return found;
    }
  }

  // 3. Try matching by name (fuzzy match)
  if (rawName) {
    const cleanedSearch = cleanName(rawName);
    if (cleanedSearch.length > 5) {
      const found = employeesList.find(e => {
        if (!e.name) return false;
        const cleanedEmp = cleanName(e.name);
        return cleanedEmp.includes(cleanedSearch) || cleanedSearch.includes(cleanedEmp);
      });
      if (found) return found;
    }
  }

  return null;
};

// Danh sách phòng ban / BĐH giờ đọc từ bảng `departments` (Supabase) qua
// useDepartments() trong component — fallback về danh sách cũ nếu DB lỗi
// (xem lib/departments.ts).

const BOARD_OF_DIRECTORS = [
  { name: "Nguyễn Nam Hải", role: "Tổng Giám Đốc", email: "hai.nn@trungnamec.com.vn", phone: "0918.999.888", avatar: "NH" },
  { name: "Lê Minh Tâm", role: "Phó Tổng Giám Đốc Tài Chính", email: "tam.lm@trungnamec.com.vn", phone: "0912.777.666", avatar: "MT" },
  { name: "Trần Đức Long", role: "Phó Tổng Giám Đốc Kỹ Thuật", email: "long.td@trungnamec.com.vn", phone: "0903.555.444", avatar: "DL" }
];

// ── Ghi chú trạng thái nhân sự trên dòng hợp đồng ───────────────────────────
// Bê nguyên luồng của module Danh sách nhân viên (employees/page.tsx:1918
// EditableNoteSelect): bấm vào huy hiệu -> hiện <select> -> chọn xong lưu ngay
// và đóng lại. Giá trị cũ không nằm trong bộ chuẩn thì được chèn lên đầu danh
// sách để không bị mất khi mở dropdown.
const CONTRACT_NOTE_OPTIONS = ["", "NV mới", "NV Kiêm nhiệm", "NV Nghỉ việc"];

// Cùng quy ước với employees/page.tsx:559 — dò trên chuỗi ghi chú.
const isResignedNote = (note?: string) => {
  const t = (note || "").toLowerCase();
  return t.includes("nghỉ việc") || t.includes("nghi viec");
};

function ContractNoteSelect({ value, onSave }: { value: string; onSave: (value: string) => void }) {
  const [val, setVal] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setVal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newVal = e.target.value;
    setVal(newVal);
    onSave(newVal);
    setIsEditing(false);
  };

  // Màu huy hiệu giữ đúng như employees/page.tsx:1933 getBadgeStyle.
  const getBadgeStyle = (text: string) => {
    if (!text) return "text-slate-400 font-medium px-2 py-1";
    const lower = text.toLowerCase();
    if (lower === "nv mới" || lower === "nv moi") {
      return "bg-emerald-50 text-emerald-700 border border-emerald-200/60 px-2.5 py-0.5 rounded-full font-bold shadow-sm";
    }
    if (lower === "nv nghỉ việc" || lower === "nv nghi viec") {
      return "bg-rose-50 text-rose-700 border border-rose-200/60 px-2.5 py-0.5 rounded-full font-bold shadow-sm";
    }
    if (lower.includes("kiêm nhiệm") || lower.includes("kiem nhiem")) {
      return "bg-blue-50 text-blue-700 border border-blue-200/60 px-2.5 py-0.5 rounded-full font-bold shadow-sm";
    }
    return "bg-slate-50 text-slate-600 border border-slate-200/60 px-2.5 py-0.5 rounded-full font-semibold";
  };

  const allOptions = CONTRACT_NOTE_OPTIONS.includes(value)
    ? CONTRACT_NOTE_OPTIONS
    : [value, ...CONTRACT_NOTE_OPTIONS];

  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className={`cursor-pointer inline-block text-[10px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[130px] ${getBadgeStyle(value)} hover:brightness-95 active:scale-95 transition-all`}
      >
        {value || "—"}
      </div>
    );
  }

  return (
    <select
      value={val || ""}
      onChange={handleChange}
      onBlur={() => setIsEditing(false)}
      autoFocus
      className="bg-white px-1.5 py-1 outline-none border border-blue-500 rounded-lg text-[10px] font-semibold text-slate-700 shadow-sm"
    >
      {allOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt || "— Trống —"}
        </option>
      ))}
    </select>
  );
}

export default function CBPage() {
  // Danh sách phòng ban / BĐH đọc từ bảng departments (fallback danh sách cũ)
  const deptLists = useDepartments();
  // Cấu hình công ty (tenant_config) — lấy tên Trưởng phòng HCNS làm người duyệt mặc định
  const tenantCfg = useTenantConfig();
  // 5 Main Tabs: employee_profile, attendance, payroll_insurance, benefits, org_chart
  const [activeTab, setActiveTab] = useState("employee_profile");
  const [activeSubTab, setActiveSubTab] = useState("personal");

  // --- BENEFIT CLAIMS & HOLIDAY BONUS STATES ---
  const [benefitClaims, setBenefitClaims] = useState<any[]>([]);
  const [holidayBonusAdjustments, setHolidayBonusAdjustments] = useState<Record<string, number>>({});
  const [showCreateClaimModal, setShowCreateClaimModal] = useState(false);
  const [selectedHolidayId, setSelectedHolidayId] = useState("national_day_2026");
  const [selectedBirthdayMonth, setSelectedBirthdayMonth] = useState<number>(new Date().getMonth() + 1);
  const [showBirthdayPreviewModal, setShowBirthdayPreviewModal] = useState(false);
  const [isExportingBirthday, setIsExportingBirthday] = useState(false);

  // --- LEAVE & ANNUAL LEAVE STATES ---
  const [leaves, setLeaves] = useState<any[]>([]);
  const [showCreateLeaveModal, setShowCreateLeaveModal] = useState(false);
  // Khoá nút trong lúc ghi đơn xuống CSDL — chống bấm trùng tạo hai đơn giống nhau.
  const [creatingLeave, setCreatingLeave] = useState(false);
  const [leaveTabMode, setLeaveTabMode] = useState<"quota" | "history">("quota");
  const [leaveSearchQuery, setLeaveSearchQuery] = useState("");
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    type: "Phép năm",
    from: new Date().toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
    reason: ""
  });
  const [claimForm, setClaimForm] = useState({
    employeeId: "",
    category: "Sinh nhật" as any,
    date: new Date().toISOString().split("T")[0],
    status: "Chờ phê duyệt",
    notes: "",
    customAmount: ""
  });

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);

  // Ảnh đại diện của ĐÚNG nhân viên đang mở hồ sơ — nguồn là ảnh họ tự tải ở
  // Cài đặt hệ thống (bảng `user_avatars`, khoá theo email đăng nhập).
  // null = chưa đặt ảnh -> giữ nguyên hai chữ viết tắt như cũ.
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);

  // Chỉ hỏi ảnh của người đang xem, không tải ảnh cả danh sách.
  // `employees.email` có thể chứa nhiều địa chỉ trong một ô nên phải dùng
  // fetchAvatarMap/pickAvatar để thử lần lượt từng địa chỉ của họ.
  const selectedEmpEmail = selectedEmp?.email;
  useEffect(() => {
    let mounted = true;
    setSelectedAvatar(null);
    if (!selectedEmpEmail) return;
    fetchAvatarMap([selectedEmpEmail]).then(map => {
      if (mounted) setSelectedAvatar(pickAvatar(map, selectedEmpEmail));
    });
    return () => {
      mounted = false;
    };
  }, [selectedEmpEmail]);

  // Real contract data from Supabase
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);

  // States for Employee Contracts management
  const [contractsSearchQuery, setContractsSearchQuery] = useState("");
  const [contractsDeptFilter, setContractsDeptFilter] = useState("");
  const [contractsProjectFilter, setContractsProjectFilter] = useState("");
  const [tempContracts, setTempContracts] = useState<Contract[]>([]);
  const [isExcelImporting, setIsExcelImporting] = useState(false);
  const [excelImportStage, setExcelImportStage] = useState<"reading" | "sending" | "receiving" | "done">("reading");
  const [isContractReading, setIsContractReading] = useState(false);
  const [showExcelImportPreview, setShowExcelImportPreview] = useState(false);
  const [excelImportedContracts, setExcelImportedContracts] = useState<Contract[]>([]);
  const [showSingleContractModal, setShowSingleContractModal] = useState(false);
  const [savingContracts, setSavingContracts] = useState(false);
  const [syncingProbation, setSyncingProbation] = useState(false);
  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [selectedAiModel, setSelectedAiModel] = useState("gpt-4o-mini");
  const [selectedAiApiKey, setSelectedAiApiKey] = useState("");

  const openAiSettings = () => {
    const savedModel = localStorage.getItem("openai_model_nhan_su") || localStorage.getItem("openai_model_hanh_chinh") || "gpt-4o-mini";
    const savedKey = localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key") || "";
    setSelectedAiModel(savedModel);
    setSelectedAiApiKey(savedKey);
    setShowAiSettingsModal(true);
  };
  const [singleContractForm, setSingleContractForm] = useState<Partial<Contract>>({
    contract_number: "",
    type: "Thử việc",
    sign_date: new Date().toISOString().split("T")[0],
    expiration_date: "",
    status: "Hiệu lực",
    employee_code: "",
    employee_name: "",
    onboard_date: "",
    probation_contract_number: "",
    probation_start_date: "",
    probation_end_date: "",
    base_salary_insurance: null,
    performance_bonus: null,
    allowances: null,
    total_income: null,
    last_salary_adj_date: "",
  });

  // Bản ghi chấm công máy: mặc định thu gọn còn 5 dòng
  const [showAllMachineLogs, setShowAllMachineLogs] = useState(false);

  // Search keyword
  const [searchQuery, setSearchQuery] = useState("");

  // Authorization states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hasFullAccess, setHasFullAccess] = useState(false);

  // Loại HĐLĐ của CHÍNH người đang đăng nhập, lấy qua RPC `my_contract_type`
  // (migration 040). Người không có cờ "Xem lương & HĐLĐ" bị RLS chặn đọc bảng
  // `contracts` (migration 018) nên `contracts` rỗng — không có đường nào khác
  // để ô "Loại hợp đồng" ở đầu hồ sơ hiện đúng. Hàm chỉ trả về đúng một chuỗi
  // loại hợp đồng của bản thân, không kèm lương và không chạm hồ sơ người khác.
  const [ownContractType, setOwnContractType] = useState<string | null>(null);

  // Chốt chặn: ẩn NÚT tab thôi chưa đủ vì nội dung render theo state. Nếu người
  // không đủ quyền đang đứng ở tab lương/hợp đồng (state cũ, quay lại trang…)
  // thì đẩy về tab an toàn.
  useEffect(() => {
    if (hasFullAccess) return;
    setActiveTab(cur => (cur === "payroll_insurance" || cur === "employee_contracts") ? "employee_profile" : cur);
    setActiveSubTab(cur => (cur === "salary" || cur === "contract") ? "personal" : cur);
  }, [hasFullAccess]);

  // Cờ can_approve_benefit — người được giao duyệt chi phúc lợi (hiếu hỷ, thưởng lễ)
  const [canApproveBenefit, setCanApproveBenefit] = useState(false);
  // Chứng từ đính kèm phiếu hiếu hỷ: id phiếu đang tải lên + file đang xem
  const [uploadingClaimId, setUploadingClaimId] = useState<string | null>(null);
  const [attachmentViewer, setAttachmentViewer] = useState<{ url: string; name: string; type: string } | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Attendance Justification (Explanation) states
  const [explanations, setExplanations] = useState<any[]>(MOCK_EXPLANATIONS);
  const [loadingExplanations, setLoadingExplanations] = useState(false);
  const [isUsingDbForExplanations, setIsUsingDbForExplanations] = useState(false);

  // Business Trip (Travel) states
  const [travels, setTravels] = useState<any[]>(MOCK_TRAVELS);
  const [editingTravelId, setEditingTravelId] = useState<string | null>(null);
  const [canDeleteTravel, setCanDeleteTravel] = useState(false);
  const [canDeleteRegime, setCanDeleteRegime] = useState(false);

  // Định mức phụ cấp (allowance_policies) + trạng thái sửa tại chỗ
  const [allowancePolicies, setAllowancePolicies] = useState<AllowancePolicy[]>(ALLOWANCE_FALLBACK);
  const [canEditAllowance, setCanEditAllowance] = useState(false);
  const [editingAllowanceCode, setEditingAllowanceCode] = useState<string | null>(null);
  const [allowanceDraft, setAllowanceDraft] = useState<AllowancePolicy | null>(null);
  const [savingAllowance, setSavingAllowance] = useState(false);
  const [canViewTimesheetSummary, setCanViewTimesheetSummary] = useState(false);

  // Định mức trợ cấp phúc lợi (benefit_policies) + sửa tay cả bảng một lượt
  const [benefitPolicies, setBenefitPolicies] = useState<BenefitPolicy[]>(BENEFIT_POLICY_FALLBACK);
  const [canEditBenefitPolicy, setCanEditBenefitPolicy] = useState(false);
  const [editingBenefitPolicy, setEditingBenefitPolicy] = useState(false);
  const [benefitPolicyDraft, setBenefitPolicyDraft] = useState<BenefitPolicy[] | null>(null);
  const [savingBenefitPolicy, setSavingBenefitPolicy] = useState(false);

  // Cùng lý do với chốt chặn lương ở trên: ẩn NÚT tab "Lấy ngày công máy chấm
  // công" thôi chưa đủ vì nội dung render theo state — phải đẩy người không đủ
  // quyền sang tab con an toàn.
  useEffect(() => {
    if (canViewTimesheetSummary) return;
    setActiveSubTab(cur => (cur === "machine" ? "explanation" : cur));
  }, [canViewTimesheetSummary]);

  const [travelFilterFrom, setTravelFilterFrom] = useState("");
  const [travelFilterTo, setTravelFilterTo] = useState("");

  // Bộ lọc ngày tháng năm cho các tab chấm công còn lại
  const [machineFilterFrom, setMachineFilterFrom] = useState("");
  const [machineFilterTo, setMachineFilterTo] = useState("");
  const [explanationFilterFrom, setExplanationFilterFrom] = useState("");
  const [explanationFilterTo, setExplanationFilterTo] = useState("");
  const [leaveFilterFrom, setLeaveFilterFrom] = useState("");
  const [leaveFilterTo, setLeaveFilterTo] = useState("");
  const [regimeFilterFrom, setRegimeFilterFrom] = useState("");
  const [regimeFilterTo, setRegimeFilterTo] = useState("");

  // Explanation Add Form states
  const [showExplanationAddForm, setShowExplanationAddForm] = useState(false);
  const [expFormDate, setExpFormDate] = useState(new Date().toISOString().substring(0, 10));
  const [expFormEmployeeId, setExpFormEmployeeId] = useState("");
  const [expFormEmployeeName, setExpFormEmployeeName] = useState("");
  const [expFormDepartment, setExpFormDepartment] = useState("");
  const [expFormReason, setExpFormReason] = useState("");
  const [expFormPropose, setExpFormPropose] = useState("");
  const [expFormApprover, setExpFormApprover] = useState("");
  const [isSubmittingExplanation, setIsSubmittingExplanation] = useState(false);

  // NV kiêm nhiệm và NV nghỉ việc không nằm trong mọi danh sách chi phúc lợi
  // (sinh nhật, hiếu hỷ, thưởng lễ). Quét cả cột Ghi chú lẫn Trạng thái vì
  // nhiều hồ sơ chỉ đánh dấu ở Ghi chú — cùng quy ước với trang Danh sách nhân viên.
  const isExcludedFromBenefits = (emp: { notes?: string; status?: string }) => {
    const text = `${emp.notes || ""} ${emp.status || ""}`.toLowerCase();
    return (
      text.includes("kiêm nhiệm") || text.includes("kiem nhiem") ||
      text.includes("nghỉ việc") || text.includes("nghi viec")
    );
  };

  // Filter employees for Women's Day (8/3 and 20/10)
  const holidayFilteredEmployees = useMemo(() => {
    const eligible = employees.filter(emp => !isExcludedFromBenefits(emp));
    const isWomensDay = selectedHolidayId === "womens_day_2026" || selectedHolidayId === "vn_womens_day_2026";
    if (isWomensDay) {
      return eligible.filter(emp => emp.gender === "Nữ");
    }
    return eligible;
  }, [employees, selectedHolidayId]);

  // --- STATE FOR EXCEL TIMESHEET & EMAIL ROUTING ---
  interface ParsedEmployeeAttendance {
    employeeCode: string;
    name: string;
    department: string;
    email: string;
    emailFound: boolean;
    totalDays: number;
    totalLate: number;
    totalEarly: number;
    totalOvertime: number;
    details: Array<{
      date: string;
      dayOfWeek: string;
      checkin: string;
      checkout: string;
      hours: number;
      late: number;
      early: number;
      status: string;
      workday?: number;
      isBusinessTrip?: boolean;
    }>;
    emailStatus?: "idle" | "sending" | "success" | "error";
    emailMessage?: string;
  }
  const [parsedEmployees, setParsedEmployees] = useState<ParsedEmployeeAttendance[]>([]);
  const [selectedEmployeeForDetail, setSelectedEmployeeForDetail] = useState<ParsedEmployeeAttendance | null>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [smtpConfig, setSmtpConfig] = useState({
    user: "",
    pass: "",
    provider: "gmail",
    host: "smtp.gmail.com",
    port: 465,
    secure: true
  });
  const [showEmailConfigModal, setShowEmailConfigModal] = useState(false);
  const [showTimesheetMatrixModal, setShowTimesheetMatrixModal] = useState(false);
  const [timesheetDeptFilter, setTimesheetDeptFilter] = useState("");
  const [modalProvider, setModalProvider] = useState("gmail");

  useEffect(() => {
    if (showEmailConfigModal) {
      setModalProvider(smtpConfig.provider || "gmail");
    }
  }, [showEmailConfigModal, smtpConfig.provider]);

  const [isSendingAllEmails, setIsSendingAllEmails] = useState(false);
  const [excelFileName, setExcelFileName] = useState("");
  const [timesheetMonth, setTimesheetMonth] = useState("");
  const [excelSearchQuery, setExcelSearchQuery] = useState("");

  const [importedTimesheets, setImportedTimesheets] = useState<any[]>([]);
  const [isSavingTimesheet, setIsSavingTimesheet] = useState(false);
  const [currentFileObject, setCurrentFileObject] = useState<File | null>(null);

  const fetchImportedTimesheets = async () => {
    try {
      const { data, error } = await supabase
        .from("attendance_imports")
        .select("*")
        .order("created_at", { ascending: false });
      if (!error && data) {
        setImportedTimesheets(data);
      }
    } catch (err) {
      console.error("Error fetching imported timesheets:", err);
    }
  };

  // Load SMTP config and fetch imported timesheets
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedUser = localStorage.getItem("tnec_cb_smtp_user") || "";
      const savedPass = localStorage.getItem("tnec_cb_smtp_pass") || "";
      const savedProvider = localStorage.getItem("tnec_cb_smtp_provider") || "gmail";
      const savedHost = localStorage.getItem("tnec_cb_smtp_host") || "smtp.gmail.com";
      const savedPort = Number(localStorage.getItem("tnec_cb_smtp_port")) || 465;
      const savedSecure = localStorage.getItem("tnec_cb_smtp_secure") !== "false";
      setSmtpConfig({
        user: savedUser,
        pass: savedPass,
        provider: savedProvider,
        host: savedHost,
        port: savedPort,
        secure: savedSecure
      });

      // Cache cục bộ hiển thị nhanh trước khi Supabase trả về (nguồn thật là Supabase)
      const savedClaims = localStorage.getItem("tnec_cb_benefit_claims");
      if (savedClaims) {
        try {
          setBenefitClaims(JSON.parse(savedClaims));
        } catch (e) {
          console.error("Error parsing saved benefit claims", e);
        }
      }

      const savedAdjustments = localStorage.getItem("tnec_cb_holiday_bonus_adjustments");
      if (savedAdjustments) {
        try {
          setHolidayBonusAdjustments(JSON.parse(savedAdjustments));
        } catch (e) {
          console.error("Error parsing saved holiday bonus adjustments", e);
        }
      }
    }
    fetchImportedTimesheets();
    fetchBenefitClaims();
  }, []);

  // Nguồn thật cho mức duyệt thưởng lễ: bảng holiday_bonus_approvals. Nạp lại
  // mỗi khi đổi đợt lễ vì mức duyệt lưu riêng theo từng đợt.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("holiday_bonus_approvals")
        .select("employee_id, amount")
        .eq("holiday_id", selectedHolidayId);
      if (cancelled) return;
      if (error) {
        console.warn("Không tải được holiday_bonus_approvals (đã chạy migration 013 chưa?):", error.message);
        return; // giữ cache localStorage nếu có
      }
      const map: Record<string, number> = {};
      (data || []).forEach(r => { map[r.employee_id] = Number(r.amount) || 0; });
      setHolidayBonusAdjustments(map);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_cb_holiday_bonus_adjustments", JSON.stringify(map));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedHolidayId]);

  // Nguồn thật cho trợ cấp hiếu hỷ: bảng Supabase `benefit_claims` (đồng bộ mọi tài khoản)
  const normalizeClaim = (row: any) => ({
    ...row,
    amount: row.amount != null && !isNaN(Number(row.amount)) ? Number(row.amount) : row.amount,
  });

  const fetchBenefitClaims = async () => {
    try {
      const { data, error } = await supabase
        .from("benefit_claims")
        .select("*")
        .order("date", { ascending: false });

      if (error) {
        console.warn("Không tải được benefit_claims từ Supabase (kiểm tra bảng đã tạo chưa):", error.message);
        return; // giữ cache localStorage nếu có
      }

      const claims = (data || []).map(normalizeClaim);
      setBenefitClaims(claims);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_cb_benefit_claims", JSON.stringify(claims));
      }
    } catch (err) {
      console.error("Lỗi fetch benefit_claims:", err);
    }
  };

  const handleSaveSmtpConfig = (user: string, pass: string, provider: string, host: string, port: number, secure: boolean) => {
    setSmtpConfig({ user, pass, provider, host, port, secure });
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_cb_smtp_user", user);
      localStorage.setItem("tnec_cb_smtp_pass", pass);
      localStorage.setItem("tnec_cb_smtp_provider", provider);
      localStorage.setItem("tnec_cb_smtp_host", host);
      localStorage.setItem("tnec_cb_smtp_port", String(port));
      localStorage.setItem("tnec_cb_smtp_secure", String(secure));
    }
    setShowEmailConfigModal(false);
    alert("Đã lưu cấu hình gửi email SMTP!");
  };

  const handleSaveTimesheetToDb = async () => {
    if (!currentFileObject || parsedEmployees.length === 0) {
      alert("Vui lòng tải lên file Excel trước!");
      return;
    }
    setIsSavingTimesheet(true);
    try {
      const parts = timesheetMonth.split("/");
      const monthVal = parts[0] || "06";
      const year = parts[1] || "2026";
      
      // Clean file name
      const cleanFileName = currentFileObject.name.replace(/[^a-zA-Z0-9.\-_ ()]/g, "");
      const filePath = `${year}/${monthVal}/${Date.now()}_${cleanFileName}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("attendance-files")
        .upload(filePath, currentFileObject, { cacheControl: "3600", upsert: true });

      if (uploadError) {
        throw new Error("Không thể tải file lên bộ lưu trữ Supabase Storage! Vui lòng đảm bảo đã chạy file cấu hình database SQL: " + uploadError.message);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("attendance-files")
        .getPublicUrl(filePath);

      // Save record to database
      const { error: insertError } = await supabase
        .from("attendance_imports")
        .insert({
          month: timesheetMonth,
          year,
          month_val: monthVal,
          file_name: currentFileObject.name,
          file_path: filePath,
          file_url: urlData?.publicUrl || "",
          parsed_data: parsedEmployees
        });

      if (insertError) {
        throw new Error("Không thể lưu thông tin vào bảng dữ liệu Supabase! Vui lòng đảm bảo đã chạy file cấu hình database SQL: " + insertError.message);
      }

      alert("Lưu bảng công lên phần mềm thành công!");
      fetchImportedTimesheets();
    } catch (err: any) {
      console.error("Error saving timesheet:", err);
      alert(err.message || "Lỗi khi lưu bảng công!");
    } finally {
      setIsSavingTimesheet(false);
    }
  };

  const handleDeleteTimesheet = async (id: string, filePath: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa bảng công này khỏi phần mềm không?")) return;
    try {
      // Delete file from Storage
      await supabase.storage.from("attendance-files").remove([filePath]);

      // Delete record from Database
      const { error } = await supabase.from("attendance_imports").delete().eq("id", id);
      if (error) throw error;

      alert("Đã xóa bảng công thành công!");
      fetchImportedTimesheets();
    } catch (err: any) {
      console.error("Error deleting timesheet:", err);
      alert("Lỗi khi xóa bảng công: " + err.message);
    }
  };

  const timesheetTree = useMemo(() => {
    const tree: Record<string, Record<string, any[]>> = {};
    importedTimesheets.forEach(item => {
      const yr = item.year || "2026";
      const mth = `Tháng ${item.month_val}`;
      if (!tree[yr]) tree[yr] = {};
      if (!tree[yr][mth]) tree[yr][mth] = [];
      tree[yr][mth].push(item);
    });
    return tree;
  }, [importedTimesheets]);

  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
  };

  const filteredExcelEmployees = useMemo(() => {
    return parsedEmployees.filter(emp => {
      if (!excelSearchQuery) return true;
      const q = normalizeText(excelSearchQuery);
      if (!q) return true;
      return (
        normalizeText(emp.name).includes(q) ||
        normalizeText(emp.employeeCode).includes(q) ||
        (emp.department && normalizeText(emp.department).includes(q)) ||
        (emp.email && normalizeText(emp.email).includes(q))
      );
    });
  }, [parsedEmployees, excelSearchQuery]);

  const parseExcelDate = (val: any): string => {
    if (val === undefined || val === null || val === "") return "";
    const num = Number(val);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const ms = Math.round((num - 25569) * 86400 * 1000);
      const date = new Date(ms);
      const d = String(date.getUTCDate()).padStart(2, '0');
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const y = date.getUTCFullYear();
      return `${d}/${m}/${y}`;
    }
    return String(val).trim();
  };

  const getMinutes = (timeStr: string): number | null => {
    if (!timeStr) return null;
    const parts = timeStr.trim().split(":");
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  };

  // Chuẩn hóa một mốc ngày (dạng "DD/MM/YYYY" từ Excel hoặc ISO từ Supabase) về "YYYY-MM-DD" để so sánh an toàn
  const toDateOnlyKey = (val: string): string => {
    if (!val) return "";
    // Chấp nhận cả "DD/MM/YYYY" và "DD-MM-YYYY" (không dùng Date() để tránh nhầm MM/DD kiểu Mỹ)
    const dmy = val.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
    const ymd = val.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (ymd) {
      return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
    }
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // "YYYY-MM-DD" -> "DD/MM/YYYY" để hiển thị
  const formatDayKey = (key: string): string => {
    const m = String(key || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(key || "");
  };

  // Nhân viên có lịch công tác đã được duyệt vào ngày này hay không
  const findApprovedTripForDay = (employeeName: string, dateVal: string, tripList: any[]) => {
    const dayKey = toDateOnlyKey(dateVal);
    if (!dayKey) return null;
    return tripList.find(t => {
      if (t.status !== "Đã duyệt") return false;
      if (normalizeText(t.name || "") !== normalizeText(employeeName)) return false;
      const fromKey = toDateOnlyKey(t.from);
      const toKey = toDateOnlyKey(t.to);
      if (!fromKey || !toKey) return false;
      return dayKey >= fromKey && dayKey <= toKey;
    }) || null;
  };

  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCurrentFileObject(file);
    setExcelFileName(file.name);
    setIsParsingExcel(true);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const data = evt.target?.result;
          if (!data) return;
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const rawRows = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
          
          let headerRowIndex = -1;
          for (let i = 0; i < rawRows.length; i++) {
            const rowStr = JSON.stringify(rawRows[i]);
            if (rowStr.includes("Mã nhân viên") || rowStr.includes("Mã NV") || rowStr.includes("MÃ NHÂN VIÊN")) {
              headerRowIndex = i;
              break;
            }
          }

          if (headerRowIndex === -1) {
            alert("Không tìm thấy dòng tiêu đề cột (Mã nhân viên, Tên nhân viên...) trong file Excel!");
            setIsParsingExcel(false);
            return;
          }

          const headers = rawRows[headerRowIndex].map((h: any) => String(h || "").trim());
          const colIndices = {
            code: headers.findIndex((h: string) => h === "Mã nhân viên" || h === "Mã NV" || h === "MÃ NHÂN VIÊN"),
            name: headers.findIndex((h: string) => h === "Tên nhân viên" || h === "TÊN NHÂN VIÊN" || h === "Họ và tên"),
            dept: headers.findIndex((h: string) => h === "Phòng ban" || h === "PHÒNG BAN"),
            date: headers.findIndex((h: string) => h === "Ngày" || h === "NGÀY"),
            dayOfWeek: headers.findIndex((h: string) => h === "Thứ" || h === "THỨ"),
            checkin: headers.findIndex((h: string) => h === "Giờ vào" || h === "GIỜ VÀO"),
            checkout: headers.findIndex((h: string) => h === "Giờ ra" || h === "GIỜ RA"),
            late: headers.findIndex((h: string) => h === "Trễ" || h === "TRỄ"),
            early: headers.findIndex((h: string) => h === "Sớm" || h === "SỚM"),
            workday: headers.findIndex((h: string) => h === "Công" || h === "CÔNG"),
            hours: headers.findIndex((h: string) => h === "Tổng giờ" || h === "TỔNG GIỜ"),
            ot: headers.findIndex((h: string) => h === "Tăng ca" || h === "TĂNG CA"),
            status: headers.findIndex((h: string) => h === "Ca" || h === "CA")
          };

          if (colIndices.code === -1 || colIndices.name === -1) {
            alert("File Excel thiếu cột bắt buộc: 'Mã nhân viên' hoặc 'Tên nhân viên'!");
            setIsParsingExcel(false);
            return;
          }

          // Bắt buộc phải có cột "Ngày": bảng tổng hợp xếp công theo đúng ngày trong tháng,
          // thiếu cột này thì không có cách nào xác định ngày nào là ngày nào.
          if (colIndices.date === -1) {
            alert("File Excel thiếu cột bắt buộc: 'Ngày'! Không thể xếp ngày công vào bảng tổng hợp.");
            setIsParsingExcel(false);
            return;
          }

          // Group rows by employee
          const employeeMap: Record<string, any[]> = {};
          let detectedMonth = "";

          for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
            const row = rawRows[i];
            if (!row || row.length === 0) continue;
            
            const codeVal = String(row[colIndices.code] || "").trim();
            if (!codeVal || codeVal === "undefined" || codeVal === "null" || codeVal === "") continue;

            if (codeVal.toLowerCase().includes("tổng") || codeVal.toLowerCase().includes("cộng")) continue;

            if (!employeeMap[codeVal]) {
              employeeMap[codeVal] = [];
            }
            employeeMap[codeVal].push(row);
          }

          // Fetch employees from database to map email — chỉ cần cột danh bạ
          // để đối chiếu bảng công, không cần PII.
          const { data: dbEmployees, error: empError } = await supabase
            .from("employees_directory")
            .select("employee_code, name, email, department");
          if (empError) throw empError;

          const parsedList: ParsedEmployeeAttendance[] = [];

          Object.entries(employeeMap).forEach(([code, rows]) => {
            const firstRow = rows[0];
            const rawName = String(firstRow[colIndices.name] || "");
            const cleanedName = rawName.replace(/^EC\s*-\s*/gi, "").trim();
            const dept = colIndices.dept !== -1 ? String(firstRow[colIndices.dept] || "").trim() : "";

            // Nhận diện nhân viên hoàn toàn dựa vào danh bạ employees_directory (mã NV hoặc họ tên
            // không dấu) — không còn trường hợp nào được gán cứng mã/email/tên trong code.
            const cleanCode = (c: string) => String(c || "").replace(/^0+/, "").trim();
            const dbEmp = dbEmployees?.find(e => {
              const dbCode = cleanCode(e.employee_code);
              const excelCode = cleanCode(code);
              const codeMatches = dbCode && excelCode && dbCode === excelCode;
              const nameMatches = normalizeText(e.name) === normalizeText(cleanedName);
              return codeMatches || nameMatches;
            });

            const email = dbEmp?.email || "";
            const emailFound = !!email;

            // Tên hiển thị lấy đúng tên trong danh bạ để khớp được với phép / giải trình / công tác
            const displayName = dbEmp?.name || cleanedName;

            let totalDays = 0;
            let totalLate = 0;
            let totalEarly = 0;
            let totalOvertime = 0;

            const details = rows.map(row => {
              const rawDate = colIndices.date !== -1 ? row[colIndices.date] : "";
              const dateVal = parseExcelDate(rawDate);
              
              if (dateVal && !detectedMonth) {
                const parts = dateVal.split(/[-\/]/);
                if (parts.length === 3) {
                  if (parts[2].length === 4) {
                    detectedMonth = `${parts[1]}/${parts[2]}`;
                  } else if (parts[0].length === 4) {
                    detectedMonth = `${parts[1]}/${parts[0]}`;
                  }
                }
              }

              const dayOfWeekVal = colIndices.dayOfWeek !== -1 ? String(row[colIndices.dayOfWeek] || "").trim() : "";
              
              const isSat = (dayStr: string) => {
                const d = dayStr.toLowerCase().trim();
                return d.includes("bảy") || d === "bảy" || d === "t7" || d === "7" || d.includes("saturday") || d === "sat";
              };

              let lateMins = colIndices.late !== -1 ? (Number(row[colIndices.late]) || 0) : 0;
              let earlyMins = colIndices.early !== -1 ? (Number(row[colIndices.early]) || 0) : 0;
              const otHours = colIndices.ot !== -1 ? (Number(row[colIndices.ot]) || 0) : 0;
              
              const checkin = colIndices.checkin !== -1 ? String(row[colIndices.checkin] || "").trim() : "";
              const checkout = colIndices.checkout !== -1 ? String(row[colIndices.checkout] || "").trim() : "";

              // Tối ưu hóa tính toán Trễ/Sớm cho Thứ Bảy
              if (isSat(dayOfWeekVal)) {
                // Tính lại Đi trễ cho Thứ Bảy (nếu có checkin)
                const ciMins = getMinutes(checkin);
                if (ciMins !== null) {
                  lateMins = ciMins > 8 * 60 ? (ciMins - 8 * 60) : 0;
                } else {
                  lateMins = 0;
                }

                // Tính lại Về sớm cho Thứ Bảy (mốc là 12h00 trưa)
                const coMins = getMinutes(checkout);
                if (coMins !== null) {
                  earlyMins = coMins < 12 * 60 ? (12 * 60 - coMins) : 0;
                } else {
                  earlyMins = 0;
                }
              }

              let rawWorkday = 0;
              if (colIndices.workday !== -1 && row[colIndices.workday] !== undefined && row[colIndices.workday] !== null && row[colIndices.workday] !== "") {
                rawWorkday = Number(row[colIndices.workday]) || 0;
              } else {
                // Tự động tính ngày công dựa trên quy định: Sáng 8h00 - 12h00, Chiều 13h15 - 17h15
                const ci = getMinutes(checkin);
                const co = getMinutes(checkout);
                if (ci !== null && co !== null) {
                  const morningStart = Math.max(ci, 8 * 60);
                  const morningEnd = Math.min(co, 12 * 60);
                  const morningMins = Math.max(0, morningEnd - morningStart);

                  const afternoonStart = Math.max(ci, 13 * 60 + 15);
                  const afternoonEnd = Math.min(co, 17 * 60 + 15);
                  const afternoonMins = Math.max(0, afternoonEnd - afternoonStart);

                  const totalMins = morningMins + afternoonMins;
                  if (totalMins >= 360) {
                    rawWorkday = 1.0;
                  } else if (totalMins >= 150) {
                    rawWorkday = 0.5;
                  }
                }
              }
              let workdayVal = Math.round(rawWorkday * 2) / 2;

              // Nếu là Thứ Bảy và có đi làm (quét vân tay checkin/checkout hoặc Công > 0), tính tròn 1.0 ngày công
              if (isSat(dayOfWeekVal)) {
                const hasSwipes = checkin && checkin !== "-" && checkout && checkout !== "-";
                if (rawWorkday > 0 || hasSwipes) {
                  workdayVal = 1.0;
                }
              }

              // Công tác đã duyệt được ưu tiên cao nhất: kể cả hôm đó có quẹt vân tay (đi công tác về
              // ghé qua văn phòng quẹt thêm) thì vẫn tính là ngày công tác, đủ 1.0 ngày công.
              let isBusinessTrip = false;
              const approvedTrip = findApprovedTripForDay(displayName, dateVal, travels);
              if (approvedTrip) {
                workdayVal = 1.0;
                isBusinessTrip = true;
              }

              totalDays += workdayVal;
              totalLate += lateMins;
              totalEarly += earlyMins;
              totalOvertime += otHours;

              return {
                date: dateVal,
                dayOfWeek: dayOfWeekVal,
                checkin,
                checkout,
                hours: colIndices.hours !== -1 ? (Number(row[colIndices.hours]) || 0) : 0,
                late: lateMins,
                early: earlyMins,
                status: colIndices.status !== -1 ? String(row[colIndices.status] || "").trim() : "",
                workday: workdayVal,
                isBusinessTrip
              };
            });

            parsedList.push({
              employeeCode: code,
              name: displayName,
              department: dept || dbEmp?.department || "",
              email,
              emailFound,
              totalDays: Math.round(totalDays * 2) / 2,
              totalLate,
              totalEarly,
              totalOvertime: parseFloat(totalOvertime.toFixed(2)),
              details,
              emailStatus: "idle"
            });
          });

          setParsedEmployees(parsedList);
          setTimesheetMonth(detectedMonth || "06/2026");
          setIsParsingExcel(false);
          alert(`Đã nhận diện thành công ${parsedList.length} nhân viên từ file chấm công!`);
        } catch (err: any) {
          console.error("Error processing Excel:", err);
          alert("Lỗi khi xử lý file Excel: " + err.message);
          setIsParsingExcel(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      console.error("FileReader error:", err);
      alert("Lỗi đọc file: " + err.message);
      setIsParsingExcel(false);
    }
  };

  // ─── BẢNG TỔNG HỢP CHẤM CÔNG THEO THÁNG (ma trận ngày x nhân viên) ───
  interface TimesheetMatrixRow {
    employeeCode: string;
    name: string;
    department: string;
    days: string[]; // tag mỗi ngày trong tháng: "x" | "CT" | "P" | "P/2" | "Ro" | ""
    vanPhong: number;
    phepCoLuong: number;
    congTac: number;
    nghiKhongLuong: number;
    tongNgayCong: number;
    hasDateMismatch: boolean;
  }

  const parseMonthYear = (monthStr: string): { month: number; year: number } => {
    const parts = (monthStr || "").split("/");
    const month = parseInt(parts[0], 10) || new Date().getMonth() + 1;
    const year = parseInt(parts[1], 10) || new Date().getFullYear();
    return { month, year };
  };

  const timesheetMatrix = useMemo(() => {
    if (parsedEmployees.length === 0) return { rows: [] as TimesheetMatrixRow[], daysInMonth: 0, month: 0, year: 0 };
    const { month, year } = parseMonthYear(timesheetMonth);
    const daysInMonth = new Date(year, month, 0).getDate();

    const rows: TimesheetMatrixRow[] = parsedEmployees.map(emp => {
      // Người được miễn thứ Bảy vẫn tính đủ công — danh sách khai trong
      // tenant_config.saturday_exempt_names (khớp tên kiểu chứa, không dấu)
      const empNameNorm = normalizeText(emp.name);
      const isSaturdayExempt = (tenantCfg.saturday_exempt_names || []).some(
        n => n && empNameNorm.includes(normalizeText(n))
      );
      const days: string[] = [];
      let vanPhong = 0, phepCoLuong = 0, congTac = 0, nghiKhongLuong = 0;

      // Công chỉ được xếp theo đúng ngày đọc từ cột "Ngày" của file Excel. Nếu không khớp
      // được ngày nào trong tháng thì báo cho HCNS biết, tuyệt đối không đoán theo vị trí dòng.
      let matchedDaysCount = 0;
      for (let dd = 1; dd <= daysInMonth; dd++) {
        const key = `${year}-${String(month).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
        if (emp.details.some(d => toDateOnlyKey(d.date) === key)) matchedDaysCount += 1;
      }
      const hasDateMismatch = matchedDaysCount === 0 && emp.details.length > 0;

      for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month - 1, d);
        const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const isSunday = dateObj.getDay() === 0;
        const isSaturday = dateObj.getDay() === 6;

        const detail = emp.details.find(dd => toDateOnlyKey(dd.date) === dayKey);

        let tag = "";
        if (detail && (detail.workday || 0) > 0) {
          const wd = detail.workday || 0;
          if (detail.isBusinessTrip) {
            tag = "CT";
            congTac += 1;
          } else if (wd < 1) {
            // Ngày thường chỉ làm nửa buổi thì đếm đúng 0.5 công. Thứ Bảy làm buổi sáng
            // đã được ép tròn 1.0 ngay ở khâu đọc Excel nên không rơi vào nhánh này.
            tag = "x/2";
            vanPhong += 0.5;
          } else {
            tag = "x";
            vanPhong += 1;
          }
        } else if (isSaturday && isSaturdayExempt) {
          // Được ưu tiên không làm thứ Bảy, vẫn tính đủ công (tenant_config.saturday_exempt_names)
          tag = "";
        } else if (isSunday) {
          tag = "";
        } else {
          // Thứ tự ưu tiên khi ngày đó không có dòng chấm công máy: Công tác > Giải trình > Nghỉ phép
          const approvedTripDay = findApprovedTripForDay(emp.name, dayKey, travels);

          // Khuyết chấm công máy (VD: quên quét vân tay lúc về) nhưng có giải trình đã được duyệt => vẫn tính đủ công
          const approvedExplanation = explanations.find(e => {
            if (e.status !== "Đã duyệt") return false;
            if (normalizeText(e.name || "") !== normalizeText(emp.name)) return false;
            return toDateOnlyKey(e.date) === dayKey;
          });

          if (approvedTripDay) {
            tag = "CT";
            congTac += 1;
          } else if (approvedExplanation) {
            tag = "GT";
            vanPhong += 1;
          } else {
            // Khuyết chấm công máy: đối chiếu nghỉ phép đã duyệt
            const approvedLeave = leaves.find(l => {
              if (l.status !== "Đã duyệt") return false;
              if (normalizeText(l.name || "") !== normalizeText(emp.name)) return false;
              const fromKey = toDateOnlyKey(l.from);
              const toKey = toDateOnlyKey(l.to);
              if (!fromKey || !toKey) return false;
              return dayKey >= fromKey && dayKey <= toKey;
            });
            if (approvedLeave) {
              const isUnpaid = normalizeText(approvedLeave.type || "").includes("khong luong");
              if (isUnpaid) {
                tag = "Ro";
                nghiKhongLuong += 1;
              } else if (approvedLeave.days === 0.5) {
                tag = "P/2";
                phepCoLuong += 0.5;
              } else {
                tag = "P";
                phepCoLuong += 1;
              }
            }
          }
        }
        days.push(tag);
      }

      return {
        employeeCode: emp.employeeCode,
        name: emp.name,
        department: emp.department || "Chưa xếp phòng",
        days,
        vanPhong,
        phepCoLuong,
        congTac,
        nghiKhongLuong,
        tongNgayCong: vanPhong + congTac + phepCoLuong,
        hasDateMismatch
      };
    });

    return { rows, daysInMonth, month, year };
  }, [parsedEmployees, leaves, explanations, travels, timesheetMonth]);

  // Số ngày công CHÍNH THỨC của mỗi nhân viên = đúng cột "Tổng ngày công" của bảng tổng hợp
  // (văn phòng + công tác + phép có lương, đã ưu tiên giải trình trước ngày phép).
  // Danh sách, ô chi tiết và email báo cáo đều lấy chung con số này để không lệch nhau.
  const officialWorkdaysByCode = useMemo(() => {
    const map = new Map<string, number>();
    timesheetMatrix.rows.forEach(row => map.set(row.employeeCode, row.tongNgayCong));
    return map;
  }, [timesheetMatrix]);

  const getOfficialWorkdays = (emp: ParsedEmployeeAttendance): number => {
    const val = officialWorkdaysByCode.get(emp.employeeCode);
    return val === undefined ? emp.totalDays : val;
  };

  // Bộ lọc phòng ban của bảng tổng hợp: "" = tất cả các phòng
  const timesheetDeptOptions = useMemo(() => {
    const names = new Set<string>();
    timesheetMatrix.rows.forEach(row => names.add(row.department || "Chưa xếp phòng"));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "vi"));
  }, [timesheetMatrix]);

  const timesheetMatrixRows = useMemo(() => {
    if (!timesheetDeptFilter) return timesheetMatrix.rows;
    return timesheetMatrix.rows.filter(row => (row.department || "Chưa xếp phòng") === timesheetDeptFilter);
  }, [timesheetMatrix, timesheetDeptFilter]);

  // Tải file công tháng khác mà phòng đang lọc không còn thì tự trả về "tất cả"
  useEffect(() => {
    if (timesheetDeptFilter && !timesheetDeptOptions.includes(timesheetDeptFilter)) {
      setTimesheetDeptFilter("");
    }
  }, [timesheetDeptOptions, timesheetDeptFilter]);

  const handleExportTimesheetSummary = async () => {
    // Xuất đúng phạm vi đang xem: đang lọc phòng nào thì chỉ tải phòng đó, không lọc thì tải tất cả
    const rows = timesheetMatrixRows;
    if (rows.length === 0) {
      alert("Chưa có dữ liệu chấm công để xuất bảng tổng hợp!");
      return;
    }
    const { daysInMonth, month, year } = timesheetMatrix;
    const deptTitle = timesheetDeptFilter
      ? (timesheetDeptFilter.toUpperCase().includes("HCNS") || timesheetDeptFilter.toUpperCase().includes("HÀNH CHÍNH")
        ? "PHÒNG HCNS"
        : `PHÒNG ${timesheetDeptFilter.toUpperCase()}`)
      : "TOÀN CÔNG TY";

    // Gom nhóm theo phòng ban, giống cấu trúc "I. PHÒNG..." / "II. TỔ..." trong file mẫu Word
    const groups: { name: string; rows: typeof rows }[] = [];
    rows.forEach(row => {
      const key = row.department || "Chưa xếp phòng";
      let group = groups.find(g => g.name === key);
      if (!group) {
        group = { name: key, rows: [] };
        groups.push(group);
      }
      group.rows.push(row);
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Bảng tổng hợp chấm công");

    const fixedCols = 2; // STT, Họ tên
    const summaryHeaders = ["Văn phòng", "Phép có hưởng lương", "Công tác", "Nghỉ phép không lương", "Tổng ngày công"];
    const totalCols = fixedCols + daysInMonth + summaryHeaders.length;
    const weekdayLabels = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    const thinBorder = { top: { style: "thin" as const }, bottom: { style: "thin" as const }, left: { style: "thin" as const }, right: { style: "thin" as const } };

    sheet.mergeCells(1, 1, 1, totalCols);
    sheet.getCell(1, 1).value = "CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM";
    sheet.getCell(1, 1).font = { bold: true, size: 12 };
    sheet.getCell(1, 1).alignment = { horizontal: "center" };

    sheet.mergeCells(2, 1, 2, totalCols);
    sheet.getCell(2, 1).value = `BẢNG TỔNG HỢP THÔNG TIN CHẤM CÔNG ${deptTitle}`;
    sheet.getCell(2, 1).font = { bold: true, size: 14 };
    sheet.getCell(2, 1).alignment = { horizontal: "center" };

    sheet.mergeCells(3, 1, 3, totalCols);
    sheet.getCell(3, 1).value = `THÁNG ${month}/${year}`;
    sheet.getCell(3, 1).font = { bold: true, size: 11, color: { argb: "FFCC0000" } };
    sheet.getCell(3, 1).alignment = { horizontal: "center" };

    sheet.mergeCells(4, 1, 4, totalCols);
    const lastDay = new Date(year, month - 1, daysInMonth);
    sheet.getCell(4, 1).value = `Từ ngày 01/${String(month).padStart(2, "0")}/${year} đến ${String(daysInMonth).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
    sheet.getCell(4, 1).font = { italic: true, size: 9, color: { argb: "FFCC0000" } };
    sheet.getCell(4, 1).alignment = { horizontal: "center" };
    void lastDay;

    const headerRow = 6;
    const subHeaderRow = 7;
    sheet.mergeCells(headerRow, 1, subHeaderRow, 1);
    sheet.getCell(headerRow, 1).value = "STT";
    sheet.mergeCells(headerRow, 2, subHeaderRow, 2);
    sheet.getCell(headerRow, 2).value = "Họ & Tên";
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, month - 1, d).getDay();
      const dCell = sheet.getCell(headerRow, fixedCols + d);
      dCell.value = String(d).padStart(2, "0");
      const wCell = sheet.getCell(subHeaderRow, fixedCols + d);
      wCell.value = weekdayLabels[dow];
      if (dow === 0) {
        dCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9CA3AF" } };
        wCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF9CA3AF" } };
      }
    }
    summaryHeaders.forEach((h, i) => {
      sheet.mergeCells(headerRow, fixedCols + daysInMonth + i + 1, subHeaderRow, fixedCols + daysInMonth + i + 1);
      sheet.getCell(headerRow, fixedCols + daysInMonth + i + 1).value = h;
    });
    for (let c = 1; c <= totalCols; c++) {
      [headerRow, subHeaderRow].forEach(r => {
        const cell = sheet.getCell(r, c);
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = thinBorder;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      });
    }

    let r = subHeaderRow + 1;
    let sectionIndex = 0;
    let grandTotal = 0;
    groups.forEach(group => {
      sectionIndex += 1;
      const groupTotal = group.rows.reduce((sum, row) => sum + row.tongNgayCong, 0);
      grandTotal += groupTotal;

      sheet.mergeCells(r, 1, r, fixedCols + daysInMonth);
      const romanNumeral = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][sectionIndex - 1] || String(sectionIndex);
      sheet.getCell(r, 1).value = `${romanNumeral}. ${group.name.toUpperCase()}`;
      sheet.getCell(r, 1).font = { bold: true, size: 10 };
      sheet.getCell(r, fixedCols + daysInMonth + summaryHeaders.length).value = groupTotal;
      sheet.getCell(r, fixedCols + daysInMonth + summaryHeaders.length).font = { bold: true };
      for (let c = 1; c <= totalCols; c++) {
        sheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF08A" } };
        sheet.getCell(r, c).border = thinBorder;
      }
      r += 1;

      group.rows.forEach((row, idx) => {
        sheet.getCell(r, 1).value = idx + 1;
        sheet.getCell(r, 2).value = row.name;
        row.days.forEach((tag, dIdx) => {
          const cell = sheet.getCell(r, fixedCols + dIdx + 1);
          cell.value = tag;
          cell.alignment = { horizontal: "center" };
          const dow = new Date(year, month - 1, dIdx + 1).getDay();
          if (dow === 0) {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1D5DB" } };
          } else if (tag === "CT") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBFDBFE" } };
          } else if (tag === "GT") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDBA74" } };
          } else if (tag === "P" || tag === "P/2") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBBF7D0" } };
          } else if (tag === "Ro") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF08A" } };
          }
        });
        sheet.getCell(r, fixedCols + daysInMonth + 1).value = row.vanPhong;
        sheet.getCell(r, fixedCols + daysInMonth + 2).value = row.phepCoLuong;
        sheet.getCell(r, fixedCols + daysInMonth + 3).value = row.congTac;
        sheet.getCell(r, fixedCols + daysInMonth + 4).value = row.nghiKhongLuong;
        sheet.getCell(r, fixedCols + daysInMonth + 5).value = row.tongNgayCong;
        for (let c = 1; c <= totalCols; c++) {
          sheet.getCell(r, c).border = thinBorder;
          if (c > fixedCols) sheet.getCell(r, c).alignment = { horizontal: "center" };
        }
        r += 1;
      });
    });

    sheet.mergeCells(r, 1, r, fixedCols + daysInMonth + summaryHeaders.length - 1);
    sheet.getCell(r, 1).value = "Tổng cộng";
    sheet.getCell(r, 1).font = { bold: true };
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    sheet.getCell(r, fixedCols + daysInMonth + summaryHeaders.length).value = grandTotal;
    sheet.getCell(r, fixedCols + daysInMonth + summaryHeaders.length).font = { bold: true };
    for (let c = 1; c <= totalCols; c++) {
      sheet.getCell(r, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE68A" } };
      sheet.getCell(r, c).border = thinBorder;
    }
    r += 2;

    sheet.getCell(r, 1).value = "Chú thích:";
    sheet.getCell(r, 1).font = { bold: true, italic: true };
    r += 1;
    const legendItems: [string, string, string?][] = [
      ["x, x/2", "Đi làm", undefined],
      ["CT", "Công tác (đã duyệt)", "FFBFDBFE"],
      ["GT", "Giải trình chấm công (đã duyệt)", "FFFDBA74"],
      ["P", "Nghỉ phép hưởng lương", "FFBBF7D0"],
      ["P/2", "Phép nửa ngày", "FFBBF7D0"],
      ["Ro", "Nghỉ không lương", "FFFEF08A"],
      ["(ô xám)", "Chủ nhật / không có dữ liệu chấm công", "FFD1D5DB"]
    ];
    legendItems.forEach(([code, label, color], i) => {
      sheet.getCell(r + i, 1).value = code;
      sheet.getCell(r + i, 1).font = { bold: true };
      sheet.getCell(r + i, 2).value = label;
      if (color) {
        sheet.getCell(r + i, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
      }
    });
    r += legendItems.length + 2;

    sheet.getCell(r, 1).value = `, ngày ..... tháng ..... năm ${year}`;
    sheet.getCell(r, 1).font = { italic: true };
    sheet.mergeCells(r, fixedCols + daysInMonth - 6, r, fixedCols + daysInMonth + summaryHeaders.length);
    sheet.getCell(r, fixedCols + daysInMonth - 6).value = `, ngày ..... tháng ..... năm ${year}`;
    sheet.getCell(r, fixedCols + daysInMonth - 6).font = { italic: true };
    sheet.getCell(r, fixedCols + daysInMonth - 6).alignment = { horizontal: "center" };
    r += 1;
    const sigCols = [1, Math.round(totalCols / 2) - 3, totalCols - 6];
    const sigLabels = ["GIÁM ĐỐC", "PHỤ TRÁCH", "NGƯỜI LẬP BIỂU"];
    sigLabels.forEach((label, i) => {
      const c = sigCols[i];
      sheet.getCell(r, c).value = label;
      sheet.getCell(r, c).font = { bold: true };
      sheet.getCell(r, c).alignment = { horizontal: "center" };
    });

    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 24;
    for (let d = 1; d <= daysInMonth; d++) sheet.getColumn(fixedCols + d).width = 4;
    for (let i = 0; i < summaryHeaders.length; i++) sheet.getColumn(fixedCols + daysInMonth + i + 1).width = 12;

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const deptSlug = timesheetDeptFilter
      ? "_" + normalizeText(timesheetDeptFilter).replace(/\s+/g, "_")
      : "";
    a.download = `Bang_tong_hop_cham_cong${deptSlug}_${month}_${year}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendEmail = async (emp: ParsedEmployeeAttendance) => {
    if (!smtpConfig.user || !smtpConfig.pass) {
      setShowEmailConfigModal(true);
      return;
    }
    if (!emp.emailFound || !emp.email) {
      alert(`Nhân viên ${emp.name} không có địa chỉ email trong danh bạ! Vui lòng cập nhật email trước.`);
      return;
    }

    setParsedEmployees(prev => prev.map(e => 
      e.employeeCode === emp.employeeCode ? { ...e, emailStatus: "sending" } : e
    ));

    try {
      const response = await apiFetch("/api/send-attendance-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          smtpConfig,
          recipient: {
            email: emp.email,
            name: emp.name,
            employeeCode: emp.employeeCode
          },
          summary: {
            totalDays: getOfficialWorkdays(emp),
            totalLate: emp.totalLate,
            totalEarly: emp.totalEarly,
            totalOvertime: emp.totalOvertime
          },
          details: emp.details,
          month: timesheetMonth
        })
      });

      const resData = await response.json();
      if (!response.ok) throw new Error(resData.error || "Gửi email thất bại!");

      setParsedEmployees(prev => prev.map(e => 
        e.employeeCode === emp.employeeCode ? { ...e, emailStatus: "success", emailMessage: "Đã gửi thành công!" } : e
      ));
    } catch (err: any) {
      console.error("Error sending email:", err);
      setParsedEmployees(prev => prev.map(e => 
        e.employeeCode === emp.employeeCode ? { ...e, emailStatus: "error", emailMessage: err.message || "Lỗi gửi!" } : e
      ));
    }
  };

  const handleSendAllEmails = async () => {
    if (!smtpConfig.user || !smtpConfig.pass) {
      setShowEmailConfigModal(true);
      return;
    }

    const readyEmps = parsedEmployees.filter(e => e.emailFound && e.email && e.emailStatus !== "success");
    if (readyEmps.length === 0) {
      alert("Không có nhân viên nào đủ điều kiện gửi email (hoặc tất cả đã gửi thành công)!");
      return;
    }

    if (!confirm(`Bạn có chắc chắn muốn gửi email chấm công cho ${readyEmps.length} nhân viên không?`)) return;

    setIsSendingAllEmails(true);

    for (const emp of readyEmps) {
      await handleSendEmail(emp);
    }

    setIsSendingAllEmails(false);
    alert("Đã hoàn thành tiến trình gửi email chấm công hàng loạt!");
  };

  const handleCreateClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimForm.employeeId) {
      alert("Vui lòng chọn nhân viên!");
      return;
    }
    const emp = employees.find(e => e.id === claimForm.employeeId);
    if (!emp) return;

    const level = getEmployeeLevel(emp.role);
    const policy = benefitPolicies.find(p => p.name === claimForm.category);
    let amount: number | string = benefitClaimAmount(policy, level);
    if (claimForm.customAmount) {
      amount = isNaN(Number(claimForm.customAmount)) ? claimForm.customAmount : Number(claimForm.customAmount);
    }

    const insertRow = {
      employee_id: emp.id,
      name: emp.name,
      role: emp.role,
      department: emp.department,
      level,
      category: claimForm.category,
      amount: String(amount), // lưu text để giữ được "Theo phê duyệt"
      date: claimForm.date,
      // Phiếu mới LUÔN ở trạng thái chờ duyệt — người lập không tự duyệt phiếu
      // của mình được nữa (RLS benefit_claims cũng chặn ở tầng DB).
      status: "Chờ phê duyệt",
      notes: claimForm.notes,
      created_by: currentUser?.email || null
    };

    try {
      const { data, error } = await supabase
        .from("benefit_claims")
        .insert([insertRow])
        .select("*")
        .single();

      if (error) throw error;

      const newClaim = normalizeClaim(data);
      const updatedClaims = [newClaim, ...benefitClaims];
      setBenefitClaims(updatedClaims);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_cb_benefit_claims", JSON.stringify(updatedClaims));
      }

      setShowCreateClaimModal(false);
      setClaimForm({
        employeeId: "",
        category: "Sinh nhật" as any,
        date: new Date().toISOString().split("T")[0],
        status: "Chờ phê duyệt",
        notes: "",
        customAmount: ""
      });
      alert("Đã thêm yêu cầu trợ cấp mới thành công!");
    } catch (err: any) {
      console.error("Lỗi lưu trợ cấp vào Supabase:", err);
      alert("Không thể lưu yêu cầu trợ cấp lên hệ thống: " + (err.message || "Lỗi không xác định"));
    }
  };

  const handleDeleteClaim = async (claimId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa yêu cầu trợ cấp này không?")) return;
    const prev = benefitClaims;
    const target = benefitClaims.find(c => c.id === claimId);
    const updatedClaims = benefitClaims.filter(c => c.id !== claimId);
    setBenefitClaims(updatedClaims); // optimistic
    try {
      const { error } = await supabase.from("benefit_claims").delete().eq("id", claimId);
      if (error) throw error;

      // Dọn chứng từ trong bucket cho khỏi rác. Người thường không có quyền xoá
      // file (policy chỉ cho người duyệt) nên lỗi ở đây bỏ qua, không chặn luồng.
      if (target?.attachment_path) {
        const { error: rmError } = await supabase.storage
          .from("benefit-attachments")
          .remove([target.attachment_path]);
        if (rmError) console.warn("Không xoá được chứng từ kèm theo:", rmError.message);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_cb_benefit_claims", JSON.stringify(updatedClaims));
      }
    } catch (err: any) {
      console.error("Lỗi xóa trợ cấp trên Supabase:", err);
      alert("Không thể xóa yêu cầu trợ cấp: " + (err.message || "Lỗi không xác định"));
      setBenefitClaims(prev); // rollback
    }
  };

  // Duyệt / từ chối / đánh dấu đã chi một phiếu hiếu hỷ. Chỉ người có cờ
  // can_approve_benefit (hoặc Admin) gọi được — RLS cũng chặn lại ở tầng DB
  // nên kể cả gọi thẳng API cũng không qua được.
  const handleDecideClaim = async (claimId: string, decision: "Đã duyệt" | "Từ chối" | "Đã chi") => {
    let reason = "";
    if (decision === "Từ chối") {
      reason = (prompt("Nhập lý do từ chối (bắt buộc):") || "").trim();
      if (!reason) return;
    } else if (!confirm(`Xác nhận chuyển phiếu sang trạng thái "${decision}"?`)) {
      return;
    }

    const patch: any = {
      status: decision,
      approved_by: currentUser?.name || currentUser?.email || null,
      approved_at: new Date().toISOString(),
      rejection_reason: decision === "Từ chối" ? reason : null,
    };

    const prev = benefitClaims;
    const optimistic = benefitClaims.map(c => (c.id === claimId ? { ...c, ...patch } : c));
    setBenefitClaims(optimistic);

    try {
      const { data, error } = await supabase
        .from("benefit_claims")
        .update(patch)
        .eq("id", claimId)
        .select("*")
        .single();
      if (error) throw error;

      const synced = benefitClaims.map(c => (c.id === claimId ? normalizeClaim(data) : c));
      setBenefitClaims(synced);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_cb_benefit_claims", JSON.stringify(synced));
      }
    } catch (err: any) {
      console.error("Lỗi cập nhật trạng thái trợ cấp:", err);
      alert("Không thể cập nhật phiếu: " + (err.message || "Lỗi không xác định"));
      setBenefitClaims(prev); // rollback
    }
  };

  // ─── CHỨNG TỪ ĐÍNH KÈM PHIẾU HIẾU HỶ ───
  // File nằm ở bucket private 'benefit-attachments'; bảng chỉ lưu đường dẫn,
  // link xem được ký hạn giờ mỗi lần mở (migration 015).
  const ALLOWED_CLAIM_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
  const MAX_CLAIM_FILE_MB = 5;

  const handleUploadClaimAttachment = async (claimId: string, file: File) => {
    if (!ALLOWED_CLAIM_FILE_TYPES.includes(file.type)) {
      alert("Chỉ nhận ảnh (JPG, PNG, WEBP, HEIC) hoặc file PDF.");
      return;
    }
    if (file.size > MAX_CLAIM_FILE_MB * 1024 * 1024) {
      alert(`File quá lớn (tối đa ${MAX_CLAIM_FILE_MB}MB). Dung lượng file của bạn: ${(file.size / 1024 / 1024).toFixed(1)}MB.`);
      return;
    }

    setUploadingClaimId(claimId);
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${claimId}/${Date.now()}_${cleanName}`;

      const { error: uploadError } = await supabase.storage
        .from("benefit-attachments")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });
      if (uploadError) throw uploadError;

      const patch = {
        attachment_path: filePath,
        attachment_name: file.name,
        attachment_type: file.type,
      };
      const { data, error } = await supabase
        .from("benefit_claims")
        .update(patch)
        .eq("id", claimId)
        .select("*")
        .single();
      if (error) throw error;

      const synced = benefitClaims.map(c => (c.id === claimId ? normalizeClaim(data) : c));
      setBenefitClaims(synced);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_cb_benefit_claims", JSON.stringify(synced));
      }
    } catch (err: any) {
      console.error("Lỗi tải chứng từ lên:", err);
      alert("Không tải được chứng từ lên hệ thống: " + (err.message || "Lỗi không xác định"));
    } finally {
      setUploadingClaimId(null);
    }
  };

  const handleViewClaimAttachment = async (claim: any) => {
    if (!claim.attachment_path) return;
    try {
      // Link ký hạn 5 phút — bucket private nên không dùng public URL được
      const { data, error } = await supabase.storage
        .from("benefit-attachments")
        .createSignedUrl(claim.attachment_path, 300);
      if (error) throw error;
      setAttachmentViewer({
        url: data.signedUrl,
        name: claim.attachment_name || "Chứng từ",
        type: claim.attachment_type || "",
      });
    } catch (err: any) {
      console.error("Lỗi mở chứng từ:", err);
      alert("Không mở được chứng từ: " + (err.message || "Lỗi không xác định"));
    }
  };

  const handleCreateLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingLeave) return;
    if (!leaveForm.employeeId) {
      alert("Vui lòng chọn nhân viên!");
      return;
    }
    const emp = employees.find(e => e.id === leaveForm.employeeId);
    if (!emp) return;

    const dFrom = new Date(leaveForm.from);
    const dTo = new Date(leaveForm.to);
    const diffTime = dTo.getTime() - dFrom.getTime();
    if (diffTime < 0) {
      alert("Từ ngày không thể lớn hơn Đến ngày!");
      return;
    }
    const days = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // ─── Chặn đăng ký phép năm vượt hạn mức ───
    // Một luật duy nhất cho mọi đường vào (đây và trang Lịch). Cần vượt hạn mức
    // thì Admin sửa tay cột "Tổng phép" trước — có dấu vết, không đi cửa sau.
    if (leaveForm.type === "Phép năm") {
      const empLeave = annualLeaveData.find(d => d.id === leaveForm.employeeId);
      if (empLeave && days > empLeave.remainingLeave) {
        alert(
          `Không đủ phép năm!\n\n` +
          `Còn lại: ${empLeave.remainingLeave} ngày — đăng ký: ${days} ngày.\n` +
          (empLeave.pendingLeave > 0
            ? `(Đã trừ ${empLeave.pendingLeave} ngày của đơn đang chờ duyệt.)\n`
            : "") +
          `\nVui lòng chuyển sang "Nghỉ không hưởng lương" rồi đăng ký lại.`
        );
        return;
      }
    }

    // Đơn nghỉ phép được lưu thành MỘT DÒNG trong bảng `tasks`. Tiêu đề phải đúng
    // khuôn "Nghỉ phép (loại): Tên (N ngày)" vì parseLeaveTask đọc ngược lại từ
    // chuỗi này ra loại nghỉ và số ngày.
    const typeLabel =
      leaveForm.type === "Phép năm"
        ? "Nghỉ phép năm hưởng lương"
        : leaveForm.type === "Nghỉ không lương"
        ? "Nghỉ việc riêng không hưởng lương"
        : "Nghỉ việc riêng hưởng nguyên lương";

    setCreatingLeave(true);
    try {
      // HCNS đăng ký hộ nên đơn vào thẳng trạng thái đã duyệt (status completed).
      const { error } = await supabase.from("tasks").insert([{
        title: `Nghỉ phép (${typeLabel}): ${emp.name} (${days} ngày)`,
        assignee: emp.name,
        start_date: leaveForm.from,
        due_date: leaveForm.to,
        priority: "Thấp",
        progress: 100,
        status: "completed",
        notes: `Loại nghỉ phép: ${typeLabel}.${leaveForm.reason ? ` Lý do: ${leaveForm.reason}` : ""} (HCNS đăng ký hộ: ${currentUser?.name || "—"})`,
        approval_stage: "approved",
      }]);
      if (error) throw error;

      // Nạp lại từ CSDL thay vì tự thêm vào state: số ngày, loại nghỉ và trạng
      // thái đều do parseLeaveTask suy ra từ dòng vừa ghi, tự dựng tay là lệch.
      await fetchLeavesFromSupabase();

      setShowCreateLeaveModal(false);
      setLeaveForm({
        employeeId: "",
        type: "Phép năm",
        from: new Date().toISOString().split("T")[0],
        to: new Date().toISOString().split("T")[0],
        reason: ""
      });
      alert("Đăng ký nghỉ phép thành công!");
    } catch (err: any) {
      console.error("Error creating leave:", err);
      alert("Không đăng ký được nghỉ phép: " + (err.message || "Lỗi không xác định"));
    } finally {
      setCreatingLeave(false);
    }
  };

  // Đơn nghỉ phép là MỘT DÒNG trong bảng `tasks` (title chứa "Nghỉ phép"), xem
  // fetchLeavesFromSupabase. Trước đây hàm này chỉ lọc dòng ra khỏi state rồi ghi
  // localStorage — mà localStorage đó KHÔNG có chỗ nào đọc lại. Nên F5 là
  // fetchLeavesFromSupabase nạp lại từ CSDL và đơn "đã xoá" hiện nguyên.
  // Giờ xoá thật dưới CSDL rồi mới bỏ khỏi state.
  //
  // AI ĐƯỢC XOÁ: Admin / C&B (hasFullAccess) xoá được mọi đơn. Nhân viên thường
  // chỉ xoá được đơn CHƯA DUYỆT của chính mình — đơn đã duyệt mà tự xoá được thì
  // số ngày "Đã nghỉ" tụt xuống và quota phép năm tự phình ra.
  const canDeleteLeave = (leave: any) => hasFullAccess || leave?.status !== "Đã duyệt";

  const handleDeleteLeave = async (leave: any) => {
    const leaveId = leave?.id;
    if (!leaveId) return;
    if (!canDeleteLeave(leave)) {
      alert("Đơn nghỉ phép đã được duyệt — bạn không thể tự xóa. Vui lòng liên hệ HCNS.");
      return;
    }
    if (!confirm("Bạn có chắc chắn muốn xóa yêu cầu nghỉ phép này không?")) return;
    try {
      // `.select()` là phần QUAN TRỌNG: RLS chặn thì Supabase trả về error = null
      // và 0 dòng, không báo lỗi gì. Không đếm lại số dòng đã xoá thì người không
      // đủ quyền vẫn thấy đơn biến mất rồi F5 lại hiện ra — đúng cái lỗi cũ.
      const { data, error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", leaveId)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        alert("Bạn không có quyền xóa yêu cầu nghỉ phép này!");
        return;
      }
      setLeaves(prev => prev.filter(l => l.id !== leaveId));
    } catch (err) {
      console.error("Error deleting leave:", err);
      alert("Không xóa được yêu cầu nghỉ phép. Kiểm tra lại quyền hoặc kết nối!");
    }
  };

  // Ghi mức duyệt thưởng lễ lên Supabase (bảng holiday_bonus_approvals) — trước
  // đây chỉ nằm trong localStorage nên mỗi máy thấy một kết quả duyệt khác nhau.
  // Khoá theo (holiday_id, employee_id) nên mỗi đợt lễ có mức duyệt riêng.
  const persistHolidayBonuses = async (rows: { employee_id: string; employee_name?: string; amount: number }[]) => {
    if (rows.length === 0) return;
    const { error } = await supabase
      .from("holiday_bonus_approvals")
      .upsert(
        rows.map(r => ({
          holiday_id: selectedHolidayId,
          employee_id: r.employee_id,
          employee_name: r.employee_name || null,
          amount: r.amount,
          approved_by: currentUser?.name || currentUser?.email || null,
          approved_at: new Date().toISOString(),
        })),
        { onConflict: "holiday_id,employee_id" }
      );
    if (error) throw error;
  };

  const handleUpdateHolidayAdjustment = async (empId: string, amount: number) => {
    const prev = holidayBonusAdjustments;
    const updatedAdjustments = { ...holidayBonusAdjustments, [empId]: amount };
    setHolidayBonusAdjustments(updatedAdjustments); // optimistic
    try {
      const emp = employees.find(e => e.id === empId);
      await persistHolidayBonuses([{ employee_id: empId, employee_name: emp?.name, amount }]);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_cb_holiday_bonus_adjustments", JSON.stringify(updatedAdjustments));
      }
    } catch (err: any) {
      console.error("Lỗi lưu mức duyệt thưởng lễ:", err);
      alert("Không lưu được mức duyệt lên hệ thống: " + (err.message || "Lỗi không xác định"));
      setHolidayBonusAdjustments(prev); // rollback
    }
  };

  const handleApproveAllHolidayBonuses = async () => {
    if (!confirm("Bạn có chắc chắn muốn phê duyệt mức đề xuất cho toàn bộ nhân sự chưa được duyệt trong danh sách đang hiển thị?")) return;

    const pending: { employee_id: string; employee_name?: string; amount: number }[] = [];
    const updatedAdjustments = { ...holidayBonusAdjustments };
    holidayFilteredEmployees.forEach(emp => {
      if (updatedAdjustments[emp.id] === undefined) {
        const amount = getProposedHolidayBonus(getEmployeeTenureYears(emp));
        updatedAdjustments[emp.id] = amount;
        pending.push({ employee_id: emp.id, employee_name: emp.name, amount });
      }
    });
    if (pending.length === 0) {
      alert("Toàn bộ nhân sự trong danh sách đã được duyệt mức thưởng.");
      return;
    }

    const prev = holidayBonusAdjustments;
    setHolidayBonusAdjustments(updatedAdjustments); // optimistic
    try {
      await persistHolidayBonuses(pending);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_cb_holiday_bonus_adjustments", JSON.stringify(updatedAdjustments));
      }
      alert(`Đã phê duyệt và lưu lên hệ thống cho ${pending.length} nhân sự.`);
    } catch (err: any) {
      console.error("Lỗi phê duyệt hàng loạt thưởng lễ:", err);
      alert("Không lưu được lên hệ thống: " + (err.message || "Lỗi không xác định"));
      setHolidayBonusAdjustments(prev); // rollback
    }
  };

  const handleExportBenefitClaims = async () => {
    try {
      const today = new Date();
      const dayStr = String(today.getDate()).padStart(2, "0");
      const monthStr = String(today.getMonth() + 1).padStart(2, "0");
      const yearStr = String(today.getFullYear());

      const items = filteredBenefitClaims.map((claim) => {
        const eventDate = claim.date ? new Date(claim.date).toLocaleDateString("vi-VN") : "";
        const noteParts = [claim.status, claim.notes].filter(Boolean).join(" · ");
        return {
          name: claim.name,
          role: claim.role || "",
          department: claim.department || "",
          benefit: claim.category || "",
          amount: typeof claim.amount === "number" ? claim.amount : Number(claim.amount) || 0,
          tenure: eventDate,
          notes: noteParts
        };
      });

      const totalAmount = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

      const payload = {
        monthYear: `${monthStr}/${yearStr}`,
        day: dayStr,
        month: monthStr,
        year: yearStr,
        totalAmount,
        items,
        template: "hieu_hy"
      };

      const response = await apiFetch("/api/export-benefits-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Không thể xuất file Word báo cáo trợ cấp hiếu hỷ");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao_cao_tro_cap_hieu_hy_${monthStr}_${yearStr}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Lỗi xuất báo cáo trợ cấp hiếu hỷ:", error);
      alert("Đã xảy ra lỗi khi tải file Word: " + error.message);
    }
  };

  const handleExportHolidayBonus = async (holidayName: string) => {
    try {
      const today = new Date();
      const dayStr = String(today.getDate()).padStart(2, "0");
      const monthStr = String(today.getMonth() + 1).padStart(2, "0");
      const yearStr = String(today.getFullYear());

      const items = holidayFilteredEmployees.map((emp) => {
        const tenureYears = getEmployeeTenureYears(emp);
        const tenureStr = getEmployeeTenureStr(emp);
        const proposed = getProposedHolidayBonus(tenureYears);
        const approved = holidayBonusAdjustments[emp.id] ?? proposed;
        return {
          name: emp.name,
          role: emp.role || "",
          department: emp.department || "",
          benefit: holidayName,
          amount: approved,
          tenure: tenureStr,
          notes: "Đã duyệt"
        };
      });

      const totalAmount = items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0);

      const payload = {
        monthYear: `${holidayName} - ${yearStr}`,
        day: dayStr,
        month: monthStr,
        year: yearStr,
        totalAmount,
        items,
        template: "che_do"
      };

      const response = await apiFetch("/api/export-benefits-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Không thể xuất file Word bảng thưởng lễ");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bang_thuong_le_${holidayName.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Lỗi xuất bảng thưởng lễ:", error);
      alert("Đã xảy ra lỗi khi tải file Word: " + error.message);
    }
  };

  const handleExportBirthdayReport = async () => {
    try {
      setIsExportingBirthday(true);
      const totalAmount = filteredBirthdays.reduce((sum, b) => sum + (b.giftAmount || 0), 0);
      const today = new Date();
      const currentYear = today.getFullYear();
      
      const dayStr = String(today.getDate()).padStart(2, '0');
      const monthStr = String(today.getMonth() + 1).padStart(2, '0');
      const yearStr = String(currentYear);

      const items = filteredBirthdays.map(b => ({
        name: b.name,
        role: b.role,
        department: b.dept,
        benefit: "Sinh nhật",
        amount: b.giftAmount || 0,
        tenure: b.tenure || "",
        notes: ""
      }));

      const payload = {
        monthYear: `${selectedBirthdayMonth}/${currentYear}`,
        day: dayStr,
        month: monthStr,
        year: yearStr,
        totalAmount: totalAmount,
        items: items
      };

      const response = await apiFetch("/api/export-benefits-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error("Không thể xuất file word báo cáo phúc lợi");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bang_theo_doi_phuc_loi_thang_${selectedBirthdayMonth}_${currentYear}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error("Lỗi xuất báo cáo sinh nhật:", error);
      alert("Đã xảy ra lỗi khi tải file word: " + error.message);
    } finally {
      setIsExportingBirthday(false);
    }
  };

  // --- HELPERS FOR EMPLOYEE CONTRACTS (AI PARSING & EDITING) ---

  const handleExcelContractUpload = async (file: File) => {
    try {
      setIsExcelImporting(true);
      setExcelImportStage("reading");
      const customKey = localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key") || "";
      const customModel = localStorage.getItem("openai_model_hanh_chinh") || localStorage.getItem("openai_model_nhan_su") || "gpt-4o";

      const formData = new FormData();
      formData.append("excel_file", file);
      formData.append("original_filename", file.name);

      const headers: Record<string, string> = {};
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }
      headers["x-openai-model"] = customModel;

      // Slight delay to show "reading" stage visually before network call
      await new Promise(r => setTimeout(r, 400));
      setExcelImportStage("sending");

      const fetchPromise = apiFetch("/api/analyze-contract-excel", {
        method: "POST",
        headers,
        body: formData,
      });

      // Switch to "receiving" stage shortly after the request is sent
      setTimeout(() => setExcelImportStage("receiving"), 1200);

      const res = await fetchPromise;

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Không thể phân tích file Excel hợp đồng.");
      }

      const result = await res.json();
      if (result.contracts && Array.isArray(result.contracts)) {
        // Hydrate imported contracts with matched employees where possible
        const hydrated = result.contracts.map((c: any) => {
          let empId = "";
          let matched = matchEmployee(c.employee_name, c.employee_code, employees);
          
          // Try to extract employee code from name if missing (e.g. "Nguyễn Thanh Tấn (5957)")
          let codeVal = c.employee_code || "";
          if (!codeVal && c.employee_name) {
            const extracted = c.employee_name.match(/\((\d+)\)/);
            if (extracted) {
              codeVal = extracted[1];
              // Try matching again if code was just extracted
              if (!matched) {
                matched = matchEmployee(c.employee_name, codeVal, employees);
              }
            }
          }

          const rawDept = c.department || "";
          const resolvedDept = rawDept && rawDept !== "Chưa phân loại" 
            ? normalizeDeptClient(rawDept) 
            : (matched ? normalizeDeptClient(matched.department) : "");

          if (matched) {
            empId = matched.id;
            return {
              ...c,
              id: "new-" + Math.random().toString(36).substr(2, 9),
              employee_id: empId,
              employee_name: matched.name,
              employee_code: matched.employee_code || codeVal || "",
              department: resolvedDept,
              employees: {
                name: matched.name,
                department: normalizeDeptClient(matched.department),
                role: matched.role,
                employee_code: matched.employee_code
              }
            };
          }
          const cleanEmpName = c.employee_name ? c.employee_name.replace(/\([^)]*\)/g, "").trim() : "";
          return {
            ...c,
            id: "new-" + Math.random().toString(36).substr(2, 9),
            employee_id: "",
            employee_name: cleanEmpName,
            employee_code: codeVal,
            department: resolvedDept
          };
        });

        // ── AUTO-SAVE to Supabase immediately, no preview modal required ──
        setExcelImportStage("saving" as any);
        let savedCount = 0;
        let failCount = 0;
        let firstError = "";

        // Faithful 1:1 import: every employee row extracted from the file becomes
        // exactly one record. We deliberately do NOT merge by employee code, name,
        // or contract number — the tracking sheet may legitimately list the same
        // person more than once, and two different people sometimes share a
        // mistakenly-duplicated code. The only thing we must guard is the unique
        // contract_number column in the DB: when a real number is empty or already
        // used, we assign an internal unique id so the row still inserts as its own
        // record instead of overwriting another one.
        const usedNumbers = new Set<string>(
          contracts.map(c => (c.contract_number || "").trim()).filter(Boolean)
        );
        const generateUniqueId = generateInternalContractNumber;

        for (const item of hydrated) {
          // Skip completely empty rows (no name and no contract number)
          if (!item.employee_name && !item.contract_number && !item.employee_code) continue;

          try {
            let empId = item.employee_id;
            if (!empId && item.employee_name) {
              const emp = matchEmployee(item.employee_name, item.employee_code, employees);
              if (emp) empId = emp.id;
            }

            const dbData: any = {
              type: item.type || "Thử việc",
              sign_date: item.sign_date || null,
              expiration_date: item.expiration_date || null,
              status: item.status || "Hiệu lực",
              salary: item.total_income || null,
              stt_ton: item.stt_ton || null,
              stt: item.stt || null,
              employee_code: item.employee_code || null,
              employee_name: item.employee_name || null,
              onboard_date: item.onboard_date || null,
              probation_contract_number: item.probation_contract_number || null,
              probation_start_date: item.probation_start_date || null,
              probation_end_date: item.probation_end_date || null,
              base_salary_insurance: item.base_salary_insurance || null,
              performance_bonus: item.performance_bonus || null,
              allowances: item.allowances || null,
              total_income: item.total_income || null,
              last_salary_adj_date: item.last_salary_adj_date || null,
              department: item.department || null,
            };
            if (empId) dbData.employee_id = empId;

            // Decide the contract_number to store. Keep the real number only if it
            // is present and not already taken; otherwise fall back to a unique id
            // so this row inserts as a separate record.
            const contractNum = (item.contract_number || "").trim();
            dbData.contract_number = (contractNum && !usedNumbers.has(contractNum))
              ? contractNum
              : generateUniqueId();

            let dbError = null;
            {
              const { error } = await supabase.from("contracts").insert([dbData]);
              dbError = error;
              // On any unique-key collision, retry once with a fresh internal id.
              if (dbError && dbError.message?.includes("duplicate key")) {
                dbData.contract_number = generateUniqueId();
                const { error: retryError } = await supabase.from("contracts").insert([dbData]);
                dbError = retryError;
              }
            }

            if (dbError) {
              console.error("Lỗi lưu hợp đồng:", item.employee_name, dbError.message);
              if (!firstError) firstError = dbError.message;
              failCount++;
            } else {
              savedCount++;
              usedNumbers.add(dbData.contract_number);
            }
          } catch (e: any) {
            console.error("Lỗi không xác định:", e);
            failCount++;
          }
        }

        // Refresh the contract list from DB
        await fetchContracts();

        const skippedCount = hydrated.length - savedCount - failCount;
        let alertMsg = "";
        if (failCount === 0) {
          alertMsg = `✅ Đã lưu thành công ${savedCount} hợp đồng nhân sự vào hệ thống!\n`;
          if (skippedCount > 0) {
            alertMsg += `ℹ️ Đã bỏ qua ${skippedCount} dòng trống hoặc dòng tiêu đề phòng ban.\n\n`;
          }
          alertMsg += `Các ô trống do AI không đọc được, bạn có thể bấm vào bảng bên dưới để điền tay.`;
          alert(alertMsg);
        } else {
          alertMsg = `⚠️ Đã lưu ${savedCount} hợp đồng. ${failCount} dòng bị lỗi.\n`;
          if (skippedCount > 0) {
            alertMsg += `ℹ️ Đã bỏ qua ${skippedCount} dòng trống hoặc dòng tiêu đề phòng ban.\n`;
          }
          alertMsg += `\nNguyên nhân lỗi: ${firstError || "không xác định"}\n\nCác ô trống do AI không đọc được, bạn có thể bấm vào bảng bên dưới để điền tay.`;
          alert(alertMsg);
        }
      } else {
        alert("Không nhận diện được danh sách hợp đồng hợp lệ từ AI. Vui lòng thử lại!");
      }
    } catch (err: any) {
      console.error("Lỗi phân tích Excel:", err);
      alert("Lỗi: " + err.message);
    } finally {
      setIsExcelImporting(false);
    }
  };

  const handleIndividualContractReader = async (file: File) => {
    try {
      setIsContractReading(true);
      const customKey = localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key") || "";
      const customModel = localStorage.getItem("openai_model_hanh_chinh") || localStorage.getItem("openai_model_nhan_su") || "gpt-4o-mini";

      const formData = new FormData();
      formData.append("contract_file", file);
      formData.append("original_filename", file.name);

      const headers: Record<string, string> = {};
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }
      headers["x-openai-model"] = customModel;

      const res = await apiFetch("/api/analyze-employee-contract", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Lỗi đọc hợp đồng lao động.");
      }

      const result = await res.json();
      
      let matchedEmpId = "";
      if (result.employee_name) {
        const matched = employees.find(e => 
          e.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === 
          result.employee_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        );
        if (matched) {
          matchedEmpId = matched.id;
        }
      }

      setSingleContractForm({
        id: "new-" + Date.now(),
        employee_id: matchedEmpId,
        stt_ton: "",
        stt: tempContracts.length + 1,
        employee_code: result.employee_code || "",
        employee_name: result.employee_name || "",
        onboard_date: result.onboard_date || "",
        probation_contract_number: result.probation_contract_number || "",
        probation_start_date: result.probation_start_date || "",
        probation_end_date: result.probation_end_date || "",
        contract_number: result.contract_number || "",
        type: result.type || "Thử việc",
        sign_date: result.sign_date || new Date().toISOString().split("T")[0],
        expiration_date: result.expiration_date || "",
        base_salary_insurance: result.base_salary_insurance || null,
        performance_bonus: result.performance_bonus || null,
        allowances: result.allowances || null,
        total_income: result.total_income || null,
        last_salary_adj_date: result.last_salary_adj_date || "",
        status: "Hiệu lực",
      });
      setShowSingleContractModal(true);
    } catch (err: any) {
      console.error("Lỗi đọc hợp đồng:", err);
      alert("Lỗi: " + err.message);
    } finally {
      setIsContractReading(false);
    }
  };

  const handleContractCellChange = (index: number, field: keyof Contract, value: any) => {
    setTempContracts(prev => {
      const copy = [...prev];
      const updatedItem = { ...copy[index] };
      
      if (field === "employee_id") {
        const emp = employees.find(e => e.id === value);
        if (emp) {
          updatedItem.employee_id = value;
          updatedItem.employee_name = emp.name;
          updatedItem.employee_code = emp.employee_code || "";
          updatedItem.employees = {
            name: emp.name,
            department: emp.department,
            role: emp.role,
            employee_code: emp.employee_code
          };
        } else {
          updatedItem.employee_id = "";
        }
      } else {
        (updatedItem as any)[field] = value;
      }
      
      copy[index] = updatedItem;
      return copy;
    });
  };

  const handleSaveContractRow = async (index: number) => {
    try {
      const contract = tempContracts[index];
      
      let empId = contract.employee_id;
      if (!empId && contract.employee_name) {
        const emp = matchEmployee(contract.employee_name, contract.employee_code, employees);
        if (emp) empId = emp.id;
      }

      if (!contract.contract_number) {
        alert("Vui lòng nhập Số HĐLĐ!");
        return;
      }

      const dbData: any = {
        contract_number: contract.contract_number,
        type: contract.type,
        sign_date: contract.sign_date || null,
        expiration_date: contract.expiration_date || null,
        status: contract.status || "Hiệu lực",
        salary: contract.total_income || null,
        stt_ton: contract.stt_ton || null,
        stt: contract.stt || null,
        employee_code: contract.employee_code || null,
        employee_name: contract.employee_name || null,
        onboard_date: contract.onboard_date || null,
        probation_contract_number: contract.probation_contract_number || null,
        probation_start_date: contract.probation_start_date || null,
        probation_end_date: contract.probation_end_date || null,
        base_salary_insurance: contract.base_salary_insurance || null,
        performance_bonus: contract.performance_bonus || null,
        allowances: contract.allowances || null,
        total_income: contract.total_income || null,
        last_salary_adj_date: contract.last_salary_adj_date || null,
        department: contract.department || null,
        notes: contract.notes || null,
      };

      if (empId) {
        dbData.employee_id = empId;
      }

      if (contract.id.startsWith("new-")) {
        const { data, error } = await supabase
          .from("contracts")
          .insert([dbData])
          .select("*, employees(name, department, role, employee_code)");
          
        if (error) throw error;
        if (data && data[0]) {
          setTempContracts(prev => {
            const copy = [...prev];
            copy[index] = data[0] as Contract;
            return copy;
          });
          alert("Thêm hợp đồng lao động thành công!");
        }
      } else {
        const { error } = await supabase
          .from("contracts")
          .update(dbData)
          .eq("id", contract.id);
          
        if (error) throw error;
        alert("Cập nhật thông tin hợp đồng thành công!");
      }
      
      await fetchContracts();
    } catch (err: any) {
      console.error("Lỗi khi lưu dòng hợp đồng:", err);
      alert("Lỗi lưu hợp đồng: " + err.message);
    }
  };

  // Đồng bộ 1 lần "Ngày ký HĐ thử việc" (Từ/Đến) từ file DANH_SACH_01/02.xlsx
  // (đã trích sẵn ra public/sync/probation-dates.json), khớp theo Mã NV.
  // Chạy bằng session của người đang đăng nhập nên RLS áp dụng như thao tác tay.
  const handleSyncProbationDates = async () => {
    try {
      setSyncingProbation(true);
      const res = await fetch("/sync/probation-dates.json");
      if (!res.ok) throw new Error("Không tải được dữ liệu đồng bộ (public/sync/probation-dates.json)");
      const rows: { code: string; name: string; from: string | null; to: string | null }[] = await res.json();
      const byCode = new Map(rows.map(r => [r.code, r]));

      // Gom danh sách cần cập nhật trước, hỏi xác nhận rồi mới ghi
      const pending: { id: string; code: string; name: string; patch: Record<string, string> }[] = [];
      const matchedCodes = new Set<string>();
      for (const c of tempContracts) {
        if (!c.id || c.id.startsWith("new-")) continue; // dòng chưa lưu DB thì bỏ qua
        const code = (c.employee_code || "").toString().trim();
        const ex = byCode.get(code);
        if (!ex) continue;
        matchedCodes.add(code);
        const patch: Record<string, string> = {};
        if (ex.from && ex.from !== c.probation_start_date) patch.probation_start_date = ex.from;
        if (ex.to && ex.to !== c.probation_end_date) patch.probation_end_date = ex.to;
        if (Object.keys(patch).length > 0) pending.push({ id: c.id, code, name: ex.name, patch });
      }

      const unmatched = rows.filter(r => !matchedCodes.has(r.code));
      if (pending.length === 0) {
        alert(`Không có dòng nào cần cập nhật — dữ liệu đã khớp với Excel.${unmatched.length ? `\n(${unmatched.length} mã NV trong Excel không có hợp đồng trong hệ thống)` : ""}`);
        return;
      }
      if (!confirm(`Sẽ điền Ngày ký HĐTV (Từ/Đến) từ Excel cho ${pending.length} hợp đồng khớp Mã NV. Tiếp tục?`)) return;

      let updated = 0;
      const failed: string[] = [];
      for (const p of pending) {
        const { error } = await supabase.from("contracts").update(p.patch).eq("id", p.id);
        if (error) failed.push(`${p.code} ${p.name}: ${error.message}`);
        else updated++;
      }
      await fetchContracts();
      alert(
        `Đồng bộ xong: cập nhật ${updated}/${pending.length} hợp đồng.` +
        (failed.length ? `\nLỗi ${failed.length} dòng:\n${failed.slice(0, 5).join("\n")}` : "") +
        (unmatched.length ? `\n${unmatched.length} mã NV trong Excel chưa có hợp đồng trong hệ thống: ${unmatched.slice(0, 10).map(r => r.code).join(", ")}${unmatched.length > 10 ? "..." : ""}` : "")
      );
    } catch (err: any) {
      console.error("Lỗi đồng bộ ngày HĐTV:", err);
      alert("Lỗi đồng bộ: " + err.message);
    } finally {
      setSyncingProbation(false);
    }
  };

  const handleBulkSaveContracts = async () => {
    try {
      setSavingContracts(true);
      
      const newItems = tempContracts.filter(c => c.id.startsWith("new-"));
      const existingItems = tempContracts.filter(c => !c.id.startsWith("new-"));

      // contracts.contract_number là UNIQUE -> dựng sẵn bản đồ "số đang dùng ->
      // id hợp đồng" để biết một số đã thuộc dòng khác hay chính dòng đang lưu.
      const ownerOfNumber = new Map<string, string>();
      for (const c of contracts) {
        const n = (c.contract_number || "").trim();
        if (n) ownerOfNumber.set(n, c.id);
      }

      // Lỗi của một dòng KHÔNG được làm hỏng cả lượt lưu: gom lại báo cuối cùng.
      const failures: string[] = [];
      let savedCount = 0;
      const rowLabel = (item: Contract) =>
        item.employee_name || item.employee_code || `dòng ${item.stt ?? "?"}`;

      for (const item of newItems) {
        let empId = item.employee_id;
        if (!empId && item.employee_name) {
          const emp = matchEmployee(item.employee_name, item.employee_code, employees);
          if (emp) empId = emp.id;
        }

        const dbData: any = {
          type: item.type || "Thử việc",
          sign_date: item.sign_date || null,
          expiration_date: item.expiration_date || null,
          status: item.status || "Hiệu lực",
          salary: item.total_income || null,
          stt_ton: item.stt_ton || null,
          stt: item.stt || null,
          employee_code: item.employee_code || null,
          employee_name: item.employee_name || null,
          onboard_date: item.onboard_date || null,
          probation_contract_number: item.probation_contract_number || null,
          probation_start_date: item.probation_start_date || null,
          probation_end_date: item.probation_end_date || null,
          base_salary_insurance: item.base_salary_insurance || null,
          performance_bonus: item.performance_bonus || null,
          allowances: item.allowances || null,
          total_income: item.total_income || null,
          last_salary_adj_date: item.last_salary_adj_date || null,
          department: item.department || null,
          notes: item.notes || null,
        };
        if (empId) dbData.employee_id = empId;

        // Số HĐLĐ: chỉ giữ số thật khi có nhập và chưa ai dùng. Bỏ trống (dòng
        // thử việc chưa ký chính thức) -> sinh số nội bộ, KHÔNG dùng chung một
        // chuỗi cố định, vì dòng thứ hai sẽ đụng ràng buộc UNIQUE.
        const typedNumber = (item.contract_number || "").trim();
        dbData.contract_number =
          typedNumber && !ownerOfNumber.has(typedNumber)
            ? typedNumber
            : generateInternalContractNumber();

        let insertError = (await supabase.from("contracts").insert([dbData])).error;
        // Vẫn đụng số (có người vừa thêm ở máy khác) -> thử lại 1 lần bằng số nội bộ.
        if (insertError && insertError.message?.includes("duplicate key")) {
          dbData.contract_number = generateInternalContractNumber();
          insertError = (await supabase.from("contracts").insert([dbData])).error;
        }

        if (insertError) {
          failures.push(`${rowLabel(item)}: ${insertError.message}`);
        } else {
          savedCount++;
          ownerOfNumber.set(dbData.contract_number, item.id);
        }
      }

      for (const item of existingItems) {
        const original = contracts.find(c => c.id === item.id);
        if (!original) continue;

        const hasChanged = 
          item.stt_ton !== original.stt_ton ||
          item.stt !== original.stt ||
          item.employee_code !== original.employee_code ||
          item.employee_name !== original.employee_name ||
          item.onboard_date !== original.onboard_date ||
          item.probation_contract_number !== original.probation_contract_number ||
          item.probation_start_date !== original.probation_start_date ||
          item.probation_end_date !== original.probation_end_date ||
          item.contract_number !== original.contract_number ||
          item.type !== original.type ||
          item.sign_date !== original.sign_date ||
          item.expiration_date !== original.expiration_date ||
          item.base_salary_insurance !== original.base_salary_insurance ||
          item.performance_bonus !== original.performance_bonus ||
          item.allowances !== original.allowances ||
          item.total_income !== original.total_income ||
          item.last_salary_adj_date !== original.last_salary_adj_date ||
          item.status !== original.status ||
          item.employee_id !== original.employee_id ||
          item.department !== original.department ||
          item.notes !== original.notes;

        if (!hasChanged) continue;

        let empId = item.employee_id;
        if (!empId && item.employee_name) {
          const emp = matchEmployee(item.employee_name, item.employee_code, employees);
          if (emp) empId = emp.id;
        }

        // Số HĐLĐ của dòng cũ: để trống thì giữ/sinh số nội bộ; nhập số đã
        // thuộc hợp đồng khác thì báo đúng dòng đó thay vì để DB chặn cả lượt.
        const typedNumber = (item.contract_number || "").trim();
        let numberToSave: string;
        if (!typedNumber) {
          numberToSave = isInternalContractNumber(original.contract_number)
            ? original.contract_number
            : generateInternalContractNumber();
        } else if (
          ownerOfNumber.has(typedNumber) &&
          ownerOfNumber.get(typedNumber) !== item.id
        ) {
          failures.push(`${rowLabel(item)}: số HĐLĐ "${typedNumber}" đã thuộc hợp đồng khác`);
          continue;
        } else {
          numberToSave = typedNumber;
        }

        const dbData: any = {
          contract_number: numberToSave,
          type: item.type,
          sign_date: item.sign_date || null,
          expiration_date: item.expiration_date || null,
          status: item.status || "Hiệu lực",
          salary: item.total_income || null,
          stt_ton: item.stt_ton || null,
          stt: item.stt || null,
          employee_code: item.employee_code || null,
          employee_name: item.employee_name || null,
          onboard_date: item.onboard_date || null,
          probation_contract_number: item.probation_contract_number || null,
          probation_start_date: item.probation_start_date || null,
          probation_end_date: item.probation_end_date || null,
          base_salary_insurance: item.base_salary_insurance || null,
          performance_bonus: item.performance_bonus || null,
          allowances: item.allowances || null,
          total_income: item.total_income || null,
          last_salary_adj_date: item.last_salary_adj_date || null,
          employee_id: empId || null,
          department: item.department || null,
          notes: item.notes || null,
        };

        const { error } = await supabase.from("contracts").update(dbData).eq("id", item.id);
        if (error) {
          failures.push(`${rowLabel(item)}: ${error.message}`);
        } else {
          savedCount++;
          ownerOfNumber.set(numberToSave, item.id);
        }
      }

      // Nạp lại TRƯỚC khi báo: dòng nào đã vào DB phải biến khỏi trạng thái
      // "new-", nếu không người dùng bấm Lưu lần nữa sẽ thêm trùng người.
      await fetchContracts();

      if (failures.length === 0) {
        alert("Lưu toàn bộ danh sách hợp đồng nhân sự thành công!");
      } else {
        alert(
          `Đã lưu ${savedCount} dòng, ${failures.length} dòng lỗi:\n` +
          failures.slice(0, 5).join("\n") +
          (failures.length > 5 ? `\n...và ${failures.length - 5} dòng khác` : "")
        );
      }
    } catch (err: any) {
      console.error("Lỗi khi lưu hàng loạt hợp đồng:", err);
      alert("Lỗi lưu hợp đồng: " + err.message);
    } finally {
      setSavingContracts(false);
    }
  };

  const handleDeleteContractRow = async (index: number) => {
    const contract = tempContracts[index];
    
    if (confirm(`Bạn có chắc chắn muốn xoá hợp đồng số "${contract.contract_number || 'chưa nhập'}" của ${contract.employee_name || 'chưa rõ tên'}?`)) {
      try {
        if (!contract.id.startsWith("new-")) {
          const { error } = await supabase.from("contracts").delete().eq("id", contract.id);
          if (error) throw error;
        }
        
        setTempContracts(prev => prev.filter((_, i) => i !== index));
        setContracts(prev => prev.filter(c => c.id !== contract.id));
        alert("Xoá hợp đồng thành công!");
      } catch (err: any) {
        console.error("Lỗi khi xoá hợp đồng:", err);
        alert("Lỗi xoá hợp đồng: " + err.message);
      }
    }
  };

  const handleAddBlankContractRow = () => {
    const newContract: Contract = {
      id: "new-" + Date.now(),
      stt_ton: "",
      stt: tempContracts.length + 1,
      employee_code: "",
      employee_name: "",
      onboard_date: "",
      probation_contract_number: "",
      probation_start_date: "",
      probation_end_date: "",
      contract_number: "",
      type: "Thử việc",
      sign_date: new Date().toISOString().split("T")[0],
      expiration_date: "",
      base_salary_insurance: null,
      performance_bonus: null,
      allowances: null,
      total_income: null,
      last_salary_adj_date: "",
      status: "Hiệu lực",
    };
    // Dòng mới còn trống nên không khớp bất kỳ bộ lọc/từ khoá nào đang bật —
    // xoá hết filter để người dùng thấy ngay dòng vừa chèn ở đầu bảng.
    setContractsSearchQuery("");
    setContractsDeptFilter("");
    setContractsProjectFilter("");
    setTempContracts(prev => [newContract, ...prev]);
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === "employee_profile") setActiveSubTab("personal");
    else if (tabId === "attendance") setActiveSubTab(canViewTimesheetSummary ? "machine" : "explanation");
    else if (tabId === "payroll_insurance") setActiveSubTab("calculation");
    else if (tabId === "benefits") setActiveSubTab("policy_rates");
    else if (tabId === "org_chart") setActiveSubTab("chart");
  };

  // Đọc dòng `tasks` thành đơn nghỉ phép — dùng chung với trang Lịch.
  const parseTaskToLeave = parseLeaveTask;

  const fetchLeavesFromSupabase = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .ilike("title", "%Nghỉ phép%")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) {
        setLeaves(data.map(parseTaskToLeave));
      }
    } catch (e) {
      console.error("Error fetching leaves from Supabase:", e);
    }
  };

  const fetchAllowancePolicies = async () => {
    try {
      const { data, error } = await supabase
        .from("allowance_policies")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) setAllowancePolicies(data as AllowancePolicy[]);
    } catch (e) {
      // Chưa chạy migration 041 -> giữ ALLOWANCE_FALLBACK, tab vẫn xem được
      console.error("Error fetching allowance policies:", e);
    }
  };

  const fetchBenefitPolicies = async () => {
    try {
      const { data, error } = await supabase
        .from("benefit_policies")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) setBenefitPolicies(data as BenefitPolicy[]);
    } catch (e) {
      // Chưa chạy migration 047 -> giữ BENEFIT_POLICY_FALLBACK, bảng vẫn xem được
      console.error("Error fetching benefit policies:", e);
    }
  };

  // Ô để trống = cấp đó không áp dụng -> lưu null (hiển thị "—"), không phải 0
  const updateBenefitDraft = (
    code: string,
    field: `${BenefitLevelKey}_amount` | `${BenefitLevelKey}_gift`,
    raw: string
  ) => {
    const value = raw.trim() === "" ? null : Number(raw);
    if (value !== null && isNaN(value)) return;
    setBenefitPolicyDraft(prev =>
      (prev || []).map(p => (p.code === code ? { ...p, [field]: value } : p))
    );
  };

  const handleSaveBenefitPolicy = async () => {
    if (!benefitPolicyDraft || !canEditBenefitPolicy) return;
    setSavingBenefitPolicy(true);
    try {
      const stamp = {
        updated_at: new Date().toISOString(),
        updated_by: currentUser?.name || currentUser?.email || null
      };
      for (const row of benefitPolicyDraft) {
        const { error } = await supabase
          .from("benefit_policies")
          .update({
            exec_amount: row.exec_amount, exec_gift: row.exec_gift,
            senior_amount: row.senior_amount, senior_gift: row.senior_gift,
            mid_amount: row.mid_amount, mid_gift: row.mid_gift,
            junior_amount: row.junior_amount, junior_gift: row.junior_gift,
            staff_amount: row.staff_amount, staff_gift: row.staff_gift,
            ...stamp
          })
          .eq("code", row.code);
        if (error) throw error;
      }
      setBenefitPolicies(benefitPolicyDraft);
      setEditingBenefitPolicy(false);
      setBenefitPolicyDraft(null);
    } catch (err: any) {
      console.error("Error saving benefit policies:", err);
      alert("Lỗi khi lưu định mức phúc lợi: " + (err.message || "Lỗi không xác định"));
    } finally {
      setSavingBenefitPolicy(false);
    }
  };

  const handleSaveAllowance = async () => {
    if (!allowanceDraft || !canEditAllowance) return;
    setSavingAllowance(true);
    try {
      const { error } = await supabase
        .from("allowance_policies")
        .update({
          target: allowanceDraft.target,
          per_day_amount: allowanceDraft.per_day_amount,
          days_per_month: allowanceDraft.days_per_month,
          threshold_days: allowanceDraft.threshold_days,
          full_amount: allowanceDraft.full_amount,
          reduced_amount: allowanceDraft.reduced_amount,
          updated_at: new Date().toISOString(),
          updated_by: currentUser?.name || currentUser?.email || null,
        })
        .eq("code", allowanceDraft.code);
      if (error) throw error;
      setAllowancePolicies(prev => prev.map(p => (p.code === allowanceDraft.code ? { ...allowanceDraft } : p)));
      setEditingAllowanceCode(null);
      setAllowanceDraft(null);
    } catch (err: any) {
      console.error("Error saving allowance policy:", err);
      alert("Lỗi khi lưu định mức phụ cấp: " + err.message);
    } finally {
      setSavingAllowance(false);
    }
  };

  const checkAccessAndLoad = async () => {
    try {
      setLoadingAuth(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) {
        setLoadingAuth(false);
        return;
      }
      
      const email = session.user.email || "";
      
      // 1. Query employees table for current employee info using ilike to support comma-separated emails
      const { data: empList } = await supabase
        .from("employees")
        .select("*")
        .ilike("email", `%${email}%`);
      const empData = empList && empList.length > 0 ? empList[0] : null;
        
      // 2. Query allowed_users for role info using ilike to support comma-separated emails
      const { data: allowedList } = await supabase
        .from("allowed_users")
        .select("role")
        .ilike("email", `%${email}%`);
      const allowedData = allowedList && allowedList.length > 0 ? allowedList[0] : null;

      // Cờ quyền theo dữ liệu (approval_permissions) — NGUỒN DUY NHẤT cấp full access
      // C&B. Các check tên/chức danh cứng (5 tên, "giám đốc", "nhân sự + HCNS"...)
      // đã bỏ hẳn: cấp/thu quyền chỉ cần bật/tắt cờ trong Cài đặt hệ thống >
      // User Permissions — tắt cờ là mất quyền thật, không còn đường vòng.
      const perms = await fetchApprovalPermissions(email);

      const isAdmin = allowedData?.role === "Admin" ||
                      empData?.role?.toLowerCase() === "admin" ||
                      email.toLowerCase().includes("admin") ||
                      (session.user.user_metadata?.full_name || "").toLowerCase().includes("admin") ||
                      (session.user.user_metadata?.name || "").toLowerCase().includes("admin");

      // Xem toàn bộ dữ liệu C&B (lương, phép, công, HĐ...): Admin hoặc cờ can_view_salary
      const fullAccess = !!(isAdmin || perms.canViewSalary);
      setHasFullAccess(fullAccess);

      // Xóa lịch trình công tác & xem bảng tổng hợp ngày công/thư mục lưu trữ chấm công:
      // Admin hoặc cờ can_view_attendance_imports
      const hrLeadAccess = !!(isAdmin || perms.canViewAttendanceImports);
      setCanDeleteTravel(hrLeadAccess);
      setCanDeleteRegime(hrLeadAccess);
      setCanEditAllowance(hrLeadAccess);
      setCanViewTimesheetSummary(hrLeadAccess);

      // Duyệt chi phúc lợi (hiếu hỷ + thưởng lễ): Admin hoặc cờ can_approve_benefit
      setCanApproveBenefit(!!(isAdmin || perms.canApproveBenefit));

      // Sửa tay bảng định mức phúc lợi: Admin hoặc cờ can_manage_employees
      // ("Quản lý hồ sơ nhân sự") — RLS benefit_policies chặn y hệt ở tầng DB.
      setCanEditBenefitPolicy(!!(isAdmin || perms.canManageEmployees));

      const userInfo = {
        email,
        name: empData?.name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || "Người dùng",
        role: empData?.role || (isAdmin ? "Admin" : "Nhân viên"),
        department: empData?.department || "Chưa xếp phòng",
        isAdmin,
        empId: empData?.id
      };
      setCurrentUser(userInfo);

      const loadedEmployees = await loadEmployeesData(email, fullAccess, userInfo.name, empData);
      await fetchContracts(loadedEmployees);
      // Chỉ hỏi khi người dùng KHÔNG đọc được bảng contracts; nhóm C&B đã có sẵn
      // dữ liệu đầy đủ nên gọi thêm là thừa.
      if (!fullAccess) await fetchOwnContractType();
      await fetchLeavesFromSupabase();
      await fetchExplanations();
      await fetchTravels();
      await fetchAllowancePolicies();
      await fetchBenefitPolicies();
    } catch (err) {
      console.error("Error checking user access:", err);
    } finally {
      setLoadingAuth(false);
    }
  };

  // Fetch employees from Supabase with access filters
  const loadEmployeesData = async (email: string, fullAccess: boolean, userName: string, empRecord: any): Promise<Employee[]> => {
    try {
      setLoadingEmployees(true);
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      if (data) {
        let finalEmployees = data as Employee[];
        if (!fullAccess) {
          finalEmployees = (data as Employee[]).filter(e => {
            if (!e.email) return e.name === userName;
            const employeeEmails = e.email.split(',').map(s => s.trim().toLowerCase());
            return employeeEmails.includes(email.toLowerCase()) || e.name === userName;
          });
          if (finalEmployees.length === 0) {
            const dummyEmp: Employee = {
              id: empRecord?.id || "dummy-id",
              name: userName,
              email: email,
              phone: empRecord?.phone || "",
              department: normalizeDeptClient(empRecord?.department) || "Chưa xếp phòng",
              role: empRecord?.role || "Nhân viên",
              status: "Chính thức",
              avatar: userName.slice(0, 2).toUpperCase(),
              kpi: 100,
              completed_tasks: 0,
              pending_tasks: 0,
              created_at: empRecord?.created_at || new Date().toISOString(),
              gender: empRecord?.gender || ""
            };
            finalEmployees = [dummyEmp];
          }
        }
        
        // Normalize employee departments client-side
        const normalizedEmployees = finalEmployees.map(e => ({
          ...e,
          department: normalizeDeptClient(e.department)
        }));
        
        setEmployees(normalizedEmployees);
        if (normalizedEmployees.length > 0) {
          setSelectedEmp(normalizedEmployees[0]);
        }
        return normalizedEmployees;
      }
      return [];
    } catch (err) {
      console.error("Error fetching employees in CB:", err);
      return [];
    } finally {
      setLoadingEmployees(false);
    }
  };

  const fetchEmployees = async () => {
    await checkAccessAndLoad();
  };

  // Loại HĐLĐ của chính mình — dùng cho ô "Loại hợp đồng" khi RLS chặn bảng
  // contracts. Hàm chưa được tạo trong DB thì im lặng bỏ qua (ô về "Chưa ký HĐ"
  // như trước), không chặn phần còn lại của trang.
  const fetchOwnContractType = async () => {
    try {
      const { data, error } = await supabase.rpc("my_contract_type");
      if (error) throw error;
      setOwnContractType(typeof data === "string" && data.trim() ? data.trim() : null);
    } catch (err) {
      console.error("Không lấy được loại hợp đồng của bản thân:", err);
      setOwnContractType(null);
    }
  };

  const fetchContracts = async (employeesList?: Employee[]) => {
    try {
      setLoadingContracts(true);
      const { data, error } = await supabase
        .from("contracts")
        .select("*, employees(name, department, role, employee_code)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) {
        const listToUse = employeesList || employees;
        const normalizedData = (data as Contract[]).map(c => {
          let empId = c.employee_id;
          let matchedEmp = c.employees;
          
          // Auto-match employee reference if missing
          if ((!empId || !matchedEmp) && c.employee_name) {
            const found = matchEmployee(c.employee_name, c.employee_code, listToUse);
            if (found) {
              empId = found.id;
              matchedEmp = {
                name: found.name,
                department: found.department,
                role: found.role,
                employee_code: found.employee_code
              };
            }
          }

          const cleanNameVal = c.employee_name ? c.employee_name.replace(/\([^)]*\)/g, "").trim() : "";
          return {
            ...c,
            employee_id: empId || "",
            employee_name: cleanNameVal,
            department: normalizeDeptClient(c.department),
            employees: matchedEmp ? {
              ...matchedEmp,
              department: normalizeDeptClient(matchedEmp.department)
            } : undefined
          };
        });
        
        // GIAO THỨC HĐTV → HĐLĐ CHÍNH THỨC:
        // 1) Khi đã tới ngày kết thúc HĐTV mà nhân viên còn làm việc (chưa "Nghỉ việc")
        //    và chưa có ngày ký HĐLĐ chính thức → tự điền:
        //      Từ  = ngày kết thúc HĐTV + 1 ngày
        //      Đến = ngày kết thúc HĐTV + 1 năm
        //    (VD: hết HĐTV 21/01/2026 → ký chính thức 22/01/2026 đến 21/01/2027)
        // 2) Đã có ngày ký HĐLĐ chính thức mà Loại HĐLĐ vẫn là "Thử việc"
        //    → tự chuyển sang "Xác định thời hạn".
        const fmtDate = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const todayStr = fmtDate(new Date());
        const autoFilled: { id: string; name: string; patch: Record<string, string> }[] = [];
        const finalData = normalizedData.map(c => {
          const patch: Record<string, string> = {};
          // Xác định "còn làm việc" dựa vào DANH SÁCH NHÂN VIÊN:
          // khớp theo employee_id, nếu chưa liên kết thì khớp theo Mã NV.
          // Không tìm thấy trong danh sách, hoặc trạng thái là "NV Nghỉ việc" -> không tự ký.
          const contractCode = (c.employee_code || "").toString().trim();
          const emp =
            listToUse.find(e => e.id === c.employee_id) ||
            (contractCode
              ? listToUse.find(e => (e.employee_code || "").toString().trim() === contractCode)
              : undefined);
          const stillWorking = !!emp && !(emp.status || "").toLowerCase().includes("nghỉ việc");

          // (1) Tự điền ngày ký HĐLĐ chính thức khi HĐTV đã kết thúc
          if (
            c.probation_end_date && c.probation_end_date <= todayStr &&
            !c.sign_date && !c.expiration_date &&
            stillWorking
          ) {
            // dùng 12h trưa để tránh lệch ngày do múi giờ
            const end = new Date(c.probation_end_date + "T12:00:00");
            if (!isNaN(end.getTime())) {
              const from = new Date(end);
              from.setDate(from.getDate() + 1);
              const to = new Date(end);
              to.setFullYear(to.getFullYear() + 1);
              patch.sign_date = fmtDate(from);
              patch.expiration_date = fmtDate(to);
            }
          }

          // (2) Đã có HĐLĐ chính thức -> loại HĐ không thể còn là "Thử việc"
          const hasOfficialDates = !!(patch.sign_date || c.sign_date || c.expiration_date);
          if (hasOfficialDates && c.type === "Thử việc") {
            patch.type = "Xác định thời hạn";
          }

          // (3) Đã ký chính thức + có Số HĐTV + chưa có Số HĐLĐ thật
          //     -> tự sinh Số HĐLĐ từ Số HĐTV, chỉ đổi ký hiệu HĐTV thành HĐLĐ
          //     (VD: 006335/2026/HĐTV/TNE&C -> 006335/2026/HĐLĐ/TNE&C)
          const hasRealContractNumber = !!c.contract_number && !c.contract_number.startsWith("IMPORT-");
          const probationNo = (c.probation_contract_number || "").trim();
          if (hasOfficialDates && !hasRealContractNumber && /HĐTV|HDTV/.test(probationNo)) {
            patch.contract_number = probationNo.replace(/HĐTV/g, "HĐLĐ").replace(/HDTV/g, "HDLD");
          }

          if (Object.keys(patch).length === 0) return c;
          autoFilled.push({ id: c.id, name: c.employee_name || emp?.name || c.employee_code || "?", patch });
          return { ...c, ...patch };
        });

        setContracts(finalData);
        setTempContracts(finalData);

        // Ghi các dòng tự điền vào DB (chạy bằng session người đăng nhập, RLS áp dụng)
        if (autoFilled.length > 0) {
          const results = await Promise.all(
            autoFilled.map(a => supabase.from("contracts").update(a.patch).eq("id", a.id))
          );
          const failed = results.filter(r => r.error).length;
          console.log(
            `[HĐTV→HĐLĐ] Tự động cập nhật ${autoFilled.length - failed}/${autoFilled.length} hợp đồng hết hạn thử việc:`,
            autoFilled.map(a => {
              const dates = a.patch.sign_date ? `${a.patch.sign_date} → ${a.patch.expiration_date}` : "";
              const typeNote = a.patch.type ? `loại HĐ → ${a.patch.type}` : "";
              const numberNote = a.patch.contract_number ? `Số HĐLĐ → ${a.patch.contract_number}` : "";
              return `${a.name}: ${[dates, typeNote, numberNote].filter(Boolean).join(", ")}`;
            })
          );
        }
      }
    } catch (err) {
      console.error("Error fetching contracts in CB:", err);
    } finally {
      setLoadingContracts(false);
    }
  };

  useEffect(() => {
    checkAccessAndLoad();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const subtab = params.get("subtab");
      if (subtab) {
        setActiveSubTab(subtab);
        if (["machine", "explanation", "leave", "travel", "regime", "allowances"].includes(subtab)) {
          setActiveTab("attendance");
        } else if (["calculation", "insurance", "policy_rates"].includes(subtab)) {
          setActiveTab("payroll_insurance");
        } else if (["birthday", "funeral_wedding", "holiday_bonus"].includes(subtab)) {
          setActiveTab("benefits");
        }
      }
    }
  }, []);

  // Group real employees by department for Org Chart
  const orgChartData = useMemo(() => {
    const groups: Record<string, Employee[]> = {};
    employees.forEach(emp => {
      const dept = emp.department || "Khối văn phòng chung";
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(emp);
    });
    return Object.entries(groups).map(([name, members]) => ({
      departmentName: name,
      manager: members.find(m => m.role.toLowerCase().includes("trưởng phòng") || m.role.toLowerCase().includes("chỉ huy")) || members[0] || null,
      members: members
    }));
  }, [employees]);

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => 
      emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.role.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  // Bảng công thật gần nhất đã tải lên (attendance_imports) — ưu tiên tháng mới nhất,
  // trong cùng tháng thì lấy lần tải lên sau cùng.
  const latestAttendanceImport = useMemo(() => {
    if (importedTimesheets.length === 0) return null;
    return [...importedTimesheets].sort((a, b) => {
      const ka = `${a.year || ""}-${String(a.month_val || "").padStart(2, "0")}`;
      const kb = `${b.year || ""}-${String(b.month_val || "").padStart(2, "0")}`;
      if (ka !== kb) return kb.localeCompare(ka);
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    })[0];
  }, [importedTimesheets]);

  // Bản ghi chấm công thật: bung dữ liệu từng ngày của file máy chấm công đã tải lên
  const machineAttendanceLogs = useMemo(() => {
    const src = latestAttendanceImport?.parsed_data;
    if (!Array.isArray(src)) return [] as any[];
    const logs: any[] = [];
    src.forEach((emp: any) => {
      (emp?.details || []).forEach((d: any) => {
        const checkin = String(d?.checkin || "").trim();
        const checkout = String(d?.checkout || "").trim();
        // Chỉ liệt kê ngày thực sự có quét vân tay
        if ((!checkin || checkin === "-") && (!checkout || checkout === "-")) return;
        const dateKey = toDateOnlyKey(d?.date || "");
        if (!dateKey) return;
        const late = Number(d?.late) || 0;
        logs.push({
          dateKey,
          name: emp?.name || "",
          checkin: checkin || "-",
          checkout: checkout || "-",
          hours: Number(d?.hours) || 0,
          status: late > 0 ? `Muộn (${late}')` : "Đúng giờ"
        });
      });
    });
    return logs.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  }, [latestAttendanceImport]);

  const filteredAttendanceLogs = useMemo(() => {
    let logs = machineAttendanceLogs
      .filter(log => hasFullAccess || normalizeText(log.name) === normalizeText(currentUser?.name || ""))
      .filter(log => !machineFilterFrom || log.dateKey >= machineFilterFrom)
      .filter(log => !machineFilterTo || log.dateKey <= machineFilterTo);
    // Không đặt bộ lọc ngày thì chỉ hiển thị ngày chấm công gần nhất có dữ liệu
    if (!machineFilterFrom && !machineFilterTo && logs.length > 0) {
      const newestDay = logs[0].dateKey;
      logs = logs.filter(log => log.dateKey === newestDay);
    }
    return logs.slice(0, 300);
  }, [machineAttendanceLogs, hasFullAccess, currentUser, machineFilterFrom, machineFilterTo]);

  // Mặc định chỉ hiện 5 bản ghi cho gọn, bấm "Xem thêm" mới bung hết
  const visibleAttendanceLogs = useMemo(() => {
    return showAllMachineLogs ? filteredAttendanceLogs : filteredAttendanceLogs.slice(0, MACHINE_LOGS_PREVIEW_COUNT);
  }, [filteredAttendanceLogs, showAllMachineLogs]);

  // Helper to determine if a role represents a manager/department head
  const isManagerRole = (role: string): boolean => {
    if (!role) return false;
    const lower = role.trim().toLowerCase();
    
    // Check for common abbreviation prefixes like "tp." or "tp " or matching phrases
    return lower.startsWith("tp.") || 
           lower.startsWith("tp ") || 
           lower === "tp" ||
           lower.includes("trưởng phòng") || 
           lower.includes("trưởng bộ phận") || 
           lower.includes("chỉ huy trưởng") || 
           lower.includes("kế toán trưởng") || 
           lower.includes("ktt") ||
           lower.includes("phó giám đốc") || 
           lower.includes("pgđ") ||
           lower.includes("chỉ huy phó") || 
           lower.includes("chỉ huy");
  };

  // Helper to find department manager for autofill (robust, systematic & intelligent)
  const getManagerForDepartment = (deptName: string) => {
    const normalizedTarget = normalizeDeptClient(deptName);
    
    // 1. Filter employees in the same normalized department
    const deptMembers = employees.filter(emp => normalizeDeptClient(emp.department) === normalizedTarget);
    
    // 2. Search systematically for a department head based on title/role (like TP. HCNS)
    let manager = deptMembers.find(m => isManagerRole(m.role));

    // 3. Specific override for HCNS (Hành chính Nhân sự) as requested by user:
    // ưu tiên đúng Trưởng phòng HCNS khai trong tenant_config.hcns_head_name
    const headNorm = normalizeName(tenantCfg.hcns_head_name || "");
    if (normalizedTarget === "Phòng Hành Chính Nhân Sự" && headNorm) {
      const daoEmp = deptMembers.find(m => {
        const nameLower = (m.name || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d");
        return nameLower.includes(headNorm);
      });
      if (daoEmp) manager = daoEmp;
    }

    // 4. Fallback search for assistant / team leader / deputy head
    if (!manager) {
      manager = deptMembers.find(m => {
        const roleLower = (m.role || "").toLowerCase();
        return roleLower.includes("tổ trưởng") || roleLower.includes("phó phòng") || roleLower.includes("phó bộ phận");
      });
    }

    if (manager) return manager.name;

    // 5. Hardcoded fallbacks if no employee record is found in DB matching department head
    if (normalizedTarget === "Phòng Hành Chính Nhân Sự") {
      return tenantCfg.hcns_head_name; // Trưởng phòng HCNS khai trong tenant_config
    }
    if (normalizedTarget === "Phòng Kỹ Thuật") {
      return "Phó Giám Đốc";
    }
    if (normalizedTarget === "Phòng Vật Tư Thiết Bị") {
      return "TP Vật Tư Thiết Bị";
    }
    if (normalizedTarget === "Phòng Kế Hoạch Đấu Thầu" || normalizedTarget === "Phòng Kế Hoạch") {
      return "TP Kế Hoạch";
    }
    if (normalizedTarget === "Phòng An Toàn Lao Động" || normalizedTarget === "Phòng ATLĐ") {
      return "TP ATLĐ";
    }
    if (normalizedTarget === "Phòng Tài Chính Kế Toán") {
      return "Kế Toán Trưởng";
    }
    if (normalizedTarget === "Phòng Dự Án" || normalizedTarget === "Phòng Quản Lý Dự Án") {
      return "PP Dự Án";
    }

    // Hard fallback to the first employee in the department list
    if (deptMembers.length > 0) {
      return deptMembers[0].name;
    }
    return "";
  };

  const fetchExplanations = async () => {
    setLoadingExplanations(true);
    try {
      const { data, error } = await supabase
        .from("attendance_justifications")
        .select("*")
        .order("date", { ascending: false });
      if (error) {
        console.warn("Table attendance_justifications error, using local storage or mock:", error.message);
        const stored = localStorage.getItem("attendance_justifications");
        if (stored) {
          setExplanations(JSON.parse(stored));
        } else {
          setExplanations(MOCK_EXPLANATIONS);
        }
        setIsUsingDbForExplanations(false);
      } else if (data) {
        setExplanations(data);
        setIsUsingDbForExplanations(true);
      }
    } catch (e: any) {
      console.warn("Error fetching explanations:", e);
      const stored = localStorage.getItem("attendance_justifications");
      if (stored) {
        setExplanations(JSON.parse(stored));
      } else {
        setExplanations(MOCK_EXPLANATIONS);
      }
      setIsUsingDbForExplanations(false);
    } finally {
      setLoadingExplanations(false);
    }
  };

  const fetchTravels = async () => {
    try {
      const { data, error } = await supabase
        .from("business_trips")
        .select("*")
        .order("from_date", { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        const normalized = data.map(d => ({
          id: d.id,
          name: d.name,
          dest: d.dest,
          from: d.from_date,
          to: d.to_date,
          purpose: d.purpose,
          cost: d.cost,
          allowance: d.cost,
          status: d.status
        }));
        setTravels(normalized);
      } else {
        setTravels(MOCK_TRAVELS);
      }
    } catch (err) {
      console.warn("Could not fetch business trips from DB, using mock:", err);
      setTravels(MOCK_TRAVELS);
    }
  };

  const handleUpdateTravelCost = async (idOrIndex: any, newCost: number) => {
    const isUuid = typeof idOrIndex === "string" && idOrIndex.length > 8;
    if (isUuid) {
      try {
        const { error } = await supabase
          .from("business_trips")
          .update({ cost: newCost })
          .eq("id", idOrIndex);
        if (error) throw error;
        alert("Đã cập nhật chi phí chuyến đi thành công!");
        fetchTravels();
      } catch (err: any) {
        console.error("Error updating travel cost:", err);
        alert("Lỗi khi cập nhật chi phí: " + err.message);
      }
    } else {
      const updated = travels.map((t, idx) => {
        const match = t.id ? t.id === idOrIndex : idx === idOrIndex;
        return match ? { ...t, cost: newCost, allowance: newCost } : t;
      });
      setTravels(updated);
    }
  };

  const handleDeleteTravel = async (idOrIndex: any) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa lịch trình công tác này không?")) {
      return;
    }
    const isUuid = typeof idOrIndex === "string" && idOrIndex.length > 8;
    if (isUuid) {
      try {
        const { error } = await supabase
          .from("business_trips")
          .delete()
          .eq("id", idOrIndex);
        if (error) throw error;
        setTravels(prev => prev.filter(t => t.id !== idOrIndex));
      } catch (err: any) {
        console.error("Error deleting business trip:", err);
        alert("Lỗi khi xóa lịch trình công tác: " + err.message);
      }
    } else {
      setTravels(prev => prev.filter((t, idx) => idx !== idOrIndex));
    }
  };

  const handleAddExplanation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expFormEmployeeName.trim()) {
      alert("Vui lòng chọn hoặc nhập tên nhân viên!");
      return;
    }
    if (!expFormDepartment.trim()) {
      alert("Vui lòng nhập phòng ban!");
      return;
    }
    if (!expFormReason.trim()) {
      alert("Vui lòng nhập lý do giải trình!");
      return;
    }
    if (!expFormPropose.trim()) {
      alert("Vui lòng nhập khung giờ đề xuất!");
      return;
    }
    if (!expFormApprover.trim()) {
      alert("Vui lòng nhập người phê duyệt!");
      return;
    }

    setIsSubmittingExplanation(true);
    const newRecord = {
      date: expFormDate,
      name: expFormEmployeeName.trim(),
      department: expFormDepartment.trim(),
      reason: expFormReason.trim(),
      propose: expFormPropose.trim(),
      approver: expFormApprover.trim(),
      status: "Chưa duyệt"
    };

    if (isUsingDbForExplanations) {
      try {
        const { data, error } = await supabase
          .from("attendance_justifications")
          .insert([newRecord])
          .select();
        if (error) throw error;
        if (data) {
          setExplanations(prev => [data[0], ...prev]);
        }
      } catch (err: any) {
        console.error("Error inserting justification:", err);
        alert("Lỗi khi lưu vào database: " + err.message);
      }
    } else {
      // Fallback
      const updated = [newRecord, ...explanations];
      setExplanations(updated);
      localStorage.setItem("attendance_justifications", JSON.stringify(updated));
    }

    // Reset form
    setExpFormReason("");
    setExpFormPropose("");
    setShowExplanationAddForm(false);
    setIsSubmittingExplanation(false);
  };

  const handleToggleExplanationApproval = async (idOrIndex: any, currentStatus: string) => {
    const newStatus = currentStatus === "Đã duyệt" ? "Chờ duyệt" : "Đã duyệt";
    if (isUsingDbForExplanations) {
      try {
        const { error } = await supabase
          .from("attendance_justifications")
          .update({ status: newStatus })
          .eq("id", idOrIndex);
        if (error) throw error;
        setExplanations(prev => prev.map(e => e.id === idOrIndex ? { ...e, status: newStatus } : e));
      } catch (err: any) {
        console.error("Error updating justification status:", err);
        alert("Lỗi khi cập nhật trạng thái: " + err.message);
      }
    } else {
      // Local state update
      const updated = explanations.map((e, idx) => {
        const match = e.id ? e.id === idOrIndex : idx === idOrIndex;
        return match ? { ...e, status: newStatus } : e;
      });
      setExplanations(updated);
      localStorage.setItem("attendance_justifications", JSON.stringify(updated));
    }
  };

  const handleDeleteExplanation = async (idOrIndex: any) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa bản ghi giải trình này không?")) {
      return;
    }
    if (isUsingDbForExplanations) {
      try {
        const { error } = await supabase
          .from("attendance_justifications")
          .delete()
          .eq("id", idOrIndex);
        if (error) throw error;
        setExplanations(prev => prev.filter(e => e.id !== idOrIndex));
      } catch (err: any) {
        console.error("Error deleting justification:", err);
        alert("Lỗi khi xóa giải trình: " + err.message);
      }
    } else {
      // Local state delete
      const updated = explanations.filter((e, idx) => {
        const match = e.id ? e.id !== idOrIndex : idx !== idOrIndex;
        return !match;
      });
      setExplanations(updated);
      localStorage.setItem("attendance_justifications", JSON.stringify(updated));
    }
  };

  const filteredExplanations = useMemo(() => {
    return explanations
      .filter(e => hasFullAccess || e.name === currentUser?.name || e.approver === currentUser?.name)
      .filter(e => !explanationFilterFrom || new Date(e.date) >= new Date(explanationFilterFrom))
      .filter(e => !explanationFilterTo || new Date(e.date) <= new Date(explanationFilterTo));
  }, [explanations, hasFullAccess, currentUser, explanationFilterFrom, explanationFilterTo]);

  const filteredLeaves = useMemo(() => {
    return leaves
      .filter(l => hasFullAccess || l.name === currentUser?.name)
      .filter(l => !leaveFilterFrom || new Date(l.from) >= new Date(leaveFilterFrom))
      .filter(l => !leaveFilterTo || new Date(l.to) <= new Date(leaveFilterTo));
  }, [leaves, hasFullAccess, currentUser, leaveFilterFrom, leaveFilterTo]);

  const isConcurrentOrSupport = (emp: any): boolean => {
    if (!emp) return false;
    const roleLower = (emp.role || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d");
    const nameLower = (emp.name || "").toLowerCase().trim();
    
    if (roleLower.includes("kiem nhiem") || roleLower.includes("ho tro")) return true;
    const inMockConcurrent = MOCK_CONCURRENTS.some(c => c.name.toLowerCase().trim() === nameLower);
    return inMockConcurrent;
  };

  const annualLeaveData = useMemo(() => {
    return employees.map(emp => {
      const isConcurrent = isConcurrentOrSupport(emp);
      const tenureStr = getEmployeeTenureStr(emp);

      // Toàn bộ phép tính nằm ở lib/annualLeave.ts — trang Lịch dùng đúng hàm này
      // để chặn đăng ký vượt hạn mức. "Đã nghỉ"/"Chờ duyệt" chỉ đếm trong NĂM NAY
      // vì phép năm không cộng dồn qua năm.
      const quota = computeLeaveQuota(emp, leaves.filter(l => l.name === emp.name), {
        isConcurrent,
      });

      return {
        id: emp.id,
        name: emp.name,
        role: emp.role,
        department: emp.department,
        created_at: emp.created_at,
        tenureStr,
        isConcurrent,
        baseLeave: quota.base,
        seniorLeave: quota.senior,
        totalLeave: quota.total,
        hasOverride: quota.hasOverride,
        usedLeave: quota.used,
        pendingLeave: quota.pending,
        remainingLeave: quota.remaining
      };
    });
  }, [employees, leaves]);

  // ─── Sửa tay cột "Tổng phép" (chỉ Admin) ───
  // Ghi thẳng vào employees.annual_leave_override. RLS (migration 007) đã chặn
  // sẵn ở tầng CSDL nên người không có quyền có gọi tay cũng không ghi được.
  const [editingLeaveQuotaId, setEditingLeaveQuotaId] = useState<string | null>(null);
  const [leaveQuotaDraft, setLeaveQuotaDraft] = useState("");
  const [savingLeaveQuota, setSavingLeaveQuota] = useState(false);
  // Bấm Esc là bỏ, nhưng thao tác đó cũng làm ô mất focus -> onBlur chạy và lưu
  // mất số vừa gõ. Cờ này để onBlur biết mà đứng yên.
  const cancelLeaveQuotaRef = useRef(false);

  const handleSaveLeaveQuota = async (empId: string) => {
    if (cancelLeaveQuotaRef.current) {
      cancelLeaveQuotaRef.current = false;
      return;
    }
    if (savingLeaveQuota) return;
    const raw = leaveQuotaDraft.trim();
    // Bỏ trống = gỡ ghi đè, trả về cho hệ thống tự tính.
    const value = raw === "" ? null : Number(raw);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      alert("Số ngày phép không hợp lệ!");
      return;
    }
    setSavingLeaveQuota(true);
    try {
      const { error } = await supabase
        .from("employees")
        .update({ annual_leave_override: value })
        .eq("id", empId);
      if (error) throw error;
      setEmployees(prev => prev.map(e => e.id === empId ? { ...e, annual_leave_override: value } : e));
      setEditingLeaveQuotaId(null);
    } catch (err) {
      console.error("Error saving leave quota:", err);
      alert("Không lưu được số phép. Kiểm tra lại quyền hoặc kết nối!");
    } finally {
      setSavingLeaveQuota(false);
    }
  };

  const searchedAnnualLeaveData = useMemo(() => {
    if (!leaveSearchQuery) return annualLeaveData;
    const q = normalizeText(leaveSearchQuery);
    return annualLeaveData.filter(d => 
      normalizeText(d.name).includes(q) || 
      normalizeText(d.role || "").includes(q) || 
      normalizeText(d.department || "").includes(q)
    );
  }, [annualLeaveData, leaveSearchQuery]);

  const searchedLeaves = useMemo(() => {
    if (!leaveSearchQuery) return filteredLeaves;
    const q = normalizeText(leaveSearchQuery);
    return filteredLeaves.filter(l => 
      normalizeText(l.name).includes(q) || 
      normalizeText(l.type || "").includes(q) || 
      normalizeText(l.reason || "").includes(q)
    );
  }, [filteredLeaves, leaveSearchQuery]);

  const filteredTravels = useMemo(() => {
    return travels
      .filter(t => hasFullAccess || t.name === currentUser?.name)
      .filter(t => !travelFilterFrom || new Date(t.from) >= new Date(travelFilterFrom))
      .filter(t => !travelFilterTo || new Date(t.to) <= new Date(travelFilterTo));
  }, [travels, hasFullAccess, currentUser, travelFilterFrom, travelFilterTo]);

  const filteredRegimes = useMemo(() => {
    return leaves
      .filter(r => REGIME_LEAVE_TYPES.includes(r.type))
      .filter(r => hasFullAccess || r.name === currentUser?.name)
      .filter(r => !regimeFilterFrom || new Date(r.from) >= new Date(regimeFilterFrom))
      .filter(r => !regimeFilterTo || new Date(r.to) <= new Date(regimeFilterTo));
  }, [leaves, hasFullAccess, currentUser, regimeFilterFrom, regimeFilterTo]);

  // Đang nghỉ hay đã đi làm lại suy ra từ mốc ngày của đơn, không lưu riêng trong DB
  const getRegimeState = (from: string, to: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(from);
    const end = new Date(to);
    if (today < start) return "Sắp nghỉ";
    if (today > end) return "Đã đi làm lại";
    return "Đang nghỉ";
  };

  // Đơn nghỉ chế độ chính là task nghỉ phép, nên xóa là xóa hẳn bản ghi dưới
  // Supabase — không chỉ ẩn ở phía trình duyệt như nút xóa bên tab Nghỉ phép.
  const handleDeleteRegime = async (leaveId: string) => {
    if (!canDeleteRegime) return;
    if (!window.confirm("Bạn có chắc chắn muốn xóa đơn nghỉ chế độ này không?")) return;
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", leaveId);
      if (error) throw error;
      setLeaves(prev => prev.filter(l => l.id !== leaveId));
    } catch (err: any) {
      console.error("Error deleting regime leave:", err);
      alert("Lỗi khi xóa đơn nghỉ chế độ: " + err.message);
    }
  };

  const filteredSalaryInfo = useMemo(() => {
    return MOCK_SALARY_INFO.filter(s => hasFullAccess || s.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

  const filteredBhxhLogs = useMemo(() => {
    return MOCK_BHXH_LOGS.filter(b => hasFullAccess || b.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

  // Nhân viên thường chỉ được xem hợp đồng của chính mình, không thấy người khác
  const myVisibleContracts = useMemo(() => {
    if (hasFullAccess) return tempContracts;
    return tempContracts.filter(c => normalizeText(c.employee_name || c.employees?.name || "") === normalizeText(currentUser?.name || ""));
  }, [tempContracts, hasFullAccess, currentUser]);

  const parseBirthdate = (dateStr: string) => {
    if (!dateStr) return null;
    
    // Normalize delimiters: replace hyphens, slashes, or dots with spaces
    const cleanStr = dateStr.replace(/[\-\.\/]/g, " ").trim();
    const parts = cleanStr.split(/\s+/);
    
    if (parts.length === 3) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      
      if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
        // Check if the first part is a 4-digit year (YYYY MM DD)
        if (p0 > 1900) {
          return { day: p2, month: p1, year: p0 };
        }
        // Check if the last part is a 4-digit year (DD MM YYYY or MM DD YYYY)
        else if (p2 > 1900) {
          return { day: p0, month: p1, year: p2 };
        }
        // Otherwise fallback to default order (DD MM YY)
        else {
          return { day: p0, month: p1, year: p2 };
        }
      }
    }
    
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return {
        day: parsedDate.getDate(),
        month: parsedDate.getMonth() + 1,
        year: parsedDate.getFullYear()
      };
    }
    
    return null;
  };

  const filteredBirthdays = useMemo(() => {
    return employees
      .filter(emp => !isExcludedFromBenefits(emp))
      .map(emp => {
        const parsed = parseBirthdate(emp.date_of_birth || "");
        if (!parsed) return null;
        
        const level = getEmployeeLevel(emp.role);
        const birthdayPolicy = benefitPolicies.find(p => p.code === "birthday");
        const cell = benefitCell(birthdayPolicy, level);
        const giftAmount = cell.amount ?? 0;
        // Giỏ hoa (nếu cấp đó có) đi kèm hộp quà, ghi rõ để HCNS chuẩn bị đúng
        const giftStr = [
          `Hộp quà & ${giftAmount.toLocaleString("vi-VN")}đ`,
          cell.gift !== null && cell.gift !== undefined ? `${cell.giftLabel} ${cell.gift.toLocaleString("vi-VN")}đ` : ""
        ].filter(Boolean).join(" + ");
        const tenure = getEmployeeTenureStr(emp);
        
        return {
          id: emp.id,
          name: emp.name,
          dob: emp.date_of_birth || "",
          day: parsed.day,
          month: parsed.month,
          year: parsed.year,
          dept: emp.department,
          role: emp.role,
          gift: giftStr,
          giftAmount,
          tenure,
          status: "Chờ gửi"
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null && b.month === selectedBirthdayMonth)
      .filter(b => hasFullAccess || b.name === currentUser?.name)
      .sort((a, b) => a.day - b.day);
  }, [employees, selectedBirthdayMonth, hasFullAccess, currentUser, benefitPolicies]);

  const daysInMonth = useMemo(() => {
    const year = new Date().getFullYear();
    const totalDays = new Date(year, selectedBirthdayMonth, 0).getDate();
    return Array.from({ length: totalDays }, (_, i) => i + 1);
  }, [selectedBirthdayMonth]);

  const filteredBenefitClaims = useMemo(() => {
    // Hồ sơ đã nghỉ việc / kiêm nhiệm thì ẩn luôn phiếu hiếu hỷ của họ.
    // Phiếu chỉ lưu tên nên đối chiếu ngược về danh sách nhân viên theo tên.
    const excludedNames = new Set(
      employees.filter(isExcludedFromBenefits).map(e => normalizeText(e.name))
    );
    return benefitClaims
      .filter(c => !excludedNames.has(normalizeText(c.name || "")))
      // Người được giao duyệt phải thấy phiếu của MỌI người, nếu không sẽ không
      // có gì để bấm duyệt. Trước đây chỉ dựa vào hasFullAccess (= Admin hoặc cờ
      // "Xem lương & HĐLĐ") nên người chỉ có cờ duyệt phúc lợi chỉ thấy phiếu
      // mang tên chính mình.
      .filter(c => hasFullAccess || canApproveBenefit || c.name === currentUser?.name);
  }, [benefitClaims, employees, hasFullAccess, canApproveBenefit, currentUser]);

  // --- HELPER FUNCTIONS FOR PREMIUM EMPLOYEE PROFILE VIEW ---
  const calculateTenure = (emp: Employee) => {
    if (!emp.created_at) return "—";
    const joinDate = new Date(emp.created_at);
    if (isNaN(joinDate.getTime())) return "—";
    
    const now = new Date();
    
    let years = now.getFullYear() - joinDate.getFullYear();
    let months = now.getMonth() - joinDate.getMonth();
    
    if (months < 0) {
      years--;
      months += 12;
    }
    
    if (now.getDate() < joinDate.getDate()) {
      months--;
      if (months < 0) {
        years--;
        months += 12;
      }
    }

    if (years < 0) {
      return "0 tháng";
    }
    
    if (years === 0) {
      return `${months} tháng`;
    }
    
    if (months === 0) {
      return `${years} năm`;
    }
    
    return `${years} năm ${months} tháng`;
  };

  // Hồ sơ đang xem có phải chính người đang đăng nhập không (khớp theo id, rồi
  // tới email đã lưu — một người có thể lưu nhiều email ngăn bởi dấu phẩy).
  const isSelfEmployee = (emp: Employee) => {
    if (!currentUser) return false;
    if (currentUser.empId && emp.id === currentUser.empId) return true;
    const loginEmail = (currentUser.email || "").toLowerCase();
    if (!loginEmail) return false;
    return (emp.email || "").toLowerCase().split(",").map(s => s.trim()).includes(loginEmail);
  };

  const getEmployeeContractType = (emp: Employee) => {
    const empCode = (emp.employee_code || "").toString().trim();
    const matchedContracts = contracts.filter(c =>
      (c.employee_id && c.employee_id === emp.id) ||
      (empCode && (c.employee_code || "").toString().trim() === empCode) ||
      (c.employee_name && emp.name && cleanName(c.employee_name) === cleanName(emp.name))
    );
    
    const isRealNumber = (n: any) => !!n && !String(n).startsWith("IMPORT-");
    const empContract =
      matchedContracts.find(c => isRealNumber(c.contract_number) && c.sign_date) ||
      matchedContracts.find(c => isRealNumber(c.contract_number)) ||
      matchedContracts[0] || null;

    // Không tìm thấy trong `contracts` có 2 khả năng khác hẳn nhau:
    //   (a) người dùng có quyền đọc bảng nhưng nhân viên này thật sự chưa có HĐ
    //   (b) người dùng bị RLS chặn nên bảng về rỗng — lúc này danh sách chỉ có
    //       đúng hồ sơ của chính họ, và loại HĐ lấy từ RPC `my_contract_type`.
    if (!empContract) {
      if (!hasFullAccess && isSelfEmployee(emp) && ownContractType) {
        return simplifyContractType(ownContractType);
      }
      return "Chưa ký HĐ";
    }
    return simplifyContractType(empContract.type) || "Chưa xác định";
  };

  const getKpiTrend = (emp: Employee) => {
    let hash = 0;
    for (let i = 0; i < emp.name.length; i++) {
      hash = emp.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const baseKpi = emp.kpi || 90;
    return [
      { month: "T1", KPI: Math.min(100, Math.max(70, baseKpi - 4 + Math.abs((hash + 1) % 8))) },
      { month: "T2", KPI: Math.min(100, Math.max(70, baseKpi - 2 + Math.abs((hash + 2) % 6))) },
      { month: "T3", KPI: Math.min(100, Math.max(70, baseKpi + Math.abs((hash + 3) % 7) - 3)) },
      { month: "T4", KPI: Math.min(100, Math.max(70, baseKpi - 1 + Math.abs((hash + 4) % 5))) },
      { month: "T5", KPI: Math.min(100, Math.max(70, baseKpi + Math.abs((hash + 5) % 6) - 1)) },
      { month: "T6", KPI: baseKpi },
    ];
  };

  const getCareerTimeline = (emp: Employee) => {
    const joinDate = new Date(emp.created_at || "2024-01-15");
    const formatDate = (d: Date) => d.toLocaleDateString("vi-VN");
    return [
      {
        title: `Gia nhập ${tenantCfg.company_name}`,
        description: `Bắt đầu công tác tại ${emp.department} với vị trí ${emp.role}.`,
        date: formatDate(joinDate),
        icon: UserCheck,
        color: "bg-blue-500",
      },
      {
        title: "Hoàn thành thử việc",
        description: "Đánh giá thử việc xuất sắc, ký hợp đồng lao động chính thức.",
        date: formatDate(new Date(joinDate.getTime() + 60 * 24 * 60 * 60 * 1000)),
        icon: CheckCircle,
        color: "bg-emerald-500",
      },
      {
        title: "Đạt mốc KPI Xuất sắc",
        description: `Hoàn thành dự án xuất sắc với KPI ghi nhận ${emp.kpi || 90}/100.`,
        date: formatDate(new Date(joinDate.getTime() + 180 * 24 * 60 * 60 * 1000)),
        icon: TrendingUp,
        color: "bg-indigo-500",
      },
    ];
  };

  const getEmployeeSalary = (emp: Employee) => {
    const found = MOCK_SALARY_INFO.find(s => s.name === emp.name);
    if (found) return found;
    
    // Hash base salary calculation for fallback
    let hash = 0;
    for (let i = 0; i < emp.name.length; i++) {
      hash = emp.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    let base = 12000000 + (Math.abs(hash % 10) * 1000000);
    if (emp.role.toLowerCase().includes("trưởng phòng") || emp.role.toLowerCase().includes("leader") || emp.role.toLowerCase().includes("phó phòng")) {
      base = 18000000 + (Math.abs(hash % 8) * 1000000);
    }
    
    const insurance = Math.floor(base * 0.3);
    const phone = 300000;
    const lunch = 730000;
    const gas = 500000;
    const total = base + phone + lunch + gas;
    
    return { id: emp.id, name: emp.name, base, insurance, phone, lunch, gas, total };
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header 
          title="Lương & Phúc lợi (C&B)" 
          subtitle="Giải trình chấm công và phúc lợi" 
        />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto text-slate-800">
          {loadingAuth ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
              <Loader2 className="animate-spin text-[#005BAC]" size={28} />
              <span className="text-[11px] font-semibold text-slate-500">Đang tải thông tin và kiểm tra quyền truy cập...</span>
            </div>
          ) : (
            <>
          
          {/* ─── 5 MAIN TABS NAVIGATOR ─── */}
          <div className="flex border-b border-slate-200 bg-white p-1 rounded-xl shadow-sm space-x-1 shrink-0 overflow-x-auto">
            {[
              { id: "employee_profile", label: "Hồ sơ nhân viên", icon: User },
              { id: "attendance", label: "Chấm công", icon: Clock },
              // 2 tab dưới đây hiện lương BHXH / phụ cấp / tổng thu nhập -> chỉ
              // Admin hoặc người có cờ "Xem lương & HĐLĐ" mới thấy. Sau khi siết
              // RLS bảng contracts (migration 018) người khác cũng không đọc được
              // dữ liệu, nên ẩn tab để không hiện bảng rỗng trông như lỗi.
              ...(hasFullAccess ? [
                { id: "payroll_insurance", label: "Bảng lương & BHXH", icon: DollarSign },
              ] : []),
              { id: "benefits", label: "Phúc lợi", icon: Award },
              ...(hasFullAccess ? [
                { id: "employee_contracts", label: "Hợp đồng nhân sự", icon: FileText },
              ] : []),
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] text-white shadow-md shadow-blue-500/15 scale-102"
                      : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ─── SUB-TABS NAVIGATOR BASED ON ACTIVE MAIN TAB (NON-PROFILE TABS ONLY) ─── */}
          {activeTab !== "employee_profile" && activeTab !== "employee_contracts" && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5 text-xs font-bold bg-[#005BAC]/5 p-1.5 rounded-xl shrink-0 border border-blue-100/20">
              {activeTab === "attendance" && [
                // "Lấy ngày công máy chấm công" là nơi tải file máy chấm công lên và
                // gửi bảng công — chỉ Admin hoặc người có cờ "Xem/nhập bảng chấm công"
                // mới thấy tab này. Nhân viên thường không thấy nút.
                ...(canViewTimesheetSummary ? [{ id: "machine", label: "Lấy ngày công máy chấm công" }] : []),
                { id: "explanation", label: "Thông tin giải trình" },
                { id: "leave", label: "Nghỉ phép" },
                { id: "travel", label: "Công tác" },
                { id: "regime", label: "Nghỉ chế độ" },
                { id: "allowances", label: "Phụ cấp cơm, xăng, dt..." }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setActiveSubTab(sub.id)}
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer border ${
                    activeSubTab === sub.id 
                      ? "bg-white text-[#005BAC] border-blue-100/60 shadow-sm scale-102" 
                      : "bg-transparent border-transparent text-slate-555 hover:text-[#005BAC] hover:bg-white/40"
                  }`}
                >
                  {sub.label}
                </button>
              ))}

              {activeTab === "payroll_insurance" && [
                { id: "calculation", label: "Tính lương" },
                { id: "insurance", label: "Bảo hiểm xã hội (BHXH)" }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setActiveSubTab(sub.id)}
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer border ${
                    activeSubTab === sub.id 
                      ? "bg-white text-[#005BAC] border-blue-100/60 shadow-sm scale-102" 
                      : "bg-transparent border-transparent text-slate-555 hover:text-[#005BAC] hover:bg-white/40"
                  }`}
                >
                  {sub.label}
                </button>
              ))}

              {activeTab === "benefits" && [
                { id: "policy_rates", label: "Định mức phúc lợi" },
                { id: "birthday", label: "Sinh nhật" },
                { id: "funeral_wedding", label: "Hiếu hỷ & Trợ cấp" },
                { id: "holiday_bonus", label: "Tiền thưởng lễ" }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setActiveSubTab(sub.id)}
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer border ${
                    activeSubTab === sub.id 
                      ? "bg-white text-[#005BAC] border-blue-100/60 shadow-sm scale-102" 
                      : "bg-transparent border-transparent text-slate-555 hover:text-[#005BAC] hover:bg-white/40"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {activeTab === "attendance" && (() => {
              const dateFilterMap: Record<string, [string, (v: string) => void, string, (v: string) => void]> = {
                machine: [machineFilterFrom, setMachineFilterFrom, machineFilterTo, setMachineFilterTo],
                explanation: [explanationFilterFrom, setExplanationFilterFrom, explanationFilterTo, setExplanationFilterTo],
                leave: [leaveFilterFrom, setLeaveFilterFrom, leaveFilterTo, setLeaveFilterTo],
                travel: [travelFilterFrom, setTravelFilterFrom, travelFilterTo, setTravelFilterTo],
                regime: [regimeFilterFrom, setRegimeFilterFrom, regimeFilterTo, setRegimeFilterTo]
              };
              const entry = dateFilterMap[activeSubTab];
              if (!entry) return null;
              const [fromVal, setFromVal, toVal, setToVal] = entry;
              return (
                <div className="flex flex-wrap items-center gap-1.5 bg-white p-1.5 rounded-xl shrink-0 border border-slate-200/60 shadow-sm">
                  <Calendar size={13} className="text-slate-400 ml-1" />
                  <input
                    type="date"
                    value={fromVal}
                    onChange={(e) => setFromVal(e.target.value)}
                    title="Từ ngày"
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                  />
                  <span className="text-slate-400 text-[11px] font-bold">-</span>
                  <input
                    type="date"
                    value={toVal}
                    onChange={(e) => setToVal(e.target.value)}
                    title="Đến ngày"
                    className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                  />
                  {(fromVal || toVal) && (
                    <button
                      type="button"
                      onClick={() => { setFromVal(""); setToVal(""); }}
                      className="px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-rose-600 cursor-pointer"
                      title="Xóa bộ lọc"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
          )}

          {/* ─── TAB CONTENT PANELS ─── */}

          {/* ─── TAB 1: HỒ SƠ NHÂN VIÊN ─── */}
          {activeTab === "employee_profile" && (
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
              {/* Left Column (20%): Directory List of Employees */}
              <div className="xl:col-span-1 glass bg-white rounded-2xl p-5 border-transparent shadow-premium flex flex-col space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-heading font-extrabold text-slate-800 text-xs uppercase tracking-wider">Nhân viên ({filteredEmployees.length})</h3>
                  <button onClick={checkAccessAndLoad} className="text-slate-400 hover:text-[#005BAC] cursor-pointer">
                    <RefreshCw size={14} className={loadingEmployees ? "animate-spin" : ""} />
                  </button>
                </div>

                <div className="relative">
                  <Search size={14} className="absolute left-3 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Tìm nhanh..."
                    className="w-full border border-slate-150 rounded-xl py-2.5 pl-9 pr-4 text-xs font-semibold text-slate-800 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  />
                </div>

                {loadingEmployees ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
                    <Loader2 className="animate-spin text-[#005BAC]" size={20} />
                    <span className="text-[10px]">Đang tải hồ sơ...</span>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[580px] overflow-y-auto pr-1">
                    {filteredEmployees.map(emp => (
                      <div
                        key={emp.id}
                        onClick={() => {
                          setSelectedEmp(emp);
                          // Keep activeSubTab if it exists in profile subtabs
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                          selectedEmp?.id === emp.id
                            ? "bg-[#005BAC]/5 border-transparent shadow-sm"
                            : "border-transparent bg-slate-50/20 hover:bg-slate-50"
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-extrabold text-[#005BAC] text-xs">
                          {emp.avatar || emp.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-xs text-slate-850 truncate">{emp.name}</p>
                          <p className="text-[10px] text-slate-450 truncate">{emp.role}</p>
                        </div>
                        <ChevronRight size={12} className="text-slate-350" />
                      </div>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <p className="text-center py-10 text-slate-400 italic text-[11px]">Không tìm thấy hồ sơ</p>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column (80%): Detailed Employee Profile Card & Panels */}
              <div className="xl:col-span-4 space-y-6">
                {selectedEmp ? (
                  <>
                    {/* Large Profile Header Card */}
                    <div className="glass bg-white rounded-3xl border-transparent shadow-premium overflow-hidden">
                      {/* Cover Banner */}
                      <div className="relative h-32 w-full bg-gradient-to-r from-[#005BAC] via-[#0089CD] to-[#00AEEF] overflow-hidden">
                        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
                        <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10 blur-2xl"></div>
                        <div className="absolute left-20 -bottom-20 w-60 h-60 rounded-full bg-[#00AEEF]/20 blur-3xl"></div>
                      </div>

                      {/* Header Main details */}
                      <div className="px-8 pb-6 relative">
                        {/* Avatar */}
                        <div className="absolute -top-14 left-8">
                          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 border-4 border-white flex items-center justify-center font-black text-white text-3xl shadow-xl overflow-hidden">
                            {selectedAvatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={selectedAvatar}
                                alt={selectedEmp.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              selectedEmp.avatar || selectedEmp.name.slice(0, 2).toUpperCase()
                            )}
                          </div>
                        </div>

                        {/* Title details */}
                        <div className="pt-14 flex flex-col md:flex-row md:items-end justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-3 flex-wrap">
                              <h2 className="font-heading font-black text-2xl text-slate-850">{selectedEmp.name}</h2>
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase ${
                                selectedEmp.status === "Chính thức" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>
                                {selectedEmp.status || "Chính thức"}
                              </span>
                            </div>
                            <p className="text-slate-500 text-xs font-semibold">
                              {selectedEmp.role} — <span className="text-slate-400 font-medium">{selectedEmp.department}</span>
                            </p>
                          </div>
                        </div>

                        {/* Summary Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-100">
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Đánh giá hiệu suất (KPI)</span>
                            <div className="flex items-center gap-1.5">
                              <div className="text-lg font-black text-[#005BAC]">{selectedEmp.kpi || 95}/100</div>
                              <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full font-bold">Xuất sắc</span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Thâm niên làm việc</span>
                            <div className="text-lg font-black text-slate-800">{calculateTenure(selectedEmp)}</div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Loại hợp đồng</span>
                            <div className="text-sm font-black text-slate-800 pt-0.5 leading-snug">
                              {getEmployeeContractType(selectedEmp)}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Trạng thái làm việc</span>
                            <div className="flex items-center gap-2 pt-1">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span className="text-xs font-bold text-slate-700">Đang hoạt động</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Sub-tabs specific to this employee */}
                    <div className="flex flex-wrap gap-1 text-xs font-bold bg-slate-100/80 p-1 rounded-2xl shrink-0 shadow-sm border border-slate-200/20">
                      {[
                        { id: "personal", label: "Thông tin cá nhân" },
                        // Lương & hợp đồng chứa dữ liệu tiền (lương BHXH, phụ cấp,
                        // tổng thu nhập) -> chỉ Admin / người có cờ "Xem lương & HĐLĐ".
                        // Kể cả hồ sơ của chính mình cũng không hiện (user chốt).
                        ...(hasFullAccess ? [
                          { id: "salary", label: "Thông tin lương" },
                          { id: "contract", label: "Thông tin HĐ" },
                        ] : []),
                        { id: "promotion", label: "Lộ trình thăng tiến" },
                        { id: "termination", label: "Nghỉ việc" },
                        { id: "concurrent", label: "Quản lý kiêm nhiệm" }
                      ].map(sub => (
                        <button
                          key={sub.id}
                          onClick={() => setActiveSubTab(sub.id)}
                          className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                            activeSubTab === sub.id 
                              ? "bg-white text-slate-850 shadow-sm" 
                              : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          {sub.label}
                        </button>
                      ))}
                    </div>

                    {/* Sub-tab Content Panel */}
                    <div className="space-y-6">
                      {activeSubTab === "personal" && (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Card 1: Contact & Personal */}
                            <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4 hover:shadow-lg transition-all duration-300">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                <Mail size={16} className="text-[#005BAC]" />
                                <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Thông tin liên hệ & Cá nhân</h4>
                              </div>
                              <div className="space-y-3.5 text-xs font-semibold text-slate-600">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Mã nhân viên</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.employee_code || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Giới tính</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.gender || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Ngày sinh</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.date_of_birth || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Số điện thoại</span>
                                  <span className="text-slate-800 font-bold">{selectedEmp.phone || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Email công việc</span>
                                  <span className="text-slate-800 font-bold break-all">{selectedEmp.email || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Bằng cấp / Học vấn</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.degree || "—"}</span>
                                </div>
                              </div>
                            </div>

                            {/* Card 2: Legal & Identity */}
                            <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4 hover:shadow-lg transition-all duration-300">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                <FileText size={16} className="text-[#005BAC]" />
                                <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Hồ sơ pháp lý & CCCD</h4>
                              </div>
                              <div className="space-y-3.5 text-xs font-semibold text-slate-600">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Số CCCD</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.cccd || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Ngày cấp</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.cccd_date || "—"}</span>
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-slate-400">Nơi cấp</span>
                                  <span className="text-slate-800 font-bold break-words">{selectedEmp.cccd_place || "—"}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 border-t border-slate-50 pt-2">
                                  <span className="text-slate-400">Địa chỉ thường trú</span>
                                  <span className="text-slate-800 font-bold break-words">{selectedEmp.permanent_address || "—"}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 border-t border-slate-50 pt-2">
                                  <span className="text-slate-400">Địa chỉ tạm trú</span>
                                  <span className="text-slate-800 font-bold break-words">{selectedEmp.temporary_address || "—"}</span>
                                </div>
                              </div>
                            </div>

                            {/* Card 3: Job & Emergency Info */}
                            <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4 hover:shadow-lg transition-all duration-300">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                <Briefcase size={16} className="text-[#005BAC]" />
                                <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Thông tin công việc & Khẩn cấp</h4>
                              </div>
                              <div className="space-y-3.5 text-xs font-semibold text-slate-600">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Chức vụ hiện tại</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.role || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Đơn vị trực thuộc</span>
                                  <span className="text-slate-800 font-bold">{selectedEmp.department || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Ngày gia nhập</span>
                                  <span className="text-slate-800 font-bold">
                                    {selectedEmp.start || (selectedEmp.created_at ? new Date(selectedEmp.created_at).toLocaleDateString("vi-VN") : "—")}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Trạng thái làm việc</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.status || "Chính thức"}</span>
                                </div>
                                <div className="flex flex-col gap-0.5 border-t border-slate-50 pt-2">
                                  <span className="text-slate-400">Liên hệ khẩn cấp</span>
                                  <span className="text-slate-800 font-bold break-words">
                                    {selectedEmp.emergency_contact_name ? (
                                      `${selectedEmp.emergency_contact_name} ${selectedEmp.emergency_contact_relationship ? `(${selectedEmp.emergency_contact_relationship})` : ""} - ${selectedEmp.emergency_contact_phone || "—"}`
                                    ) : "—"}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5 border-t border-slate-50 pt-2">
                                  <span className="text-slate-400">Ghi chú</span>
                                  <span className="text-slate-800 font-bold break-words italic">{selectedEmp.notes || "—"}</span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* KPI trend & Timeline */}
                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* KPI Trend Chart */}
                            <div className="lg:col-span-2 glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4 hover:shadow-lg transition-all duration-300">
                              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                <div className="flex items-center gap-2">
                                  <TrendingUp size={16} className="text-[#005BAC]" />
                                  <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Xu hướng hiệu suất (KPI 6 tháng)</h4>
                                </div>
                                <span className="text-[10px] bg-blue-50 text-[#005BAC] px-2.5 py-0.5 rounded-full font-bold">Trung bình: {selectedEmp.kpi || 95}/100</span>
                              </div>
                              <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={getKpiTrend(selectedEmp)} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.03)" vertical={false} />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                                    <YAxis domain={[60, 100]} tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                      contentStyle={{ 
                                        background: 'rgba(255, 255, 255, 0.95)', 
                                        border: 'none', 
                                        borderRadius: '12px', 
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                                        backdropFilter: 'blur(8px)',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        color: '#1E293B'
                                      }} 
                                    />
                                    <Line type="monotone" dataKey="KPI" stroke="#005BAC" strokeWidth={3} dot={{ r: 4, stroke: "#005BAC", strokeWidth: 2, fill: "#fff" }} activeDot={{ r: 6 }} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </div>

                            {/* Career Timeline */}
                            <div className="lg:col-span-1 glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4 hover:shadow-lg transition-all duration-300">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                <Clock size={16} className="text-[#005BAC]" />
                                <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Lộ trình sự nghiệp</h4>
                              </div>
                              <div className="relative border-l border-slate-200 pl-4 space-y-5 py-2 ml-1">
                                {getCareerTimeline(selectedEmp).map((milestone, idx) => {
                                  const MilestoneIcon = milestone.icon;
                                  return (
                                    <div key={idx} className="relative">
                                      <div className={`absolute -left-[25px] top-0.5 w-4.5 h-4.5 rounded-full ${milestone.color} text-white flex items-center justify-center shadow-sm`}>
                                        <MilestoneIcon size={10} />
                                      </div>
                                      <div>
                                        <span className="text-[9px] font-bold text-slate-400 block">{milestone.date}</span>
                                        <h5 className="font-bold text-xs text-slate-850 mt-0.5">{milestone.title}</h5>
                                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed mt-0.5">{milestone.description}</p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeSubTab === "salary" && (
                        <div className="space-y-6">
                          {/* Large Gross/Net numbers */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="glass bg-gradient-to-br from-[#005BAC]/5 to-blue-50/20 rounded-2xl p-6 border-transparent shadow-premium flex items-center justify-between hover-elevate">
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Lương cơ bản (Gross)</span>
                                <div className="text-2xl font-black text-[#005BAC]">
                                  {getEmployeeSalary(selectedEmp).base.toLocaleString("vi-VN")} đ
                                </div>
                              </div>
                              <span className="p-3 bg-blue-100/50 text-[#005BAC] rounded-xl"><DollarSign size={20} /></span>
                            </div>

                            <div className="glass bg-gradient-to-br from-emerald-50/10 to-emerald-500/5 rounded-2xl p-6 border-transparent shadow-premium flex items-center justify-between hover-elevate">
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Tổng phụ cấp tháng</span>
                                <div className="text-2xl font-black text-emerald-600">
                                  {(getEmployeeSalary(selectedEmp).phone + getEmployeeSalary(selectedEmp).lunch + getEmployeeSalary(selectedEmp).gas).toLocaleString("vi-VN")} đ
                                </div>
                              </div>
                              <span className="p-3 bg-emerald-100/50 text-emerald-600 rounded-xl"><Plus size={20} /></span>
                            </div>

                            <div className="glass bg-gradient-to-br from-indigo-50/10 to-indigo-600/5 rounded-2xl p-6 border-transparent shadow-premium flex items-center justify-between hover-elevate">
                              <div className="space-y-1">
                                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Thực nhận dự kiến (Net)</span>
                                <div className="text-2xl font-black text-indigo-600">
                                  {getEmployeeSalary(selectedEmp).total.toLocaleString("vi-VN")} đ
                                </div>
                              </div>
                              <span className="p-3 bg-indigo-100/50 text-indigo-600 rounded-xl"><CheckCircle size={20} /></span>
                            </div>
                          </div>

                          {/* Breakdown lists */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Allowances breakdown */}
                            <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4">
                              <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider border-b border-slate-100 pb-3">Chi tiết phụ cấp phúc lợi</h4>
                              <div className="space-y-4">
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-slate-500">Phụ cấp cơm trưa văn phòng</span>
                                    <span className="text-slate-800 font-bold">{getEmployeeSalary(selectedEmp).lunch.toLocaleString("vi-VN")} đ</span>
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                                    <div className="bg-[#005BAC] h-1.5 rounded-full" style={{ width: '100%' }}></div>
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-slate-500">Hỗ trợ xăng xe di chuyển</span>
                                    <span className="text-slate-800 font-bold">{getEmployeeSalary(selectedEmp).gas.toLocaleString("vi-VN")} đ</span>
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                                    <div className="bg-[#00AEEF] h-1.5 rounded-full" style={{ width: '60%' }}></div>
                                  </div>
                                </div>
                                <div className="space-y-1.5">
                                  <div className="flex justify-between text-xs font-semibold">
                                    <span className="text-slate-500">Phụ cấp cước điện thoại</span>
                                    <span className="text-slate-800 font-bold">{getEmployeeSalary(selectedEmp).phone.toLocaleString("vi-VN")} đ</span>
                                  </div>
                                  <div className="w-full bg-slate-100 rounded-full h-1.5">
                                    <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '30%' }}></div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Contributions and Deductions */}
                            <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4">
                              <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider border-b border-slate-100 pb-3">Khấu trừ & Trích đóng BHXH</h4>
                              <div className="space-y-3.5 text-xs font-semibold text-slate-600">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Lương trích đóng bảo hiểm</span>
                                  <span className="text-slate-800 font-bold">{getEmployeeSalary(selectedEmp).insurance.toLocaleString("vi-VN")} đ</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Khấu trừ BHXH cá nhân (8%)</span>
                                  <span className="text-rose-600 font-bold">-{Math.floor(getEmployeeSalary(selectedEmp).insurance * 0.08).toLocaleString("vi-VN")} đ</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Khấu trừ BHYT cá nhân (1.5%)</span>
                                  <span className="text-rose-600 font-bold">-{Math.floor(getEmployeeSalary(selectedEmp).insurance * 0.015).toLocaleString("vi-VN")} đ</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Khấu trừ BHTN cá nhân (1%)</span>
                                  <span className="text-rose-600 font-bold">-{Math.floor(getEmployeeSalary(selectedEmp).insurance * 0.01).toLocaleString("vi-VN")} đ</span>
                                </div>
                                <div className="border-t border-slate-100 pt-3 flex items-center justify-between font-bold text-slate-800">
                                  <span>Doanh nghiệp đóng thêm (21.5%)</span>
                                  <span className="text-emerald-600">+{Math.floor(getEmployeeSalary(selectedEmp).insurance * 0.215).toLocaleString("vi-VN")} đ</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {activeSubTab === "contract" && (() => {
                        // Single source of truth: pull the employee's contract straight from the
                        // tracking list (`contracts`). Any edit saved in "Hợp đồng nhân sự" refreshes
                        // `contracts`, so this profile view auto-syncs with the tracking table.
                        const fmtDate = (d: any) => {
                          if (!d) return "—";
                          const dt = new Date(d);
                          return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString("vi-VN");
                        };
                        const isRealNumber = (n: any) => !!n && !String(n).startsWith("IMPORT-");
                        const empCode = (selectedEmp.employee_code || "").toString().trim();
                        const matchedContracts = contracts.filter(c =>
                          (c.employee_id && c.employee_id === selectedEmp.id) ||
                          (empCode && (c.employee_code || "").toString().trim() === empCode) ||
                          (c.employee_name && selectedEmp.name && cleanName(c.employee_name) === cleanName(selectedEmp.name))
                        );
                        // Prefer the labour contract (real HĐLĐ number + sign date), then any real
                        // number, then whatever matched.
                        const empContract =
                          matchedContracts.find(c => isRealNumber(c.contract_number) && c.sign_date) ||
                          matchedContracts.find(c => isRealNumber(c.contract_number)) ||
                          matchedContracts[0] || null;
                        const contractNo = empContract && isRealNumber(empContract.contract_number)
                          ? empContract.contract_number
                          : (empContract?.probation_contract_number || "—");
                        return (
                        <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-6">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <div>
                              <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Hợp đồng lao động chính thức</h4>
                              <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Chi tiết các điều khoản hợp đồng lao động đã ký kết</p>
                            </div>
                            <button className="flex items-center gap-1.5 px-3.5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm">
                              <Download size={13} /> Tải PDF hợp đồng
                            </button>
                          </div>

                          {!empContract && (
                            <div className="text-[11px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                              Chưa có dữ liệu hợp đồng cho nhân viên này trong danh sách theo dõi. Hãy thêm/nhập ở tab “Hợp đồng nhân sự”.
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div className="bg-slate-50/50 p-4 rounded-xl space-y-3">
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-400">Số hợp đồng</span>
                                  <span className="text-mono text-slate-850 font-bold">{contractNo}</span>
                                </div>
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-400">Loại hợp đồng</span>
                                  <span className="text-slate-850 font-bold">{empContract?.type || "—"}</span>
                                </div>
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-400">Ngày ký hiệu lực</span>
                                  <span className="text-slate-850 font-bold">{fmtDate(empContract?.sign_date)}</span>
                                </div>
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-400">Ngày hết hạn dự kiến</span>
                                  <span className="text-slate-850 font-bold">{fmtDate(empContract?.expiration_date)}</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-l-2 border-[#005BAC] pl-2">Điều khoản quan trọng</h5>
                              <div className="space-y-2.5 text-xs font-semibold text-slate-600">
                                <p className="flex items-center gap-2">
                                  <CheckCircle size={13} className="text-emerald-500" /> 
                                  Thời giờ làm việc: 44 giờ/tuần (Sáng thứ 2 đến hết sáng thứ 7)
                                </p>
                                <p className="flex items-center gap-2">
                                  <CheckCircle size={13} className="text-emerald-500" /> 
                                  Số ngày nghỉ phép năm hưởng lương: 12 ngày/năm
                                </p>
                                <p className="flex items-center gap-2">
                                  <CheckCircle size={13} className="text-emerald-500" /> 
                                  Địa điểm làm việc: Trực thuộc Văn phòng đại diện hoặc Dự án chỉ định
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                        );
                      })()}

                      {activeSubTab === "promotion" && (
                        <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-6">
                          <div className="border-b border-slate-100 pb-4">
                            <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Lịch sử thăng tiến & Bổ nhiệm</h4>
                            <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Các quyết định điều động công tác, bổ nhiệm chức vụ và tăng bậc lương</p>
                          </div>

                          <div className="relative border-l border-slate-200 ml-4 pl-6 space-y-6 ml-1 py-1">
                            {(() => {
                              const matchingPromotions = MOCK_PROMOTIONS.filter(p => p.name === selectedEmp.name);
                              const list = matchingPromotions.length > 0 ? matchingPromotions : [
                                {
                                  name: selectedEmp.name,
                                  oldRole: "Nhân viên mới tuyển dụng",
                                  newRole: selectedEmp.role,
                                  oldDept: selectedEmp.department,
                                  newDept: selectedEmp.department,
                                  date: selectedEmp.created_at,
                                  type: "Ký HĐLĐ chính thức"
                                }
                              ];

                              return list.map((p, idx) => (
                                <div key={idx} className="relative">
                                  <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-blue-150 border-2 border-white flex items-center justify-center shadow-sm">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#005BAC]"></div>
                                  </div>
                                  <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 hover:bg-slate-50 transition-all space-y-1">
                                    <span className="text-[9px] font-black text-[#005BAC] uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-full">{p.type}</span>
                                    <h5 className="font-heading font-extrabold text-slate-850 text-xs mt-1.5">{p.name}</h5>
                                    <p className="text-[11px] text-slate-500 font-semibold mt-1">
                                      Vai trò cũ: <span className="text-slate-400">{p.oldRole} ({p.oldDept})</span>
                                    </p>
                                    <p className="text-[11px] text-slate-850 font-bold">
                                      Chức danh mới: <span className="text-[#005BAC]">{p.newRole} ({p.newDept})</span>
                                    </p>
                                    <p className="text-[10px] text-slate-450 font-bold mt-2">Ngày quyết định: {new Date(p.date).toLocaleDateString("vi-VN")}</p>
                                  </div>
                                </div>
                              ));
                            })()}
                          </div>
                        </div>
                      )}

                      {activeSubTab === "termination" && (
                        <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-6">
                          <div className="border-b border-slate-100 pb-4">
                            <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Hồ sơ thôi việc & Chấm dứt hợp đồng</h4>
                            <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Tiến trình giải quyết thủ tục thôi việc và bàn giao tài sản công ty</p>
                          </div>

                          {(() => {
                            const matchTerm = MOCK_TERMINATIONS.find(t => t.name === selectedEmp.name);
                            if (matchTerm) {
                              return (
                                <div className="space-y-4">
                                  <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 text-xs font-semibold text-rose-800 flex items-center gap-2">
                                    <AlertCircle size={15} />
                                    Nhân sự đang trong tiến trình nghỉ việc. Dự kiến kết thúc: {new Date(matchTerm.date).toLocaleDateString("vi-VN")}.
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3.5 text-xs font-semibold text-slate-600">
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Lý do nghỉ việc</span>
                                        <span className="text-slate-800 font-bold">{matchTerm.reason}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Tiến độ bàn giao công việc</span>
                                        <span className="text-slate-850 font-bold">{matchTerm.status}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-slate-400">Trợ cấp thôi việc dự kiến</span>
                                        <span className="text-slate-800 font-bold">{matchTerm.allowance.toLocaleString("vi-VN")} đ</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            } else {
                              return (
                                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                                  <CheckCircle size={36} className="text-emerald-500 bg-emerald-50 rounded-full p-1.5" />
                                  <h5 className="font-bold text-slate-850 text-sm mt-2">Nhân sự đang hoạt động tích cực</h5>
                                  <p className="text-slate-450 text-xs font-semibold max-w-sm">Không ghi nhận bất kỳ hồ sơ hoặc yêu cầu chấm dứt hợp đồng lao động nào đối với nhân sự này.</p>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      )}

                      {activeSubTab === "concurrent" && (
                        <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-6">
                          <div className="border-b border-slate-100 pb-4">
                            <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Thông tin kiêm nhiệm song song</h4>
                            <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Bổ nhiệm các chức danh kiêm nhiệm và chế độ phụ cấp bổ sung</p>
                          </div>

                          {(() => {
                            const matchConc = MOCK_CONCURRENTS.find(c => c.name === selectedEmp.name);
                            if (matchConc) {
                              return (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="bg-blue-50/10 border border-blue-100/50 rounded-2xl p-5 space-y-3.5">
                                    <div className="flex justify-between text-xs font-semibold">
                                      <span className="text-slate-400">Vai trò kiêm nhiệm</span>
                                      <span className="text-[#005BAC] font-black">{matchConc.concurrent}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-semibold">
                                      <span className="text-slate-400">Khối/Phòng phụ trách</span>
                                      <span className="text-slate-850 font-bold">{matchConc.dept}</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-semibold">
                                      <span className="text-slate-400">Phụ cấp bổ sung tháng</span>
                                      <span className="text-emerald-600 font-bold">+{matchConc.allowance.toLocaleString("vi-VN")} đ</span>
                                    </div>
                                    <div className="flex justify-between text-xs font-semibold">
                                      <span className="text-slate-400">Ngày quyết định bổ nhiệm</span>
                                      <span className="text-slate-800 font-bold">{new Date(matchConc.date).toLocaleDateString("vi-VN")}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            } else {
                              return (
                                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                                  <Shield size={36} className="text-slate-400 bg-slate-50 rounded-full p-2" />
                                  <h5 className="font-bold text-slate-700 text-sm mt-2">Không kiêm nhiệm</h5>
                                  <p className="text-slate-450 text-xs font-semibold max-w-sm">Hiện tại nhân sự chỉ phụ trách chuyên môn chính theo chức danh quy định, không kiêm nhiệm vị trí khác.</p>
                                </div>
                              );
                            }
                          })()}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="glass bg-white rounded-3xl p-12 text-center text-slate-400 text-xs italic shadow-premium border-transparent">
                    Vui lòng chọn một nhân sự từ danh sách bên trái để xem hồ sơ chi tiết.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── TAB 2: CHẤM CÔNG ─── */}
          {activeTab === "attendance" && (
            <div className="space-y-6">
              {activeSubTab === "machine" && canViewTimesheetSummary && (
                <div className="space-y-6">
                  {/* CARD 1: ĐỒNG BỘ TRỰC TIẾP TỪ MÁY CHẤM CÔNG */}
                  <div className="glass bg-white rounded-2xl border border-slate-200/50 shadow-premium overflow-hidden">
                    {/* Header banner gradient */}
                    <div className="p-6 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0ea5e9 0%,#2563eb 55%,#4f46e5 100%)" }}>
                      <div className="absolute -right-6 -top-8 opacity-15 select-none pointer-events-none">
                        <Fingerprint size={150} />
                      </div>
                      <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <span className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Fingerprint size={20} /></span>
                          <div>
                            <h3 className="font-heading font-black text-base leading-tight">Dữ liệu máy chấm công vân tay</h3>
                            <p className="text-white/80 text-xs font-medium mt-0.5">
                              {latestAttendanceImport
                                ? `Lấy từ bảng công tháng ${latestAttendanceImport.month} đã tải lên: ${latestAttendanceImport.file_name}`
                                : "Chưa có bảng công nào được tải lên hệ thống"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 space-y-5">

                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {filteredAttendanceLogs.length > 0
                          ? `Bản ghi chấm công ngày ${formatDayKey(filteredAttendanceLogs[0].dateKey)}${machineFilterFrom || machineFilterTo ? " (theo bộ lọc)" : " (gần nhất)"}`
                          : "Bản ghi chấm công"}
                      </h4>
                      {filteredAttendanceLogs.length === 0 && (
                        <div className="text-slate-400 text-xs italic py-4 text-center bg-slate-50 rounded-2xl border border-slate-100">
                          Chưa có dữ liệu chấm công. Vui lòng tải file Excel từ máy chấm công lên ở khối bên dưới và bấm "Lưu bảng công này".
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                              <th className="py-2.5 px-3">Ngày</th>
                              <th className="py-2.5 px-3">Họ và tên</th>
                              <th className="py-2.5 px-3 text-center">Giờ vào (Check-in)</th>
                              <th className="py-2.5 px-3 text-center">Giờ ra (Check-out)</th>
                              <th className="py-2.5 px-3 text-center">Tổng giờ làm</th>
                              <th className="py-2.5 px-3 text-center">Trạng thái công</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                            {visibleAttendanceLogs.map((log, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-3 px-3 font-semibold">{formatDayKey(log.dateKey)}</td>
                                <td className="py-3 px-3 font-bold text-slate-800">{log.name}</td>
                                <td className="py-3 px-3 text-center font-mono font-bold text-emerald-600">{log.checkin}</td>
                                <td className="py-3 px-3 text-center font-mono font-bold text-[#005BAC]">{log.checkout}</td>
                                <td className="py-3 px-3 text-center">{log.hours} tiếng</td>
                                <td className="py-3 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    log.status === "Đúng giờ" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                  }`}>{log.status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {filteredAttendanceLogs.length > MACHINE_LOGS_PREVIEW_COUNT && (
                        <button
                          onClick={() => setShowAllMachineLogs(v => !v)}
                          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-150 text-slate-600 font-bold text-[11px] cursor-pointer transition-all active:scale-[0.99]"
                        >
                          {showAllMachineLogs ? (
                            <>
                              <ChevronUp size={13} /> Thu gọn
                            </>
                          ) : (
                            <>
                              <ChevronDown size={13} /> Xem thêm {filteredAttendanceLogs.length - MACHINE_LOGS_PREVIEW_COUNT} bản ghi
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    </div>
                  </div>

                  {/* CARD 2: PHÂN PHỐI BẢNG CÔNG HÀNG THÁNG QUA EMAIL */}
                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                      <div>
                        <h3 className="font-heading font-extrabold text-slate-800 text-sm">PHÂN PHỐI BẢNG CÔNG HÀNG THÁNG QUA EMAIL</h3>
                        <p className="text-slate-400 text-[10px] font-semibold mt-1">Tải lên file Excel từ máy chấm công để tự động tổng hợp ngày công và gửi email báo cáo chi tiết cho từng nhân viên.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {parsedEmployees.length > 0 && canViewTimesheetSummary && (
                          <button
                            onClick={() => setShowTimesheetMatrixModal(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer border border-indigo-100"
                          >
                            <FileText size={13} />
                            Bảng tổng hợp ngày công trong tháng
                          </button>
                        )}
                        {canViewTimesheetSummary && (
                          <button
                            onClick={() => setShowEmailConfigModal(true)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer"
                          >
                            <Settings size={13} />
                            {smtpConfig.user ? `SMTP: ${smtpConfig.user}` : "Cấu hình gửi email"}
                          </button>
                        )}
                        {parsedEmployees.length > 0 && (
                          <>
                            <button
                              onClick={handleSaveTimesheetToDb}
                              disabled={isSavingTimesheet}
                              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow disabled:opacity-50"
                            >
                              {isSavingTimesheet ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" /> Đang lưu...
                                </>
                              ) : (
                                <>
                                  <FileText size={13} /> Lưu bảng công này
                                </>
                              )}
                            </button>
                            <button
                              onClick={handleSendAllEmails}
                              disabled={isSendingAllEmails}
                              className="flex items-center gap-2 px-4 py-1.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow disabled:opacity-50"
                            >
                              {isSendingAllEmails ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" /> Đang gửi...
                                </>
                              ) : (
                                <>
                                  <Mail size={13} /> Gửi tất cả ({parsedEmployees.filter(e => e.emailFound && e.email && e.emailStatus !== "success").length})
                                </>
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* UPLOAD BOX */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-center">
                      <div className="md:col-span-2">
                        <label className="border-2 border-dashed border-slate-200 hover:border-[#005BAC]/50 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all bg-slate-50/50 hover:bg-blue-50/10 group relative">
                          <input
                            type="file"
                            accept=".xlsx, .xls"
                            className="hidden"
                            onChange={handleUploadExcel}
                            disabled={isParsingExcel}
                          />
                          {isParsingExcel ? (
                            <>
                              <Loader2 size={28} className="text-[#005BAC] animate-spin mb-2" />
                              <span className="text-xs font-bold text-slate-700">Đang phân tích file Excel chấm công...</span>
                            </>
                          ) : (
                            <>
                              <UploadCloud size={28} className="text-slate-400 group-hover:text-[#005BAC] transition-all mb-2" />
                              <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-all">
                                {excelFileName ? `Đã chọn: ${excelFileName}` : "Kéo thả hoặc click để chọn file Excel máy chấm công"}
                              </span>
                              <span className="text-[10px] text-slate-400 font-semibold mt-1 font-sans">Hỗ trợ định dạng .xlsx, .xls</span>
                            </>
                          )}
                        </label>
                      </div>

                      {/* STATS */}
                      <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-150">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Thông tin tóm tắt</h4>
                        <div className="grid grid-cols-2 gap-2.5 text-xs">
                          <div className="relative p-3 rounded-xl text-white shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
                            <Users size={26} className="absolute -right-1 -bottom-1 opacity-20" />
                            <div className="text-[9px] font-bold opacity-80 uppercase tracking-wider">Số nhân viên</div>
                            <div className="text-xl font-black leading-none mt-1">{parsedEmployees.length}</div>
                          </div>
                          <div className="relative p-3 rounded-xl text-white shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg,#0ea5e9,#2563eb)" }}>
                            <Calendar size={26} className="absolute -right-1 -bottom-1 opacity-20" />
                            <div className="text-[9px] font-bold opacity-80 uppercase tracking-wider">Tháng chấm công</div>
                            <div className="text-xl font-black leading-none mt-1">{timesheetMonth || "--/----"}</div>
                          </div>
                          <div className="relative p-3 rounded-xl text-white shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                            <CheckCircle size={26} className="absolute -right-1 -bottom-1 opacity-20" />
                            <div className="text-[9px] font-bold opacity-80 uppercase tracking-wider">Đã khớp email</div>
                            <div className="text-xl font-black leading-none mt-1">{parsedEmployees.filter(e => e.emailFound).length}</div>
                          </div>
                          <div className="relative p-3 rounded-xl text-white shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)" }}>
                            <AlertCircle size={26} className="absolute -right-1 -bottom-1 opacity-20" />
                            <div className="text-[9px] font-bold opacity-80 uppercase tracking-wider">Chưa có email</div>
                            <div className="text-xl font-black leading-none mt-1">{parsedEmployees.filter(e => !e.emailFound).length}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* TABLE PREVIEW */}
                    {parsedEmployees.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-slate-100">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 bg-slate-50/50 p-3 rounded-2xl border border-slate-150">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Danh sách nhân viên nhận diện từ Excel</h4>
                            {excelSearchQuery && (
                              <span className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100">
                                Tìm thấy {filteredExcelEmployees.length}/{parsedEmployees.length} nhân viên
                              </span>
                            )}
                            {parsedEmployees.filter(e => !e.emailFound).length > 0 && !excelSearchQuery && (
                              <span className="text-[10px] text-amber-600 font-bold bg-amber-50 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                <AlertCircle size={10} /> Có {parsedEmployees.filter(e => !e.emailFound).length} nhân viên chưa có email. Vui lòng cập nhật trực tiếp tại dòng tương ứng.
                              </span>
                            )}
                          </div>
                          <div className="relative w-full md:w-72">
                            <Search size={13} className="absolute left-3 top-2.5 text-slate-400" />
                            <input
                              type="text"
                              value={excelSearchQuery}
                              onChange={(e) => setExcelSearchQuery(e.target.value)}
                              placeholder="Tìm kiếm nhanh nhân viên..."
                              className="w-full border border-slate-200 rounded-xl py-1.5 pl-8 pr-4 text-xs font-semibold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-xs"
                            />
                          </div>
                        </div>

                        <div className="overflow-x-auto border border-slate-100 rounded-xl">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-250 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                                <th className="py-2.5 px-3">Mã NV / Họ và tên</th>
                                <th className="py-2.5 px-3">Phòng ban</th>
                                <th className="py-2.5 px-3 text-center">Tổng công</th>
                                <th className="py-2.5 px-3 text-center">Trễ (phút)</th>
                                <th className="py-2.5 px-3 text-center">Sớm (phút)</th>
                                <th className="py-2.5 px-3 text-center">Tăng ca (giờ)</th>
                                <th className="py-2.5 px-3 w-64">Email nhận báo cáo</th>
                                <th className="py-2.5 px-3 text-center">Trạng thái gửi</th>
                                <th className="py-2.5 px-3 text-center">Hành động</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                              {filteredExcelEmployees.map((emp) => (
                                <tr key={emp.employeeCode} className="hover:bg-slate-50/50">
                                  <td className="py-3 px-3">
                                    <div className="font-bold text-slate-800">{emp.name}</div>
                                    <div className="text-[10px] text-slate-400 font-bold font-mono uppercase">{emp.employeeCode}</div>
                                  </td>
                                  <td className="py-3 px-3 text-slate-500">{emp.department || "Chưa phân loại"}</td>
                                  <td className="py-3 px-3 text-center font-bold text-slate-800">{getOfficialWorkdays(emp)} ngày</td>
                                  <td className="py-3 px-3 text-center text-amber-600 font-bold">{emp.totalLate}</td>
                                  <td className="py-3 px-3 text-center text-orange-500 font-bold">{emp.totalEarly}</td>
                                  <td className="py-3 px-3 text-center text-emerald-600 font-bold">{emp.totalOvertime}</td>
                                  <td className="py-3 px-3">
                                    <div className="relative flex items-center">
                                      <input
                                        type="email"
                                        value={emp.email}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setParsedEmployees(prev => prev.map(p => 
                                            p.employeeCode === emp.employeeCode ? { ...p, email: val, emailFound: !!val } : p
                                          ));
                                        }}
                                        className={`w-full px-2 py-1 bg-slate-50 border rounded-lg text-xs font-semibold focus:bg-white outline-none transition-all ${
                                          emp.emailFound ? "border-slate-200 focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC]" : "border-amber-300 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                                        }`}
                                        placeholder="Nhập email thủ công..."
                                      />
                                      {!emp.emailFound && (
                                        <AlertTriangle size={12} className="text-amber-500 absolute right-2 pointer-events-none animate-pulse" />
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    {emp.emailStatus === "idle" && (
                                      <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold">Chờ gửi</span>
                                    )}
                                    {emp.emailStatus === "sending" && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[9px] font-bold flex items-center justify-center gap-1 max-w-[80px] mx-auto">
                                        <Loader2 size={10} className="animate-spin" /> Đang gửi
                                      </span>
                                    )}
                                    {emp.emailStatus === "success" && (
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-bold">Thành công</span>
                                    )}
                                    {emp.emailStatus === "error" && (
                                      <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded-full text-[9px] font-bold border border-rose-200 cursor-pointer" title={emp.emailMessage}>
                                        Lỗi gửi
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-3 text-center">
                                    <div className="flex items-center justify-center gap-1.5">
                                      <button
                                        onClick={() => setSelectedEmployeeForDetail(emp)}
                                        className="p-1.5 text-slate-500 hover:text-[#005BAC] hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                                        title="Xem chi tiết bảng công"
                                      >
                                        <Eye size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleSendEmail(emp)}
                                        disabled={emp.emailStatus === "sending"}
                                        className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                          emp.emailStatus === "success" 
                                            ? "text-emerald-600 hover:bg-emerald-50" 
                                            : "text-slate-500 hover:text-emerald-600 hover:bg-emerald-50"
                                        }`}
                                        title="Gửi báo cáo email"
                                      >
                                        <Send size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* FOLDER DIRECTORY TREE */}
                    {canViewTimesheetSummary && (
                    <div className="space-y-3 pt-5 border-t border-slate-100">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thư mục lưu trữ bảng công trên phần mềm</h4>
                      {importedTimesheets.length === 0 ? (
                        <div className="text-slate-400 text-xs italic py-4 text-center bg-slate-50 rounded-2xl border border-slate-100">
                          Chưa có bảng công nào được lưu trữ trên phần mềm. Vui lòng tải lên file Excel và bấm "Lưu bảng công này" để lưu trữ.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {Object.entries(timesheetTree).map(([year, months]) => (
                            <div key={year} className="bg-slate-50 border border-slate-150 p-4 rounded-2xl space-y-3">
                              <div className="flex items-center gap-2 text-slate-800 font-extrabold text-xs">
                                <span className="text-amber-500 text-sm">📁</span> Năm {year}
                              </div>
                              <div className="pl-4 space-y-3 border-l border-slate-200">
                                {Object.entries(months).map(([monthName, files]) => (
                                  <div key={monthName} className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-slate-600 font-bold text-xs">
                                      <span className="text-amber-400 text-sm">📁</span> {monthName}
                                    </div>
                                    <div className="pl-4 space-y-1.5">
                                      {files.map((file) => (
                                        <div key={file.id} className="bg-white border border-slate-100 p-2.5 rounded-xl flex items-center justify-between gap-3 shadow-xs hover:border-[#005BAC]/30 transition-all">
                                          <div className="min-w-0 flex-1">
                                            <div className="text-[11px] font-bold text-slate-700 truncate" title={file.file_name}>
                                              {file.file_name}
                                            </div>
                                            <div className="text-[9px] text-slate-400 font-semibold mt-0.5">
                                              Đã lưu: {new Date(file.created_at).toLocaleDateString("vi-VN")} | {file.parsed_data?.length || 0} nhân sự
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <button
                                              onClick={() => {
                                                const enrichedData = (file.parsed_data || []).map((emp: any) => {
                                                  const cleanCode = (c: string) => String(c || "").replace(/^0+/, "").trim();
                                                  const normName = normalizeText(emp.name || "");
                                                  if (normName === "nttquyen" || normName === "n.t.t.quyen" || cleanCode(emp.employeeCode) === "5897") {
                                                    return {
                                                      ...emp,
                                                      name: "Nguyễn Trương Thùy Quyên - CV Tuyển dụng",
                                                      department: emp.department && emp.department !== "Chưa phân loại" ? emp.department : "Phòng Hành Chính Nhân Sự",
                                                      email: emp.email && emp.email !== "Nhập email thủ công..." ? emp.email : "quyenntt@trungnamgroup.com.vn, quyen.0408@gmail.com",
                                                      emailFound: true
                                                    };
                                                  }
                                                  return emp;
                                                });
                                                setParsedEmployees(enrichedData);
                                                setTimesheetMonth(file.month);
                                                setExcelFileName(file.file_name);
                                                // Clear current file object as we are loading from db
                                                setCurrentFileObject(null);
                                                alert(`Đã tải dữ liệu bảng công Tháng ${file.month} từ cơ sở dữ liệu!`);
                                              }}
                                              className="p-1 text-slate-500 hover:text-[#005BAC] hover:bg-blue-50 rounded transition-all cursor-pointer"
                                              title="Xem dữ liệu bảng công"
                                            >
                                              <Eye size={13} />
                                            </button>
                                            {file.file_url && (
                                              <a
                                                href={file.file_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="p-1 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all cursor-pointer flex items-center justify-center"
                                                title="Tải xuống file Excel gốc"
                                              >
                                                <Download size={13} />
                                              </a>
                                            )}
                                            <button
                                              onClick={() => handleDeleteTimesheet(file.id, file.file_path)}
                                              className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded transition-all cursor-pointer"
                                              title="Xóa bảng công"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    )}
                  </div>

                </div>
              )}

              {activeSubTab === "explanation" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4 overflow-hidden">
                  <div className="-mx-6 -mt-6 mb-2 px-6 py-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#f59e0b 0%,#f97316 60%,#ef4444 100%)" }}>
                    <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><AlertTriangle size={120} /></div>
                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><AlertTriangle size={18} /></span>
                        <div>
                          <h3 className="font-heading font-black text-base leading-tight">Giải trình sai lệch công / quên quét thẻ</h3>
                          <p className="text-white/80 text-xs font-medium mt-0.5">Phê duyệt &amp; đối soát lý do sai lệch hoặc bổ sung giờ check-in/check-out</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowExplanationAddForm(!showExplanationAddForm)}
                        className="flex items-center justify-center gap-1.5 px-4 py-2 bg-white/95 hover:bg-white text-orange-700 font-bold rounded-xl cursor-pointer text-xs transition-all shadow-md active:scale-95 shrink-0 self-start sm:self-auto"
                      >
                        {showExplanationAddForm ? <X size={13} /> : <Plus size={13} />}
                        {showExplanationAddForm ? "Đóng biểu mẫu" : "Thêm mới giải trình"}
                      </button>
                    </div>
                  </div>

                  {/* Biểu mẫu Thêm mới giải trình */}
                  {showExplanationAddForm && (
                    <form onSubmit={handleAddExplanation} className="bg-slate-50/60 border border-slate-200/60 rounded-xl p-4 space-y-3 transition-all">
                      <div className="text-xs font-bold text-[#005BAC] uppercase tracking-wider border-b border-slate-200/50 pb-1.5 flex items-center gap-1.5">
                        <Plus size={13} /> Thêm mới thông tin giải trình
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Ngày giải trình */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Ngày giải trình *</label>
                          <div className="relative">
                            <Calendar size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                            <input
                              type="date"
                              required
                              value={expFormDate}
                              onChange={(e) => setExpFormDate(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                            />
                          </div>
                        </div>

                        {/* Chọn nhân viên */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Chọn nhân viên *</label>
                          <select
                            value={expFormEmployeeId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setExpFormEmployeeId(val);
                              if (val === "custom") {
                                setExpFormEmployeeName("");
                                setExpFormDepartment("");
                                setExpFormApprover("");
                              } else {
                                const emp = employees.find(emp => emp.id === val);
                                if (emp) {
                                  setExpFormEmployeeName(emp.name);
                                  setExpFormDepartment(emp.department || "Phòng HCNS");
                                  // Auto-fill manager
                                  const managerName = getManagerForDepartment(emp.department);
                                  setExpFormApprover(managerName);
                                }
                              }
                            }}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                          >
                            <option value="">-- Chọn nhân viên --</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>
                                {emp.name} ({emp.department})
                              </option>
                            ))}
                            <option value="custom">Khác (Nhập thủ công)</option>
                          </select>
                        </div>

                        {/* Tên nhân viên (nếu nhập thủ công) */}
                        {expFormEmployeeId === "custom" ? (
                          <div className="space-y-1">
                            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Họ và tên nhân viên *</label>
                            <input
                              type="text"
                              required
                              placeholder="Nhập họ tên..."
                              value={expFormEmployeeName}
                              onChange={(e) => setExpFormEmployeeName(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                            />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Phòng ban (Tự động)</label>
                            <input
                              type="text"
                              disabled
                              value={expFormDepartment}
                              className="w-full px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-500 outline-none"
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Phòng ban (nếu nhập thủ công) */}
                        {expFormEmployeeId === "custom" && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Phòng ban *</label>
                            <input
                              type="text"
                              required
                              placeholder="Nhập tên phòng ban..."
                              value={expFormDepartment}
                              onChange={(e) => setExpFormDepartment(e.target.value)}
                              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                            />
                          </div>
                        )}

                        {/* Lý do giải trình */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Lý do giải trình *</label>
                          <input
                            type="text"
                            required
                            placeholder="Ví dụ: Quên quét vân tay lúc về..."
                            value={expFormReason}
                            onChange={(e) => setExpFormReason(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                          />
                        </div>

                        {/* Khung giờ đề xuất */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Khung giờ đề xuất *</label>
                          <input
                            type="text"
                            required
                            placeholder="Ví dụ: Checkout 17:00, Cả ngày công tác..."
                            value={expFormPropose}
                            onChange={(e) => setExpFormPropose(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                          />
                        </div>

                        {/* Người phê duyệt */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">Người phê duyệt (Trưởng phòng) *</label>
                          <input
                            type="text"
                            required
                            placeholder="Tên trưởng phòng phê duyệt..."
                            value={expFormApprover}
                            onChange={(e) => setExpFormApprover(e.target.value)}
                            className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/50">
                        <button
                          type="button"
                          onClick={() => {
                            setShowExplanationAddForm(false);
                            setExpFormReason("");
                            setExpFormPropose("");
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer text-[10px] transition-all"
                        >
                          Hủy bỏ
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingExplanation}
                          className="flex items-center gap-1.5 px-4 py-1.5 bg-[#005BAC] hover:bg-[#004b90] text-white font-bold rounded-lg cursor-pointer text-[10px] transition-all disabled:opacity-50 shadow-md shadow-blue-500/5"
                        >
                          {isSubmittingExplanation ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                          Lưu giải trình
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Ngày giải trình</th>
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Phòng ban</th>
                          <th className="py-3 px-3">Lý do giải trình</th>
                          <th className="py-3 px-3">Khung giờ đề xuất</th>
                          <th className="py-3 px-3">Người phê duyệt</th>
                          <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
                          <th className="py-3 px-3 w-28 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {loadingExplanations ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-400">
                              <div className="flex justify-center items-center gap-2">
                                <Loader2 size={14} className="animate-spin text-[#005BAC]" />
                                Đang tải danh sách giải trình...
                              </div>
                            </td>
                          </tr>
                        ) : filteredExplanations.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-400 italic">
                              Chưa có thông tin giải trình nào phù hợp.
                            </td>
                          </tr>
                        ) : (
                          filteredExplanations.map((e, idx) => {
                            const canApprove = hasFullAccess || (currentUser && currentUser.name === e.approver);
                            const canDelete = hasFullAccess || (currentUser && currentUser.name === e.name);
                            const recordId = e.id || idx;
                            return (
                              <tr key={recordId} className="hover:bg-slate-50/50">
                                <td className="py-3.5 px-3 font-semibold">{new Date(e.date).toLocaleDateString("vi-VN")}</td>
                                <td className="py-3.5 px-3 text-slate-800 font-bold">{e.name}</td>
                                <td className="py-3.5 px-3 text-slate-500 font-medium">{e.department || "Phòng HCNS"}</td>
                                <td className="py-3.5 px-3 text-slate-550 italic font-medium">{e.reason}</td>
                                <td className="py-3.5 px-3 font-mono text-[#005BAC]">{e.propose}</td>
                                <td className="py-3.5 px-3 text-slate-650 font-medium">{e.approver || tenantCfg.hcns_head_name}</td>
                                <td className="py-3.5 px-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                    e.status === "Đã duyệt" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                                  }`}>{e.status === "Chờ duyệt" ? "Chưa duyệt" : (e.status || "Chưa duyệt")}</span>
                                </td>
                                <td className="py-3.5 px-3 text-center">
                                  <div className="flex items-center justify-center">
                                    {canDelete ? (
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteExplanation(recordId)}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200/60 hover:border-rose-200 transition-all cursor-pointer flex items-center justify-center shadow-sm active:scale-90"
                                        title="Xóa giải trình"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    ) : (
                                      <span className="text-[9px] text-slate-400 italic">Không có quyền</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "leave" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6 overflow-hidden">
                  <div className="-mx-6 -mt-6 mb-1 px-6 py-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#10b981 0%,#14b8a6 55%,#0ea5e9 100%)" }}>
                    <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><Calendar size={120} /></div>
                    <div className="relative flex items-center gap-3">
                      <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Calendar size={18} /></span>
                      <div>
                        <h3 className="font-heading font-black text-base leading-tight">Quản lý nghỉ phép năm</h3>
                        <p className="text-white/80 text-xs font-medium mt-0.5">Theo dõi hạn mức, ngày đã nghỉ &amp; số phép còn lại của nhân sự</p>
                      </div>
                    </div>
                  </div>

                  {/* Thống kê nhanh phép năm */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="relative p-4 rounded-2xl text-white shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg,#6366f1,#4f46e5)" }}>
                      <Users size={40} className="absolute -right-2 -bottom-2 opacity-15" />
                      <div className="text-[10px] font-black opacity-80 uppercase tracking-wider">Nhân sự áp dụng</div>
                      <div className="text-xl font-extrabold mt-1">{annualLeaveData.filter(d => !d.isConcurrent).length} nhân viên</div>
                    </div>
                    <div className="relative p-4 rounded-2xl text-white shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg,#0ea5e9,#2563eb)" }}>
                      <Calendar size={40} className="absolute -right-2 -bottom-2 opacity-15" />
                      <div className="text-[10px] font-black opacity-80 uppercase tracking-wider">Tổng ngày phép cấp</div>
                      <div className="text-xl font-extrabold mt-1">{annualLeaveData.reduce((sum, d) => sum + d.totalLeave, 0)} ngày</div>
                    </div>
                    <div className="relative p-4 rounded-2xl text-white shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
                      <CheckCircle size={40} className="absolute -right-2 -bottom-2 opacity-15" />
                      <div className="text-[10px] font-black opacity-80 uppercase tracking-wider">Tổng ngày đã nghỉ</div>
                      <div className="text-xl font-extrabold mt-1">{annualLeaveData.reduce((sum, d) => sum + d.usedLeave, 0)} ngày</div>
                    </div>
                    <div className="relative p-4 rounded-2xl text-white shadow-sm overflow-hidden" style={{ background: "linear-gradient(135deg,#8b5cf6,#7c3aed)" }}>
                      <Award size={40} className="absolute -right-2 -bottom-2 opacity-15" />
                      <div className="text-[10px] font-black opacity-80 uppercase tracking-wider">Tổng ngày còn lại</div>
                      <div className="text-xl font-extrabold mt-1">{annualLeaveData.reduce((sum, d) => sum + d.remainingLeave, 0)} ngày</div>
                    </div>
                  </div>

                  {/* Header & Mode Switch */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-150 pb-3 gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex bg-[#005BAC]/5 p-1 rounded-xl border border-blue-100/20">
                        <button
                          type="button"
                          onClick={() => setLeaveTabMode("quota")}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            leaveTabMode === "quota" 
                              ? "bg-white text-[#005BAC] border-blue-100/60 shadow-sm" 
                              : "bg-transparent border-transparent text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Hạn mức phép năm
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeaveTabMode("history")}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                            leaveTabMode === "history" 
                              ? "bg-white text-[#005BAC] border-blue-100/60 shadow-sm" 
                              : "bg-transparent border-transparent text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Lịch sử nghỉ phép
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-1 items-center justify-end gap-3 flex-wrap sm:flex-nowrap">
                      {/* Bộ tìm kiếm nhân viên */}
                      <div className="relative w-full sm:w-64">
                        <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Tìm tên nhân viên..."
                          value={leaveSearchQuery}
                          onChange={(e) => setLeaveSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none text-xs font-semibold transition-all"
                        />
                        {leaveSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setLeaveSearchQuery("")}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          window.location.href = "/calendar?action=request_leave";
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#005BAC] hover:bg-[#004b90] text-white font-bold rounded-lg cursor-pointer text-[10px] transition-all shadow-md shadow-blue-500/10 active:scale-95 shrink-0"
                      >
                        <Plus size={12} /> Đăng ký nghỉ phép
                      </button>
                    </div>
                  </div>

                  {/* Hiển thị bảng theo mode */}
                  {leaveTabMode === "quota" && (
                    <div className="overflow-x-auto border border-slate-150 rounded-2xl">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3 w-10 text-center">STT</th>
                            <th className="py-3 px-3">Nhân viên</th>
                            <th className="py-3 px-3">Phòng ban & Chức danh</th>
                            <th className="py-3 px-3 text-center">Ngày nhận việc</th>
                            <th className="py-3 px-3 text-center">Thâm niên</th>
                            {/* Phép cơ bản KHÔNG còn là định mức 12 ngày cả năm mà là
                                số đã tích luỹ tới tháng này — ghi rõ để HCNS khỏi hiểu nhầm. */}
                            <th className="py-3 px-3 text-center">
                              Phép cơ bản
                              <div className="normal-case tracking-normal text-[9px] font-bold text-slate-400 mt-0.5">
                                tích luỹ đến tháng {new Date().getMonth() + 1}
                              </div>
                            </th>
                            <th className="py-3 px-3 text-center">Phép thâm niên</th>
                            <th className="py-3 px-3 text-center">Tổng phép</th>
                            <th className="py-3 px-3 text-center">Đã nghỉ</th>
                            <th className="py-3 px-3 text-center">Còn lại</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {searchedAnnualLeaveData.map((d, idx) => (
                            <tr key={d.id} className="hover:bg-slate-50/50">
                              <td className="py-3.5 px-3 text-center text-slate-400">{idx + 1}</td>
                              <td className="py-3.5 px-3 text-slate-805 font-bold text-slate-800">{d.name}</td>
                              <td className="py-3.5 px-3 text-slate-500">
                                {d.department} <span className="text-[10px] text-slate-400">({d.role})</span>
                              </td>
                              <td className="py-3.5 px-3 text-center font-mono text-slate-550">
                                {d.created_at ? new Date(d.created_at).toLocaleDateString("vi-VN") : "--"}
                              </td>
                              <td className="py-3.5 px-3 text-center text-slate-800">{d.tenureStr}</td>
                              <td className="py-3.5 px-3 text-center text-slate-500">
                                {d.isConcurrent ? "0 ngày" : `${d.baseLeave} ngày`}
                              </td>
                              <td className="py-3.5 px-3 text-center text-slate-500">
                                {d.isConcurrent ? "0 ngày" : `+${d.seniorLeave} ngày`}
                              </td>
                              {/* Admin bấm vào số để sửa tay. Bỏ trống ô rồi lưu là
                                  gỡ ghi đè, quay về công thức 12 + thâm niên. */}
                              <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                                {d.isConcurrent ? (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-400 border border-slate-200/40 rounded text-[9px] font-bold">Kiêm nhiệm/Hỗ trợ</span>
                                ) : editingLeaveQuotaId === d.id ? (
                                  <input
                                    type="number"
                                    min={0}
                                    autoFocus
                                    disabled={savingLeaveQuota}
                                    value={leaveQuotaDraft}
                                    onChange={(e) => setLeaveQuotaDraft(e.target.value)}
                                    onBlur={() => handleSaveLeaveQuota(d.id)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") e.currentTarget.blur();
                                      if (e.key === "Escape") {
                                        cancelLeaveQuotaRef.current = true;
                                        setEditingLeaveQuotaId(null);
                                      }
                                    }}
                                    placeholder="Tự tính"
                                    className="w-20 px-2 py-1 text-center text-xs font-bold border border-[#005BAC] rounded-lg outline-none disabled:opacity-50"
                                  />
                                ) : currentUser?.isAdmin ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLeaveQuotaDraft(d.hasOverride ? String(d.totalLeave) : "");
                                      setEditingLeaveQuotaId(d.id);
                                    }}
                                    title="Bấm để sửa tay số phép năm"
                                    className={`px-2 py-0.5 rounded-lg border border-dashed transition-colors cursor-pointer ${
                                      d.hasOverride
                                        ? "border-[#005BAC] text-[#005BAC] bg-blue-50/60"
                                        : "border-slate-300 text-slate-800 hover:bg-slate-100"
                                    }`}
                                  >
                                    {d.totalLeave} ngày
                                  </button>
                                ) : (
                                  `${d.totalLeave} ngày`
                                )}
                              </td>
                              <td className="py-3.5 px-3 text-center text-emerald-600">{d.usedLeave} ngày</td>
                              <td className="py-3.5 px-3 text-center">
                                {d.isConcurrent ? (
                                  <span className="text-slate-400 font-normal">-</span>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    d.remainingLeave > 5 ? "bg-blue-50 text-[#005BAC]" : "bg-rose-50 text-rose-600"
                                  }`}>{d.remainingLeave} ngày</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {leaveTabMode === "history" && (
                    <div className="overflow-x-auto border border-slate-150 rounded-2xl">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3 w-10 text-center">STT</th>
                            <th className="py-3 px-3">Nhân viên</th>
                            <th className="py-3 px-3">Loại nghỉ phép</th>
                            <th className="py-3 px-3">Từ ngày</th>
                            <th className="py-3 px-3">Đến ngày</th>
                            <th className="py-3 px-3 text-center">Tổng số ngày nghỉ</th>
                            <th className="py-3 px-3">Lý do nghỉ</th>
                            <th className="py-3 px-3 w-32 text-center">Trạng thái duyệt</th>
                            <th className="py-3 px-3 w-20 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {searchedLeaves.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-6 text-center italic text-slate-400">
                                Chưa ghi nhận lịch sử nghỉ phép nào.
                              </td>
                            </tr>
                          ) : (
                            searchedLeaves.map((l, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-3.5 px-3 text-center text-slate-400">{idx + 1}</td>
                                <td className="py-3.5 px-3 text-slate-800 font-bold">{l.name}</td>
                                <td className="py-3.5 px-3 text-[#005BAC] font-bold">{l.type}</td>
                                <td className="py-3.5 px-3 font-mono">{new Date(l.from).toLocaleDateString("vi-VN")}</td>
                                <td className="py-3.5 px-3 font-mono">{new Date(l.to).toLocaleDateString("vi-VN")}</td>
                                <td className="py-3.5 px-3 text-center text-slate-800 font-bold">{l.days} ngày</td>
                                <td className="py-3.5 px-3 text-slate-500 italic font-medium">{l.reason}</td>
                                <td className="py-3.5 px-3 text-center">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                    l.status === "Đã duyệt" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
                                  }`}>{l.status}</span>
                                </td>
                                <td className="py-3.5 px-3 text-center">
                                  {canDeleteLeave(l) ? (
                                    <button
                                      onClick={() => handleDeleteLeave(l)}
                                      className="p-1 hover:bg-rose-50 text-rose-500 rounded-lg hover:text-rose-700 transition-all cursor-pointer inline-flex items-center justify-center active:scale-95"
                                      title="Xóa yêu cầu nghỉ phép"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  ) : (
                                    <span
                                      className="text-slate-300 inline-flex items-center justify-center"
                                      title="Đơn đã duyệt — chỉ HCNS xóa được"
                                    >
                                      <Trash2 size={14} />
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* ─── MODAL ĐĂNG KÝ NGHỈ PHÉP ─── */}
                  {showCreateLeaveModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                      <div className="bg-white w-full max-w-lg rounded-2xl shadow-premium border border-slate-100 overflow-hidden transform transition-all animate-scale-up">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#005BAC] text-white">
                          <h3 className="font-heading font-black text-sm flex items-center gap-2">
                            <Calendar size={16} /> Đăng ký nghỉ phép
                          </h3>
                          <button
                            type="button"
                            onClick={() => setShowCreateLeaveModal(false)}
                            className="text-white/80 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-white/10"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <form onSubmit={handleCreateLeave} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
                          {/* Chọn nhân viên */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Chọn cán bộ nhân viên</label>
                            <select
                              value={leaveForm.employeeId}
                              onChange={(e) => setLeaveForm(prev => ({ ...prev, employeeId: e.target.value }))}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all cursor-pointer"
                            >
                              <option value="">-- Chọn nhân viên --</option>
                              {employees.map(e => (
                                <option key={e.id} value={e.id}>{e.name} - {e.role} ({e.department})</option>
                              ))}
                            </select>
                          </div>

                          {/* Thông tin phép năm còn lại của nhân viên */}
                          {leaveForm.employeeId && (() => {
                            const empLeave = annualLeaveData.find(d => d.id === leaveForm.employeeId);
                            if (!empLeave) return null;
                            
                            return (
                              <div className={`p-4 rounded-xl border ${
                                empLeave.isConcurrent 
                                  ? "bg-amber-50/60 border-amber-200/65" 
                                  : "bg-slate-50 border-slate-150"
                              } space-y-2`}>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thông tin phép năm nhân sự:</span>
                                  {empLeave.isConcurrent && (
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800">
                                      Nhân sự kiêm nhiệm/hỗ trợ (Không hưởng phép năm)
                                    </span>
                                  )}
                                </div>
                                
                                <div className="grid grid-cols-4 gap-2 text-center">
                                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                                    <div className="text-[9px] font-bold text-slate-400">Tổng hạn mức</div>
                                    <div className="text-sm font-black text-slate-800 mt-0.5">{empLeave.totalLeave} ngày</div>
                                  </div>
                                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                                    <div className="text-[9px] font-bold text-slate-400">Đã nghỉ phép năm</div>
                                    <div className="text-sm font-black text-emerald-600 mt-0.5">{empLeave.usedLeave} ngày</div>
                                  </div>
                                  {/* Đơn chờ duyệt cũng giữ chỗ — không hiện ra thì người dùng
                                      không hiểu vì sao còn lại ít hơn hạn mức trừ đã nghỉ. */}
                                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                                    <div className="text-[9px] font-bold text-slate-400">Đang chờ duyệt</div>
                                    <div className={`text-sm font-black mt-0.5 ${
                                      empLeave.pendingLeave > 0 ? "text-amber-600" : "text-slate-400"
                                    }`}>{empLeave.pendingLeave} ngày</div>
                                  </div>
                                  <div className="p-2 bg-white rounded-lg border border-slate-100">
                                    <div className="text-[9px] font-bold text-slate-400">Còn lại khả dụng</div>
                                    <div className={`text-sm font-black mt-0.5 ${
                                      empLeave.remainingLeave > 0 ? "text-indigo-600" : "text-slate-400"
                                    }`}>{empLeave.remainingLeave} ngày</div>
                                  </div>
                                </div>
                                
                                {!empLeave.isConcurrent && (
                                  <div className="text-[9.5px] font-medium text-slate-400 leading-normal flex items-center gap-1 mt-1">
                                    <Info size={11} className="text-slate-400 shrink-0" />
                                    <span>Thâm niên: <strong className="text-slate-600 font-bold">{empLeave.tenureStr}</strong> (Được cộng {empLeave.seniorLeave} ngày phép thâm niên).</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Loại nghỉ phép */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Loại nghỉ phép</label>
                            <select
                              value={leaveForm.type}
                              onChange={(e) => setLeaveForm(prev => ({ ...prev, type: e.target.value }))}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all cursor-pointer"
                            >
                              <option value="Phép năm">Nghỉ phép năm (Trừ vào hạn mức phép năm)</option>
                              <option value="Việc riêng">Nghỉ việc riêng (Không trừ phép năm)</option>
                              <option value="Nghỉ không lương">Nghỉ không hưởng lương (Không trừ phép năm)</option>
                            </select>
                          </div>

                          {/* Thời gian nghỉ */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Từ ngày</label>
                              <input
                                type="date"
                                value={leaveForm.from}
                                onChange={(e) => setLeaveForm(prev => ({ ...prev, from: e.target.value }))}
                                required
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Đến ngày</label>
                              <input
                                type="date"
                                value={leaveForm.to}
                                onChange={(e) => setLeaveForm(prev => ({ ...prev, to: e.target.value }))}
                                required
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all"
                              />
                            </div>
                          </div>

                          {/* Hiện số ngày nghỉ tự động tính toán & Cảnh báo hạn mức */}
                          {(() => {
                            if (!leaveForm.from || !leaveForm.to) return null;
                            const dFrom = new Date(leaveForm.from);
                            const dTo = new Date(leaveForm.to);
                            const diffTime = dTo.getTime() - dFrom.getTime();
                            if (diffTime < 0) {
                              return (
                                <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 flex items-center gap-2">
                                  <AlertTriangle size={14} />
                                  <span>Ngày kết thúc không được nhỏ hơn ngày bắt đầu!</span>
                                </div>
                              );
                            }
                            
                            const days = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
                            const empLeave = annualLeaveData.find(d => d.id === leaveForm.employeeId);
                            const isOverLimit = leaveForm.type === "Phép năm" && empLeave && days > empLeave.remainingLeave;
                            const isConcurrentWarning = leaveForm.type === "Phép năm" && empLeave?.isConcurrent;

                            return (
                              <div className="space-y-2">
                                <div className="p-3 bg-[#005BAC]/5 border border-[#005BAC]/10 rounded-xl flex items-center justify-between text-slate-700">
                                  <div className="flex items-center gap-1.5">
                                    <Clock size={14} className="text-[#005BAC]" />
                                    <span>Tổng số ngày đăng ký nghỉ:</span>
                                  </div>
                                  <span className="text-sm font-black text-[#005BAC]">{days} ngày</span>
                                </div>

                                {isConcurrentWarning && (
                                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 flex items-start gap-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <span>
                                      <strong>Lưu ý:</strong> Nhân sự này là nhân sự kiêm nhiệm/hỗ trợ, không được cấp phép năm. Việc duyệt phép năm có thể dẫn đến số phép âm.
                                    </span>
                                  </div>
                                )}

                                {isOverLimit && !isConcurrentWarning && (
                                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-start gap-2">
                                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                    <span>
                                      <strong>Không đủ phép năm:</strong> đăng ký {days} ngày nhưng chỉ còn {empLeave.remainingLeave} ngày
                                      {empLeave.pendingLeave > 0 && ` (đã trừ ${empLeave.pendingLeave} ngày của đơn đang chờ duyệt)`}.
                                      {" "}Vui lòng chuyển sang <strong>Nghỉ không hưởng lương</strong> để tiếp tục.
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Lý do nghỉ */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Lý do xin nghỉ</label>
                            <textarea
                              value={leaveForm.reason}
                              onChange={(e) => setLeaveForm(prev => ({ ...prev, reason: e.target.value }))}
                              rows={2}
                              placeholder="Mô tả lý do xin nghỉ phép..."
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all resize-none"
                            />
                          </div>

                          {/* Buttons */}
                          {(() => {
                            // Khoá nút khi phép năm không đủ: người dùng phải đổi loại
                            // nghỉ chứ không ép gửi được. Hàm submit cũng chặn lần nữa.
                            const empLeave = annualLeaveData.find(d => d.id === leaveForm.employeeId);
                            const dF = new Date(leaveForm.from);
                            const dT = new Date(leaveForm.to);
                            const gap = dT.getTime() - dF.getTime();
                            const reqDays = gap >= 0 ? Math.round(gap / (1000 * 60 * 60 * 24)) + 1 : 0;
                            const blocked =
                              leaveForm.type === "Phép năm" &&
                              !!empLeave &&
                              reqDays > empLeave.remainingLeave;

                            return (
                              <div className="flex justify-end gap-2 pt-2">
                                <button
                                  type="button"
                                  onClick={() => setShowCreateLeaveModal(false)}
                                  disabled={creatingLeave}
                                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
                                >
                                  Hủy bỏ
                                </button>
                                <button
                                  type="submit"
                                  disabled={blocked || creatingLeave}
                                  title={blocked ? "Không đủ phép năm — hãy chuyển sang Nghỉ không hưởng lương" : undefined}
                                  className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-premium"
                                >
                                  {creatingLeave ? "Đang lưu..." : blocked ? "Không đủ phép năm" : "Đăng ký phép"}
                                </button>
                              </div>
                            );
                          })()}
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeSubTab === "travel" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4 overflow-hidden">
                  <div className="-mx-6 -mt-6 mb-2 px-6 py-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#0ea5e9 0%,#3b82f6 55%,#6366f1 100%)" }}>
                    <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><Briefcase size={120} /></div>
                    <div className="relative flex items-center gap-3">
                      <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Briefcase size={18} /></span>
                      <div>
                        <h3 className="font-heading font-black text-base leading-tight">Danh sách lịch trình công tác</h3>
                        <p className="text-white/80 text-xs font-medium mt-0.5">Theo dõi lịch kiểm tra dự án công trường &amp; trợ cấp công tác phí</p>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Họ và Tên</th>
                          <th className="py-3 px-3">Địa điểm công tác</th>
                          <th className="py-3 px-3">Từ ngày</th>
                          <th className="py-3 px-3">Đến ngày</th>
                          <th className="py-3 px-3">Mục đích công tác</th>
                          <th className="py-3 px-3">Tổng chi phí thực tế</th>
                          <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
                          {canDeleteTravel && <th className="py-3 px-3 w-16 text-center">Thao tác</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredTravels.map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{t.name}</td>
                            <td className="py-3.5 px-3 text-[#005BAC] font-bold">{t.dest}</td>
                            <td className="py-3.5 px-3">{new Date(t.from).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3">{new Date(t.to).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-slate-550 font-medium">{t.purpose}</td>
                            <td className="py-3.5 px-3 text-emerald-600 font-bold">
                              {editingTravelId === (t.id || idx) ? (
                                <input
                                  type="number"
                                  defaultValue={t.cost !== undefined ? t.cost : t.allowance}
                                  onBlur={(e) => {
                                    const val = Number(e.target.value);
                                    handleUpdateTravelCost(t.id || idx, val);
                                    setEditingTravelId(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      const val = Number((e.target as HTMLInputElement).value);
                                      handleUpdateTravelCost(t.id || idx, val);
                                      setEditingTravelId(null);
                                    }
                                  }}
                                  className="w-24 px-1.5 py-0.5 border border-slate-300 rounded text-xs text-slate-800 font-semibold outline-none focus:border-blue-500"
                                  autoFocus
                                />
                              ) : (
                                <div
                                  onClick={() => {
                                    if (hasFullAccess) {
                                      setEditingTravelId(t.id || idx);
                                    }
                                  }}
                                  className={`px-1 py-0.5 rounded transition-colors flex items-center justify-between group ${
                                    hasFullAccess ? "cursor-pointer hover:bg-slate-100" : ""
                                  }`}
                                  title={hasFullAccess ? "Nhấp để sửa số tiền" : undefined}
                                >
                                  <span>{((t.cost !== undefined ? t.cost : t.allowance) || 0).toLocaleString("vi-VN")} đ</span>
                                  {hasFullAccess && (
                                    <Edit2 size={10} className="text-slate-400 opacity-40 group-hover:opacity-100 transition-opacity ml-1" />
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">{t.status}</span>
                            </td>
                            {canDeleteTravel && (
                              <td className="py-3.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTravel(t.id !== undefined ? t.id : idx)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200/60 hover:border-rose-200 transition-all cursor-pointer inline-flex items-center justify-center shadow-sm active:scale-90"
                                  title="Xóa lịch trình công tác"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "regime" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4 overflow-hidden">
                  <div className="-mx-6 -mt-6 mb-2 px-6 py-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#8b5cf6 0%,#a855f7 55%,#d946ef 100%)" }}>
                    <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><Heart size={120} /></div>
                    <div className="relative flex items-center gap-3">
                      <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Heart size={18} /></span>
                      <div>
                        <h3 className="font-heading font-black text-base leading-tight">Nghỉ chế độ phúc lợi BHXH</h3>
                      </div>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Họ và Tên</th>
                          <th className="py-3 px-3">Chế độ thụ hưởng</th>
                          <th className="py-3 px-3">Ngày bắt đầu</th>
                          <th className="py-3 px-3">Ngày kết thúc</th>
                          <th className="py-3 px-3">Trạng thái đơn</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái nghỉ</th>
                          {canDeleteRegime && <th className="py-3 px-3 w-16 text-center">Thao tác</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredRegimes.map((r, idx) => {
                          const regimeState = getRegimeState(r.from, r.to);
                          return (
                          <tr key={r.id || idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{r.name}</td>
                            <td className="py-3.5 px-3 text-indigo-600 font-bold">{r.type}</td>
                            <td className="py-3.5 px-3">{new Date(r.from).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3">{new Date(r.to).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-slate-500 font-bold flex items-center gap-1.5"><Info size={12} className="text-slate-400" /> {r.status}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                regimeState === "Đang nghỉ" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                              }`}>{regimeState}</span>
                            </td>
                            {canDeleteRegime && (
                              <td className="py-3.5 px-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRegime(r.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg border border-slate-200/60 hover:border-rose-200 transition-all cursor-pointer inline-flex items-center justify-center shadow-sm active:scale-90"
                                  title="Xóa đơn nghỉ chế độ"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                          );
                        })}
                        {filteredRegimes.length === 0 && (
                          <tr>
                            <td colSpan={canDeleteRegime ? 7 : 6} className="py-8 text-center text-slate-400 font-bold italic">Không có đơn nghỉ chế độ nào</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "allowances" && (
                <div className="space-y-6">
                  <div className="rounded-2xl px-6 py-5 text-white shadow-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg,#f43f5e 0%,#fb7185 50%,#f97316 100%)" }}>
                    <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><Briefcase size={120} /></div>
                    <div className="relative flex items-center gap-3">
                      <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Briefcase size={18} /></span>
                      <div>
                        <h3 className="font-heading font-black text-base leading-tight">Phụ cấp cơm, xăng, điện thoại...</h3>
                        <p className="text-white/80 text-xs font-medium mt-0.5">Định mức phụ cấp đang áp dụng theo từng nhóm đối tượng</p>
                      </div>
                    </div>
                  </div>
                  {/* Allowance Standards Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {allowancePolicies.map(a => {
                      const isEditing = editingAllowanceCode === a.code;
                      const draft = isEditing && allowanceDraft ? allowanceDraft : a;
                      return (
                      <div key={a.code} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm hover-elevate space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="p-2 bg-blue-50 text-[#005BAC] rounded-xl"><Briefcase size={16} /></span>
                          {canEditAllowance && !isEditing && (
                            <button
                              type="button"
                              onClick={() => { setEditingAllowanceCode(a.code); setAllowanceDraft({ ...a }); }}
                              className="p-1.5 text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 rounded-lg border border-slate-200/60 hover:border-blue-200 transition-all cursor-pointer inline-flex items-center justify-center shadow-sm active:scale-90"
                              title="Sửa định mức phụ cấp"
                            >
                              <Edit2 size={13} />
                            </button>
                          )}
                          {isEditing && (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={handleSaveAllowance}
                                disabled={savingAllowance}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg border border-emerald-200/60 transition-all cursor-pointer inline-flex items-center justify-center shadow-sm active:scale-90 disabled:opacity-50"
                                title="Lưu định mức"
                              >
                                {savingAllowance ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingAllowanceCode(null); setAllowanceDraft(null); }}
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200/60 transition-all cursor-pointer inline-flex items-center justify-center shadow-sm active:scale-90"
                                title="Hủy"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                        <div>
                          <h4 className="font-heading font-extrabold text-slate-800 text-xs">{a.name}</h4>

                          {!isEditing ? (
                            <>
                              <p className="font-heading font-black text-[#005BAC] text-sm mt-1">
                                {formatVnd(allowanceMonthly(a))}/tháng
                              </p>
                              {a.kind === "per_day" ? (
                                <p className="text-slate-500 text-[10px] font-semibold mt-1">
                                  {formatVnd(a.per_day_amount)}/ngày × {a.days_per_month} ngày công (thứ 2 → thứ 6)
                                </p>
                              ) : (
                                <p className="text-slate-500 text-[10px] font-semibold mt-1">
                                  Từ {a.threshold_days} ngày công trở lên; dưới {a.threshold_days} ngày còn {formatVnd(a.reduced_amount)}/tháng
                                </p>
                              )}
                              <p className="text-slate-400 text-[10px] font-semibold mt-2">Đối tượng: {a.target}</p>
                            </>
                          ) : (
                            <div className="mt-2 space-y-2">
                              {a.kind === "per_day" ? (
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="space-y-1">
                                    <span className="block text-slate-400 text-[10px] font-bold">Mức/ngày (đ)</span>
                                    <input
                                      type="number"
                                      value={draft.per_day_amount ?? ""}
                                      onChange={e => setAllowanceDraft({ ...draft, per_day_amount: e.target.value === "" ? null : Number(e.target.value) })}
                                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                  </label>
                                  <label className="space-y-1">
                                    <span className="block text-slate-400 text-[10px] font-bold">Ngày công/tháng</span>
                                    <input
                                      type="number"
                                      value={draft.days_per_month ?? ""}
                                      onChange={e => setAllowanceDraft({ ...draft, days_per_month: e.target.value === "" ? null : Number(e.target.value) })}
                                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                  </label>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <label className="space-y-1 block">
                                    <span className="block text-slate-400 text-[10px] font-bold">Ngày công tối thiểu</span>
                                    <input
                                      type="number"
                                      value={draft.threshold_days ?? ""}
                                      onChange={e => setAllowanceDraft({ ...draft, threshold_days: e.target.value === "" ? null : Number(e.target.value) })}
                                      className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                                    />
                                  </label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="space-y-1">
                                      <span className="block text-slate-400 text-[10px] font-bold">Mức đủ ngày (đ)</span>
                                      <input
                                        type="number"
                                        value={draft.full_amount ?? ""}
                                        onChange={e => setAllowanceDraft({ ...draft, full_amount: e.target.value === "" ? null : Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                                      />
                                    </label>
                                    <label className="space-y-1">
                                      <span className="block text-slate-400 text-[10px] font-bold">Mức thiếu ngày (đ)</span>
                                      <input
                                        type="number"
                                        value={draft.reduced_amount ?? ""}
                                        onChange={e => setAllowanceDraft({ ...draft, reduced_amount: e.target.value === "" ? null : Number(e.target.value) })}
                                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                                      />
                                    </label>
                                  </div>
                                </div>
                              )}
                              <label className="space-y-1 block">
                                <span className="block text-slate-400 text-[10px] font-bold">Đối tượng áp dụng</span>
                                <input
                                  type="text"
                                  value={draft.target}
                                  onChange={e => setAllowanceDraft({ ...draft, target: e.target.value })}
                                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 3: BẢNG LƯƠNG & BHXH ─── */}
          {activeTab === "payroll_insurance" && (
            <div className="space-y-6">
              {activeSubTab === "calculation" && (
                <div className="space-y-6">
                  {/* Monthly Payroll Grid */}
                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="font-heading font-extrabold text-slate-800 text-sm">BẢNG TÍNH TOÁN TIỀN LƯƠNG THÁNG NÀY</h3>
                        <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Dữ liệu tính toán dựa trên ngày công chấm công và thang bảng lương quy định</p>
                      </div>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1.5 rounded-xl">Tháng 06/2026</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3">Họ và Tên</th>
                            <th className="py-3 px-3 text-center">Ngày công quy định</th>
                            <th className="py-3 px-3 text-center">Ngày công thực tế</th>
                            <th className="py-3 px-3">Lương cơ bản</th>
                            <th className="py-3 px-3">Phụ cấp</th>
                            <th className="py-3 px-3">Khấu trừ BHXH (10.5%)</th>
                            <th className="py-3 px-3">Thuế TNCN trích đóng</th>
                            <th className="py-3 px-3 text-right">Lương thực lĩnh (Net)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {filteredSalaryInfo.map(s => {
                            const deductions = s.insurance * 0.105;
                            const tax = s.base * 0.05; // mock tax
                            const netPay = s.total - deductions - tax;
                            return (
                              <tr key={s.id} className="hover:bg-slate-50/50">
                                <td className="py-3.5 px-3 text-slate-850 font-bold">{s.name}</td>
                                <td className="py-3.5 px-3 text-center">24 ngày</td>
                                <td className="py-3.5 px-3 text-center text-blue-600 font-bold">24 ngày</td>
                                <td className="py-3.5 px-3">{s.base.toLocaleString("vi-VN")} đ</td>
                                <td className="py-3.5 px-3">{(s.phone + s.lunch + s.gas).toLocaleString("vi-VN")} đ</td>
                                <td className="py-3.5 px-3 text-rose-600">-{deductions.toLocaleString("vi-VN")} đ</td>
                                <td className="py-3.5 px-3 text-amber-600">-{tax.toLocaleString("vi-VN")} đ</td>
                                <td className="py-3.5 px-3 text-right text-emerald-600 font-black">{netPay.toLocaleString("vi-VN")} đ</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Salary trends chart */}
                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                    <h3 className="font-heading font-bold text-slate-800 text-sm mb-5">Biến động Quỹ lương & Trích đóng BHXH (6 tháng qua)</h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={HISTORICAL_SALARY_TREND}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="Tổng lương (Tỷ)" stroke="#005BAC" strokeWidth={2} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              )}

              {activeSubTab === "insurance" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">HỒ SƠ BẢO HIỂM XÃ HỘI & TRÍCH ĐÓNG BHXH</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Theo dõi mã số bảo hiểm, mức lương đóng quy định và trích nộp định kỳ</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Mã số BHXH</th>
                          <th className="py-3 px-3">Mức lương đóng BHXH</th>
                          <th className="py-3 px-3">BHXH Cá nhân (8%)</th>
                          <th className="py-3 px-3">BHYT Cá nhân (1.5%)</th>
                          <th className="py-3 px-3">BHTN Cá nhân (1%)</th>
                          <th className="py-3 px-3">Doanh nghiệp đóng thêm (21.5%)</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái Sổ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredBhxhLogs.map((b, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{b.name}</td>
                            <td className="py-3.5 px-3 font-mono font-bold text-slate-500">{b.code}</td>
                            <td className="py-3.5 px-3">{b.base.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-rose-600">-{b.SI.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-rose-600">-{b.HI.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-rose-600">-{b.UI.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-emerald-600">+{b.company_total.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-100 text-blue-800">{b.booklet}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 4: PHÚC LỢI ─── */}
          {activeTab === "benefits" && (
            <div className="space-y-6">
              {/* ─── SUB-TAB 1: ĐỊNH MỨC PHÚC LỢI ─── */}
              {activeSubTab === "policy_rates" && (
                <div className="space-y-6">
                  {/* Bảng Định mức Trợ cấp */}
                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4 overflow-hidden">
                    <div className="-mx-6 -mt-6 mb-2 px-6 py-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#4f46e5 0%,#2563eb 55%,#0ea5e9 100%)" }}>
                      <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><Award size={120} /></div>
                      <div className="relative flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Award size={18} /></span>
                        <div>
                          <h3 className="font-heading font-black text-base leading-tight">Định mức trợ cấp phúc lợi đã duyệt</h3>
                          <p className="text-white/80 text-xs font-medium mt-0.5">Chính sách trợ cấp áp dụng thống nhất cho các cấp nhân sự công ty</p>
                        </div>

                        {/* Sửa tay: Admin hoặc cờ "Quản lý hồ sơ nhân sự" */}
                        {canEditBenefitPolicy && (
                          <div className="ml-auto flex items-center gap-2 shrink-0">
                            {!editingBenefitPolicy ? (
                              <button
                                type="button"
                                onClick={() => { setEditingBenefitPolicy(true); setBenefitPolicyDraft(benefitPolicies.map(p => ({ ...p }))); }}
                                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur text-white text-[11px] font-bold rounded-xl border border-white/30 transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1.5"
                                title="Chỉnh định mức phúc lợi"
                              >
                                <Edit2 size={13} /> Chỉnh định mức
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={handleSaveBenefitPolicy}
                                  disabled={savingBenefitPolicy}
                                  className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-xl transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1.5 disabled:opacity-60 shadow-sm"
                                >
                                  {savingBenefitPolicy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Lưu định mức
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingBenefitPolicy(false); setBenefitPolicyDraft(null); }}
                                  disabled={savingBenefitPolicy}
                                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur text-white text-[11px] font-bold rounded-xl border border-white/30 transition-all cursor-pointer active:scale-95 inline-flex items-center gap-1.5 disabled:opacity-60"
                                >
                                  <X size={13} /> Hủy
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {editingBenefitPolicy && (
                      <p className="text-[10px] font-semibold text-slate-500 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        Ô trên là <strong className="text-slate-700">tiền mặt</strong>, ô dưới (nền xanh) là giá trị{" "}
                        <strong className="text-slate-700">giỏ hoa / vòng hoa</strong>. Để trống nghĩa là cấp đó không áp dụng khoản này.
                      </p>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3 w-12 text-center">Stt</th>
                            <th className="py-3 px-3 w-56">Nội dung</th>
                            <th className="py-3 px-3 text-center bg-blue-50/30 text-blue-800">Điều hành cao cấp</th>
                            <th className="py-3 px-3 text-center text-slate-700">Quản lý cấp cao</th>
                            <th className="py-3 px-3 text-center text-slate-700">Quản lý cấp trung</th>
                            <th className="py-3 px-3 text-center text-slate-700">Quản lý sơ cấp</th>
                            <th className="py-3 px-3 text-center text-slate-700">CBNV</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {(editingBenefitPolicy && benefitPolicyDraft ? benefitPolicyDraft : benefitPolicies).map((row, idx) => (
                            <tr key={row.code} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3.5 px-3 text-center text-slate-400 font-bold align-top">{idx + 1}</td>
                              <td className="py-3.5 px-3 text-slate-800 font-bold align-top leading-snug">
                                {row.name}
                                {row.gift_label && (
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                                    Kèm {row.gift_label}
                                  </span>
                                )}
                              </td>
                              {BENEFIT_LEVELS.map(lv => {
                                const amount = row[`${lv.key}_amount`];
                                const gift = row[`${lv.key}_gift`];
                                const isExec = lv.key === "exec";
                                return (
                                  <td
                                    key={lv.key}
                                    className={`py-3.5 px-3 text-center align-top ${isExec ? "bg-blue-50/20 text-blue-700 font-bold" : "text-slate-600"}`}
                                  >
                                    {!editingBenefitPolicy ? (
                                      <>
                                        <div className={amount !== null && amount !== undefined ? "font-bold" : "text-slate-300"}>
                                          {amount !== null && amount !== undefined ? `${amount.toLocaleString("vi-VN")} đ` : (gift === null || gift === undefined ? "—" : "")}
                                        </div>
                                        {gift !== null && gift !== undefined && (
                                          <div className="text-[10px] font-semibold text-emerald-600 mt-0.5">
                                            {row.gift_label || "Hiện vật"} {gift.toLocaleString("vi-VN")} đ
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="space-y-1">
                                        <input
                                          type="number"
                                          min={0}
                                          step={1000}
                                          value={amount ?? ""}
                                          placeholder="—"
                                          onChange={(e) => updateBenefitDraft(row.code, `${lv.key}_amount`, e.target.value)}
                                          className="w-full px-2 py-1 text-[11px] text-center bg-white border border-slate-200 rounded-lg focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none"
                                          title="Tiền mặt (để trống nếu cấp này không áp dụng)"
                                        />
                                        {row.gift_label && (
                                          <input
                                            type="number"
                                            min={0}
                                            step={1000}
                                            value={gift ?? ""}
                                            placeholder={row.gift_label}
                                            onChange={(e) => updateBenefitDraft(row.code, `${lv.key}_gift`, e.target.value)}
                                            className="w-full px-2 py-1 text-[11px] text-center bg-emerald-50/40 border border-emerald-200 rounded-lg focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                                            title={`${row.gift_label} (để trống nếu không áp dụng)`}
                                          />
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Diễn giải chức danh & Thưởng lễ */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Phân nhóm chức danh */}
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-3.5">
                      <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-3.5 bg-blue-600 rounded-full inline-block"></span>
                        Quy định Phân cấp Chức danh Quản lý
                      </h4>
                      <div className="space-y-2 text-[11px] leading-relaxed text-slate-600">
                        <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                          <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[9px] uppercase shrink-0">Quản lý cấp cao</span>
                          <div>
                            <strong className="text-slate-700">Quản lý cấp cao:</strong> Giám đốc (GĐ), Phó Giám đốc (PGĐ).
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[9px] uppercase shrink-0">Quản lý cấp trung</span>
                          <div>
                            <strong className="text-slate-700">Quản lý cấp trung:</strong> Trưởng phòng, Phó phòng, Giám đốc BĐH, PGĐ BĐH, Chỉ huy trưởng.
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                          <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[9px] uppercase shrink-0">Quản lý cấp sơ</span>
                          <div>
                            <strong className="text-slate-700">Quản lý sơ cấp:</strong> Tổ trưởng, Chỉ huy phó.
                          </div>
                        </div>
                        <div className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                          <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-bold text-[9px] uppercase shrink-0">CBNV thường</span>
                          <div>
                            <strong className="text-slate-700">CBNV:</strong> Các nhân viên, chuyên viên, kỹ sư khác trong hệ thống.
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Quy tắc thưởng lễ thâm niên */}
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-3.5">
                      <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <span className="w-1.5 h-3.5 bg-emerald-600 rounded-full inline-block"></span>
                        Quy tắc Thưởng Lễ lớn theo Thâm niên
                      </h4>
                      <p className="text-slate-500 text-[10px] font-semibold leading-relaxed">
                        Thưởng lễ lớn (2/9, 30/4, Tết Dương Lịch...) gồm 4 mức phân phối dựa trên thâm niên làm việc thực tế, hỗ trợ điều chỉnh tay linh hoạt để trình Giám đốc phê duyệt:
                      </p>
                      
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="p-3 bg-gradient-to-br from-emerald-50/40 to-teal-50/20 border border-emerald-100 rounded-xl text-center">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Dưới 1 năm</span>
                          <div className="text-sm font-black text-emerald-700 mt-0.5">300.000 đ</div>
                        </div>
                        <div className="p-3 bg-gradient-to-br from-emerald-50/40 to-teal-50/20 border border-emerald-100 rounded-xl text-center">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Từ 1 đến dưới 3 năm</span>
                          <div className="text-sm font-black text-emerald-700 mt-0.5">500.000 đ</div>
                        </div>
                        <div className="p-3 bg-gradient-to-br from-emerald-50/40 to-teal-50/20 border border-emerald-100 rounded-xl text-center">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Từ 3 đến dưới 5 năm</span>
                          <div className="text-sm font-black text-emerald-700 mt-0.5">1.000.000 đ</div>
                        </div>
                        <div className="p-3 bg-gradient-to-br from-emerald-50/40 to-teal-50/20 border border-emerald-100 rounded-xl text-center">
                          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Từ 5 năm trở lên</span>
                          <div className="text-sm font-black text-emerald-700 mt-0.5">2.000.000 đ</div>
                        </div>
                      </div>
                      
                      <div className="bg-amber-50 border border-amber-150 p-2.5 rounded-lg text-amber-800 text-[10px] leading-relaxed">
                        <strong>Chú ý:</strong> Hệ thống tự động gợi ý theo thâm niên. Người dùng có quyền thay đổi mức thưởng cho từng cá nhân (dropdown/nhập số) trực tiếp tại bảng thưởng trước khi phê duyệt.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── SUB-TAB 2: SINH NHẬT ─── */}
              {activeSubTab === "birthday" && (
                <div className="space-y-6">
                  {/* Header banner gradient hiện đại */}
                  <div className="rounded-3xl p-6 text-white shadow-lg relative overflow-hidden" style={{ background: "linear-gradient(135deg,#6366f1 0%,#8b5cf6 55%,#ec4899 100%)" }}>
                    <div className="absolute -right-6 -top-8 opacity-20 select-none pointer-events-none">
                      <Cake size={140} />
                    </div>
                    <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Cake size={20} /></span>
                        <div>
                          <h3 className="font-heading font-black text-lg leading-tight">Lịch &amp; Danh sách sinh nhật nhân sự</h3>
                          <p className="text-white/80 text-xs font-medium mt-0.5">Tự động tính quà thưởng theo phòng ban &amp; chức vụ · {filteredBirthdays.length} nhân sự trong Tháng {selectedBirthdayMonth}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBirthdayPreviewModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 bg-white/95 hover:bg-white text-indigo-700 font-bold rounded-xl cursor-pointer text-xs transition-all shadow-md active:scale-95 shrink-0 self-start md:self-auto"
                      >
                        <FileText size={13} /> Danh sách CBNV trong tháng
                      </button>
                    </div>
                  </div>

                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6">
                    {/* Month Navigator */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-4 rounded-full inline-block bg-gradient-to-b from-indigo-500 to-pink-500"></span>
                        Lịch sinh nhật Tháng {selectedBirthdayMonth}
                      </h4>
                      <div className="flex flex-wrap gap-1 text-[10px] font-bold bg-slate-100 p-1 rounded-xl shrink-0">
                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setSelectedBirthdayMonth(m)}
                            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                              selectedBirthdayMonth === m
                                ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-sm"
                                : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                            }`}
                          >
                            T{m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Calendar Highlight Grid */}
                    <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-16 gap-2">
                      {daysInMonth.map(dayNum => {
                        const dayBirthdays = filteredBirthdays.filter(b => b.day === dayNum);
                        const hasBirthdays = dayBirthdays.length > 0;
                        return (
                          <div
                            key={dayNum}
                            className={`h-14 flex flex-col items-center justify-center rounded-2xl transition-all cursor-pointer ${
                              hasBirthdays
                                ? "text-white shadow-md shadow-indigo-500/20 scale-[1.03]"
                                : "bg-slate-50/60 border border-slate-100 text-slate-400 hover:bg-white hover:text-slate-700 hover:shadow-premium hover:border-indigo-200 hover:scale-105 active:scale-95"
                            }`}
                            style={hasBirthdays ? { background: "linear-gradient(135deg,#6366f1,#a855f7)" } : undefined}
                            title={hasBirthdays ? `Sinh nhật: ${dayBirthdays.map(b => b.name).join(", ")}` : `Ngày ${dayNum}`}
                          >
                            <span className={`text-[11px] font-black ${hasBirthdays ? "text-white" : "text-slate-400"}`}>
                              {dayNum}
                            </span>
                            {hasBirthdays ? (
                              <span className="flex items-center gap-0.5 mt-1">
                                <Cake size={9} className="text-white" />
                                {dayBirthdays.length > 1 && <span className="text-[8px] font-black text-white">{dayBirthdays.length}</span>}
                              </span>
                            ) : (
                              <span className="w-1.5 h-1.5 bg-slate-200 rounded-full mt-1.5"></span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Danh sách chi tiết nhân sự */}
                    <div className="space-y-3.5 pt-1">
                      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-1.5 h-4 rounded-full inline-block bg-gradient-to-b from-indigo-500 to-pink-500"></span>
                        Danh sách chi trợ cấp sinh nhật ({filteredBirthdays.length} nhân sự)
                      </h4>

                      {filteredBirthdays.length === 0 ? (
                        <div className="py-12 border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 font-bold italic bg-slate-50/20 text-xs">
                          Không ghi nhận nhân viên nào có ngày sinh trong Tháng {selectedBirthdayMonth}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredBirthdays.map((b) => (
                            <div
                              key={b.id}
                              className="group relative flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-150 shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 hover:border-indigo-200/70 transition-all hover-elevate duration-300 overflow-hidden"
                            >
                              {/* Accent bar */}
                              <span className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500 to-pink-500 opacity-70 group-hover:opacity-100 transition-opacity"></span>
                              <div className="flex items-center gap-3 pl-1.5">
                                <div className="w-12 h-12 rounded-2xl text-white shadow-md flex items-center justify-center font-black text-sm shrink-0" style={{ background: "linear-gradient(135deg,#6366f1,#ec4899)" }}>
                                  {b.name.slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-heading font-extrabold text-slate-800 text-xs flex items-center gap-2 flex-wrap">
                                    {b.name}
                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold rounded-full text-[8px] uppercase tracking-wider">
                                      Ngày {b.day}
                                    </span>
                                  </h4>
                                  <p className="text-[10px] text-slate-500 font-semibold truncate">{b.dept} | {b.role}</p>
                                  <p className="text-[9px] text-slate-400 mt-0.5">Ngày sinh: {String(b.day).padStart(2, '0')}/{String(b.month).padStart(2, '0')}/{b.year}</p>
                                </div>
                              </div>
                              <div className="text-right flex flex-col items-end gap-1.5 shrink-0">
                                <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full flex items-center gap-1 border border-emerald-100">
                                  <Gift size={10} className="text-emerald-500" /> {b.gift}
                                </span>
                                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/25">
                                  {b.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── SUB-TAB 3: HIẾU HỶ & TRỢ CẤP ─── */}
              {activeSubTab === "funeral_wedding" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4 overflow-hidden">
                  <div className="-mx-6 -mt-6 mb-2 px-6 py-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#e11d48 0%,#f43f5e 50%,#fb7185 100%)" }}>
                    <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><Heart size={120} /></div>
                    <div className="relative flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Heart size={18} /></span>
                        <div>
                          <h3 className="font-heading font-black text-base leading-tight">Chi trợ cấp hiếu hỷ &amp; biến cố</h3>
                          <p className="text-white/80 text-xs font-medium mt-0.5">Quỹ hỗ trợ cưới hỏi, sinh con, ốm đau nằm viện &amp; tử tuất của CBNV</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleExportBenefitClaims}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold rounded-xl cursor-pointer text-xs transition-all active:scale-95"
                        >
                          <Download size={13} /> Xuất báo cáo
                        </button>
                        <button
                          onClick={() => {
                            if (employees.length > 0) {
                              setClaimForm(prev => ({ ...prev, employeeId: employees[0].id }));
                            }
                            setShowCreateClaimModal(true);
                          }}
                          className="flex items-center gap-1 px-4 py-2 bg-white/95 hover:bg-white text-rose-700 font-bold rounded-xl cursor-pointer text-xs transition-all shadow-md active:scale-95"
                        >
                          <Plus size={13} /> Tạo yêu cầu trợ cấp
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Chức vụ & Phòng ban</th>
                          <th className="py-3 px-3 text-center">Cấp quản lý</th>
                          <th className="py-3 px-3">Nội dung trợ cấp</th>
                          <th className="py-3 px-3 text-right">Mức hỗ trợ</th>
                          <th className="py-3 px-3 text-center">Ngày sự kiện</th>
                          <th className="py-3 px-3 text-center">Trạng thái</th>
                          <th className="py-3 px-3 text-center">Chứng từ</th>
                          <th className="py-3 px-3 w-16 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredBenefitClaims.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-slate-400 font-bold italic">Không có bản ghi yêu cầu trợ cấp nào</td>
                          </tr>
                        ) : (
                          filteredBenefitClaims.map((claim) => (
                            <tr key={claim.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3.5 px-3 text-slate-800 font-bold">{claim.name}</td>
                              <td className="py-3.5 px-3 text-slate-500 font-medium">
                                <div>{claim.role}</div>
                                <div className="text-[10px] text-slate-400">{claim.department}</div>
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                  claim.level === "Điều hành cao cấp" ? "bg-red-50 text-red-700" :
                                  claim.level === "Quản lý cấp cao" ? "bg-indigo-50 text-indigo-700" :
                                  claim.level === "Quản lý cấp trung" ? "bg-purple-50 text-purple-700" :
                                  claim.level === "Quản lý sơ cấp" ? "bg-amber-50 text-amber-700" :
                                  "bg-slate-50 text-slate-700"
                                }`}>
                                  {claim.level}
                                </span>
                              </td>
                              <td className="py-3.5 px-3 text-blue-700 font-bold">{claim.category}</td>
                              <td className="py-3.5 px-3 text-right text-emerald-600 font-black">
                                {typeof claim.amount === "number"
                                  ? `+${claim.amount.toLocaleString("vi-VN")} đ`
                                  : claim.amount}
                              </td>
                              <td className="py-3.5 px-3 text-center font-mono font-medium text-slate-500">
                                {new Date(claim.date).toLocaleDateString("vi-VN")}
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  claim.status === "Đã chi" || claim.status === "Đã thanh toán"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : claim.status === "Đã duyệt"
                                    ? "bg-blue-100 text-blue-800"
                                    : claim.status === "Từ chối"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}>{claim.status}</span>
                                {claim.approved_by && claim.status !== "Chờ phê duyệt" && (
                                  <div className="text-[9px] text-slate-400 font-semibold mt-1">
                                    {claim.approved_by}
                                    {claim.approved_at && ` · ${new Date(claim.approved_at).toLocaleDateString("vi-VN")}`}
                                  </div>
                                )}
                                {claim.status === "Từ chối" && claim.rejection_reason && (
                                  <div className="text-[9px] text-rose-500 font-semibold mt-0.5 max-w-[150px] mx-auto">
                                    Lý do: {claim.rejection_reason}
                                  </div>
                                )}
                              </td>
                              {/* Chứng từ đính kèm: ảnh/PDF giấy tờ chứng minh sự việc */}
                              <td className="py-3.5 px-3 text-center">
                                {(() => {
                                  const isOwnPending =
                                    claim.status === "Chờ phê duyệt" &&
                                    (claim.created_by || "").toLowerCase() === (currentUser?.email || "").toLowerCase();
                                  const canAttach = canApproveBenefit || isOwnPending;
                                  const isUploading = uploadingClaimId === claim.id;

                                  return (
                                    <div className="flex items-center justify-center gap-1">
                                      {claim.attachment_path && (
                                        <button
                                          onClick={() => handleViewClaimAttachment(claim)}
                                          title={`Xem chứng từ: ${claim.attachment_name || ""}`}
                                          className="text-blue-600 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 transition-all cursor-pointer"
                                        >
                                          <Eye size={14} />
                                        </button>
                                      )}
                                      {canAttach && (
                                        <>
                                          <input
                                            type="file"
                                            id={`claim-file-${claim.id}`}
                                            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
                                            className="hidden"
                                            onChange={(e) => {
                                              const f = e.target.files?.[0];
                                              if (f) handleUploadClaimAttachment(claim.id, f);
                                              e.target.value = ""; // cho phép chọn lại đúng file vừa rồi
                                            }}
                                          />
                                          <label
                                            htmlFor={`claim-file-${claim.id}`}
                                            title={claim.attachment_path ? "Thay chứng từ khác" : "Tải chứng từ lên (ảnh hoặc PDF)"}
                                            className={`p-1.5 rounded-lg transition-all inline-flex ${
                                              isUploading
                                                ? "text-slate-300 cursor-wait"
                                                : "text-slate-400 hover:text-[#005BAC] hover:bg-blue-50 cursor-pointer"
                                            }`}
                                          >
                                            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                                          </label>
                                        </>
                                      )}
                                      {!claim.attachment_path && !canAttach && (
                                        <span className="text-slate-300 text-[10px] font-semibold">—</span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  {canApproveBenefit && claim.status === "Chờ phê duyệt" && (
                                    <>
                                      <button
                                        onClick={() => handleDecideClaim(claim.id, "Đã duyệt")}
                                        title="Duyệt chi"
                                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-bold transition-all cursor-pointer active:scale-95"
                                      >
                                        Duyệt
                                      </button>
                                      <button
                                        onClick={() => handleDecideClaim(claim.id, "Từ chối")}
                                        title="Từ chối chi"
                                        className="px-2 py-1 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-[9px] font-bold transition-all cursor-pointer active:scale-95"
                                      >
                                        Từ chối
                                      </button>
                                    </>
                                  )}
                                  {canApproveBenefit && claim.status === "Đã duyệt" && (
                                    <button
                                      onClick={() => handleDecideClaim(claim.id, "Đã chi")}
                                      title="Đánh dấu đã chi trả"
                                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-bold transition-all cursor-pointer active:scale-95"
                                    >
                                      Đã chi
                                    </button>
                                  )}
                                  {(canApproveBenefit ||
                                    (claim.status === "Chờ phê duyệt" &&
                                      (claim.created_by || "").toLowerCase() === (currentUser?.email || "").toLowerCase())) && (
                                    <button
                                      onClick={() => handleDeleteClaim(claim.id)}
                                      title={canApproveBenefit ? "Xoá phiếu" : "Rút lại phiếu"}
                                      className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ─── SUB-TAB 4: TIỀN THƯỞNG LỄ ─── */}
              {activeSubTab === "holiday_bonus" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5 overflow-hidden">
                  <div className="-mx-6 -mt-6 mb-2 px-6 py-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg,#059669 0%,#10b981 50%,#f59e0b 110%)" }}>
                    <div className="absolute -right-5 -top-6 opacity-15 pointer-events-none select-none"><Gift size={120} /></div>
                    <div className="relative flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0"><Gift size={18} /></span>
                        <div>
                          <h3 className="font-heading font-black text-base leading-tight">Phân bổ thưởng lễ theo thâm niên</h3>
                          <p className="text-white/80 text-xs font-medium mt-0.5">Tự động tính thâm niên &amp; đề xuất 4 mức thưởng — cho phép sửa tay trực tiếp</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-white bg-white/15 border border-white/30 rounded-xl px-2.5 py-1.5">
                          <span className="opacity-80">Đợt lễ:</span>
                          <select
                            value={selectedHolidayId}
                            onChange={(e) => setSelectedHolidayId(e.target.value)}
                            className="bg-transparent outline-none cursor-pointer text-xs font-bold text-white [&>option]:text-slate-700"
                          >
                            {TNEC_HOLIDAYS.map(h => (
                              <option key={h.id} value={h.id}>{h.holiday} ({new Date(h.date).getFullYear()})</option>
                            ))}
                          </select>
                        </div>
                        {canApproveBenefit && (
                          <button
                            onClick={handleApproveAllHolidayBonuses}
                            className="px-4 py-2 bg-white/95 hover:bg-white text-emerald-700 font-bold rounded-xl cursor-pointer text-xs transition-all shadow-md active:scale-95"
                          >
                            Phê duyệt hàng loạt
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const hol = TNEC_HOLIDAYS.find(h => h.id === selectedHolidayId);
                            handleExportHolidayBonus(hol?.holiday || "Thuong_Le");
                          }}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold rounded-xl cursor-pointer text-xs transition-all active:scale-95"
                        >
                          <Download size={13} /> Xuất bảng thưởng
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  {(() => {
                    let totalProposed = 0;
                    let totalApproved = 0;
                    holidayFilteredEmployees.forEach(emp => {
                      const tenureYears = getEmployeeTenureYears(emp);
                      const proposed = getProposedHolidayBonus(tenureYears);
                      const approved = holidayBonusAdjustments[emp.id] ?? proposed;
                      totalProposed += proposed;
                      totalApproved += approved;
                    });
                    
                    return (
                       <div className="grid grid-cols-3 gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 text-center">
                        <div className="space-y-0.5">
                           <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tổng nhân sự chi thưởng</div>
                           <div className="text-base font-black text-slate-800">{holidayFilteredEmployees.length} nhân viên</div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tổng ngân sách thâm niên đề xuất</div>
                          <div className="text-base font-black text-slate-600">{totalProposed.toLocaleString("vi-VN")} đ</div>
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tổng ngân sách duyệt thực tế</div>
                          <div className="text-base font-black text-blue-700">{totalApproved.toLocaleString("vi-VN")} đ</div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Employee Bonuses List */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3 w-12 text-center">Stt</th>
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Phòng ban & Chức vụ</th>
                          <th className="py-3 px-3 text-center">Ngày vào làm</th>
                          <th className="py-3 px-3 text-center">Giới tính</th>
                          <th className="py-3 px-3 text-center">Thâm niên</th>
                          <th className="py-3 px-3 text-right">Mức thưởng đề xuất</th>
                          <th className="py-3 px-3 text-center w-52">Mức thưởng phê duyệt (Sửa tay)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {holidayFilteredEmployees.map((emp, idx) => {
                          const level = getEmployeeLevel(emp.role);
                          const tenureYears = getEmployeeTenureYears(emp);
                          const tenureStr = getEmployeeTenureStr(emp);
                          const proposed = getProposedHolidayBonus(tenureYears);
                          const approved = holidayBonusAdjustments[emp.id] ?? proposed;
                          
                          return (
                            <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3 px-3 text-center text-slate-400">{idx + 1}</td>
                              <td className="py-3 px-3 text-slate-800 font-bold">{emp.name}</td>
                              <td className="py-3 px-3 text-slate-500 font-medium">
                                <div>{emp.role}</div>
                                <div className="text-[10px] text-slate-400">{emp.department}</div>
                              </td>
                              <td className="py-3 px-3 text-center font-mono text-slate-500">
                                {emp.created_at ? new Date(emp.created_at).toLocaleDateString("vi-VN") : "19/06/2026"}
                              </td>
                              <td className="py-3 px-3 text-center text-slate-600 font-medium">
                                {emp.gender || <span className="text-slate-300">—</span>}
                              </td>
                              <td className="py-3 px-3 text-center text-slate-600 font-medium">{tenureStr}</td>
                              <td className="py-3 px-3 text-right text-slate-500 font-mono">
                                {proposed.toLocaleString("vi-VN")} đ
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <div className="flex items-center gap-1.5 justify-center">
                                  {/* Input nhập tay trực tiếp */}
                                  <input
                                    type="number"
                                    value={approved}
                                    disabled={!canApproveBenefit}
                                    title={canApproveBenefit ? "" : "Chỉ người được cấp quyền duyệt chi phúc lợi mới sửa được"}
                                    onChange={(e) => handleUpdateHolidayAdjustment(emp.id, Number(e.target.value) || 0)}
                                    placeholder="Nhập số tiền..."
                                    className="w-28 px-2 py-1 border border-slate-200 rounded-lg text-right font-mono font-bold text-blue-700 focus:border-blue-500 outline-none text-xs disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                                  />

                                  {/* Dropdown để chọn nhanh 4 mức */}
                                  <select
                                    value={approved}
                                    disabled={!canApproveBenefit}
                                    onChange={(e) => handleUpdateHolidayAdjustment(emp.id, Number(e.target.value))}
                                    className="px-1.5 py-1 border border-slate-200 rounded-lg bg-slate-50 text-[10px] font-bold text-slate-600 outline-none cursor-pointer"
                                  >
                                    <option value={300000}>300k</option>
                                    <option value={500000}>500k</option>
                                    <option value={1000000}>1M</option>
                                    <option value={2000000}>2M</option>
                                    <option value={approved}>Khác</option>
                                  </select>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ─── MODAL TẠO MỚI YÊU CẦU TRỢ CẤP PHÚC LỢI ─── */}
              {showCreateClaimModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
                  <div className="bg-white w-full max-w-lg rounded-2xl shadow-premium border border-slate-100 overflow-hidden transform transition-all animate-scale-up">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#005BAC] text-white">
                      <h3 className="font-heading font-black text-sm flex items-center gap-2">
                        <Award size={16} /> Tạo yêu cầu chi trợ cấp phúc lợi
                      </h3>
                      <button
                        onClick={() => setShowCreateClaimModal(false)}
                        className="text-white/80 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-white/10"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <form onSubmit={handleCreateClaim} className="p-6 space-y-4 text-xs font-semibold text-slate-700">
                      {/* Chọn nhân viên */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Chọn cán bộ nhân viên</label>
                        <select
                          value={claimForm.employeeId}
                          onChange={(e) => setClaimForm(prev => ({ ...prev, employeeId: e.target.value }))}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all cursor-pointer"
                        >
                          <option value="">-- Chọn nhân viên --</option>
                          {employees.map(e => (
                            <option key={e.id} value={e.id}>{e.name} - {e.role} ({e.department})</option>
                          ))}
                        </select>
                      </div>

                      {/* Thông tin chức vụ và cấp quản lý tự động */}
                      {claimForm.employeeId && (() => {
                        const emp = employees.find(e => e.id === claimForm.employeeId);
                        if (!emp) return null;
                        const level = getEmployeeLevel(emp.role);
                        const stdPolicy = benefitPolicies.find(p => p.name === claimForm.category);

                        return (
                          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-150 rounded-xl">
                            <div>
                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cấp quản lý nhận diện:</div>
                              <div className="text-xs font-black text-slate-800 mt-0.5">{level}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Mức hỗ trợ quy định:</div>
                              <div className="text-xs font-black text-emerald-600 mt-0.5">
                                {benefitCellText(stdPolicy, level)}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Loại trợ cấp & Ngày sự kiện */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Loại trợ cấp</label>
                          <select
                            value={claimForm.category}
                            onChange={(e) => setClaimForm(prev => ({ ...prev, category: e.target.value as any }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all cursor-pointer"
                          >
                            {/* Danh mục lấy thẳng từ bảng định mức để không lệch nhau */}
                            {benefitPolicies.map(p => (
                              <option key={p.code} value={p.name}>{p.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ngày xảy ra sự kiện</label>
                          <input
                            type="date"
                            value={claimForm.date}
                            onChange={(e) => setClaimForm(prev => ({ ...prev, date: e.target.value }))}
                            required
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* Số tiền tùy chỉnh — trạng thái do người duyệt quyết, không tự chọn */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Số tiền tùy chỉnh (nếu có)</label>
                        <input
                          type="text"
                          value={claimForm.customAmount}
                          onChange={(e) => setClaimForm(prev => ({ ...prev, customAmount: e.target.value }))}
                          placeholder="Nhập số tiền khác nếu có..."
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all"
                        />
                      </div>

                      {/* Ghi chú */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ghi chú sự vụ</label>
                        <textarea
                          value={claimForm.notes}
                          onChange={(e) => setClaimForm(prev => ({ ...prev, notes: e.target.value }))}
                          rows={2}
                          placeholder="Mô tả cụ thể sự việc (ví dụ: Nằm viện 3 ngày, Kết hôn nhân sự, ...)"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all resize-none"
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowCreateClaimModal(false)}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
                        >
                          Hủy bỏ
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-premium"
                        >
                          Lưu yêu cầu
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* ─── XEM CHỨNG TỪ ĐÍNH KÈM (ảnh / PDF) ─── */}
              {attachmentViewer && (
                <div
                  className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                  onClick={() => setAttachmentViewer(null)}
                >
                  <div
                    className="bg-white rounded-2xl shadow-premium w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between px-5 py-3.5 bg-[#005BAC] text-white shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText size={16} className="shrink-0" />
                        <h3 className="font-heading font-black text-sm truncate">{attachmentViewer.name}</h3>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={attachmentViewer.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 border border-white/30 rounded-lg text-[11px] font-bold transition-all"
                        >
                          <Download size={12} /> Tải về
                        </a>
                        <button
                          onClick={() => setAttachmentViewer(null)}
                          className="p-1.5 hover:bg-white/20 rounded-lg transition-all cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto bg-slate-100 p-4 flex items-center justify-center">
                      {attachmentViewer.type === "application/pdf" ? (
                        <iframe
                          src={attachmentViewer.url}
                          title={attachmentViewer.name}
                          className="w-full h-[70vh] rounded-lg bg-white border border-slate-200"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={attachmentViewer.url}
                          alt={attachmentViewer.name}
                          className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-md"
                        />
                      )}
                    </div>
                    <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 shrink-0">
                      <p className="text-[10px] text-slate-400 font-semibold">
                        Chứng từ lưu trên hệ thống, không công khai — đường dẫn xem chỉ có hiệu lực 5 phút.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── TAB 5: HỢP ĐỒNG NHÂN SỰ ─── */}
          {activeTab === "employee_contracts" && (
            <div className="space-y-6 animate-fade-in">
              {/* Header and Control Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-200/50">
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <div className="flex-1 min-w-[200px] relative">
                      <span className="absolute left-3 top-2.5 text-slate-400"><Search size={16} /></span>
                      <input
                        type="text"
                        value={contractsSearchQuery}
                        onChange={(e) => setContractsSearchQuery(e.target.value)}
                        placeholder="Tìm theo họ tên, mã NV, số hợp đồng..."
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all text-xs font-semibold"
                      />
                    </div>
                    <select
                      value={contractsDeptFilter}
                      onChange={(e) => { setContractsDeptFilter(e.target.value); setContractsProjectFilter(""); }}
                      className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all text-xs font-semibold text-slate-600 cursor-pointer"
                    >
                      <option value="">Tất cả phòng ban</option>
                      {deptLists.phongBan.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                    <select
                      value={contractsProjectFilter}
                      onChange={(e) => { setContractsProjectFilter(e.target.value); setContractsDeptFilter(""); }}
                      className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all text-xs font-semibold text-slate-600 cursor-pointer"
                    >
                      <option value="">Tất cả Ban điều hành</option>
                      {deptLists.bdh.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-2">
                  {hasFullAccess && (
                    <>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.pdf,.docx,.doc,.png,.jpg,.jpeg,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const ext = file.name.split(".").pop()?.toLowerCase();
                        if (ext === "xlsx" || ext === "xls") {
                          handleExcelContractUpload(file);
                        } else {
                          handleIndividualContractReader(file);
                        }
                      }
                    }}
                    className="hidden"
                    id="unified-contract-upload"
                  />
                  <label
                    htmlFor="unified-contract-upload"
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-premium active:scale-95"
                  >
                    <UploadCloud size={14} /> Nhập file (Excel/PDF)
                  </label>

                  <button
                    onClick={openAiSettings}
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-650 bg-white rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
                  >
                    <Settings size={14} /> Cấu hình AI
                  </button>

                  <button
                    onClick={handleAddBlankContractRow}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-premium active:scale-95"
                  >
                    <Plus size={14} /> Thêm hợp đồng mới
                  </button>

                  <button
                    onClick={handleBulkSaveContracts}
                    disabled={savingContracts}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-premium disabled:opacity-50 active:scale-95"
                  >
                    {savingContracts ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Lưu tất cả thay đổi
                  </button>

                  <button
                    onClick={handleSyncProbationDates}
                    disabled={syncingProbation || loadingContracts}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-premium disabled:opacity-50 active:scale-95"
                    title="Điền Ngày ký HĐTV (Từ/Đến) từ file DANH_SACH Excel, khớp theo Mã NV"
                  >
                    {syncingProbation ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Đồng bộ HĐTV (Excel)
                  </button>
                    </>
                  )}

                  <button
                    onClick={() => fetchContracts()}
                    disabled={loadingContracts}
                    className="p-2.5 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-xl transition-all cursor-pointer active:scale-95"
                    title="Đồng bộ lại"
                  >
                    <RefreshCw size={14} className={loadingContracts ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>


              {/* Data Grid Table */}
              <div className="glass bg-white rounded-2xl border border-slate-200/50 shadow-premium overflow-hidden">
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50/50 gap-2">
                  <h3 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Danh sách theo dõi ký HĐTV, HĐLĐ ({myVisibleContracts.length} bản ghi)</h3>
                  <span className="text-[9px] text-amber-600 font-extrabold bg-amber-50 px-2.5 py-1 rounded-full uppercase tracking-wider border border-amber-100">
                    Nhập liệu trực tiếp vào các ô trống. Bấm nút Lưu từng dòng hoặc Lưu tất cả thay đổi.
                  </span>
                </div>

                <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-thin">
                  <table className="w-full text-[11px] text-left border-collapse min-w-[2640px]">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[9px] sticky top-0 z-10">
                        <th className="py-2.5 px-2 w-12 text-center bg-slate-50 border-r border-slate-200">STT</th>
                        <th className="py-2.5 px-2 w-28 bg-slate-50 border-r border-slate-200">Mã NV</th>
                        <th className="py-2.5 px-2 w-48 bg-slate-50 border-r border-slate-200">Họ và tên</th>
                        <th className="py-2.5 px-2 w-40 bg-slate-50 border-r border-slate-200">Phòng ban</th>
                        <th className="py-2.5 px-2 w-44 text-center bg-slate-50 border-r border-slate-200">Ngày ký HĐTV</th>
                        <th className="py-2.5 px-2 w-44 bg-slate-50 border-r border-slate-200">Số HĐTV</th>
                        <th className="py-2.5 px-2 w-40 bg-slate-50 border-r border-slate-200">Loại HĐLĐ</th>
                        <th className="py-2.5 px-2 w-44 text-center bg-slate-50 border-r border-slate-200">Ngày ký HĐLĐ chính thức</th>
                        <th className="py-2.5 px-2 w-44 bg-slate-50 border-r border-slate-200">Số HĐLĐ</th>
                        <th className="py-2.5 px-2 w-32 text-right bg-slate-50 border-r border-slate-200">Lương BHXH</th>
                        <th className="py-2.5 px-2 w-32 text-right bg-slate-50 border-r border-slate-200">Thưởng HQCV</th>
                        <th className="py-2.5 px-2 w-32 text-right bg-slate-50 border-r border-slate-200">Phụ cấp</th>
                        <th className="py-2.5 px-2 w-32 text-right bg-slate-50 border-r border-slate-200 text-emerald-700 bg-emerald-50/10">Tổng thu nhập</th>
                        <th className="py-2.5 px-2 w-36 bg-slate-50 border-r border-slate-200">Ghi chú</th>
                        <th className="py-2.5 px-2 w-20 text-center bg-slate-50">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                      {loadingContracts ? (
                        <tr>
                          <td colSpan={15} className="py-12 text-center text-slate-400 gap-2">
                            <Loader2 className="animate-spin text-[#005BAC] mx-auto mb-2" size={20} />
                            <span>Đang tải danh sách hợp đồng lao động...</span>
                          </td>
                        </tr>
                      ) : myVisibleContracts.length === 0 ? (
                        <tr>
                          <td colSpan={15} className="py-12 text-center text-slate-400">
                            Không tìm thấy dữ liệu hợp đồng nào. Hãy tải lên Excel hoặc thêm dòng hợp đồng mới!
                          </td>
                        </tr>
                      ) : (
                        (() => {
                          const query = contractsSearchQuery.trim().toLowerCase();
                          const filtered = myVisibleContracts.filter(c => {
                            // Dòng vừa thêm tay (chưa lưu) luôn hiện, không bao giờ
                            // bị bộ lọc/tìm kiếm ẩn mất khiến người dùng tưởng nút hỏng.
                            if (c.id.startsWith("new-")) return true;
                            const name = (c.employee_name || "").toLowerCase();
                            const code = (c.employee_code || "").toLowerCase();
                            const num = (c.contract_number || "").toLowerCase();
                            // Filter on the SAME department shown in the row (the contract's
                            // own department takes priority), so a row never appears under a
                            // department filter that differs from its displayed phòng ban.
                            const dept = (c.department || c.employees?.department || "").toLowerCase();
                            const deptMatch = contractsDeptFilter ? dept.includes(contractsDeptFilter.toLowerCase()) : true;
                            const projectMatch = contractsProjectFilter ? dept.includes(contractsProjectFilter.toLowerCase()) : true;
                            return (name.includes(query) || code.includes(query) || num.includes(query) || dept.includes(query)) && deptMatch && projectMatch;
                          })
                          // Ghi chú "nghỉ việc" luôn nằm cuối bảng — cùng quy ước
                          // với Danh sách nhân viên (employees/page.tsx:588).
                          .sort((a, b) => (isResignedNote(a.notes) ? 1 : 0) - (isResignedNote(b.notes) ? 1 : 0));

                          return filtered.map((c, index) => {
                            const actualIdx = tempContracts.findIndex(tc => tc.id === c.id);
                            return (
                              <tr key={c.id} className={`transition-all ${
                                isResignedNote(c.notes)
                                  ? "bg-orange-50/80 hover:bg-orange-100/60"
                                  : "hover:bg-slate-50/50"
                              }`}>
                                {/* STT */}
                                <td className="py-1 px-1 border-r border-slate-100 text-center font-bold text-slate-500">
                                  {index + 1}
                                </td>
                                {/* Mã NV */}
                                <td className="py-1 px-1 border-r border-slate-100">
                                  <input
                                    type="text"
                                    value={c.employee_code || ""}
                                    onChange={(e) => handleContractCellChange(actualIdx, "employee_code", e.target.value)}
                                    className="w-full bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 text-slate-600 font-mono"
                                  />
                                </td>
                                {/* Họ và tên */}
                                <td className="py-1 px-1 border-r border-slate-100 font-bold text-slate-800">
                                  {c.id.startsWith("new-") ? (
                                    // Dòng thêm tay: chỉ 1 ô gõ tên cho gọn. Lúc lưu,
                                    // handleBulkSaveContracts tự dò nhân viên theo tên/mã NV.
                                    <input
                                      type="text"
                                      value={c.employee_name || ""}
                                      onChange={(e) => handleContractCellChange(actualIdx, "employee_name", e.target.value)}
                                      placeholder="Nhập họ và tên..."
                                      className="w-full bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 font-bold text-slate-800"
                                    />
                                  ) : (
                                  <div className="flex flex-col gap-1 w-full">
                                    <select
                                      value={c.employee_id || ""}
                                      onChange={(e) => handleContractCellChange(actualIdx, "employee_id", e.target.value)}
                                      className="w-full bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 text-xs cursor-pointer font-bold text-slate-850"
                                    >
                                      <option value="">-- Chọn nhân viên hệ thống --</option>
                                      {employees.map(emp => (
                                        <option key={emp.id} value={emp.id}>
                                          {emp.name}
                                        </option>
                                      ))}
                                    </select>
                                    {!c.employee_id && (
                                      <input
                                        type="text"
                                        value={c.employee_name || ""}
                                        onChange={(e) => handleContractCellChange(actualIdx, "employee_name", e.target.value)}
                                        placeholder="Hoặc tự gõ tên..."
                                        className="w-full px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded font-normal text-[10px] focus:bg-white focus:border-blue-300 outline-none"
                                      />
                                    )}
                                  </div>
                                  )}
                                </td>
                                {/* Phòng ban */}
                                <td className="py-1 px-1 border-r border-slate-100 font-semibold text-slate-500 text-[10px] text-center whitespace-normal break-words">
                                  <select
                                    value={c.department || c.employees?.department || ""}
                                    onChange={(e) => handleContractCellChange(actualIdx, "department", e.target.value)}
                                    className="w-full bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 text-center cursor-pointer text-[10px] whitespace-normal break-words"
                                  >
                                    <option value="">Chưa phân loại</option>
                                    {deptLists.all.map(name => (
                                      <option key={name} value={name}>{name}</option>
                                    ))}
                                  </select>
                                </td>
                                {/* Ngày ký HĐTV (từ ngày → đến ngày) — cảnh báo khi còn <= 30 ngày tới hạn */}
                                <td className={`py-1 px-1 border-r border-slate-100 transition-colors ${
                                  c.probation_end_date && (new Date(c.probation_end_date).getTime() - new Date().getTime()) <= 30 * 24 * 60 * 60 * 1000 && (new Date(c.probation_end_date).getTime() - new Date().getTime()) > -24 * 60 * 60 * 1000
                                    ? "bg-amber-100/50"
                                    : ""
                                }`}>
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] font-extrabold text-slate-400 uppercase w-6 shrink-0">Từ</span>
                                      <input
                                        type="date"
                                        value={c.probation_start_date || ""}
                                        onChange={(e) => handleContractCellChange(actualIdx, "probation_start_date", e.target.value)}
                                        className="bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-0.5 px-1 w-full text-center"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] font-extrabold text-slate-400 uppercase w-6 shrink-0">Đến</span>
                                      <input
                                        type="date"
                                        value={c.probation_end_date || ""}
                                        onChange={(e) => handleContractCellChange(actualIdx, "probation_end_date", e.target.value)}
                                        className={`bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-0.5 px-1 w-full text-center ${
                                          c.probation_end_date && (new Date(c.probation_end_date).getTime() - new Date().getTime()) <= 30 * 24 * 60 * 60 * 1000 && (new Date(c.probation_end_date).getTime() - new Date().getTime()) > -24 * 60 * 60 * 1000
                                            ? "text-amber-600 font-bold"
                                            : ""
                                        }`}
                                      />
                                    </div>
                                  </div>
                                </td>
                                {/* Số HĐTV */}
                                <td className="py-1 px-1 border-r border-slate-100">
                                  <input
                                    type="text"
                                    value={c.probation_contract_number || ""}
                                    onChange={(e) => handleContractCellChange(actualIdx, "probation_contract_number", e.target.value)}
                                    className="w-full bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 font-mono text-[10px]"
                                  />
                                </td>
                                {/* Loại HĐLĐ */}
                                <td className="py-1 px-1 border-r border-slate-100">
                                  <select
                                    value={c.type || ""}
                                    onChange={(e) => handleContractCellChange(actualIdx, "type", e.target.value)}
                                    className="w-full bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 text-[10px] cursor-pointer"
                                  >
                                    <option value="">—</option>
                                    <option value="Xác định thời hạn">Xác định thời hạn</option>
                                    <option value="Không xác định thời hạn">Không xác định thời hạn</option>
                                    <option value="Thử việc">Thử việc</option>
                                    <option value="1 năm">1 năm</option>
                                    <option value="2 năm">2 năm</option>
                                    <option value="3 năm">3 năm</option>
                                    {c.type && !["Xác định thời hạn", "Không xác định thời hạn", "Thử việc", "1 năm", "2 năm", "3 năm"].includes(c.type) && (
                                      <option value={c.type}>{c.type}</option>
                                    )}
                                  </select>
                                </td>

                                {/* Ngày ký HĐLĐ chính thức (hiệu lực → hết hạn) */}
                                <td className={`py-1 px-1 border-r border-slate-100 transition-colors ${
                                  c.expiration_date && (new Date(c.expiration_date).getTime() - new Date().getTime()) <= 30 * 24 * 60 * 60 * 1000 && (new Date(c.expiration_date).getTime() - new Date().getTime()) > -24 * 60 * 60 * 1000
                                    ? "bg-amber-100/50"
                                    : ""
                                }`}>
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] font-extrabold text-slate-400 uppercase w-6 shrink-0">Từ</span>
                                      <input
                                        type="date"
                                        value={c.sign_date || ""}
                                        onChange={(e) => handleContractCellChange(actualIdx, "sign_date", e.target.value)}
                                        className="bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-0.5 px-1 w-full text-center"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[8px] font-extrabold text-slate-400 uppercase w-6 shrink-0">Đến</span>
                                      <input
                                        type="date"
                                        value={c.expiration_date || ""}
                                        onChange={(e) => handleContractCellChange(actualIdx, "expiration_date", e.target.value)}
                                        className={`bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-0.5 px-1 w-full text-center ${
                                          c.expiration_date && (new Date(c.expiration_date).getTime() - new Date().getTime()) <= 30 * 24 * 60 * 60 * 1000 && (new Date(c.expiration_date).getTime() - new Date().getTime()) > -24 * 60 * 60 * 1000
                                            ? "text-amber-600 font-bold"
                                            : ""
                                        }`}
                                      />
                                    </div>
                                  </div>
                                </td>
                                {/* Số HĐLĐ */}
                                <td className="py-1 px-1 border-r border-slate-100">
                                  <input
                                    type="text"
                                    value={c.contract_number && !c.contract_number.startsWith("IMPORT-") ? c.contract_number : ""}
                                    onChange={(e) => handleContractCellChange(actualIdx, "contract_number", e.target.value)}
                                    placeholder="Số HĐLĐ..."
                                    className="w-full bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 font-mono text-[10px]"
                                  />
                                </td>
                                {/* Lương BHXH */}
                                <td className="py-1 px-1 border-r border-slate-100 text-right">
                                  <input
                                    type="text"
                                    value={c.base_salary_insurance !== null && c.base_salary_insurance !== undefined ? c.base_salary_insurance.toLocaleString("vi-VN") : ""}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, "");
                                      handleContractCellChange(actualIdx, "base_salary_insurance", val ? parseInt(val) : null);
                                    }}
                                    className="w-full text-right bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 font-bold text-slate-800"
                                  />
                                </td>
                                {/* Thưởng HQCV */}
                                <td className="py-1 px-1 border-r border-slate-100 text-right">
                                  <input
                                    type="text"
                                    value={c.performance_bonus !== null && c.performance_bonus !== undefined ? c.performance_bonus.toLocaleString("vi-VN") : ""}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, "");
                                      handleContractCellChange(actualIdx, "performance_bonus", val ? parseInt(val) : null);
                                    }}
                                    className="w-full text-right bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 font-bold text-slate-600"
                                  />
                                </td>
                                {/* Phụ cấp */}
                                <td className="py-1 px-1 border-r border-slate-100 text-right">
                                  <input
                                    type="text"
                                    value={c.allowances !== null && c.allowances !== undefined ? c.allowances.toLocaleString("vi-VN") : ""}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, "");
                                      handleContractCellChange(actualIdx, "allowances", val ? parseInt(val) : null);
                                    }}
                                    className="w-full text-right bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 font-bold text-slate-600"
                                  />
                                </td>
                                {/* Tổng thu nhập */}
                                <td className="py-1 px-1 border-r border-slate-100 text-right font-bold text-emerald-700 bg-emerald-50/10">
                                  <input
                                    type="text"
                                    value={c.total_income !== null && c.total_income !== undefined ? c.total_income.toLocaleString("vi-VN") : ""}
                                    onChange={(e) => {
                                      const val = e.target.value.replace(/\D/g, "");
                                      handleContractCellChange(actualIdx, "total_income", val ? parseInt(val) : null);
                                    }}
                                    className="w-full text-right bg-transparent hover:bg-slate-100/50 focus:bg-white border border-transparent focus:border-blue-300 rounded outline-none py-1 px-1 font-bold text-emerald-700"
                                  />
                                </td>
                                {/* Ghi chú */}
                                <td className="py-1 px-2 border-r border-slate-100">
                                  <ContractNoteSelect
                                    value={c.notes || ""}
                                    onSave={(val) => handleContractCellChange(actualIdx, "notes", val)}
                                  />
                                </td>
                                {/* Thao tác */}
                                <td className="py-1 px-1 text-center flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleSaveContractRow(actualIdx)}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all cursor-pointer"
                                    title="Lưu dòng này"
                                  >
                                    <Save size={13} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteContractRow(actualIdx)}
                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-all cursor-pointer"
                                    title="Xoá"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          });
                        })()
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── MODAL PREVIEW NHẬP EXCEL HỢP ĐỒNG ─── */}
          {showExcelImportPreview && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white w-full max-w-6xl rounded-2xl shadow-premium border border-slate-100 overflow-hidden transform transition-all animate-scale-up max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#005BAC] text-white shrink-0">
                  <h3 className="font-heading font-black text-sm flex items-center gap-2">
                    <FileText size={16} /> Xem trước danh sách hợp đồng AI đã trích xuất từ Excel
                  </h3>
                  <button
                    onClick={() => setShowExcelImportPreview(false)}
                    className="text-white/80 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-white/10"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4 flex-1">
                  <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl text-blue-800 text-xs font-semibold">
                    💡 AI đã tự động chuẩn hóa ngày tháng và số tiền. Hãy kiểm tra các cột thông tin trước khi nạp vào bảng chính. Ô có nút chọn nhân viên cho phép khớp nối với hồ sơ nhân sự hiện có.
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[50vh] scrollbar-thin">
                    <table className="w-full text-[10px] text-left border-collapse min-w-[2200px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[8px] sticky top-0">
                          <th className="py-2 px-2 w-12 text-center bg-slate-50 border-r border-slate-200">STT</th>
                          <th className="py-2 px-2 w-24 bg-slate-50 border-r border-slate-200">Mã NV</th>
                          <th className="py-2 px-2 w-48 bg-slate-50 border-r border-slate-200">Họ và tên khớp hệ thống</th>
                          <th className="py-2 px-2 w-40 bg-slate-50 border-r border-slate-200">Phòng ban</th>
                          <th className="py-2 px-2 w-28 text-center bg-slate-50 border-r border-slate-200">Ngày nhận việc</th>
                          <th className="py-2 px-2 w-40 bg-slate-50 border-r border-slate-200">Số HĐTV</th>
                          <th className="py-2 px-2 w-28 text-center bg-slate-50 border-r border-slate-200">Từ ngày</th>
                          <th className="py-2 px-2 w-28 text-center bg-slate-50 border-r border-slate-200">Đến ngày</th>
                          <th className="py-2 px-2 w-40 bg-slate-50 border-r border-slate-200">Số HĐLĐ</th>
                          <th className="py-2 px-2 w-36 bg-slate-50 border-r border-slate-200">Loại HĐLĐ</th>
                          <th className="py-2 px-2 w-28 text-center bg-slate-50 border-r border-slate-200">Hiệu lực</th>
                          <th className="py-2 px-2 w-28 text-center bg-slate-50 border-r border-slate-200">Hết hạn</th>
                          <th className="py-2 px-2 w-28 text-right bg-slate-50 border-r border-slate-200">Lương BHXH</th>
                          <th className="py-2 px-2 w-28 text-right bg-slate-50 border-r border-slate-200">Thưởng HQCV</th>
                          <th className="py-2 px-2 w-28 text-right bg-slate-50 border-r border-slate-200">Phụ cấp</th>
                          <th className="py-2 px-2 w-28 text-right bg-slate-50 border-r border-slate-200 text-emerald-700 bg-emerald-50/10">Tổng thu nhập</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                        {excelImportedContracts.map((c, idx) => (
                          <tr key={c.id || idx} className="hover:bg-slate-50/30">
                            <td className="py-2 px-2 border-r border-slate-100 text-center font-bold text-slate-500">{idx + 1}</td>
                            <td className="py-2 px-2 border-r border-slate-100 font-mono">{c.employee_code}</td>
                            <td className="py-2 px-2 border-r border-slate-100 font-bold text-slate-800">
                              <select
                                value={c.employee_id || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setExcelImportedContracts(prev => {
                                    const copy = [...prev];
                                    const matched = employees.find(emp => emp.id === val);
                                    copy[idx] = {
                                      ...copy[idx],
                                      employee_id: val,
                                      employee_name: matched ? matched.name : copy[idx].employee_name,
                                      employee_code: matched ? (matched.employee_code || "") : copy[idx].employee_code,
                                    };
                                    return copy;
                                  });
                                }}
                                className="w-full bg-slate-50 border border-slate-200 rounded p-1 text-[10px] font-bold text-slate-800"
                              >
                                <option value="">-- {c.employee_name || "Chọn nhân sự hệ thống"} --</option>
                                {employees.map(emp => (
                                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-2 border-r border-slate-100 text-center font-semibold text-[10px] text-slate-500 whitespace-normal break-words">{c.department || "Chưa phân loại"}</td>
                            <td className="py-2 px-2 border-r border-slate-100 text-center font-mono">{c.onboard_date}</td>
                            <td className="py-2 px-2 border-r border-slate-100 font-mono text-[9px]">{c.probation_contract_number}</td>
                            <td className="py-2 px-2 border-r border-slate-100 text-center font-mono">{c.probation_start_date}</td>
                            <td className="py-2 px-2 border-r border-slate-100 text-center font-mono">{c.probation_end_date}</td>
                            <td className="py-2 px-2 border-r border-slate-100 font-mono text-[9px] text-[#005BAC]">{c.contract_number}</td>
                            <td className="py-2 px-2 border-r border-slate-100 font-bold">{c.type}</td>
                            <td className="py-2 px-2 border-r border-slate-100 text-center font-mono">{c.sign_date}</td>
                            <td className="py-2 px-2 border-r border-slate-100 text-center font-mono">{c.expiration_date}</td>
                            <td className="py-2 px-2 border-r border-slate-100 text-right font-bold text-slate-850">
                              {c.base_salary_insurance ? c.base_salary_insurance.toLocaleString("vi-VN") : ""}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-100 text-right font-bold text-slate-500">
                              {c.performance_bonus ? c.performance_bonus.toLocaleString("vi-VN") : ""}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-100 text-right font-bold text-slate-500">
                              {c.allowances ? c.allowances.toLocaleString("vi-VN") : ""}
                            </td>
                            <td className="py-2 px-2 border-r border-slate-100 text-right font-bold text-emerald-600 bg-emerald-50/10">
                              {c.total_income ? c.total_income.toLocaleString("vi-VN") : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2 shrink-0">
                  <button
                    onClick={() => setShowExcelImportPreview(false)}
                    className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl active:scale-95 transition-all cursor-pointer text-xs"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={() => {
                      setTempContracts(prev => [...excelImportedContracts, ...prev]);
                      setShowExcelImportPreview(false);
                      alert(`Đã nạp ${excelImportedContracts.length} dòng hợp đồng từ Excel vào bảng chính! Nhớ bấm 'Lưu tất cả thay đổi' để đồng bộ lên hệ thống.`);
                    }}
                    className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all cursor-pointer text-xs shadow-premium"
                  >
                    Đồng ý nạp vào bảng chính
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── MODAL XÁC NHẬN HỢP ĐỒNG ĐỌC BẰNG AI ─── */}
          {showSingleContractModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white w-full max-w-2xl rounded-2xl shadow-premium border border-slate-100 overflow-hidden transform transition-all animate-scale-up">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#005BAC] text-white">
                  <h3 className="font-heading font-black text-sm flex items-center gap-2">
                    <FileText size={16} /> Chi tiết hợp đồng AI trích xuất từ tài liệu
                  </h3>
                  <button
                    onClick={() => setShowSingleContractModal(false)}
                    className="text-white/80 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-white/10"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!singleContractForm.contract_number) {
                      alert("Vui lòng điền Số HĐLĐ!");
                      return;
                    }
                    setTempContracts(prev => [singleContractForm as Contract, ...prev]);
                    setShowSingleContractModal(false);
                    alert("Đã thêm hợp đồng trích xuất vào bảng! Bạn nhớ bấm 'Lưu tất cả thay đổi' để hoàn tất.");
                  }}
                  className="p-6 space-y-4 text-xs font-semibold text-slate-700"
                >
                  <div className="bg-purple-50 border border-purple-100 p-3 rounded-xl text-purple-800 text-[10px] font-bold">
                    🔮 AI đã đọc tài liệu hợp đồng và phát hiện thông tin dưới đây. Vui lòng xác minh và khớp nối với nhân sự hệ thống trước khi nạp vào bảng.
                  </div>

                  {/* Họ tên & Khớp nối */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Họ tên nhân viên (AI đọc được)</label>
                      <input
                        type="text"
                        value={singleContractForm.employee_name || ""}
                        onChange={(e) => setSingleContractForm(prev => ({ ...prev, employee_name: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] outline-none"
                      />
                    </div>
                    
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Khớp với hồ sơ hệ thống</label>
                      <select
                        value={singleContractForm.employee_id || ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const emp = employees.find(emp => emp.id === val);
                          setSingleContractForm(prev => ({
                            ...prev,
                            employee_id: val,
                            employee_name: emp ? emp.name : prev.employee_name,
                            employee_code: emp ? (emp.employee_code || "") : prev.employee_code,
                            employees: emp ? {
                              name: emp.name,
                              department: emp.department,
                              role: emp.role,
                              employee_code: emp.employee_code
                            } : undefined
                          }));
                        }}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                      >
                        <option value="">-- Chọn nhân sự để khớp nối --</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Số HĐLĐ & Loại HĐLĐ */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-[#005BAC] uppercase tracking-wider">Số HĐLĐ (Bắt buộc)</label>
                      <input
                        type="text"
                        value={singleContractForm.contract_number || ""}
                        onChange={(e) => setSingleContractForm(prev => ({ ...prev, contract_number: e.target.value }))}
                        required
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] outline-none font-bold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Loại hợp đồng</label>
                      <select
                        value={singleContractForm.type || "Thử việc"}
                        onChange={(e) => setSingleContractForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer"
                      >
                        <option value="Thử việc">Thử việc</option>
                        <option value="Không xác định thời hạn">Không xác định thời hạn</option>
                        <option value="Xác định thời hạn 1 năm">Xác định thời hạn 1 năm</option>
                        <option value="Xác định thời hạn 2 năm">Xác định thời hạn 2 năm</option>
                        <option value="Xác định thời hạn 3 năm">Xác định thời hạn 3 năm</option>
                        <option value="Xác định thời hạn khác">Xác định thời hạn khác</option>
                      </select>
                    </div>
                  </div>

                  {/* Ngày hiệu lực & Ngày hết hạn */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ngày hiệu lực HĐLĐ</label>
                      <input
                        type="date"
                        value={singleContractForm.sign_date || ""}
                        onChange={(e) => setSingleContractForm(prev => ({ ...prev, sign_date: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ngày hết hạn HĐLĐ</label>
                      <input
                        type="date"
                        value={singleContractForm.expiration_date || ""}
                        onChange={(e) => setSingleContractForm(prev => ({ ...prev, expiration_date: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  {/* Thông tin Lương, Thưởng và Phụ cấp */}
                  <div className="grid grid-cols-4 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Lương BHXH</label>
                      <input
                        type="text"
                        value={singleContractForm.base_salary_insurance !== null && singleContractForm.base_salary_insurance !== undefined ? singleContractForm.base_salary_insurance.toLocaleString("vi-VN") : ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setSingleContractForm(prev => ({ ...prev, base_salary_insurance: val ? parseInt(val) : null }));
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl outline-none text-right font-bold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Thưởng HQCV</label>
                      <input
                        type="text"
                        value={singleContractForm.performance_bonus !== null && singleContractForm.performance_bonus !== undefined ? singleContractForm.performance_bonus.toLocaleString("vi-VN") : ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setSingleContractForm(prev => ({ ...prev, performance_bonus: val ? parseInt(val) : null }));
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl outline-none text-right font-bold text-right font-bold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Phụ cấp</label>
                      <input
                        type="text"
                        value={singleContractForm.allowances !== null && singleContractForm.allowances !== undefined ? singleContractForm.allowances.toLocaleString("vi-VN") : ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setSingleContractForm(prev => ({ ...prev, allowances: val ? parseInt(val) : null }));
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl outline-none text-right font-bold"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-emerald-700 uppercase tracking-wider">Tổng thu nhập</label>
                      <input
                        type="text"
                        value={singleContractForm.total_income !== null && singleContractForm.total_income !== undefined ? singleContractForm.total_income.toLocaleString("vi-VN") : ""}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, "");
                          setSingleContractForm(prev => ({ ...prev, total_income: val ? parseInt(val) : null }));
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl outline-none text-right font-bold text-emerald-700"
                      />
                    </div>
                  </div>

                  {/* Thử việc & Thông tin phụ lục */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Số HĐ thử việc</label>
                      <input
                        type="text"
                        value={singleContractForm.probation_contract_number || ""}
                        onChange={(e) => setSingleContractForm(prev => ({ ...prev, probation_contract_number: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Thử việc từ ngày</label>
                      <input
                        type="date"
                        value={singleContractForm.probation_start_date || ""}
                        onChange={(e) => setSingleContractForm(prev => ({ ...prev, probation_start_date: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Thử việc đến ngày</label>
                      <input
                        type="date"
                        value={singleContractForm.probation_end_date || ""}
                        onChange={(e) => setSingleContractForm(prev => ({ ...prev, probation_end_date: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowSingleContractModal(false)}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-premium"
                    >
                      Xác nhận và nạp vào bảng
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ─── MODAL CẤU HÌNH SMTP GỬI THƯ ─── */}
          {showEmailConfigModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-premium border border-slate-100 overflow-hidden transform transition-all animate-scale-up">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#005BAC] text-white">
                  <h3 className="font-heading font-black text-sm flex items-center gap-2">
                    <Settings size={16} /> Cấu hình tài khoản SMTP gửi email
                  </h3>
                  <button
                    onClick={() => setShowEmailConfigModal(false)}
                    className="text-white/80 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-white/10"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const user = String(formData.get("smtp_user") || "").trim();
                    const pass = String(formData.get("smtp_pass") || "").trim();
                    const provider = modalProvider;
                    
                    let host = "smtp.gmail.com";
                    let port = 465;
                    let secure = true;

                    if (provider === "gmail") {
                      host = "smtp.gmail.com";
                      port = 465;
                      secure = true;
                    } else if (provider === "outlook") {
                      host = "smtp.office365.com";
                      port = 587;
                      secure = false;
                    } else {
                      host = String(formData.get("smtp_host") || "").trim() || "smtp.gmail.com";
                      port = Number(formData.get("smtp_port")) || 465;
                      secure = formData.get("smtp_secure") === "true";
                    }

                    if (!user || !pass) {
                      alert("Vui lòng điền đầy đủ email và mật khẩu!");
                      return;
                    }
                    handleSaveSmtpConfig(user, pass, provider, host, port, secure);
                  }}
                  className="p-6 space-y-4 text-xs font-semibold text-slate-700"
                >
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Nhà cung cấp Email</label>
                    <select
                      value={modalProvider}
                      onChange={(e) => setModalProvider(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all cursor-pointer"
                    >
                      <option value="gmail">Gmail</option>
                      <option value="outlook">Outlook / Microsoft Office 365 (Doanh nghiệp)</option>
                      <option value="custom">Cấu hình SMTP khác (Thủ công)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Tài khoản Email gửi đi</label>
                    <input
                      type="email"
                      name="smtp_user"
                      defaultValue={smtpConfig.user}
                      placeholder={modalProvider === "gmail" ? "vidu@gmail.com" : "phuonglnl@trungnamgroup.com.vn"}
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Mật khẩu hoặc Mật khẩu ứng dụng</span>
                      {modalProvider === "gmail" && (
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#005BAC] hover:underline normal-case font-bold"
                        >
                          Cách lấy mật khẩu Gmail?
                        </a>
                      )}
                      {modalProvider === "outlook" && (
                        <a
                          href="https://mysignins.microsoft.com/security-info"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#005BAC] hover:underline normal-case font-bold"
                        >
                          Cài đặt bảo mật Microsoft?
                        </a>
                      )}
                    </label>
                    <input
                      type="password"
                      name="smtp_pass"
                      defaultValue={smtpConfig.pass}
                      placeholder="Mật khẩu tài khoản hoặc mật khẩu ứng dụng"
                      required
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all font-mono tracking-widest"
                    />
                  </div>

                  {modalProvider === "custom" && (
                    <div className="grid grid-cols-2 gap-3 border border-slate-100 p-3 rounded-2xl bg-slate-50/50">
                      <div className="space-y-1.5 col-span-2">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">SMTP Server Host</label>
                        <input
                          type="text"
                          name="smtp_host"
                          defaultValue={smtpConfig.host}
                          placeholder="smtp.example.com"
                          required
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl focus:border-[#005BAC] outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Cổng (Port)</label>
                        <input
                          type="number"
                          name="smtp_port"
                          defaultValue={smtpConfig.port}
                          placeholder="465"
                          required
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl focus:border-[#005BAC] outline-none transition-all"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Bảo mật SSL/TLS</label>
                        <select
                          name="smtp_secure"
                          defaultValue={String(smtpConfig.secure)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl focus:border-[#005BAC] outline-none transition-all cursor-pointer"
                        >
                          <option value="true">SSL (Port 465)</option>
                          <option value="false">TLS/STARTTLS (Port 587 hoặc khác)</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Hướng dẫn bảo mật dựa theo nhà cung cấp */}
                  <div className="bg-blue-50 border border-blue-100 p-3.5 rounded-xl space-y-1 text-blue-800 text-[10px] leading-relaxed">
                    <p className="font-bold flex items-center gap-1 text-xs">
                      <Info size={13} /> Hướng dẫn cấu hình gửi email:
                    </p>
                    {modalProvider === "gmail" ? (
                      <>
                        <p>1. Gmail yêu cầu bạn phải bật **Xác minh 2 bước** trên tài khoản Google, sau đó tạo một **Mật khẩu ứng dụng (App Password)** gồm 16 ký tự để kết nối.</p>
                        <p>2. Không dùng mật khẩu đăng nhập Gmail thông thường vì Google chặn kết nối ứng dụng trực tiếp từ bên ngoài.</p>
                      </>
                    ) : modalProvider === "outlook" ? (
                      <>
                        <p>1. Đối với email Outlook doanh nghiệp (ví dụ `@trungnamgroup.com.vn`), hệ thống sử dụng SMTP của Microsoft (`smtp.office365.com` qua cổng `587`).</p>
                        <p>2. Nếu công ty bạn yêu cầu xác thực MFA (bảo mật 2 lớp), bạn cần tạo **Mật khẩu ứng dụng (App Password)** từ tài khoản Microsoft của mình để kết nối.</p>
                        <p>3. Nếu công ty không sử dụng bảo mật 2 lớp cho Outlook, bạn có thể điền mật khẩu đăng nhập email thông thường.</p>
                      </>
                    ) : (
                      <p>Vui lòng liên hệ bộ phận IT quản lý hệ thống email của công ty để xin thông tin **SMTP Host**, **Port** và kiểm tra xem có cần mật khẩu ứng dụng riêng hay không.</p>
                    )}
                    <p className="pt-1 text-slate-400 border-t border-blue-100/50 mt-1">Thông tin SMTP được lưu cục bộ trên trình duyệt của bạn (localStorage), đảm bảo an toàn tuyệt đối.</p>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowEmailConfigModal(false)}
                      className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl active:scale-95 transition-all cursor-pointer"
                    >
                      Hủy bỏ
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-premium"
                    >
                      Lưu cấu hình
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ─── MODAL CHI TIẾT BẢNG CÔNG NHÂN VIÊN ─── */}
          {selectedEmployeeForDetail && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white w-full max-w-4xl rounded-2xl shadow-premium border border-slate-100 overflow-hidden transform transition-all animate-scale-up max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-[#005BAC] text-white shrink-0">
                  <div>
                    <h3 className="font-heading font-black text-sm">
                      Chi tiết bảng công - {selectedEmployeeForDetail.name}
                    </h3>
                    <p className="text-white/80 text-[10px] font-bold mt-0.5">
                      Mã nhân viên: {selectedEmployeeForDetail.employeeCode} | Phòng ban: {selectedEmployeeForDetail.department || "Chưa phân loại"} | Tháng {timesheetMonth}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedEmployeeForDetail(null)}
                    className="text-white/80 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-white/10"
                  >
                    <X size={16} />
                  </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4 text-xs font-semibold text-slate-700 flex-1">
                  {/* Tóm tắt công */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-center">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tổng ngày công</div>
                      <div className="text-lg font-black text-slate-800">{getOfficialWorkdays(selectedEmployeeForDetail)} ngày</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-center">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tổng giờ tăng ca</div>
                      <div className="text-lg font-black text-emerald-600">{selectedEmployeeForDetail.totalOvertime} giờ</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-center">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Số lần đi trễ</div>
                      <div className="text-lg font-black text-amber-600">{selectedEmployeeForDetail.totalLate} phút</div>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-150 text-center">
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Số lần về sớm</div>
                      <div className="text-lg font-black text-orange-500">{selectedEmployeeForDetail.totalEarly} phút</div>
                    </div>
                  </div>

                  {/* Bảng chi tiết từng ngày */}
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nhật ký chấm công chi tiết theo ngày</h4>
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-2 px-3">Ngày</th>
                            <th className="py-2 px-3">Thứ</th>
                            <th className="py-2 px-3 text-center">Giờ vào</th>
                            <th className="py-2 px-3 text-center">Giờ ra</th>
                            <th className="py-2 px-3 text-center">Trễ (phút)</th>
                            <th className="py-2 px-3 text-center">Sớm (phút)</th>
                            <th className="py-2 px-3 text-center">Mô tả ca</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium text-slate-600">
                          {selectedEmployeeForDetail.details.map((day, idx) => (
                            <tr key={idx} className={`hover:bg-slate-50/50 ${day.isBusinessTrip ? "bg-blue-50/40" : ""}`}>
                              <td className="py-2.5 px-3 font-semibold text-slate-800">{day.date}</td>
                              <td className="py-2.5 px-3 text-slate-400 font-bold">{day.dayOfWeek}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">{day.checkin || "--:--"}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-[#005BAC]">{day.checkout || "--:--"}</td>
                              <td className="py-2.5 px-3 text-center text-amber-600 font-bold">{day.late > 0 ? day.late : "-"}</td>
                              <td className="py-2.5 px-3 text-center text-orange-500 font-bold">{day.early > 0 ? day.early : "-"}</td>
                              <td className="py-2.5 px-3 text-[10px] font-bold uppercase">
                                {day.isBusinessTrip ? (
                                  <span className="px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700">Công tác (bù công)</span>
                                ) : (
                                  <span className="text-slate-400">{day.status || "-"}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 shrink-0">
                  <button
                    onClick={() => setSelectedEmployeeForDetail(null)}
                    className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-95 transition-all cursor-pointer text-xs"
                  >
                    Đóng lại
                  </button>
                  <button
                    onClick={() => {
                      handleSendEmail(selectedEmployeeForDetail);
                      setSelectedEmployeeForDetail(null);
                    }}
                    disabled={selectedEmployeeForDetail.emailStatus === "sending" || !selectedEmployeeForDetail.emailFound}
                    className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-premium text-xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Send size={12} /> Gửi email báo cáo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── MODAL BẢNG TỔNG HỢP NGÀY CÔNG TRONG THÁNG ─── */}
          {showTimesheetMatrixModal && canViewTimesheetSummary && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white w-full max-w-6xl rounded-2xl shadow-premium border border-slate-100 overflow-hidden transform transition-all animate-scale-up max-h-[88vh] flex flex-col">
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-[#005BAC] text-white shrink-0">
                  <div>
                    <h3 className="font-heading font-black text-sm">Bảng tổng hợp ngày công trong tháng {timesheetMonth}</h3>
                    <p className="text-white/80 text-[10px] font-bold mt-0.5">x = Đi làm · x/2 = Làm nửa ngày · CT = Công tác · GT = Giải trình chấm công (đã duyệt) · P = Phép · P/2 = Phép nửa ngày · Ro = Nghỉ không lương</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={timesheetDeptFilter}
                      onChange={e => setTimesheetDeptFilter(e.target.value)}
                      className="px-3 py-1.5 rounded-lg bg-white/95 text-[#005BAC] font-bold text-[11px] cursor-pointer border-0 outline-none shadow max-w-[220px]"
                    >
                      <option value="">Tất cả phòng ban ({timesheetMatrix.rows.length})</option>
                      {timesheetDeptOptions.map(dept => (
                        <option key={dept} value={dept}>
                          {dept} ({timesheetMatrix.rows.filter(r => (r.department || "Chưa xếp phòng") === dept).length})
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleExportTimesheetSummary}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 hover:bg-white text-[#005BAC] font-bold rounded-lg cursor-pointer text-[11px] transition-all shadow active:scale-95"
                    >
                      <Download size={12} /> Tải về
                    </button>
                    <button
                      onClick={() => setShowTimesheetMatrixModal(false)}
                      className="text-white/80 hover:text-white transition-all cursor-pointer p-1 rounded-lg hover:bg-white/10"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="p-4 overflow-auto flex-1">
                  {timesheetMatrixRows.some(r => r.hasDateMismatch) && (
                    <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold leading-relaxed">
                      Có dữ liệu chấm công không rơi vào tháng {timesheetMonth} nên không xếp được vào bảng:{" "}
                      {timesheetMatrixRows.filter(r => r.hasDateMismatch).map(r => r.name).join(", ")}. Vui lòng kiểm tra lại cột "Ngày" trong file Excel.
                    </div>
                  )}
                  <table className="text-[9px] text-center border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                        <th className="py-1.5 px-2 sticky left-0 bg-slate-50 text-left z-10">Họ và Tên</th>
                        {Array.from({ length: timesheetMatrix.daysInMonth }, (_, i) => i + 1).map(d => {
                          const dow = new Date(timesheetMatrix.year, timesheetMatrix.month - 1, d).getDay();
                          return (
                            <th key={d} className={`py-1.5 px-1 w-5 ${dow === 0 ? "bg-slate-200" : ""}`}>{String(d).padStart(2, "0")}</th>
                          );
                        })}
                        <th className="py-1.5 px-1.5 w-12">VP</th>
                        <th className="py-1.5 px-1.5 w-12">Phép</th>
                        <th className="py-1.5 px-1.5 w-12">CT</th>
                        <th className="py-1.5 px-1.5 w-12">Ro</th>
                        <th className="py-1.5 px-1.5 w-12 bg-amber-50">Tổng</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                      {timesheetMatrixRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-1.5 px-2 text-left sticky left-0 bg-white whitespace-nowrap">{row.name}</td>
                          {row.days.map((tag, dIdx) => {
                            const dow = new Date(timesheetMatrix.year, timesheetMatrix.month - 1, dIdx + 1).getDay();
                            return (
                              <td key={dIdx} className={`py-1.5 px-1 ${
                                dow === 0 ? "bg-slate-100 text-slate-400" :
                                tag === "CT" ? "bg-blue-50 text-blue-700" :
                                tag === "GT" ? "bg-orange-100 text-orange-700" :
                                tag === "P" || tag === "P/2" ? "bg-emerald-50 text-emerald-700" :
                                tag === "Ro" ? "bg-amber-50 text-amber-700" : ""
                              }`}>{tag}</td>
                            );
                          })}
                          <td className="py-1.5 px-1.5 text-emerald-600">{row.vanPhong}</td>
                          <td className="py-1.5 px-1.5 text-emerald-600">{row.phepCoLuong}</td>
                          <td className="py-1.5 px-1.5 text-blue-600">{row.congTac}</td>
                          <td className="py-1.5 px-1.5 text-amber-600">{row.nghiKhongLuong}</td>
                          <td className="py-1.5 px-1.5 bg-amber-50/60 text-slate-900">{row.tongNgayCong}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {timesheetMatrixRows.length === 0 && (
                    <div className="text-slate-400 text-xs italic py-6 text-center bg-slate-50 rounded-2xl border border-slate-100">
                      Không có nhân viên nào thuộc phòng "{timesheetDeptFilter}" trong bảng công tháng này.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── MODAL XEM TRƯỚC VÀ XUẤT BÁO CÁO SINH NHẬT WORD ─── */}
          {showBirthdayPreviewModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
              <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl max-w-4xl w-full border border-white/10 shadow-2xl flex flex-col my-8 overflow-hidden transform transition-all animate-scale-up">
                
                {/* Header điều khiển */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-800 text-white shrink-0">
                  <h3 className="font-heading font-black text-sm flex items-center gap-2">
                    <FileText size={16} className="text-pink-400 animate-pulse" /> Xem trước bảng đề nghị phúc lợi sinh nhật
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportBirthdayReport}
                      disabled={isExportingBirthday}
                      className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl cursor-pointer text-xs transition-all shadow-md shadow-pink-500/20 active:scale-95 disabled:opacity-50"
                    >
                      {isExportingBirthday ? (
                        <>
                          <Loader2 size={12} className="animate-spin" /> Đang tạo file...
                        </>
                      ) : (
                        <>
                          <Download size={12} /> Tải file Word (.docx)
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowBirthdayPreviewModal(false)}
                      className="text-slate-400 hover:text-white transition-all cursor-pointer p-2 rounded-lg hover:bg-white/10"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Khung xem trước A4 */}
                <div className="p-6 overflow-y-auto bg-slate-100/50 flex justify-center max-h-[70vh]">
                  <div className="bg-white w-[210mm] min-h-[297mm] p-12 shadow-xl border border-slate-200/50 text-black flex flex-col justify-between font-serif relative" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    
                    <div>
                      {/* Document Header (Logo & Company Name) */}
                      <div className="flex justify-between items-start mb-6 border-b border-black pb-4 text-xs font-normal">
                        <div className="flex gap-2">
                          <div className="flex flex-col items-center justify-center border-2 border-[#005BAC] p-1 w-14 h-14 shrink-0 bg-white">
                            <span className="text-[10px] font-black text-[#005BAC] leading-none">TRUNG</span>
                            <span className="text-[10px] font-black text-red-600 leading-none mt-0.5">NAM</span>
                            <span className="text-[7px] font-bold text-slate-500 leading-none mt-1">E&C</span>
                          </div>
                          <div>
                            <div className="font-extrabold text-[10px] uppercase text-[#005BAC] tracking-wide">Công ty CP Xây dựng và Lắp máy Trung Nam</div>
                            <div className="text-[8px] text-slate-600 mt-1 leading-normal">
                              A: Tầng trệt tòa nhà văn phòng Safomec, 7/1 Thành Thái, P14, Q10, TPHCM<br/>
                              T: (+84) 834 70 75 79 | E: info.tnec@trungnamgroup.com.vn<br/>
                              W: trungnamec.com.vn
                            </div>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end">
                          <h2 className="font-black text-sm uppercase tracking-wide text-black m-0">Bảng theo dõi phúc lợi</h2>
                          <div className="font-black text-[10px] underline mt-0.5">HCNS/BM/048</div>
                        </div>
                      </div>

                      {/* Main Title */}
                      <div className="text-center my-6">
                        <h1 className="text-base font-black uppercase text-[#005BAC] tracking-wider m-0">
                          DANH SÁCH SINH NHẬT THÁNG {selectedBirthdayMonth}/{new Date().getFullYear()}
                        </h1>
                      </div>

                      {/* Document Table */}
                      <div className="overflow-x-auto my-4">
                        <table className="w-full text-xs text-left border border-black border-collapse" style={{ borderWidth: '1px' }}>
                          <thead>
                            <tr className="bg-[#D68F5A]/20 text-black font-extrabold text-[10px] uppercase border-b border-black">
                              <th className="py-2.5 px-1.5 border-r border-black text-center font-bold" style={{ width: '40px' }}>STT</th>
                              <th className="py-2.5 px-2 border-r border-black font-bold">Họ và tên</th>
                              <th className="py-2.5 px-2 border-r border-black font-bold">Chức vụ</th>
                              <th className="py-2.5 px-2 border-r border-black font-bold">Phòng ban</th>
                              <th className="py-2.5 px-2 border-r border-black text-center font-bold" style={{ width: '80px' }}>Phúc lợi</th>
                              <th className="py-2.5 px-2 border-r border-black text-right font-bold" style={{ width: '90px' }}>Số tiền</th>
                              <th className="py-2.5 px-2 border-r border-black text-center font-bold" style={{ width: '100px' }}>Thâm niên</th>
                              <th className="py-2.5 px-2 font-bold" style={{ width: '90px' }}>Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-black text-[11px]">
                            {filteredBirthdays.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="py-4 text-center italic text-slate-500 border border-black">
                                  Không có dữ liệu sinh nhật trong tháng {selectedBirthdayMonth}
                                </td>
                              </tr>
                            ) : (
                              filteredBirthdays.map((b, idx) => (
                                <tr key={b.id} className="hover:bg-slate-50">
                                  <td className="py-2 px-1.5 border-r border-black text-center font-medium">{idx + 1}</td>
                                  <td className="py-2 px-2 border-r border-black font-bold">{b.name}</td>
                                  <td className="py-2 px-2 border-r border-black text-[#A0522D] font-bold">{b.role}</td>
                                  <td className="py-2 px-2 border-r border-black text-[#A0522D] font-bold">{b.dept}</td>
                                  <td className="py-2 px-2 border-r border-black text-[#005BAC] text-center font-bold">Sinh nhật</td>
                                  <td className="py-2 px-2 border-r border-black text-right font-bold">
                                    {b.giftAmount ? b.giftAmount.toLocaleString("vi-VN") : "0"}
                                  </td>
                                  <td className="py-2 px-2 border-r border-black text-[#005BAC] text-center font-bold">{b.tenure || ""}</td>
                                  <td className="py-2 px-2 border-black"></td>
                                </tr>
                              ))
                            )}
                            
                            <tr className="bg-slate-50/50 border-t border-black font-bold">
                              <td colSpan={5} className="py-2 px-2 border-r border-black text-center uppercase tracking-wider font-extrabold">TỔNG CỘNG</td>
                              <td className="py-2 px-2 border-r border-black text-right text-[#005BAC] font-extrabold">
                                {filteredBirthdays.reduce((sum, b) => sum + (b.giftAmount || 0), 0).toLocaleString("vi-VN")}
                              </td>
                              <td className="py-2 px-2 border-r border-black"></td>
                              <td className="py-2 px-2 border-black"></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Date & Signatures Section */}
                      <div className="mt-8 text-xs font-normal">
                        <div className="text-right italic mb-4">
                          Tp. HCM, ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
                        </div>
                        <div className="grid grid-cols-2 text-center font-bold">
                          <div className="italic uppercase font-bold text-slate-800">BLĐ DUYỆT</div>
                          <div className="italic uppercase font-bold text-slate-800">PHÒNG HCNS</div>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ─── MODAL CẤU HÌNH AI PHÂN TÍCH HỢP ĐỒNG ─── */}
          {showAiSettingsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 flex flex-col gap-4 transform transition-all animate-scale-up">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-heading font-black text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                    <Settings className="text-[#005BAC]" size={18} /> Cấu hình mô hình AI phân tích
                  </h3>
                  <button
                    onClick={() => setShowAiSettingsModal(false)}
                    className="text-slate-400 hover:text-slate-600 transition-all cursor-pointer p-1.5 rounded-lg hover:bg-slate-100"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">Mô hình AI sử dụng:</label>
                    <select
                      value={selectedAiModel}
                      onChange={(e) => setSelectedAiModel(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none text-xs font-semibold text-slate-700 bg-slate-50 cursor-pointer"
                    >
                      <option value="gpt-4o-mini">gpt-4o-mini (Khuyên dùng, Nhanh & Tối ưu chi phí)</option>
                      <option value="gpt-4o">gpt-4o (Đọc thông tin phức tạp, chính xác cao)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-600">OpenAI API Key (sk-...):</label>
                    <input
                      type="password"
                      value={selectedAiApiKey}
                      onChange={(e) => setSelectedAiApiKey(e.target.value)}
                      placeholder="Nhập API Key của bạn (sk-...)"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none text-xs font-semibold text-slate-700 bg-slate-50"
                    />
                    <p className="text-[10px] text-slate-400 font-medium">
                      API Key này được lưu an toàn tại trình duyệt của bạn (local) và chỉ dùng để gửi yêu cầu phân tích trực tiếp tới OpenAI.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t border-slate-100 pt-3 mt-2">
                  <button
                    onClick={() => setShowAiSettingsModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl active:scale-95 transition-all cursor-pointer text-xs"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    onClick={() => {
                      localStorage.setItem("openai_model_nhan_su", selectedAiModel);
                      localStorage.setItem("openai_model_hanh_chinh", selectedAiModel);
                      localStorage.setItem("openai_api_key", selectedAiApiKey.trim());
                      localStorage.setItem("openai_api_key_hanh_chinh", selectedAiApiKey.trim());
                      setShowAiSettingsModal(false);
                      alert("Đã lưu cấu hình mô hình AI và API Key thành công!");
                    }}
                    className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all cursor-pointer shadow-premium text-xs"
                  >
                    Lưu cấu hình
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Floating Loading Indicator for AI / Excel import */}
          {(isExcelImporting || isContractReading) && (
            <div className="fixed bottom-6 right-6 z-50 bg-white rounded-2xl p-4 border border-slate-200 shadow-2xl flex items-center gap-3 animate-slide-in">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Loader2 className="animate-spin text-[#005BAC]" size={20} />
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-800">
                  {isExcelImporting ? "Đang xử lý file Excel..." : "AI đang đọc hợp đồng..."}
                </h4>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                  {isExcelImporting 
                    ? (excelImportStage === "reading" ? "Đang đọc & tối ưu dữ liệu..." :
                       excelImportStage === "sending" ? "Đang phân tích cấu trúc cột..." : "Đang nạp dữ liệu từ AI...") 
                    : "Đang trích xuất lương, thưởng và ngày hiệu lực..."}
                </p>
              </div>
            </div>
          )}
          </>
          )}
        </main>
      </div>
    </div>
  );
}

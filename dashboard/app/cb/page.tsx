"use client";

import { useState, useEffect, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
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
  RefreshCw
} from "lucide-react";
import * as XLSX from "xlsx";
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
}

interface Contract {
  id: string;
  contract_number: string;
  type: string;
  expiration_date: string;
  effective_date: string;
  status: string;
}

// --- MOCK DATA FOR C&B SUBSECTIONS ---
const MOCK_SALARY_INFO = [
  { id: "1", name: "Phạm Thành Lộc", base: 18000000, insurance: 5000000, phone: 300000, lunch: 730000, gas: 500000, total: 19530000 },
  { id: "2", name: "Nguyễn Bích Như Quỳnh", base: 15000000, insurance: 5000000, phone: 300000, lunch: 730000, gas: 500000, total: 16530000 },
  { id: "3", name: "Nguyễn Ngọc Thanh Hằng", base: 14000000, insurance: 4500000, phone: 200000, lunch: 730000, gas: 500000, total: 15430000 },
  { id: "4", name: "Trần Nghiệp Quang", base: 22000000, insurance: 6000000, phone: 500000, lunch: 730000, gas: 1000000, total: 24230000 }
];

const MOCK_PROMOTIONS = [
  { name: "Phạm Thành Lộc", oldRole: "Nhân viên Marketing", newRole: "Trưởng nhóm Marketing", oldDept: "Phòng HCNS", newDept: "Phòng HCNS", date: "2026-01-01", type: "Thăng chức" },
  { name: "Trần Nghiệp Quang", oldRole: "Kỹ sư giám sát", newRole: "Chỉ huy phó", oldDept: "Phòng Dự án", newDept: "Dự án Vàm Lẽo", date: "2026-03-15", type: "Bổ nhiệm" },
  { name: "Nguyễn Ngọc Thanh Hằng", oldRole: "Nhân viên C&B bậc 1", newRole: "Nhân viên C&B bậc 2", oldDept: "Phòng HCNS", newDept: "Phòng HCNS", date: "2026-05-01", type: "Tăng bậc" }
];

const MOCK_TERMINATIONS = [
  { name: "Trần Văn A", dept: "Phòng Kỹ thuật", date: "2026-05-31", reason: "Tìm kiếm thử thách mới", status: "Đã bàn giao", allowance: 12000000 },
  { name: "Lê Thị B", dept: "Phòng Kế toán", date: "2026-06-15", reason: "Đi du học nước ngoài", status: "Đang bàn giao (80%)", allowance: 0 }
];

const MOCK_CONCURRENTS = [
  { name: "Phạm Thành Lộc", primary: "Trưởng nhóm Marketing", concurrent: "Quản trị truyền thông nội bộ", dept: "Phòng HCNS", allowance: 2000000, date: "2026-02-01" },
  { name: "Trần Nghiệp Quang", primary: "Chỉ huy phó Vàm Lẽo", concurrent: "Giám sát ATLĐ dự án Vàm Lẽo", dept: "Khối Dự án", allowance: 3000000, date: "2026-04-01" }
];

const MOCK_ATTENDANCE_LOGS = [
  { date: "2026-06-09", name: "Phạm Thành Lộc", checkin: "07:55", checkout: "17:05", hours: 8, status: "Đúng giờ" },
  { date: "2026-06-09", name: "Nguyễn Bích Như Quỳnh", checkin: "08:02", checkout: "17:15", hours: 8, status: "Muộn (2')" },
  { date: "2026-06-09", name: "Nguyễn Ngọc Thanh Hằng", checkin: "07:45", checkout: "17:00", hours: 8, status: "Đúng giờ" },
  { date: "2026-06-09", name: "Trần Nghiệp Quang", checkin: "08:15", checkout: "17:30", hours: 8, status: "Muộn (15')" }
];

const MOCK_EXPLANATIONS = [
  { date: "2026-06-08", name: "Phạm Thành Lộc", reason: "Quên quét vân tay lúc về", propose: "Checkout 17:00", status: "Chờ duyệt" },
  { date: "2026-06-05", name: "Trần Nghiệp Quang", reason: "Đi gặp đối tác trực tiếp tại công trường", propose: "Cả ngày công tác", status: "Đã duyệt" }
];

const MOCK_LEAVES = [
  { name: "Phạm Thành Lộc", type: "Phép năm", from: "2026-06-12", to: "2026-06-12", days: 1, reason: "Giải quyết việc gia đình", status: "Đã duyệt" },
  { name: "Nguyễn Bích Như Quỳnh", type: "Phép năm", from: "2026-06-20", to: "2026-06-22", days: 3, reason: "Nghỉ mát hè cùng gia đình", status: "Chờ duyệt" }
];

const MOCK_TRAVELS = [
  { name: "Trần Nghiệp Quang", dest: "Dự án Cà Ná", from: "2026-06-10", to: "2026-06-12", purpose: "Kiểm tra kỹ thuật ATLĐ", allowance: 1500000, status: "Đã duyệt" }
];

const MOCK_REGIMES = [
  { name: "Nguyễn Thị Hoa", type: "Nghỉ thai sản (6 tháng)", from: "2026-03-01", to: "2026-09-01", insurance_claim: "Hồ sơ đã gửi BHXH", status: "Đang nghỉ" },
  { name: "Lê Minh Tuấn", type: "Ốm đau hưởng BHXH (3 ngày)", from: "2026-06-01", to: "2026-06-03", insurance_claim: "Chờ duyệt chi trả", status: "Đã đi làm lại" }
];

const MOCK_ALLOWANCES = [
  { name: "Cơm trưa văn phòng", standard: "730.000 đ/tháng", target: "Toàn bộ nhân viên chính thức", activeCount: 145 },
  { name: "Xăng xe di chuyển", standard: "500.000 đ - 1.500.000 đ/tháng", target: "Kỹ sư công trường và cấp quản lý", activeCount: 54 },
  { name: "Điện thoại liên lạc", standard: "200.000 đ - 500.000 đ/tháng", target: "Cấp chỉ huy và Nhân viên kinh doanh", activeCount: 32 }
];

const MOCK_BHXH_LOGS = [
  { name: "Phạm Thành Lộc", code: "0123456789", base: 18000000, SI: 1440000, HI: 270000, UI: 180000, company_total: 3870000, booklet: "Công ty giữ" },
  { name: "Nguyễn Bích Như Quỳnh", code: "0123456790", base: 15000000, SI: 1200000, HI: 225000, UI: 150000, company_total: 3225000, booklet: "Công ty giữ" },
  { name: "Nguyễn Ngọc Thanh Hằng", code: "0123456791", base: 14000000, SI: 1120000, HI: 210000, UI: 140000, company_total: 3010000, booklet: "Công ty giữ" },
  { name: "Trần Nghiệp Quang", code: "0123456792", base: 22000000, SI: 1760000, HI: 330000, UI: 220000, company_total: 4730000, booklet: "Công ty giữ" }
];

const BENEFIT_POLICY: Record<string, Record<string, number | string>> = {
  "Sinh nhật": {
    "Điều hành cao cấp": "Theo phê duyệt",
    "Quản lý cấp cao": 1000000,
    "Quản lý cấp trung": 500000,
    "Quản lý sơ cấp": 400000,
    "CBNV": 300000
  },
  "Kết hôn": {
    "Điều hành cao cấp": "Theo phê duyệt",
    "Quản lý cấp cao": 2000000,
    "Quản lý cấp trung": 1000000,
    "Quản lý sơ cấp": 700000,
    "CBNV": 500000
  },
  "Sinh con": {
    "Điều hành cao cấp": "Theo phê duyệt",
    "Quản lý cấp cao": 2000000,
    "Quản lý cấp trung": 1000000,
    "Quản lý sơ cấp": 500000,
    "CBNV": 500000
  },
  "Ốm đau": {
    "Điều hành cao cấp": "Theo phê duyệt",
    "Quản lý cấp cao": 1000000,
    "Quản lý cấp trung": 500000,
    "Quản lý sơ cấp": 400000,
    "CBNV": 300000
  },
  "Tử tuất": {
    "Điều hành cao cấp": "Theo phê duyệt",
    "Quản lý cấp cao": 2000000,
    "Quản lý cấp trung": 1000000,
    "Quản lý sơ cấp": 700000,
    "CBNV": 500000
  }
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

const getEmployeeTenureYears = (emp: any): number => {
  if (!emp || !emp.created_at) return 1.5;
  const joinDate = new Date(emp.created_at);
  const now = new Date("2026-06-19");
  const diffTime = Math.max(0, now.getTime() - joinDate.getTime());
  const diffDays = diffTime / (1000 * 60 * 60 * 24);
  return diffDays / 365.25;
};

const getEmployeeTenureStr = (emp: any): string => {
  if (!emp || !emp.created_at) return "1 năm 6 tháng";
  const joinDate = new Date(emp.created_at);
  const now = new Date("2026-06-19");
  let years = now.getFullYear() - joinDate.getFullYear();
  let months = now.getMonth() - joinDate.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  if (years === 0 && months === 0) {
    return "Mới gia nhập";
  }
  return `${years > 0 ? `${years} năm ` : ""}${months > 0 ? `${months} tháng` : ""}`.trim();
};

const getProposedHolidayBonus = (years: number): number => {
  if (years < 1) return 300000;
  if (years < 3) return 500000;
  if (years < 5) return 1000000;
  return 2000000;
};

const INITIAL_BENEFIT_CLAIMS = [
  {
    id: "claim-1",
    name: "Nguyễn Ngọc Thanh Hằng",
    role: "Nhân viên C&B bậc 2",
    department: "Phòng Hành Chính Nhân Sự",
    level: "CBNV",
    category: "Kết hôn",
    amount: 500000,
    date: "2026-06-02",
    status: "Đã chi",
    notes: "Đám cưới nhân viên Nguyễn Ngọc Thanh Hằng"
  },
  {
    id: "claim-2",
    name: "Phạm Thành Lộc",
    role: "Trưởng nhóm Marketing",
    department: "Phòng Hành Chính Nhân Sự",
    level: "CBNV",
    category: "Ốm đau",
    amount: 300000,
    date: "2026-05-20",
    status: "Đã chi",
    notes: "Nghỉ nằm viện 3 ngày do sốt xuất huyết"
  },
  {
    id: "claim-3",
    name: "Trần Nghiệp Quang",
    role: "Chỉ huy phó",
    department: "Ban Điều Hành Dự Án Vàm Lẽo",
    level: "Quản lý sơ cấp",
    category: "Sinh con",
    amount: 500000,
    date: "2026-05-12",
    status: "Đã chi",
    notes: "Vợ sinh con, gửi chế độ chúc mừng"
  },
  {
    id: "claim-4",
    name: "Nguyễn Bích Như Quỳnh",
    role: "Nhân viên C&B bậc 1",
    department: "Phòng Hành Chính Nhân Sự",
    level: "CBNV",
    category: "Sinh nhật",
    amount: 300000,
    date: "2026-06-15",
    status: "Đã duyệt",
    notes: "Quà sinh nhật CBNV tháng 6"
  },
  {
    id: "claim-5",
    name: "Nguyễn Nam Hải",
    role: "Tổng Giám Đốc",
    department: "Hội Đồng Quản Trị",
    level: "Điều hành cao cấp",
    category: "Sinh nhật",
    amount: "Theo phê duyệt",
    date: "2026-06-12",
    status: "Đã duyệt",
    notes: "Sinh nhật Tổng Giám Đốc"
  }
];

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

// --- ORG CHART SETUP DATA ---
const DEPARTMENTS_LIST = [
  // Khối Văn Phòng
  { name: "Phòng Hành Chính Nhân Sự", key: "hr", type: "office", desc: "Quản trị hành chính, tuyển dụng, đào tạo, C&B và các chế độ phúc lợi", color: "from-blue-600 to-indigo-600" },
  { name: "Phòng Tài Chính Kế Toán", key: "accounting", type: "office", desc: "Quản lý tài chính doanh nghiệp, kế toán thuế, công nợ và quyết toán thanh toán", color: "from-indigo-600 to-purple-600" },
  { name: "Phòng Thư Ký, Trợ Lý", key: "assistant", type: "office", desc: "Hỗ trợ công tác thư ký Ban Giám đốc, điều phối công việc hành chính", color: "from-amber-600 to-yellow-600" },
  { name: "Phòng Kế Hoạch Đấu Thầu", key: "bidding", type: "office", desc: "Xây dựng kế hoạch đấu thầu, định giá dự án, lập hồ sơ thầu thi công", color: "from-purple-600 to-fuchsia-600" },
  { name: "Phòng Thị Trường", key: "market", type: "office", desc: "Phát triển thị trường, quan hệ đối tác, mở rộng dự án thi công xây dựng", color: "from-pink-600 to-rose-600" },
  
  // Khối Kỹ Thuật & Giám Sát
  { name: "Phòng Kỹ Thuật", key: "technical", type: "tech", desc: "Giám sát thiết kế, bóc tách khối lượng, giải pháp kỹ thuật công trình", color: "from-teal-600 to-emerald-600" },
  { name: "Phòng Vật Tư Thiết Bị", key: "materials", type: "tech", desc: "Cung ứng vật tư thiết bị, quản lý điều động máy móc công trình dự án", color: "from-cyan-600 to-blue-600" },
  { name: "Phòng An Toàn Lao Động", key: "safety", type: "tech", desc: "Đảm bảo ATLĐ, vệ sinh môi trường công trường, đào tạo HSE", color: "from-emerald-600 to-green-600" },
  { name: "Phòng Quản Lý Dự Án", key: "management", type: "tech", desc: "Quản lý tiến độ, chất lượng thi công dự án, hồ sơ thanh quyết toán", color: "from-sky-600 to-indigo-600" },

  // Khối Hiện Trường / Công Trường
  { name: "Ban Điều Hành Dự Án Vàm Lẽo", key: "project_vamleo", type: "project", desc: "Ban điều hành trực tiếp thi công, giám sát tại dự án Vàm Lẽo", color: "from-amber-600 to-orange-600" },
  { name: "Ban Điều Hành Dự Án Cà Ná", key: "project_cana", type: "project", desc: "Ban điều hành trực tiếp thi công, giám sát tại dự án Cà Ná", color: "from-orange-600 to-red-600" }
];

const BOARD_OF_DIRECTORS = [
  { name: "Nguyễn Nam Hải", role: "Tổng Giám Đốc", email: "hai.nn@trungnamec.com.vn", phone: "0918.999.888", avatar: "NH" },
  { name: "Lê Minh Tâm", role: "Phó Tổng Giám Đốc Tài Chính", email: "tam.lm@trungnamec.com.vn", phone: "0912.777.666", avatar: "MT" },
  { name: "Trần Đức Long", role: "Phó Tổng Giám Đốc Kỹ Thuật", email: "long.td@trungnamec.com.vn", phone: "0903.555.444", avatar: "DL" }
];

export default function CBPage() {
  // 5 Main Tabs: employee_profile, attendance, payroll_insurance, benefits, org_chart
  const [activeTab, setActiveTab] = useState("employee_profile");
  const [activeSubTab, setActiveSubTab] = useState("personal");

  // --- BENEFIT CLAIMS & HOLIDAY BONUS STATES ---
  const [benefitClaims, setBenefitClaims] = useState<any[]>([]);
  const [holidayBonusAdjustments, setHolidayBonusAdjustments] = useState<Record<string, number>>({});
  const [showCreateClaimModal, setShowCreateClaimModal] = useState(false);
  const [selectedHolidayId, setSelectedHolidayId] = useState("national_day_2026");
  const [selectedBirthdayMonth, setSelectedBirthdayMonth] = useState<number>(new Date().getMonth() + 1);
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
  
  // Real contract data from Supabase
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(false);

  // Biometric sync state
  const [isSyncingMachine, setIsSyncingMachine] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);

  // Search keyword
  const [searchQuery, setSearchQuery] = useState("");

  // Authorization states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Filter employees for Women's Day (8/3 and 20/10)
  const holidayFilteredEmployees = useMemo(() => {
    const isWomensDay = selectedHolidayId === "womens_day_2026" || selectedHolidayId === "vn_womens_day_2026";
    if (isWomensDay) {
      return employees.filter(emp => emp.gender === "Nữ");
    }
    return employees;
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

      const savedClaims = localStorage.getItem("tnec_cb_benefit_claims");
      if (savedClaims) {
        try {
          setBenefitClaims(JSON.parse(savedClaims));
        } catch (e) {
          console.error("Error parsing saved benefit claims", e);
        }
      } else {
        setBenefitClaims(INITIAL_BENEFIT_CLAIMS);
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
  }, []);

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

          // Fetch employees from database to map email
          const { data: dbEmployees, error: empError } = await supabase
            .from("employees")
            .select("employee_code, name, email, department");
          if (empError) throw empError;

          const parsedList: ParsedEmployeeAttendance[] = [];

          Object.entries(employeeMap).forEach(([code, rows]) => {
            const firstRow = rows[0];
            const rawName = String(firstRow[colIndices.name] || "");
            const cleanedName = rawName.replace(/^EC\s*-\s*/gi, "").trim();
            const dept = colIndices.dept !== -1 ? String(firstRow[colIndices.dept] || "").trim() : "";

            const cleanCode = (c: string) => String(c || "").replace(/^0+/, "").trim();
            const dbEmp = dbEmployees?.find(e => {
              const dbCode = cleanCode(e.employee_code);
              const excelCode = cleanCode(code);
              const dbNormName = normalizeText(e.name);
              const excelNormName = normalizeText(cleanedName);
              
              const codeMatches = dbCode && excelCode && dbCode === excelCode;
              const nameMatches = dbNormName === excelNormName;
              const specialQuyenMatches = (excelNormName === "nttquyen" || excelCode === "5897") && dbNormName === "nguyen truong thuy quyen";
              
              return codeMatches || nameMatches || specialQuyenMatches;
            });

            let email = dbEmp?.email || "";
            if (!email && (normalizeText(cleanedName) === "nttquyen" || cleanCode(code) === "5897")) {
              email = "quyenntt@trungnamgroup.com.vn, quyen.0408@gmail.com";
            }
            const emailFound = !!email;

            let displayName = cleanedName;
            if (dbEmp) {
              if (normalizeText(dbEmp.name) === "nguyen truong thuy quyen") {
                displayName = "Nguyễn Trương Thùy Quyên - CV Tuyển dụng";
              } else {
                displayName = dbEmp.name;
              }
            } else if (normalizeText(cleanedName) === "nttquyen" || cleanCode(code) === "5897") {
              displayName = "Nguyễn Trương Thùy Quyên - CV Tuyển dụng";
            }

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
                status: colIndices.status !== -1 ? String(row[colIndices.status] || "").trim() : ""
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
      const response = await fetch("/api/send-attendance-email", {
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
            totalDays: emp.totalDays,
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

  const handleCreateClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimForm.employeeId) {
      alert("Vui lòng chọn nhân viên!");
      return;
    }
    const emp = employees.find(e => e.id === claimForm.employeeId);
    if (!emp) return;

    const level = getEmployeeLevel(emp.role);
    let amount: number | string = BENEFIT_POLICY[claimForm.category][level];
    if (claimForm.customAmount) {
      amount = isNaN(Number(claimForm.customAmount)) ? claimForm.customAmount : Number(claimForm.customAmount);
    }

    const newClaim = {
      id: `claim-${Date.now()}`,
      employee_id: emp.id,
      name: emp.name,
      role: emp.role,
      department: emp.department,
      level,
      category: claimForm.category,
      amount,
      date: claimForm.date,
      status: claimForm.status,
      notes: claimForm.notes
    };

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
  };

  const handleDeleteClaim = (claimId: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa yêu cầu trợ cấp này không?")) return;
    const updatedClaims = benefitClaims.filter(c => c.id !== claimId);
    setBenefitClaims(updatedClaims);
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_cb_benefit_claims", JSON.stringify(updatedClaims));
    }
  };

  const handleUpdateHolidayAdjustment = (empId: string, amount: number) => {
    const updatedAdjustments = { ...holidayBonusAdjustments, [empId]: amount };
    setHolidayBonusAdjustments(updatedAdjustments);
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_cb_holiday_bonus_adjustments", JSON.stringify(updatedAdjustments));
    }
  };

  const handleApproveAllHolidayBonuses = () => {
    if (!confirm("Bạn có chắc chắn muốn phê duyệt mức đề xuất cho toàn bộ nhân sự chưa được duyệt trong danh sách đang hiển thị?")) return;
    const updatedAdjustments = { ...holidayBonusAdjustments };
    holidayFilteredEmployees.forEach(emp => {
      if (updatedAdjustments[emp.id] === undefined) {
        const tenureYears = getEmployeeTenureYears(emp);
        updatedAdjustments[emp.id] = getProposedHolidayBonus(tenureYears);
      }
    });
    setHolidayBonusAdjustments(updatedAdjustments);
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_cb_holiday_bonus_adjustments", JSON.stringify(updatedAdjustments));
    }
    alert("Đã phê duyệt hàng loạt thành công!");
  };

  const handleExportBenefitClaims = () => {
    const dataToExport = filteredBenefitClaims.map((claim, idx) => ({
      "STT": idx + 1,
      "Họ và Tên": claim.name,
      "Phòng ban": claim.department,
      "Chức vụ": claim.role,
      "Cấp quản lý": claim.level,
      "Loại trợ cấp": claim.category,
      "Số tiền hỗ trợ": typeof claim.amount === "number" ? claim.amount.toLocaleString("vi-VN") + " đ" : claim.amount,
      "Ngày sự kiện": new Date(claim.date).toLocaleDateString("vi-VN"),
      "Trạng thái": claim.status,
      "Ghi chú": claim.notes || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tro_Cap_Phuc_Loi");
    XLSX.writeFile(workbook, "Bao_cao_tro_cap_phuc_loi.xlsx");
  };

  const handleExportHolidayBonus = (holidayName: string) => {
    const dataToExport = holidayFilteredEmployees.map((emp, idx) => {
      const level = getEmployeeLevel(emp.role);
      const tenureYears = getEmployeeTenureYears(emp);
      const tenureStr = getEmployeeTenureStr(emp);
      const proposed = getProposedHolidayBonus(tenureYears);
      const approved = holidayBonusAdjustments[emp.id] ?? proposed;
      return {
        "STT": idx + 1,
        "Họ và Tên": emp.name,
        "Phòng ban": emp.department,
        "Chức vụ": emp.role,
        "Cấp quản lý": level,
        "Ngày vào làm": emp.created_at ? new Date(emp.created_at).toLocaleDateString("vi-VN") : "19/06/2026",
        "Giới tính": emp.gender || "",
        "Thâm niên": tenureStr,
        "Mức thưởng đề xuất (đ)": proposed,
        "Mức thưởng phê duyệt (đ)": approved,
        "Trạng thái": "Đã duyệt"
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Thuong_Le_Nhan_Su");
    XLSX.writeFile(workbook, `Bang_thuong_le_${holidayName.replace(/\s+/g, "_")}.xlsx`);
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === "employee_profile") setActiveSubTab("personal");
    else if (tabId === "attendance") setActiveSubTab("machine");
    else if (tabId === "payroll_insurance") setActiveSubTab("calculation");
    else if (tabId === "benefits") setActiveSubTab("policy_rates");
    else if (tabId === "org_chart") setActiveSubTab("chart");
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

      const isAdmin = allowedData?.role === "Admin" || empData?.role?.toLowerCase() === "admin";
      const isHRStaff = empData?.name === "Lại Nguyễn Lan Phương" || 
                        empData?.name === "Dương Nhật Hoành Anh" ||
                        session.user.user_metadata?.full_name === "Lại Nguyễn Lan Phương" || 
                        session.user.user_metadata?.full_name === "Dương Nhật Hoành Anh" || 
                        session.user.user_metadata?.name === "Lại Nguyễn Lan Phương" ||
                        session.user.user_metadata?.name === "Dương Nhật Hoành Anh" ||
                        empData?.role === "CV Nhân sự" ||
                        empData?.role === "Tổ trưởng Nhân sự" ||
                        (empData?.role?.toLowerCase()?.includes("nhân sự") && 
                         (empData?.department?.toLowerCase()?.includes("hành chính") || empData?.department?.toLowerCase()?.includes("hcns"))) ||
                        (empData?.role?.toLowerCase()?.includes("tổ trưởng") && 
                         (empData?.department?.toLowerCase()?.includes("hành chính") || empData?.department?.toLowerCase()?.includes("hcns")));
      const isTPHCNS = empData?.role?.toLowerCase()?.includes("trưởng phòng") && 
                       (empData?.department?.toLowerCase()?.includes("hành chính") || empData?.department?.toLowerCase()?.includes("hcns"));
                       
      const fullAccess = !!(isAdmin || isHRStaff || isTPHCNS);
      setHasFullAccess(fullAccess);
      
      const userInfo = {
        email,
        name: empData?.name || session.user.user_metadata?.full_name || session.user.user_metadata?.name || "Người dùng",
        role: empData?.role || (isAdmin ? "Admin" : "Nhân viên"),
        department: empData?.department || "Chưa xếp phòng",
        isAdmin,
        empId: empData?.id
      };
      setCurrentUser(userInfo);

      // Now load employees and contracts
      await loadEmployeesData(email, fullAccess, userInfo.name, empData);
      await fetchContracts();
    } catch (err) {
      console.error("Error checking user access:", err);
    } finally {
      setLoadingAuth(false);
    }
  };

  // Fetch employees from Supabase with access filters
  const loadEmployeesData = async (email: string, fullAccess: boolean, userName: string, empRecord: any) => {
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
              department: empRecord?.department || "Chưa xếp phòng",
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
        setEmployees(finalEmployees);
        if (finalEmployees.length > 0) {
          setSelectedEmp(finalEmployees[0]);
        }
      }
    } catch (err) {
      console.error("Error fetching employees in CB:", err);
    } finally {
      setLoadingEmployees(false);
    }
  };

  const fetchEmployees = async () => {
    await checkAccessAndLoad();
  };

  // Fetch contracts from Supabase
  const fetchContracts = async () => {
    try {
      setLoadingContracts(true);
      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .order("effective_date", { ascending: false });
      if (error) throw error;
      if (data) {
        setContracts(data as Contract[]);
      }
    } catch (err) {
      console.error("Error fetching contracts in CB:", err);
    } finally {
      setLoadingContracts(false);
    }
  };

  useEffect(() => {
    checkAccessAndLoad();
  }, []);

  // Sync fingerprint machine mock
  const handleSyncBiometricMachine = () => {
    setIsSyncingMachine(true);
    setTimeout(() => {
      setIsSyncingMachine(false);
      setSyncedCount(145);
      alert("Đồng bộ dữ liệu từ máy chấm công vân tay thành công! Đã nạp 145 bản ghi ngày công hôm nay.");
    }, 1200);
  };

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

  const filteredAttendanceLogs = useMemo(() => {
    return MOCK_ATTENDANCE_LOGS.filter(log => hasFullAccess || log.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

  const filteredExplanations = useMemo(() => {
    return MOCK_EXPLANATIONS.filter(e => hasFullAccess || e.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

  const filteredLeaves = useMemo(() => {
    return MOCK_LEAVES.filter(l => hasFullAccess || l.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

  const filteredTravels = useMemo(() => {
    return MOCK_TRAVELS.filter(t => hasFullAccess || t.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

  const filteredRegimes = useMemo(() => {
    return MOCK_REGIMES.filter(r => hasFullAccess || r.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

  const filteredSalaryInfo = useMemo(() => {
    return MOCK_SALARY_INFO.filter(s => hasFullAccess || s.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

  const filteredBhxhLogs = useMemo(() => {
    return MOCK_BHXH_LOGS.filter(b => hasFullAccess || b.name === currentUser?.name);
  }, [hasFullAccess, currentUser]);

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
      .map(emp => {
        const parsed = parseBirthdate(emp.date_of_birth || "");
        if (!parsed) return null;
        
        const level = getEmployeeLevel(emp.role);
        const giftVal = BENEFIT_POLICY["Sinh nhật"][level];
        const giftStr = giftVal === "Theo phê duyệt" ? "Theo phê duyệt" : `Hộp quà & ${giftVal.toLocaleString("vi-VN")}đ`;
        
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
          status: "Chờ gửi"
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null && b.month === selectedBirthdayMonth)
      .filter(b => hasFullAccess || b.name === currentUser?.name)
      .sort((a, b) => a.day - b.day);
  }, [employees, selectedBirthdayMonth, hasFullAccess, currentUser]);

  const daysInMonth = useMemo(() => {
    const year = new Date().getFullYear();
    const totalDays = new Date(year, selectedBirthdayMonth, 0).getDate();
    return Array.from({ length: totalDays }, (_, i) => i + 1);
  }, [selectedBirthdayMonth]);

  const filteredBenefitClaims = useMemo(() => {
    return benefitClaims.filter(c => hasFullAccess || c.name === currentUser?.name);
  }, [benefitClaims, hasFullAccess, currentUser]);

  // --- HELPER FUNCTIONS FOR PREMIUM EMPLOYEE PROFILE VIEW ---
  const calculateTenure = (emp: Employee) => {
    let hash = 0;
    for (let i = 0; i < emp.name.length; i++) {
      hash = emp.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const years = Math.abs(hash % 3) + 1; // 1 to 3 years
    const months = Math.abs(hash % 12);
    return `${years} năm ${months} tháng`;
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
        title: "Gia nhập Trung Nam EC",
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
          subtitle="Báo cáo phân tích lương, ngày công, hợp đồng, phúc lợi và sơ đồ nhân sự công ty" 
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
              { id: "payroll_insurance", label: "Bảng lương & BHXH", icon: DollarSign },
              { id: "benefits", label: "Phúc lợi", icon: Award },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-[#005BAC] text-white shadow-md shadow-blue-500/10"
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
          {activeTab !== "employee_profile" && (
            <div className="flex flex-wrap gap-2 text-xs font-bold bg-slate-100 p-1.5 rounded-xl shrink-0">
              {activeTab === "attendance" && [
                { id: "machine", label: "Lấy ngày công máy chấm công" },
                { id: "explanation", label: "Thông tin giải trình" },
                { id: "leave", label: "Nghỉ phép" },
                { id: "travel", label: "Công tác" },
                { id: "regime", label: "Nghỉ chế độ" },
                { id: "allowances", label: "Phụ cấp cơm, xăng, dt..." }
              ].map(sub => (
                <button
                  key={sub.id}
                  onClick={() => setActiveSubTab(sub.id)}
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activeSubTab === sub.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
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
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activeSubTab === sub.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
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
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                    activeSubTab === sub.id ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
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
                          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 border-4 border-white flex items-center justify-center font-black text-white text-3xl shadow-xl">
                            {selectedEmp.avatar || selectedEmp.name.slice(0, 2).toUpperCase()}
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
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Mức độ hoàn thành</span>
                            <div className="text-lg font-black text-slate-800">
                              {selectedEmp.completed_tasks || 12} <span className="text-xs font-semibold text-slate-400">đã xong</span>
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
                        { id: "salary", label: "Thông tin lương" },
                        { id: "contract", label: "Thông tin HĐ" },
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
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Contact Card */}
                            <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4 hover:shadow-lg transition-all duration-300">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                <Mail size={16} className="text-[#005BAC]" />
                                <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Thông tin liên hệ</h4>
                              </div>
                              <div className="space-y-3.5 text-xs font-semibold text-slate-600">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Email công việc</span>
                                  <span className="text-slate-800 font-bold">{selectedEmp.email}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Số điện thoại</span>
                                  <span className="text-slate-800 font-bold">{selectedEmp.phone || "Chưa thiết lập"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Nơi làm việc</span>
                                  <span className="text-slate-850 font-bold">Văn phòng HCM</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Điện thoại khẩn cấp</span>
                                  <span className="text-slate-800 font-bold">Người thân - 0909.123.456</span>
                                </div>
                              </div>
                            </div>

                            {/* Job Info Card */}
                            <div className="glass bg-white rounded-2xl p-6 border-transparent shadow-premium space-y-4 hover:shadow-lg transition-all duration-300">
                              <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                                <Briefcase size={16} className="text-[#005BAC]" />
                                <h4 className="font-heading font-black text-slate-800 text-xs uppercase tracking-wider">Thông tin công việc</h4>
                              </div>
                              <div className="space-y-3.5 text-xs font-semibold text-slate-600">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Chức vụ hiện tại</span>
                                  <span className="text-slate-850 font-bold">{selectedEmp.role}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Đơn vị trực thuộc</span>
                                  <span className="text-slate-800 font-bold">{selectedEmp.department}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Người quản lý trực tiếp</span>
                                  <span className="text-[#005BAC] font-bold">Lê Thị Hoa Đào (Trưởng phòng)</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">Ngày gia nhập</span>
                                  <span className="text-slate-800 font-bold">{new Date(selectedEmp.created_at).toLocaleDateString("vi-VN")}</span>
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

                      {activeSubTab === "contract" && (
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

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div className="bg-slate-50/50 p-4 rounded-xl space-y-3">
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-400">Số hợp đồng</span>
                                  <span className="text-mono text-slate-850 font-bold">HDLD-{selectedEmp.name.slice(0, 2).toUpperCase()}-2025</span>
                                </div>
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-400">Loại hợp đồng</span>
                                  <span className="text-slate-850 font-bold">Xác định thời hạn (3 năm)</span>
                                </div>
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-400">Ngày ký hiệu lực</span>
                                  <span className="text-slate-850 font-bold">{new Date(selectedEmp.created_at).toLocaleDateString("vi-VN")}</span>
                                </div>
                                <div className="flex justify-between text-xs font-semibold">
                                  <span className="text-slate-400">Ngày hết hạn dự kiến</span>
                                  <span className="text-slate-850 font-bold">
                                    {new Date(new Date(selectedEmp.created_at).getTime() + 3 * 365 * 24 * 60 * 60 * 1000).toLocaleDateString("vi-VN")}
                                  </span>
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
                      )}

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
              {activeSubTab === "machine" && (
                <div className="space-y-6">
                  {/* CARD 1: ĐỒNG BỘ TRỰC TIẾP TỪ MÁY CHẤM CÔNG */}
                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                      <div>
                        <h3 className="font-heading font-extrabold text-slate-800 text-sm">ĐỒNG BỘ DỮ LIỆU TỪ MÁY CHẤM CÔNG VÂN TAY / FINGERPRINT</h3>
                        <p className="text-slate-400 text-[10px] font-semibold mt-1">Kết nối mạng TCP/IP trực tiếp với máy chấm công tại văn phòng và công trường</p>
                      </div>
                      {hasFullAccess && (
                        <button
                          onClick={handleSyncBiometricMachine}
                          disabled={isSyncingMachine}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow disabled:opacity-50"
                        >
                          {isSyncingMachine ? (
                            <>
                              <Loader2 size={13} className="animate-spin" /> Đang đồng bộ...
                            </>
                          ) : (
                            <>
                              <RefreshCw size={13} /> Lấy dữ liệu công máy chấm công
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {syncedCount > 0 && (
                      <div className="bg-emerald-50 border border-emerald-250 p-3 rounded-xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold">
                        <CheckCircle size={15} /> Đồng bộ hoàn tất! Hệ thống đã ghi nhận {syncedCount} bản ghi chấm công từ văn phòng và các dự án trong ngày.
                      </div>
                    )}

                    <div className="space-y-3">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bản ghi chấm công hôm nay (Mẫu)</h4>
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
                            {filteredAttendanceLogs.map((log, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-3 px-3 font-semibold">{new Date(log.date).toLocaleDateString("vi-VN")}</td>
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
                        <button
                          onClick={() => setShowEmailConfigModal(true)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer"
                        >
                          <Settings size={13} />
                          {smtpConfig.user ? `SMTP: ${smtpConfig.user}` : "Cấu hình gửi email"}
                        </button>
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
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-white p-2 rounded-xl border border-slate-100">
                            <div className="text-[9px] font-bold text-slate-400">Số nhân viên</div>
                            <div className="text-base font-black text-slate-800">{parsedEmployees.length}</div>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-slate-100">
                            <div className="text-[9px] font-bold text-slate-400">Tháng chấm công</div>
                            <div className="text-base font-black text-[#005BAC]">{timesheetMonth || "--/----"}</div>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-slate-100">
                            <div className="text-[9px] font-bold text-slate-400">Đã khớp email</div>
                            <div className="text-base font-black text-emerald-600">
                              {parsedEmployees.filter(e => e.emailFound).length}
                            </div>
                          </div>
                          <div className="bg-white p-2 rounded-xl border border-slate-100">
                            <div className="text-[9px] font-bold text-slate-400">Chưa có email</div>
                            <div className="text-base font-black text-amber-500">
                              {parsedEmployees.filter(e => !e.emailFound).length}
                            </div>
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
                                  <td className="py-3 px-3 text-center font-bold text-slate-800">{emp.totalDays} ngày</td>
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
                  </div>
                </div>
              )}

              {activeSubTab === "explanation" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">GIẢI TRÌNH SAI LỆCH CÔNG TÁC / QUÊN QUÉT THẺ</h3>
                    <p className="text-slate-400 text-[10px] font-semibold mt-1">Nơi phê duyệt và đối soát lý do sai lệch hoặc bổ sung thời gian checkin/checkout của nhân viên</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Ngày giải trình</th>
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Lý do giải trình</th>
                          <th className="py-3 px-3">Khung giờ đề xuất</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái duyệt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredExplanations.map((e, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 font-semibold">{new Date(e.date).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{e.name}</td>
                            <td className="py-3.5 px-3 text-slate-550 italic font-medium">{e.reason}</td>
                            <td className="py-3.5 px-3 font-mono text-[#005BAC]">{e.propose}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                e.status === "Đã duyệt" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>{e.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "leave" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">THEO DÕI NGHỈ PHÉP NĂM</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Quản lý duyệt đơn nghỉ phép năm, nghỉ việc riêng, nghỉ không lương</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Nhân viên</th>
                          <th className="py-3 px-3">Loại nghỉ phép</th>
                          <th className="py-3 px-3">Từ ngày</th>
                          <th className="py-3 px-3">Đến ngày</th>
                          <th className="py-3 px-3 text-center">Tổng số ngày nghỉ</th>
                          <th className="py-3 px-3">Lý do nghỉ</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái duyệt</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredLeaves.map((l, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{l.name}</td>
                            <td className="py-3.5 px-3 text-blue-600 font-bold">{l.type}</td>
                            <td className="py-3.5 px-3">{new Date(l.from).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3">{new Date(l.to).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-center">{l.days} ngày</td>
                            <td className="py-3.5 px-3 text-slate-500 italic font-medium">{l.reason}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                l.status === "Đã duyệt" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              }`}>{l.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "travel" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">DANH SÁCH LỊCH TRÌNH CÔNG TÁC</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Theo dõi lịch trình kiểm tra dự án công trường và trợ cấp công tác phí</span>
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
                          <th className="py-3 px-3">Trợ cấp tiền xăng/di chuyển</th>
                          <th className="py-3 px-3 w-28 text-center">Trạng thái</th>
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
                            <td className="py-3.5 px-3 text-emerald-600 font-bold">+{t.allowance.toLocaleString("vi-VN")} đ</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800">{t.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "regime" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">NGHỈ CHẾ ĐỘ PHÚC LỢI BHXH (ỐM ĐAU, THAI SẢN)</h3>
                    <span className="text-[10px] text-slate-400 font-bold">Quản lý danh sách nhân viên nghỉ chế độ và tiến độ nộp hồ sơ thụ hưởng BHXH</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                          <th className="py-3 px-3">Họ và Tên</th>
                          <th className="py-3 px-3">Chế độ thụ hưởng</th>
                          <th className="py-3 px-3">Ngày bắt đầu</th>
                          <th className="py-3 px-3">Ngày kết thúc</th>
                          <th className="py-3 px-3">Tình trạng hồ sơ BHXH</th>
                          <th className="py-3 px-3 w-32 text-center">Trạng thái nghỉ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredRegimes.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-3.5 px-3 text-slate-800 font-bold">{r.name}</td>
                            <td className="py-3.5 px-3 text-indigo-600 font-bold">{r.type}</td>
                            <td className="py-3.5 px-3">{new Date(r.from).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3">{new Date(r.to).toLocaleDateString("vi-VN")}</td>
                            <td className="py-3.5 px-3 text-slate-500 font-bold flex items-center gap-1.5"><Info size={12} className="text-slate-400" /> {r.insurance_claim}</td>
                            <td className="py-3.5 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                r.status === "Đang nghỉ" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                              }`}>{r.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeSubTab === "allowances" && (
                <div className="space-y-6">
                  {/* Allowance Standards Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {MOCK_ALLOWANCES.map((a, idx) => (
                      <div key={idx} className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-sm hover-elevate space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="p-2 bg-blue-50 text-[#005BAC] rounded-xl"><Briefcase size={16} /></span>
                          <span className="text-[10px] text-emerald-600 font-bold">Đang áp dụng cho {a.activeCount} nhân sự</span>
                        </div>
                        <div>
                          <h4 className="font-heading font-extrabold text-slate-800 text-xs">{a.name}</h4>
                          <p className="font-heading font-black text-[#005BAC] text-sm mt-1">{a.standard}</p>
                          <p className="text-slate-400 text-[10px] font-semibold mt-2">Đối tượng: {a.target}</p>
                        </div>
                      </div>
                    ))}
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
                  <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                      <span className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Award size={16} /></span>
                      <div>
                        <h3 className="font-heading font-extrabold text-slate-800 text-sm">2.1 ĐỊNH MỨC TRỢ CẤP PHÚC LỢI ĐÃ ĐƯỢC DUYỆT</h3>
                        <p className="text-slate-400 text-[10px] font-semibold">Chính sách trợ cấp phúc lợi áp dụng thống nhất cho các cấp nhân sự công ty</p>
                      </div>
                    </div>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-3 w-12 text-center">Stt</th>
                            <th className="py-3 px-3 w-40">Nội dung</th>
                            <th className="py-3 px-3 text-center bg-blue-50/30 text-blue-800">Điều hành cao cấp</th>
                            <th className="py-3 px-3 text-center text-slate-700">Quản lý cấp cao</th>
                            <th className="py-3 px-3 text-center text-slate-700">Quản lý cấp trung</th>
                            <th className="py-3 px-3 text-center text-slate-700">Quản lý sơ cấp</th>
                            <th className="py-3 px-3 text-center text-slate-700">CBNV</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                          {Object.entries(BENEFIT_POLICY).map(([category, levels], idx) => (
                            <tr key={category} className="hover:bg-slate-50/50 transition-colors">
                              <td className="py-3.5 px-3 text-center text-slate-400 font-bold">{idx + 1}</td>
                              <td className="py-3.5 px-3 text-slate-800 font-bold">{category}</td>
                              <td className="py-3.5 px-3 text-center font-bold bg-blue-50/20 text-blue-700 italic">
                                {levels["Điều hành cao cấp"]}
                              </td>
                              <td className="py-3.5 px-3 text-center font-bold text-slate-800">
                                {typeof levels["Quản lý cấp cao"] === "number" 
                                  ? levels["Quản lý cấp cao"].toLocaleString("vi-VN") + " đ" 
                                  : levels["Quản lý cấp cao"]}
                              </td>
                              <td className="py-3.5 px-3 text-center text-slate-600">
                                {typeof levels["Quản lý cấp trung"] === "number" 
                                  ? levels["Quản lý cấp trung"].toLocaleString("vi-VN") + " đ" 
                                  : levels["Quản lý cấp trung"]}
                              </td>
                              <td className="py-3.5 px-3 text-center text-slate-600">
                                {typeof levels["Quản lý sơ cấp"] === "number" 
                                  ? levels["Quản lý sơ cấp"].toLocaleString("vi-VN") + " đ" 
                                  : levels["Quản lý sơ cấp"]}
                              </td>
                              <td className="py-3.5 px-3 text-center text-slate-600">
                                {typeof levels["CBNV"] === "number" 
                                  ? levels["CBNV"].toLocaleString("vi-VN") + " đ" 
                                  : levels["CBNV"]}
                              </td>
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
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6">
                  {/* Header & Month Navigator */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-4 gap-4">
                    <div className="flex items-center gap-2">
                      <span className="p-2 bg-pink-50 text-pink-600 rounded-xl animate-pulse"><Cake size={16} /></span>
                      <div>
                        <h3 className="font-heading font-extrabold text-slate-800 text-sm">LỊCH VÀ DANH SÁCH SINH NHẬT NHÂN SỰ</h3>
                        <p className="text-slate-400 text-[10px] font-semibold">Đối chiếu danh sách thâm niên và tính toán quà thưởng tự động theo phòng ban & chức vụ</p>
                      </div>
                    </div>

                    {/* Month Quick Select */}
                    <div className="flex flex-wrap gap-1 text-[10px] font-bold bg-slate-100 p-1 rounded-xl shrink-0">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSelectedBirthdayMonth(m)}
                          className={`px-2 py-1 rounded-lg transition-all cursor-pointer ${
                            selectedBirthdayMonth === m 
                              ? "bg-[#005BAC] text-white shadow-sm" 
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                          }`}
                        >
                          T{m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Lịch sinh nhật trong tháng (Calendar Highlight Grid) */}
                  <div className="space-y-2.5">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-3.5 bg-pink-500 rounded-full inline-block"></span>
                      Lịch Sinh Nhật Tháng {selectedBirthdayMonth} (Có highlight ngày có sự kiện)
                    </h4>
                    
                    <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-16 gap-2">
                      {daysInMonth.map(dayNum => {
                        const dayBirthdays = filteredBirthdays.filter(b => b.day === dayNum);
                        const hasBirthdays = dayBirthdays.length > 0;
                        return (
                          <div
                            key={dayNum}
                            className={`h-14 flex flex-col items-center justify-center rounded-xl border transition-all ${
                              hasBirthdays
                                ? "bg-gradient-to-br from-pink-50 to-pink-100/50 border-pink-300 text-pink-700 shadow-md ring-2 ring-pink-500/10 scale-105"
                                : "bg-slate-50/40 border-slate-100 text-slate-400 hover:bg-slate-50"
                            }`}
                            title={hasBirthdays ? `Sinh nhật: ${dayBirthdays.map(b => b.name).join(", ")}` : `Ngày ${dayNum}`}
                          >
                            <span className={`text-[11px] font-black ${hasBirthdays ? "text-pink-600" : "text-slate-400"}`}>
                              {dayNum}
                            </span>
                            {hasBirthdays ? (
                              <span className="p-0.5 bg-pink-500 rounded-full text-white animate-bounce mt-1">
                                <Cake size={7} />
                              </span>
                            ) : (
                              <span className="w-1.5 h-1.5 bg-slate-200 rounded-full mt-1.5"></span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Danh sách chi tiết nhân sự */}
                  <div className="space-y-3.5 pt-2">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                      <span className="w-1.5 h-3.5 bg-blue-600 rounded-full inline-block"></span>
                      Danh Sách Chi Trợ Cấp Sinh Nhật ({filteredBirthdays.length} Nhân Sự)
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
                            className="flex items-center justify-between p-4 bg-gradient-to-r from-pink-50/20 to-indigo-50/10 rounded-2xl border border-pink-100/50 hover-elevate transition-all"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-full bg-pink-100 text-pink-600 border-2 border-white shadow-premium flex items-center justify-center font-bold text-sm">
                                {b.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="font-heading font-extrabold text-slate-850 text-xs flex items-center gap-1.5">
                                  {b.name}
                                  <span className="px-1.5 py-0.5 bg-pink-100 text-pink-850 font-black rounded text-[8px] uppercase">
                                    Ngày {b.day}
                                  </span>
                                </h4>
                                <p className="text-[10px] text-slate-500 font-semibold">{b.dept} | {b.role}</p>
                                <p className="text-[9px] text-slate-400 mt-0.5">Ngày sinh: {String(b.day).padStart(2, '0')}/{String(b.month).padStart(2, '0')}/{b.year}</p>
                              </div>
                            </div>
                            <div className="text-right flex flex-col items-end gap-1.5">
                              <span className="text-[10px] font-black text-[#005BAC] bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-1 border border-blue-100">
                                <Gift size={10} className="text-blue-500" /> {b.gift}
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                {b.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── SUB-TAB 3: HIẾU HỶ & TRỢ CẤP ─── */}
              {activeSubTab === "funeral_wedding" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-3">
                    <div>
                      <h3 className="font-heading font-extrabold text-slate-800 text-sm">DANH SÁCH CHI TRỢ CẤP HIẾU HỶ & BIẾN CỐ</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Theo dõi quỹ hỗ trợ việc cưới hỏi, sinh con, ốm đau nằm viện và tử tuất của cán bộ nhân viên</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleExportBenefitClaims}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-lg cursor-pointer text-[10px] transition-all"
                      >
                        <Download size={12} /> Xuất báo cáo
                      </button>
                      <button
                        onClick={() => {
                          if (employees.length > 0) {
                            setClaimForm(prev => ({ ...prev, employeeId: employees[0].id }));
                          }
                          setShowCreateClaimModal(true);
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-lg cursor-pointer text-[10px] transition-all shadow-md shadow-blue-500/10"
                      >
                        <Plus size={12} /> Tạo yêu cầu trợ cấp
                      </button>
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
                          <th className="py-3 px-3 w-16 text-center">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                        {filteredBenefitClaims.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400 font-bold italic">Không có bản ghi yêu cầu trợ cấp nào</td>
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
                              </td>
                              <td className="py-3.5 px-3 text-center">
                                <button
                                  onClick={() => handleDeleteClaim(claim.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer inline-block"
                                >
                                  <Trash2 size={13} />
                                </button>
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
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <span className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><DollarSign size={16} /></span>
                      <div>
                        <h3 className="font-heading font-extrabold text-slate-800 text-sm">CHI TIẾT PHÂN BỔ THƯỞNG LỄ THEO THÂM NIÊN</h3>
                        <p className="text-slate-400 text-[10px] font-semibold">Tự động tính thâm niên và đề xuất 4 mức thưởng (300k/500k/1M/2M) - Cho phép sửa tay trực tiếp</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
                        <span>Đợt lễ:</span>
                        <select
                          value={selectedHolidayId}
                          onChange={(e) => setSelectedHolidayId(e.target.value)}
                          className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg outline-none cursor-pointer focus:bg-white text-xs font-semibold text-slate-700"
                        >
                          {TNEC_HOLIDAYS.map(h => (
                            <option key={h.id} value={h.id}>{h.holiday} ({new Date(h.date).getFullYear()})</option>
                          ))}
                        </select>
                      </div>
                      
                      <button
                        onClick={handleApproveAllHolidayBonuses}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-[10px] transition-all shadow-md shadow-emerald-500/10"
                      >
                        Phê duyệt hàng loạt
                      </button>
                      <button
                        onClick={() => {
                          const hol = TNEC_HOLIDAYS.find(h => h.id === selectedHolidayId);
                          handleExportHolidayBonus(hol?.holiday || "Thuong_Le");
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-lg cursor-pointer text-[10px] transition-all"
                      >
                        <Download size={12} /> Xuất bảng thưởng
                      </button>
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
                                    onChange={(e) => handleUpdateHolidayAdjustment(emp.id, Number(e.target.value) || 0)}
                                    placeholder="Nhập số tiền..."
                                    className="w-28 px-2 py-1 border border-slate-200 rounded-lg text-right font-mono font-bold text-blue-700 focus:border-blue-500 outline-none text-xs"
                                  />
                                  
                                  {/* Dropdown để chọn nhanh 4 mức */}
                                  <select
                                    value={approved}
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
                        const stdAmount = BENEFIT_POLICY[claimForm.category][level];
                        
                        return (
                          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-150 rounded-xl">
                            <div>
                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cấp quản lý nhận diện:</div>
                              <div className="text-xs font-black text-slate-800 mt-0.5">{level}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Mức hỗ trợ quy định:</div>
                              <div className="text-xs font-black text-emerald-600 mt-0.5">
                                {typeof stdAmount === "number" ? `${stdAmount.toLocaleString("vi-VN")} đ` : stdAmount}
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
                            <option value="Sinh nhật">Sinh nhật</option>
                            <option value="Kết hôn">Kết hôn</option>
                            <option value="Sinh con">Sinh con</option>
                            <option value="Ốm đau">Ốm đau</option>
                            <option value="Tử tuất">Tử tuất</option>
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

                      {/* Số tiền tùy chỉnh & Trạng thái */}
                      <div className="grid grid-cols-2 gap-3">
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

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Trạng thái phê duyệt</label>
                          <select
                            value={claimForm.status}
                            onChange={(e) => setClaimForm(prev => ({ ...prev, status: e.target.value }))}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-[#005BAC] focus:ring-1 focus:ring-[#005BAC] outline-none transition-all cursor-pointer"
                          >
                            <option value="Chờ phê duyệt">Chờ phê duyệt</option>
                            <option value="Đã duyệt">Đã duyệt (Chờ chi)</option>
                            <option value="Đã chi">Đã chi trả hoàn tất</option>
                            <option value="Từ chối">Từ chối chi</option>
                          </select>
                        </div>
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
                      <div className="text-lg font-black text-slate-800">{selectedEmployeeForDetail.totalDays} ngày</div>
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
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3 font-semibold text-slate-800">{day.date}</td>
                              <td className="py-2.5 px-3 text-slate-400 font-bold">{day.dayOfWeek}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-600">{day.checkin || "--:--"}</td>
                              <td className="py-2.5 px-3 text-center font-mono font-bold text-[#005BAC]">{day.checkout || "--:--"}</td>
                              <td className="py-2.5 px-3 text-center text-amber-600 font-bold">{day.late > 0 ? day.late : "-"}</td>
                              <td className="py-2.5 px-3 text-center text-orange-500 font-bold">{day.early > 0 ? day.early : "-"}</td>
                              <td className="py-2.5 px-3 text-[10px] text-slate-400 font-bold uppercase">{day.status || "-"}</td>
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
          </>
          )}
        </main>
      </div>
    </div>
  );
}

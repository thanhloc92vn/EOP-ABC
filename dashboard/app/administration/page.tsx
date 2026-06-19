"use client";

import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import {
  Package,
  CheckCircle,
  AlertTriangle,
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  ClipboardList,
  Receipt,
  RefreshCw,
  BarChart3,
  Trash2,
  Upload,
  FileText,
  User,
  ArrowRight,
  Check,
  Settings,
  Brain,
  Save,
  Loader2,
  Download,
  Eye,
  X,
  Pencil,
  Calendar,
  ChevronDown,
  Building2,
  Briefcase
} from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { docSoVietNam, exportDeNghiChuyenTien, downloadDocFile } from "@/lib/wordExporter";
import { supabase } from "@/lib/supabase";
import * as XLSX from "xlsx";

// ─── TYPES & INTERFACES ──────────────────────────────────────────────────────
interface SupplyItem {
  name: string;
  cat: string;
  unit: string;
  stock: number;
  allocated: number;
  alert: "Bình thường" | "Cảnh báo";
  initialStock?: number;
  imported?: number;
}

interface DeptRequest {
  id: string;
  dept: string;
  item: string;
  qty: number;
  date: string;
  allocationTime?: string;
  status: "Chờ duyệt" | "Đã cấp phát";
  target?: "phongban" | "duan";
  targetName?: string;
  requesterName?: string;
  cat?: string;
  unit?: string;
}

interface AllocationTarget {
  id: string;
  type: "phongban" | "duan";
  name: string;
  receiver: string;
  notes: string;
}

interface ChecklistItem {
  id: string;
  task: string;
  assignee: "Như Quỳnh" | "Thùy Quyên" | "Thanh Hằng" | "Thanh Ngân";
  frequency: "Hàng ngày" | "Hàng tuần" | "Hàng tháng";
  status: "Kế hoạch" | "Đang xử lý" | "Chờ duyệt" | "Cần chỉnh sửa" | "Hoàn thành";
  priority?: "Cao" | "Trung bình" | "Thấp";
  date?: string;
}

interface Invoice {
  id: string;
  number: string;
  date: string;
  desc: string;
  amount: number;
  file_url?: string;
  beneficiary_name?: string;
  bank_account?: string;
  bank_name_branch?: string;
}

interface RecurringPayment {
  name: string;
  bank: string;
  account: string;
  owner: string;
  lastAmount: number;
  content: string;
}

interface Supplier {
  id: string;
  name: string;
  account: string;
  bank: string;
  service: string;
  project_name?: string;
}

interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  account: string;
  bank: string;
  service: string;
  amount: number;
  content: string;
  month: string;
  fileUrl?: string;
  project_name?: string;
}

// ─── INITIAL MOCK DATA ────────────────────────────────────────────────────────
const INITIAL_SUPPLIES: SupplyItem[] = [
  { name: "Giấy A4 Double A 70gsm", cat: "Giấy in", unit: "Ram", stock: 150, allocated: 0, alert: "Bình thường" },
  { name: "Bút bi Thiên Long xanh", cat: "Bút viết", unit: "Hộp", stock: 12, allocated: 0, alert: "Cảnh báo" },
  { name: "Kẹp bướm 25mm", cat: "Dụng cụ lưu trữ", unit: "Hộp", stock: 45, allocated: 0, alert: "Bình thường" }
];

const INITIAL_DEPT_REQUESTS: DeptRequest[] = [];

const DEPARTMENTS = [
  "Phòng Hành Chính Nhân Sự",
  "Phòng Tài Chính Kế Toán",
  "Phòng Vật Tư Thiết Bị",
  "Phòng Thị Trường",
  "Phòng Kế Hoạch Đấu Thầu",
  "Phòng Kỹ Thuật",
  "Phòng An Toàn Lao Động",
  "Phòng Quản Lý Dự Án",
  "Phòng Thư Ký, Trợ Lý",
  "Giám đốc",
  "Phó Giám đốc"
];

const PROJECTS = [
  "BĐH Vàm Lẽo",
  "BĐH Rạch Xuyên Tâm",
  "BĐH Thường Phước",
  "BĐH XLNT Tây Ninh",
  "BĐH KCN Cà Ná",
  "BĐH Chống Hạn Ninh Thuận",
  "BĐH Tỉnh Lộ 8",
  "BĐH Cầu Mã Đà",
  "BĐH ĐMT Trà Vinh 2",
  "BĐH Hương Lộ 11"
];

const normalizeDeptName = (name: string): string => {
  if (!name) return "";
  const cleaned = name.trim().toLowerCase();
  if (
    cleaned === "phòng hcns" ||
    cleaned === "hcns" ||
    cleaned === "p.hcns" ||
    cleaned === "p. hành chính nhân sự" ||
    cleaned === "hành chính nhân sự" ||
    cleaned === "phòng hành chính nhân sự"
  ) {
    return "Phòng Hành Chính Nhân Sự";
  }
  if (
    cleaned === "phòng tài chính kế toán" ||
    cleaned === "phòng tckt" ||
    cleaned === "tckt" ||
    cleaned === "p.tckt" ||
    cleaned === "kế toán" ||
    cleaned === "phòng kế toán"
  ) {
    return "Phòng Tài Chính Kế Toán";
  }
  if (
    cleaned === "phòng vật tư thiết bị" ||
    cleaned === "vật tư thiết bị" ||
    cleaned === "vật tư" ||
    cleaned === "phòng vật tư"
  ) {
    return "Phòng Vật Tư Thiết Bị";
  }
  if (
    cleaned === "phòng kế hoạch đấu thầu" ||
    cleaned === "kế hoạch đấu thầu" ||
    cleaned === "khđt" ||
    cleaned === "phòng khđt"
  ) {
    return "Phòng Kế Hoạch Đấu Thầu";
  }
  if (
    cleaned === "phòng quản lý dự án" ||
    cleaned === "quản lý dự án" ||
    cleaned === "qlda" ||
    cleaned === "phòng qlda"
  ) {
    return "Phòng Quản Lý Dự Án";
  }
  return name;
};

const INITIAL_ALLOCATION_TARGETS: AllocationTarget[] = [
  { id: "CP-01", type: "phongban", name: "Phòng Hành Chính Nhân Sự", receiver: "Như Quỳnh", notes: "Văn phòng công ty" },
  { id: "CP-02", type: "phongban", name: "Phòng Tài Chính Kế Toán", receiver: "Thanh Hằng", notes: "Văn phòng công ty" },
  { id: "CP-03", type: "phongban", name: "Phòng Vật Tư Thiết Bị", receiver: "Thùy Quyên", notes: "Văn phòng công ty" },
  { id: "CP-04", type: "phongban", name: "Phòng Thị Trường", receiver: "Nguyễn Văn A", notes: "Văn phòng công ty" },
  { id: "CP-05", type: "phongban", name: "Phòng Kế Hoạch Đấu Thầu", receiver: "Nguyễn Văn B", notes: "Văn phòng công ty" },
  { id: "CP-06", type: "phongban", name: "Phòng Kỹ Thuật", receiver: "Nguyễn Văn C", notes: "Văn phòng công ty" },
  { id: "CP-07", type: "phongban", name: "Phòng An Toàn Lao Động", receiver: "Nguyễn Văn D", notes: "Văn phòng công ty" },
  { id: "CP-08", type: "phongban", name: "Phòng Quản Lý Dự Án", receiver: "Nguyễn Văn E", notes: "Văn phòng công ty" },
  { id: "CP-09", type: "phongban", name: "Phòng Thư Ký, Trợ Lý", receiver: "Nguyễn Văn F", notes: "Văn phòng công ty" },
  { id: "CP-10", type: "phongban", name: "Giám đốc", receiver: "Trần Nghiệp Quang", notes: "Ban Giám đốc" },
  { id: "CP-11", type: "phongban", name: "Phó Giám đốc", receiver: "Phó Giám đốc", notes: "Ban Giám đốc" },
  { id: "CP-12", type: "duan", name: "BĐH Vàm Lẽo", receiver: "Chỉ huy trưởng", notes: "Dự án Vàm Lẽo" },
  { id: "CP-13", type: "duan", name: "BĐH Tỉnh Lộ 8", receiver: "Chỉ huy trưởng", notes: "Dự án Tỉnh Lộ 8" },
  { id: "CP-14", type: "duan", name: "BĐH Cầu Mã Đà", receiver: "Chỉ huy trưởng", notes: "Dự án Cầu Mã Đà" },
  { id: "CP-15", type: "duan", name: "BĐH Thường Phước", receiver: "Chỉ huy trưởng", notes: "Dự án Thường Phước" },
  { id: "CP-16", type: "duan", name: "BĐH XLNT Tây Ninh", receiver: "Chỉ huy trưởng", notes: "Dự án XLNT Tây Ninh" },
  { id: "CP-17", type: "duan", name: "BĐH KCN Cà Ná", receiver: "Chỉ huy trưởng", notes: "Dự án KCN Cà Ná" },
  { id: "CP-18", type: "duan", name: "BĐH ĐMT Trà Vinh 2", receiver: "Chỉ huy trưởng", notes: "Dự án ĐMT Trà Vinh 2" },
  { id: "CP-19", type: "duan", name: "BĐH Rạch Xuyên Tâm", receiver: "Chỉ huy trưởng", notes: "Dự án Rạch Xuyên Tâm" },
  { id: "CP-20", type: "duan", name: "BĐH Chống Hạn Ninh Thuận", receiver: "Chỉ huy trưởng", notes: "Dự án Chống Hạn Ninh Thuận" },
  { id: "CP-21", type: "duan", name: "BĐH Hương Lộ 11", receiver: "Chỉ huy trưởng", notes: "Dự án Hương Lộ 11" }
];

const KANBAN_COLUMNS = [
  { id: "Kế hoạch", label: "KẾ HOẠCH", color: "border-purple-500 bg-purple-50/10 text-purple-700", dotColor: "bg-purple-500", badgeBg: "bg-purple-100 text-purple-800" },
  { id: "Đang xử lý", label: "ĐANG XỬ LÝ", color: "border-amber-500 bg-amber-50/10 text-amber-700", dotColor: "bg-amber-500", badgeBg: "bg-amber-100 text-amber-800" },
  { id: "Chờ duyệt", label: "CHỜ DUYỆT", color: "border-blue-500 bg-blue-50/10 text-blue-700", dotColor: "bg-blue-500", badgeBg: "bg-blue-100 text-blue-800" },
  { id: "Cần chỉnh sửa", label: "CẦN CHỈNH SỬA", color: "border-rose-500 bg-rose-50/10 text-rose-700", dotColor: "bg-rose-500", badgeBg: "bg-rose-100 text-rose-800" },
  { id: "Hoàn thành", label: "HOÀN THÀNH", color: "border-emerald-500 bg-emerald-50/10 text-emerald-700", dotColor: "bg-emerald-500", badgeBg: "bg-emerald-100 text-emerald-800" }
];

const INITIAL_CHECKLIST: ChecklistItem[] = [];


const INITIAL_RECURRING: RecurringPayment[] = [
  { name: "Tiền điện văn phòng", bank: "MB Bank", account: "1234567890", owner: "EVN TP.HCM", lastAmount: 14500000, content: "Thanh toan tien dien van phong TNEC thang" },
  { name: "Tiền nước văn phòng", bank: "Vietcombank", account: "001100445566", owner: "SAWACO", lastAmount: 1200000, content: "Thanh toan tien nuoc TNEC thang" },
  { name: "Cước Internet cáp quang", bank: "BIDV", account: "1199558877", owner: "VIETTEL TELECOM", lastAmount: 3500000, content: "Thanh toan cuoc internet TNEC thang" }
];

const INITIAL_SUPPLIERS: Supplier[] = [
  { id: "NCC-01", name: "CÔNG TY CỔ PHẦN AN CƯ ĐỨC PHÚ", account: "520052868", bank: "TP BANK - PGD Kỳ Hòa - CN Sài Gòn", service: "Thuê văn phòng HCM", project_name: "Văn phòng HCM" },
  { id: "NCC-02", name: "CÔNG TY CỔ PHẦN ĐẦU TƯ THỊNH VƯỢNG HVC", account: "334818", bank: "ACB - CN Tân Bình", service: "Lắp máy lạnh văn phòng", project_name: "Văn phòng HCM" },
  { id: "NCC-03", name: "CÔNG TY CỔ PHẦN HAI BỐN BẢY", account: "14020592925013", bank: "NH TMCP Kỹ Thương VN - CN Quang Trung", service: "Chuyển phát nhanh", project_name: "Văn phòng HCM" },
  { id: "NCC-04", name: "CÔNG TY CỔ PHẦN THƯƠNG MẠI XÂY DỰNG HPK", account: "3181551718", bank: "NH ACB - CN Gò Vấp", service: "Thi công sửa chữa văn phòng", project_name: "Văn phòng HCM" },
  { id: "NCC-05", name: "Nguyễn Bích Như Quỳnh", account: "11112857", bank: "Ngân hàng ACB", service: "", project_name: "Văn phòng HCM" },
  { id: "NCC-06", name: "Nguyễn Ngọc Thanh Hằng", account: "02597652501", bank: "Ngân hàng Tiên Phong (TP BANK)", service: "", project_name: "Văn phòng HCM" },
  { id: "NCC-07", name: "TRẦN NGHIỆP QUANG", account: "0942870512", bank: "Ngân hàng SHB", service: "Thuê nhà Vàm Lẽo", project_name: "Vàm Lẽo" },
];

interface AdminMonthlyReport {
  id: string;
  stt: string;
  content: string;
  category_type: "office" | "project";
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
  m8: number;
  m9: number;
  m10: number;
  m11: number;
  m12: number;
  notes: string;
  is_custom: boolean;
  created_at?: string;
}

const DEFAULT_REPORT_ROWS: Array<{ stt: string; content: string; category_type: 'office' | 'project' }> = [
  { stt: "1", content: "Văn phòng phẩm", category_type: "office" },
  { stt: "2", content: "Photo, in ấn, mực in", category_type: "office" },
  { stt: "2.1", content: "Photo, in ấn, mực in  tại các VP", category_type: "office" },
  { stt: "2.2", content: "Photo, in ấn tài liệu phục vụ chuyên môn", category_type: "office" },
  { stt: "2.3", content: "Thuê máy photo các DA", category_type: "office" },
  { stt: "3", content: "Hóa chất, vật dụng vệ sinh văn phòng", category_type: "office" },
  { stt: "3.1", content: "Hóa chất, vật dụng", category_type: "office" },
  { stt: "3.2", content: "Thuê dịch vụ vệ sinh", category_type: "office" },
  { stt: "4", content: "CP hành chính vp", category_type: "office" },
  { stt: "1", content: "Chi phí CCDC, phần mềm hỗ trợ, đồ dùng phục vụ công tác quản lý (giá trị dưới 10tr.đ)", category_type: "office" },
  { stt: "1.1", content: "Mua sắm  bàn, ghế VP", category_type: "office" },
  { stt: "1.2", content: "Mua sắm đồ trang trí VP", category_type: "office" },
  { stt: "1.3", content: "Mua đồ dùng văn phòng (pin, ổ cắm, trái cây, hoa, ….)", category_type: "office" },
  { stt: "1.4", content: "Chi phí mua bánh, trái cây tổ chức lễ 08/03", category_type: "office" },
  { stt: "1.5", content: "Hoa tặng, trái cây, hoa lễ khỏi công", category_type: "office" },
  { stt: "1.6", content: "Cúng tất niên, khai trương, thần tài", category_type: "office" },
  { stt: "1.7", content: "Chi phí in tem nhãn", category_type: "office" },
  { stt: "1.8", content: "Chi phí pickle ball", category_type: "office" },
  { stt: "19", content: "Chi phí di chuyển trang thiết bị làm việc", category_type: "office" },
  { stt: "20", content: "Làm móc khóa, quà tặng tuyển dụng", category_type: "office" },
  { stt: "2", content: "Sự kiện sinh nhật 18 TNEC", category_type: "office" },
  { stt: "2.1", content: "Chi phí sảnh tiệc", category_type: "office" },
  { stt: "2.2", content: "Tổ chức sự kiện", category_type: "office" },
  { stt: "2.3", content: "Quà tặng", category_type: "office" },
  { stt: "2.4", content: "Thuê phòng cho BLĐ (Mr Phát & Mr Hùng)", category_type: "office" },
  { stt: "1", content: "Chi phí VMB", category_type: "office" },
  { stt: "1.1", content: "Chi phí VMB", category_type: "office" },
  { stt: "1.2", content: "Thuê xe, taxi", category_type: "office" },
  { stt: "3", content: "Thuê nhà, văn phòng làm việc", category_type: "office" },
  { stt: "3.1", content: "Chi phí cho PGĐ", category_type: "office" },
  { stt: "3.1.1", content: "Thuê nhà cho PGĐ", category_type: "office" },
  { stt: "3.1.2", content: "Tiền điện , nước", category_type: "office" },
  { stt: "3.1.3", content: "Di chuyển", category_type: "office" },
  { stt: "3.2", content: "Thuê VP HCM  + phí quản lý", category_type: "office" },
  { stt: "4", content: "Chi phí điện vp + phí gửi xe (xe máy + xe ô tô)", category_type: "office" },
  { stt: "5", content: "Chi phí nước (nước uống)", category_type: "office" },
  { stt: "6.2", content: "Chuyển phát nhanh", category_type: "office" },
  { stt: "7", content: "Xăng dầu, cầu phà, bến bãi xe ô tô con", category_type: "office" },
  { stt: "7.1", content: "Phí gửi xe, rửa xe và các chi phí khác", category_type: "office" },
  { stt: "7.2", content: "Nhiên liệu", category_type: "office" },
  { stt: "8", content: "Chi phí sửa chữa, bảo dưỡng ô tô", category_type: "office" },
  { stt: "9", content: "Thuê xe ô tô hàng tháng", category_type: "office" },
  { stt: "10", content: "Chi phí đăng kiểm, phí đường bộ XMTB", category_type: "office" },
  { stt: "11", content: "Chi phí mua quà tặng đối tác khách hàng", category_type: "office" },
  { stt: "12", content: "Dự án Cà Ná", category_type: "project" },
  { stt: "12.1", content: "Mua sắm CCDC, thiết bị cho VP làm việc", category_type: "project" },
  { stt: "13", content: "RẠCH XUYÊN TÂM", category_type: "project" },
  { stt: "13.1", content: "Cúng chặt cây tại dự án", category_type: "project" },
  { stt: "13.2", content: "Tivi 55 inch + giá treo", category_type: "project" },
  { stt: "13.3", content: "Cab HDMI 10m", category_type: "project" },
  { stt: "14", content: "Dự án Cống âu thuyền Vàm Lẽo", category_type: "project" },
  { stt: "14.1", content: "Mời cơm Khách tham gia Lễ khởi công", category_type: "project" },
  { stt: "14.2", content: "Chi phí hậu cần Lễ khởi công", category_type: "project" },
  { stt: "14.3", content: "Kệ hoa chúc mừng Lễ Khởi Công", category_type: "project" },
  { stt: "14.4", content: "CP thuê nhà +nước sinh hoạt", category_type: "project" },
  { stt: "14.5", content: "Chi phí thuê đơn vị tổ chức sự kiện Lễ khởi công", category_type: "project" },
  { stt: "14.6", content: "CP cho TVGS", category_type: "project" },
  { stt: "15", content: "DA Tỉnh lộ  8", category_type: "project" },
  { stt: "15.1", content: "Làm con dấu tròn BĐH", category_type: "project" },
  { stt: "16", content: "DA Trà Vinh", category_type: "project" },
  { stt: "16.1", content: "Flycam Mini 2 Combo + thẻ nhớ 64Gb", category_type: "project" },
  { stt: "17", content: "DA XLNT Tây Ninh", category_type: "project" },
  { stt: "17.1", content: "Tiền thuê nhà BĐH", category_type: "project" },
];

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function AdministrationPage() {
  const [activeTab, setActiveTab] = useState<"checklist" | "invoice" | "recurring" | "report" | "vpp">("checklist");
  const [recurringSubTab, setRecurringSubTab] = useState<"suppliers" | "payments">("suppliers");

  // States for interactive monthly cost report
  const [reportRows, setReportRows] = useState<AdminMonthlyReport[]>([]);
  const [reportLoading, setReportLoading] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editingInvoiceNumberId, setEditingInvoiceNumberId] = useState<string | null>(null);

  // State Management
  const [supplies, setSupplies] = useState<SupplyItem[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("tnec_supplies");
      if (saved) return JSON.parse(saved);
    }
    return INITIAL_SUPPLIES;
  });
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);
  const [deptRequests, setDeptRequests] = useState<DeptRequest[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>(INITIAL_CHECKLIST);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>(INITIAL_RECURRING);

  // New Supplier States
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pendingPayments, setPendingPayments] = useState<SupplierPayment[]>([]);

  // Form states for creating supplier
  const [supplierIdState, setSupplierIdState] = useState("");
  const [supplierNameState, setSupplierNameState] = useState("");
  const [supplierAccountState, setSupplierAccountState] = useState("");
  const [supplierBankState, setSupplierBankState] = useState("");
  const [supplierServiceState, setSupplierServiceState] = useState("");
  const [supplierProjectState, setSupplierProjectState] = useState("Văn phòng HCM");

  // Form states for creating pending payment
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payContent, setPayContent] = useState("");
  const [payMonth, setPayMonth] = useState("06/2026");

  // Checklist Kanban States
  const [draggedOverCol, setDraggedOverCol] = useState<string | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState<"Như Quỳnh" | "Thùy Quyên" | "Thanh Hằng" | "Thanh Ngân">("Như Quỳnh");
  const [newTaskPriority, setNewTaskPriority] = useState<"Cao" | "Trung bình" | "Thấp">("Trung bình");
  const [newTaskFreq, setNewTaskFreq] = useState<"Hàng ngày" | "Hàng tuần" | "Hàng tháng">("Hàng ngày");

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDropCard = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    
    setChecklist(prev => prev.map(item => 
      item.id === id ? { ...item, status: targetStatus as any } : item
    ));
  };

  const handleDeleteTask = (id: string) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;

    const newTask: ChecklistItem = {
      id: `T-${Date.now()}`,
      task: newTaskName,
      assignee: newTaskAssignee,
      frequency: newTaskFreq,
      status: "Kế hoạch",
      priority: newTaskPriority,
      date: new Date().toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }).replace("/", "-")
    };

    setChecklist(prev => [...prev, newTask]);
    setNewTaskName("");
    setShowAddTask(false);
  };

  // VPP states
  const [vppSubTab, setVppSubTab] = useState<"inventory" | "phongban" | "duan">("inventory");
  const [searchTerm, setSearchTerm] = useState("");
  
  // State for inventory add item form
  const [showAddSupply, setShowAddSupply] = useState(false);
  const [newSupplyName, setNewSupplyName] = useState("");
  const [newSupplyCat, setNewSupplyCat] = useState("Giấy in");
  const [newSupplyUnit, setNewSupplyUnit] = useState("");
  const [newSupplyStock, setNewSupplyStock] = useState(0);

  // Dynamic unique categories extracted from supplies list
  const uniqueCategories = useMemo(() => {
    const cats = supplies.map(s => s.cat).filter(Boolean);
    if (cats.length === 0) {
      return ["Giấy in", "Bút viết", "Dụng cụ lưu trữ", "Khác"];
    }
    return Array.from(new Set(cats));
  }, [supplies]);


  // State for Allocation Targets Directory (Danh mục cấp phát)
  const [allocationTargets, setAllocationTargets] = useState<AllocationTarget[]>(INITIAL_ALLOCATION_TARGETS);
  const [showAllocationDirectory, setShowAllocationDirectory] = useState(false);
  const [newTargetType, setNewTargetType] = useState<"phongban" | "duan">("phongban");
  const [newTargetName, setNewTargetName] = useState("");
  const [newTargetReceiver, setNewTargetReceiver] = useState("");
  const [newTargetNotes, setNewTargetNotes] = useState("");

  // States for editing VPP stock (Beginning and Imports)
  const [editingInitialStockName, setEditingInitialStockName] = useState<string | null>(null);
  const [editingInitialStockVal, setEditingInitialStockVal] = useState<number>(0);
  const [editingImportedName, setEditingImportedName] = useState<string | null>(null);
  const [editingImportedVal, setEditingImportedVal] = useState<number>(0);

  // State for editing category directly
  const [editingSupplyCatName, setEditingSupplyCatName] = useState<string | null>(null);
  const [editingCatVal, setEditingCatVal] = useState("");

  // States for PYC (phiếu yêu cầu)
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("Tất cả");
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>("Tất cả");

  // State for creating new PYC
  const [showNewPYCModal, setShowNewPYCModal] = useState(false);
  const [newPYCTarget, setNewPYCTarget] = useState<"phongban" | "duan">("phongban");
  const [newPYCTargetName, setNewPYCTargetName] = useState("");
  const [newPYCItem, setNewPYCItem] = useState("");
  const [newPYCQty, setNewPYCQty] = useState(1);
  const [newPYCRequesterName, setNewPYCRequesterName] = useState("");

  // Invoice Reader Batch States
  const [invoiceQueue, setInvoiceQueue] = useState<Array<{
    id: string;
    file: File;
    status: "pending" | "extracting" | "success" | "error";
    number: string;
    date: string;
    desc: string;
    amount: number;
    error?: string;
    isMock?: boolean;
    fileUrl?: string;
    beneficiaryName?: string;
    bankAccount?: string;
    bankNameBranch?: string;
  }>>([]);
  const [isExtractingBatch, setIsExtractingBatch] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [activePreviewInvoice, setActivePreviewInvoice] = useState<Invoice | null>(null);
  const [showRecurringPreviewModal, setShowRecurringPreviewModal] = useState(false);
  const [selectedRecurringPreviewIdx, setSelectedRecurringPreviewIdx] = useState(0);
  const [activePreviewPayment, setActivePreviewPayment] = useState<SupplierPayment | null>(null);

  // States for viewing original files in popups
  const [previewFileUrl, setPreviewFileUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewFileIndex, setPreviewFileIndex] = useState<number>(0);
  const [showSqlGuideModal, setShowSqlGuideModal] = useState(false);
  const [isTableMissing, setIsTableMissing] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);
  const [uploadingPaymentId, setUploadingPaymentId] = useState<string | null>(null);

  // Report date range states
  const [reportStartDate, setReportStartDate] = useState("2026-06-01");
  const [reportEndDate, setReportEndDate] = useState("2026-06-30");
  const [showDatePickerPopover, setShowDatePickerPopover] = useState(false);
  const [tempStartDate, setTempStartDate] = useState("2026-06-01");
  const [tempEndDate, setTempEndDate] = useState("2026-06-30");

  // Form metadata for document generation
  const [employeeName, setEmployeeName] = useState("Nguyễn Bích Như Quỳnh");
  const [employeeDept, setEmployeeDept] = useState("Phòng Hành chính nhân sự");
  const [paymentMission, setPaymentMission] = useState("Thanh toán chi phí hành chính tháng 06");
  const [documentType, setDocumentType] = useState<"payment" | "transfer">("transfer");
  const [projectName, setProjectName] = useState("Văn phòng HCM");
  const [supplierName, setSupplierName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankNameBranch, setBankNameBranch] = useState("");

  // AI Settings States for Invoice Reader
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [showAiSettingsModal, setShowAiSettingsModal] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // AI VPP Upload & Auto-Creation States
  const [vppFileUploading, setVppFileUploading] = useState(false);
  const [showVppPreviewModal, setShowVppPreviewModal] = useState(false);
  const [vppPreviewTargetType, setVppPreviewTargetType] = useState<"phongban" | "duan">("phongban");
  const [vppPreviewTargetName, setVppPreviewTargetName] = useState("");
  const [vppPreviewRequesterName, setVppPreviewRequesterName] = useState("");
  const [vppPreviewItems, setVppPreviewItems] = useState<Array<{
    checked: boolean;
    name: string;
    unit: string;
    qty: number;
  }>>([]);
  const [isSuppliesLoadedFromServer, setIsSuppliesLoadedFromServer] = useState(false);

  // VPP Slip Preview & Download States
  const [showSlipPreviewModal, setShowSlipPreviewModal] = useState(false);
  const [slipPreviewTargetType, setSlipPreviewTargetType] = useState<"phongban" | "duan">("phongban");
  const [slipPreviewTargetName, setSlipPreviewTargetName] = useState("");

  // Helper to parse tasks into DeptRequests
  const parseVppTask = (t: any): DeptRequest => {
    try {
      if (t.notes && t.notes.startsWith("{")) {
        const parsed = JSON.parse(t.notes);
        const normTargetName = normalizeDeptName(parsed.targetName || t.assignee);
        return {
          id: t.id,
          dept: parsed.target === "phongban" ? normTargetName : `Ban điều hành ${normTargetName}`,
          item: parsed.item,
          qty: parsed.qty,
          date: parsed.date || t.start_date,
          allocationTime: parsed.allocationTime || parsed.allocationDate || "",
          status: t.status === "completed" ? "Đã cấp phát" : "Chờ duyệt",
          target: parsed.target || "phongban",
          targetName: normTargetName,
          requesterName: parsed.requesterName || "",
          cat: parsed.cat || "",
          unit: parsed.unit || ""
        };
      }
    } catch (e) {
      console.error("Error parsing task notes as JSON:", e);
    }
    
    // Fallback parsing from title: VPP: targetName | item | qty
    const parts = t.title.split("|").map((p: string) => p.trim());
    const targetName = normalizeDeptName((parts[0] || "").replace("VPP:", "").trim());
    const item = parts[1] || "";
    const qty = Number(parts[2]) || 1;
    return {
      id: t.id,
      dept: t.title.includes("Ban điều hành") || t.title.includes("BĐH") ? `Ban điều hành ${targetName}` : targetName,
      item: item,
      qty: qty,
      date: t.start_date || "",
      allocationTime: "",
      status: t.status === "completed" ? "Đã cấp phát" : "Chờ duyệt",
      target: t.title.includes("Ban điều hành") || t.title.includes("BĐH") ? "duan" : "phongban",
      targetName: targetName,
      cat: "",
      unit: ""
    };
  };

  // Helper to fuzzy match requested item names to supplies catalog
  const findMatchingSupply = (itemName: string): SupplyItem | null => {
    if (!itemName) return null;
    const normalizedSearch = itemName.trim().toLowerCase();
    
    // 1. Try exact match first
    let found = supplies.find(s => s.name.trim().toLowerCase() === normalizedSearch);
    if (found) return found;
    
    // 2. Try accent-insensitive and symbol-insensitive exact match
    const cleanForComparison = (str: string) => str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove Vietnamese accents
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") // remove all symbols and spaces
      .trim();

    const cleanSearch = cleanForComparison(normalizedSearch);
    if (!cleanSearch) return null;

    found = supplies.find(s => cleanForComparison(s.name) === cleanSearch);
    if (found) return found;

    // 3. Normalize words to handle common typos and equivalents
    const normalizeWords = (str: string) => {
      let clean = str.toLowerCase().trim();
      
      // Clean typos
      clean = clean.replace(/doupble/g, "double");
      clean = clean.replace(/mầu/g, "màu");
      
      // Map common request terms to official catalog terms
      if (clean.includes("kẹp bướm")) {
        if (clean.includes("nhỏ") || clean.includes("size nhỏ") || clean.includes("15mm") || clean.includes("19mm")) {
          return "kẹp bướm 15mm";
        }
        if (clean.includes("vừa") || clean.includes("size vừa") || clean.includes("25mm") || clean.includes("32mm")) {
          return "kẹp bướm 25mm";
        }
        if (clean.includes("lớn") || clean.includes("size lớn") || clean.includes("41mm") || clean.includes("51mm")) {
          return "kẹp bướm 41mm";
        }
      }
      
      if (clean === "kẹp giấy" || clean === "ghim kẹp" || clean.includes("kẹp giấy c62") || clean.includes("ghim kẹp giấy")) {
        return "ghim kẹp giấy c62";
      }
      
      if (clean === "khăn giấy" || clean === "khăn giấy hộp" || clean.includes("khan giay")) {
        return "khăn giấy nhỏ";
      }
      
      if (clean.includes("thước dẻo") || clean.includes("thước kẻ") || clean.includes("thuoc deo")) {
        return "thước kẻ";
      }
      
      if (clean.includes("băng keo xanh")) {
        return "băng keo xanh";
      }

      if (clean.includes("băng keo trong")) {
        return "băng keo trong";
      }
      
      if (clean.includes("bút bi xanh")) {
        return "bút bi thiên long xanh";
      }

      if (clean.includes("bút chì")) {
        return "bút chì";
      }

      if (clean.includes("bút xóa kéo")) {
        return "bút xóa kéo";
      }
      
      return clean;
    };

    const cleanNormSearch = cleanForComparison(normalizeWords(itemName));
    found = supplies.find(s => cleanForComparison(normalizeWords(s.name)) === cleanNormSearch);
    if (found) return found;

    // 4. Sørensen-Dice coefficient similarity match for fallback
    const getBigrams = (s: string) => {
      const bigrams = new Set<string>();
      for (let i = 0; i < s.length - 1; i++) {
        bigrams.add(s.substring(i, i + 2));
      }
      return bigrams;
    };

    const getSimilarity = (s1: string, s2: string) => {
      if (s1 === s2) return 1.0;
      if (s1.length < 2 || s2.length < 2) return 0.0;
      const b1 = getBigrams(s1);
      const b2 = getBigrams(s2);
      let intersection = 0;
      for (const val of b1) {
        if (b2.has(val)) intersection++;
      }
      return (2.0 * intersection) / (b1.size + b2.size);
    };

    let bestMatch: SupplyItem | null = null;
    let highestSim = 0;

    for (const s of supplies) {
      const cleanNormCatalog = cleanForComparison(normalizeWords(s.name));
      const sim = getSimilarity(cleanNormSearch, cleanNormCatalog);
      if (sim > highestSim) {
        highestSim = sim;
        bestMatch = s;
      }
    }

    if (highestSim >= 0.70 && bestMatch) {
      return bestMatch;
    }

    return null;
  };

  // Dynamically calculate the allocated quantity from completed VPP requests (status = "Đã cấp phát")
  const suppliesWithDynamicAllocated = useMemo(() => {
    return supplies.map(s => {
      const allocatedSum = deptRequests
        .filter(r => r.status === "Đã cấp phát" && findMatchingSupply(r.item)?.name === s.name)
        .reduce((sum, r) => sum + r.qty, 0);
      const initialStock = s.initialStock !== undefined ? s.initialStock : (s.stock !== undefined ? s.stock : 0);
      const imported = s.imported !== undefined ? s.imported : 0;
      const remaining = imported - allocatedSum;
      const ending = initialStock + imported - allocatedSum;
      return {
        ...s,
        initialStock,
        imported,
        allocated: allocatedSum,
        remaining,
        ending
      };
    });
  }, [supplies, deptRequests]);

  // Helper to get matched supply item with dynamically calculated stocks (initialStock, imported, allocated, remaining, ending)
  const findMatchingSupplyDynamic = (itemName: string) => {
    const raw = findMatchingSupply(itemName);
    if (!raw) return null;
    return suppliesWithDynamicAllocated.find(s => s.name === raw.name) || null;
  };

  // Fetch VPP supplies catalog from Supabase
  const fetchSuppliesCatalog = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("title", "VPP_INVENTORY_CATALOG");

      if (error) {
        throw error;
      }

      // Read current local storage items to merge
      let localItems: SupplyItem[] = [];
      if (typeof window !== "undefined") {
        const localSaved = localStorage.getItem("tnec_supplies");
        if (localSaved) {
          try {
            const parsed = JSON.parse(localSaved);
            if (Array.isArray(parsed)) {
              localItems = parsed;
            }
          } catch (e) {
            console.error("Error parsing local supplies for merge:", e);
          }
        }
      }

      if (data && data.length > 0) {
        const primaryRecord = data[0];
        
        // Background cleanup of any duplicates
        if (data.length > 1) {
          const idsToDelete = data.slice(1).map(r => r.id);
          supabase
            .from("tasks")
            .delete()
            .in("id", idsToDelete)
            .then(({ error: delErr }) => {
              if (delErr) console.error("Error deleting duplicate catalogs:", delErr);
            });
        }

        if (primaryRecord.notes) {
          const parsedServer = JSON.parse(primaryRecord.notes);
          if (Array.isArray(parsedServer)) {
            // Merge server items and local items (items in local that aren't on the server are added)
            const mergedSupplies = [...parsedServer];
            let hasMergedNew = false;
            
            for (const localItem of localItems) {
              const existsOnServer = parsedServer.some(s => s.name.trim().toLowerCase() === localItem.name.trim().toLowerCase());
              if (!existsOnServer && localItem.name.trim() !== "") {
                mergedSupplies.push(localItem);
                hasMergedNew = true;
              }
            }
            
            setSupplies(mergedSupplies);
            localStorage.setItem("tnec_supplies", JSON.stringify(mergedSupplies));
            
            // If local machine had newer items, sync them back to Supabase
            if (hasMergedNew) {
              await supabase
                .from("tasks")
                .update({ notes: JSON.stringify(mergedSupplies) })
                .eq("id", primaryRecord.id);
            }
          }
        }
      } else {
        // Seed in Supabase with current localStorage if it exists to prevent losing entered items, otherwise fallback to INITIAL_SUPPLIES
        let seedData = INITIAL_SUPPLIES;
        if (localItems.length > 0) {
          seedData = localItems;
        }

        const { error: insertError } = await supabase
          .from("tasks")
          .insert([{
            title: "VPP_INVENTORY_CATALOG",
            assignee: "Hành chính",
            status: "completed",
            notes: JSON.stringify(seedData)
          }]);

        if (insertError) throw insertError;
        setSupplies(seedData);
        localStorage.setItem("tnec_supplies", JSON.stringify(seedData));
      }
      setIsSuppliesLoadedFromServer(true);
    } catch (err) {
      console.error("Error fetching supplies catalog from Supabase:", err);
    }
  };

  // Fetch VPP requests from Supabase
  const fetchDeptRequests = async () => {
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .ilike("title", "VPP:%");

      if (error) throw error;

      const mapped = (data || []).map(t => parseVppTask(t));
      setDeptRequests(mapped);
    } catch (err) {
      console.error("Error fetching dept requests from Supabase:", err);
    }
  };

  // Fetch suppliers from Supabase
  const fetchSuppliers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        setSuppliers(data as Supplier[]);
      } else {
        setSuppliers(INITIAL_SUPPLIERS);
      }
    } catch (err) {
      console.error("Failed to fetch suppliers from Supabase:", err);
      setSuppliers(INITIAL_SUPPLIERS);
    }
  }, []);

  // Load API Settings on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key_hanh_chinh") || "");
      setModel(localStorage.getItem("openai_model_hanh_chinh") || "gpt-4o-mini");
      
      const savedName = localStorage.getItem("employee_name") || localStorage.getItem("display_name");
      if (savedName) setEmployeeName(savedName);

      // Load Allocation Targets
      const savedTargets = localStorage.getItem("tnec_allocation_targets");
      if (savedTargets) {
        try {
          const parsed = JSON.parse(savedTargets);
          // If the saved targets list contains old department/project names, reset it to INITIAL_ALLOCATION_TARGETS
          const hasOldTargets = parsed.some((t: any) => t.name === "Kế toán" || t.name === "Phòng HCNS" || t.name === "Vàm Lẽo");
          if (hasOldTargets) {
            setAllocationTargets(INITIAL_ALLOCATION_TARGETS);
            localStorage.setItem("tnec_allocation_targets", JSON.stringify(INITIAL_ALLOCATION_TARGETS));
          } else {
            let changed = false;
            const updated = [...parsed];
            INITIAL_ALLOCATION_TARGETS.forEach(initItem => {
              const exists = parsed.some(
                (p: any) => p.name.toLowerCase() === initItem.name.toLowerCase() && p.type === initItem.type
              );
              if (!exists) {
                updated.push(initItem);
                changed = true;
              }
            });
            if (changed) {
              localStorage.setItem("tnec_allocation_targets", JSON.stringify(updated));
            }
            setAllocationTargets(updated);
          }
        } catch (err) {
          console.error("Error parsing savedTargets:", err);
          setAllocationTargets(INITIAL_ALLOCATION_TARGETS);
          localStorage.setItem("tnec_allocation_targets", JSON.stringify(INITIAL_ALLOCATION_TARGETS));
        }
      } else {
        setAllocationTargets(INITIAL_ALLOCATION_TARGETS);
        localStorage.setItem("tnec_allocation_targets", JSON.stringify(INITIAL_ALLOCATION_TARGETS));
      }

      // Fetch Dept Requests and Supplies Catalog from Supabase
      fetchDeptRequests();
      fetchSuppliers();
      fetchSuppliesCatalog();
      fetchReportRows();

      fetchUserRoleAndDept();
    }
  }, [fetchSuppliers]);

  const fetchUserRoleAndDept = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) return;

      const user = session.user;
      const email = user.email || "";

      // 1. Check allowed_users
      const { data: allowedData } = await supabase
        .from("allowed_users")
        .select("role")
        .ilike("email", email)
        .maybeSingle();

      const isAdmin = allowedData?.role === "Admin";

      // 2. Check employees
      const { data: empData } = await supabase
        .from("employees")
        .select("name, role, department")
        .like("email", `%${email}%`)
        .maybeSingle();

      const userInfo = {
        email,
        name: empData?.name || user.user_metadata?.full_name || user.user_metadata?.name || "Người dùng",
        role: empData?.role || (isAdmin ? "Admin" : "Nhân viên"),
        department: empData?.department || "Chưa xếp phòng",
        isAdmin
      };
      
      setCurrentUser(userInfo);
    } catch (err) {
      console.error("Error fetching user permissions in admin:", err);
    }
  };

  const canDeleteSupplies = !!(currentUser && (
    currentUser.isAdmin || 
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.role.toLowerCase().includes("trưởng phòng") || 
    currentUser.role.toLowerCase().includes("truong phong") ||
    currentUser.role.toLowerCase().includes("phó phòng") || 
    currentUser.role.toLowerCase().includes("pho phong") ||
    currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
    currentUser.role.toLowerCase().includes("pho truong phong")
  ));

  const canApproveRequests = !!(currentUser && (
    currentUser.isAdmin || 
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.role.toLowerCase().includes("trưởng phòng") || 
    currentUser.role.toLowerCase().includes("truong phong") ||
    currentUser.role.toLowerCase().includes("phó phòng") || 
    currentUser.role.toLowerCase().includes("pho phong") ||
    currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
    currentUser.role.toLowerCase().includes("pho truong phong") ||
    currentUser.role.toLowerCase().includes("hành chính") ||
    currentUser.role.toLowerCase().includes("hanh chinh") ||
    currentUser.department.toLowerCase().includes("hành chính") ||
    currentUser.department.toLowerCase().includes("hanh chinh")
  ));

  // Sync supplies to Supabase and localStorage when changed
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_supplies", JSON.stringify(supplies));

      // Only sync if the catalog has been fetched from the server.
      // This prevents overwriting the database with default/stale local values on mount.
      if (isSuppliesLoadedFromServer) {
        const syncSuppliesToSupabase = async () => {
          try {
            await supabase
              .from("tasks")
              .update({ notes: JSON.stringify(supplies) })
              .eq("title", "VPP_INVENTORY_CATALOG");
          } catch (err) {
            console.error("Error syncing supplies to Supabase:", err);
          }
        };
        syncSuppliesToSupabase();
      }
    }
  }, [supplies, isSuppliesLoadedFromServer]);

  // Sync deptRequests is now handled directly by Supabase

  // Delete Supply Handler
  const handleDeleteSupply = (name: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vật tư "${name}" khỏi danh mục kho không?`)) return;
    setSupplies(prev => prev.filter(s => s.name !== name));
  };

  // VPP Inventory quick add unregistered item handler
  const handleQuickAddSupply = (itemName: string) => {
    if (!itemName || !itemName.trim()) return;
    const cleanName = itemName.trim();
    if (supplies.some(s => s.name.toLowerCase() === cleanName.toLowerCase())) {
      alert(`Vật tư "${cleanName}" đã tồn tại trong danh mục.`);
      return;
    }
    
    // Automatically guess category based on name keywords
    let guessedCat = "Khác";
    const lowerName = cleanName.toLowerCase();
    if (lowerName.includes("giấy") || lowerName.includes("paper")) guessedCat = "Giấy in";
    else if (lowerName.includes("bút") || lowerName.includes("highlight") || lowerName.includes("chì") || lowerName.includes("viết") || lowerName.includes("pen")) guessedCat = "Bút viết";
    else if (lowerName.includes("kẹp") || lowerName.includes("bìa") || lowerName.includes("file") || lowerName.includes("hộp")) guessedCat = "Dụng cụ lưu trữ";
    
    // Automatically guess unit based on name keywords
    let guessedUnit = "cái";
    if (lowerName.includes("giấy a4") || lowerName.includes("giấy a3")) guessedUnit = "ram";
    else if (lowerName.includes("bút") || lowerName.includes("highlight") || lowerName.includes("kéo") || lowerName.includes("thước") || lowerName.includes("dao")) guessedUnit = "cây";
    else if (lowerName.includes("kẹp bướm") || lowerName.includes("ghim") || lowerName.includes("mực")) guessedUnit = "hộp";
    else if (lowerName.includes("băng keo")) guessedUnit = "cuộn";
    else if (lowerName.includes("giấy note") || lowerName.includes("trình ký")) guessedUnit = "xấp";
    else if (lowerName.includes("pin")) guessedUnit = "cục";

    const newSupply: SupplyItem = {
      name: cleanName,
      cat: guessedCat,
      unit: guessedUnit,
      initialStock: 0,
      imported: 0,
      stock: 0, // Quick added has 0 stock initially
      allocated: 0,
      alert: "Cảnh báo" // 0 stock is Alert
    };

    setSupplies(prev => [...prev, newSupply]);
    alert(`Đã thêm nhanh vật tư "${cleanName}" (Đơn vị: ${guessedUnit}, Danh mục: ${guessedCat}) vào danh mục tồn kho hành chính với số lượng tồn kho mặc định là 0. Bạn có thể nhấp vào biểu tượng bút chì để cập nhật số lượng tồn kho!`);
  };

  const handleDeleteRequest = async (reqId: string) => {
    const request = deptRequests.find(r => r.id === reqId);
    if (!request) return;

    if (window.confirm("Bạn có chắc chắn muốn xóa yêu cầu cấp phát này không?")) {
      try {
        const { error } = await supabase
          .from("tasks")
          .delete()
          .eq("id", reqId);

        if (error) throw error;

        // If the request was approved ("Đã cấp phát"), restore the stock
        if (request.status === "Đã cấp phát") {
          setSupplies(prev => prev.map(s => {
            const matched = findMatchingSupply(request.item);
            if (matched && s.name === matched.name) {
              const newStock = s.stock + request.qty;
              return {
                ...s,
                stock: newStock,
                alert: newStock < 15 ? "Cảnh báo" : "Bình thường"
              };
            }
            return s;
          }));
        }

        alert("Đã xóa yêu cầu cấp phát thành công.");
        fetchDeptRequests();
      } catch (err: any) {
        console.error("Error deleting VPP request from Supabase:", err);
        alert("Lỗi khi xóa yêu cầu: " + (err.message || err));
      }
    }
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key_hanh_chinh", apiKey.trim());
      localStorage.setItem("openai_model_hanh_chinh", model);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    }
  };

  // --- NEW SUPPLIER & RECURRING PAYMENT HANDLERS ---
  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierNameState.trim() || !supplierAccountState.trim() || !supplierBankState.trim()) {
      alert("Vui lòng nhập đầy đủ thông tin nhà cung cấp!");
      return;
    }

    const nextId = `NCC-${String(suppliers.length + 1).padStart(2, "0")}`;
    const newSupplier: Supplier = {
      id: supplierIdState.trim() || nextId,
      name: supplierNameState.trim(),
      account: supplierAccountState.trim(),
      bank: supplierBankState.trim(),
      service: supplierServiceState.trim(),
      project_name: supplierProjectState
    };

    try {
      const { error } = await supabase
        .from("suppliers")
        .insert([newSupplier]);
      if (error) throw error;

      setSuppliers(prev => [...prev, newSupplier]);
      alert("Đã thêm Nhà cung cấp thành công!");
    } catch (err: any) {
      console.error("Failed to add supplier to Supabase:", err);
      // Fallback
      const updated = [...suppliers, newSupplier];
      setSuppliers(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_suppliers", JSON.stringify(updated));
      }
      alert("Đã thêm Nhà cung cấp (Lưu tạm trên trình duyệt)!");
    }

    // Reset form
    setSupplierIdState("");
    setSupplierNameState("");
    setSupplierAccountState("");
    setSupplierBankState("");
    setSupplierServiceState("");
    setSupplierProjectState("Văn phòng HCM");
  };

  const handleDeleteSupplier = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa Nhà cung cấp này không?")) {
      try {
        const { error } = await supabase
          .from("suppliers")
          .delete()
          .eq("id", id);
        if (error) throw error;

        setSuppliers(prev => prev.filter(s => s.id !== id));
      } catch (err: any) {
        console.error("Failed to delete supplier from Supabase:", err);
        // Fallback
        const updated = suppliers.filter(s => s.id !== id);
        setSuppliers(updated);
        if (typeof window !== "undefined") {
          localStorage.setItem("tnec_suppliers", JSON.stringify(updated));
        }
      }
    }
  };

  const handleSupplierSelect = (id: string) => {
    setSelectedSupplierId(id);
    const supp = suppliers.find(s => s.id === id);
    if (supp) {
      setPayContent(`Thanh toan ${supp.service || "dich vu"} ${supp.name} thang`);
    } else {
      setPayContent("");
    }
  };

  const handleAddPendingPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const supp = suppliers.find(s => s.id === selectedSupplierId);
    if (!supp || !payAmount || isNaN(Number(payAmount))) {
      alert("Vui lòng chọn Nhà cung cấp và nhập số tiền hợp lệ!");
      return;
    }

    const tempId = `PAY-${Date.now().toString().slice(-4)}`;
    let finalId = tempId;
    let addedInv: Invoice | null = null;

    // Try to sync with Supabase invoices table
    try {
      const { data, error } = await supabase
        .from("invoices")
        .insert([{
          number: `HD-DK-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().slice(0, 10),
          description: payContent || `Thanh toán định kỳ ${supp.name}`,
          amount: Number(payAmount),
          beneficiary_name: supp.name,
          bank_account: supp.account,
          bank_name_branch: supp.bank,
          project_name: supp.project_name || "Văn phòng HCM"
        }])
        .select();
      if (error) throw error;
      if (data && data[0]) {
        finalId = data[0].id;
        const savedInv: Invoice = {
          id: data[0].id,
          number: data[0].number,
          date: data[0].date,
          desc: data[0].description || "",
          amount: Number(data[0].amount),
          file_url: data[0].file_url || "",
          beneficiary_name: data[0].beneficiary_name || "",
          bank_account: data[0].bank_account || "",
          bank_name_branch: data[0].bank_name_branch || ""
        };
        addedInv = savedInv;
        setInvoices(prev => [savedInv, ...prev]);
        alert("Đã thêm khoản thanh toán và đồng bộ thành công lên Supabase!");
      }
    } catch (err: any) {
      console.warn("Could not sync to Supabase (saving locally):", err.message || err);
      // Create local fallback invoice
      const newInv: Invoice = {
        id: tempId,
        number: `HD-DK-${Date.now().toString().slice(-4)}`,
        date: new Date().toISOString().slice(0, 10),
        desc: payContent || `Thanh toán định kỳ ${supp.name}`,
        amount: Number(payAmount),
        beneficiary_name: supp.name,
        bank_account: supp.account,
        bank_name_branch: supp.bank
      };
      addedInv = newInv;
      setInvoices(prev => [newInv, ...prev]);
      alert("Đã lưu khoản thanh toán thành công (lưu tạm thời trên trình duyệt do lỗi kết nối Supabase)!");
    }

    const newPayment: SupplierPayment = {
      id: finalId,
      supplierId: supp.id,
      supplierName: supp.name,
      account: supp.account,
      bank: supp.bank,
      service: supp.service,
      amount: Number(payAmount),
      content: payContent || `Thanh toán định kỳ ${supp.name}`,
      month: payMonth || "06/2026",
      project_name: supp.project_name || "Văn phòng HCM"
    };

    const updated = [...pendingPayments, newPayment];
    setPendingPayments(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_pending_payments", JSON.stringify(updated));
    }

    if (addedInv) {
      handleAutoFillReport([addedInv, ...invoices], updated, true);
    }

    // Reset payment inputs
    setPayAmount("");
    setSelectedSupplierId("");
    setPayContent("");
  };

  const handleDeletePendingPayment = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa khoản thanh toán này?")) {
      try {
        if (!id.startsWith("PAY-") && !id.startsWith("INV-")) {
          const { error } = await supabase
            .from("invoices")
            .delete()
            .eq("id", id);
          if (error) throw error;
        }
      } catch (err: any) {
        console.warn("Could not delete invoice row from Supabase:", err.message || err);
      }

      const updatedPayments = pendingPayments.filter(p => p.id !== id);
      setPendingPayments(updatedPayments);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_pending_payments", JSON.stringify(updatedPayments));
      }
      
      const updatedInvs = invoices.filter(inv => inv.id !== id);
      setInvoices(updatedInvs);

      // Trigger silent auto sync with updated lists
      handleAutoFillReport(updatedInvs, updatedPayments, true);
    }
  };

  const handleUpdatePaymentProject = async (paymentId: string, projectName: string) => {
    const updated = pendingPayments.map(p => p.id === paymentId ? { ...p, project_name: projectName } : p);
    setPendingPayments(updated);
    if (typeof window !== "undefined") {
      localStorage.setItem("tnec_pending_payments", JSON.stringify(updated));
    }

    try {
      if (!paymentId.startsWith("PAY-") && !paymentId.startsWith("INV-")) {
        const { error } = await supabase
          .from("invoices")
          .update({ project_name: projectName })
          .eq("id", paymentId);
        if (error) throw error;
      }
    } catch (err: any) {
      console.warn("Could not sync project update to Supabase:", err.message || err);
    }

    // Trigger silent auto sync with updated lists
    handleAutoFillReport(invoices, updated, true);
  };

  const handleExportDeNghiChuyenTien = async () => {
    const currentMonthPayments = pendingPayments.filter(p => p.month === payMonth);
    if (currentMonthPayments.length === 0) {
      alert("Danh sách thanh toán trống, không thể xuất file!");
      return;
    }

    setExportLoading(true);
    try {
      const expEmployeeName = currentUser?.name || employeeName;
      const expEmployeeDept = currentUser?.department || employeeDept;

      for (const p of currentMonthPayments) {
        const response = await fetch("/api/export-invoice-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            employeeName: expEmployeeName,
            employeeDept: expEmployeeDept,
            mission: p.content,
            projectName: p.project_name || "Văn phòng HCM",
            supplierName: p.supplierName,
            bankAccount: p.account,
            bankNameBranch: p.bank,
            templateType: "transfer",
            items: [
              {
                number: "",
                date: new Date().toISOString().slice(0, 10),
                desc: p.content,
                amount: p.amount
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error(`Không thể xuất phiếu cho ${p.supplierName}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Giay_De_Nghi_Chuyen_Tien_${p.supplierName.replace(/\s+/g, "_")}.docx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        // Add a small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    } catch (error: any) {
      alert("Lỗi khi xuất phiếu đề nghị chuyển tiền: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  const handlePreviewSpecificPayment = (paymentId: string) => {
    const currentMonthPayments = pendingPayments.filter(p => p.month === payMonth);
    const idx = currentMonthPayments.findIndex(p => p.id === paymentId);
    if (idx !== -1) {
      setSelectedRecurringPreviewIdx(idx);
      setShowRecurringPreviewModal(true);
    }
  };

  // Helper to parse JSON description of invoices safely
  const getInvoiceDesc = (desc: string) => {
    if (desc && desc.startsWith("{\"")) {
      try {
        const parsed = JSON.parse(desc);
        return parsed.mission || "";
      } catch (e) {
        return desc;
      }
    }
    return desc || "";
  };

  // Helper classification function
  const getCategory = (desc: string) => {
    const lower = (desc || "").toLowerCase();
    if (lower.includes("văn phòng phẩm") || lower.includes("vpp") || lower.includes("giấy") || lower.includes("bút") || lower.includes("in ấn")) {
      return "Văn phòng phẩm";
    }
    if (lower.includes("điện") || lower.includes("nước") || lower.includes("evn") || lower.includes("sawaco") || lower.includes("điện nước")) {
      return "Điện nước văn phòng";
    }
    if (lower.includes("internet") || lower.includes("cáp quang") || lower.includes("viettel") || lower.includes("fpt") || lower.includes("vnpt") || lower.includes("wifi")) {
      return "Cáp quang Internet";
    }
    if (lower.includes("tiếp khách") || lower.includes("ăn uống") || lower.includes("entertainment") || lower.includes("cafe") || lower.includes("nhà hàng") || lower.includes("hoa quả") || lower.includes("tiệc")) {
      return "Chi phí mua đồ tiếp khách";
    }
    return "Chi phí khác";
  };

  const getReportData = (startDate: string, endDate: string) => {
    const filteredInvoices = invoices.filter(inv => {
      if (!inv.date) return false;
      return inv.date >= startDate && inv.date <= endDate;
    });

    const filteredPayments = pendingPayments.filter(p => {
      if (!p.month) return false;
      const parts = p.month.split("/");
      if (parts.length !== 2) return false;
      const mm = parts[0].padStart(2, "0");
      const yyyy = parts[1];
      const monthStart = `${yyyy}-${mm}-01`;
      const lastDay = new Date(parseInt(yyyy), parseInt(mm), 0).getDate();
      const monthEnd = `${yyyy}-${mm}-${String(lastDay).padStart(2, "0")}`;
      return monthEnd >= startDate && monthStart <= endDate;
    });

    const combinedItems = [
      ...filteredInvoices.map(inv => ({
        id: inv.id,
        type: "Hóa đơn",
        code: inv.number || "N/A",
        date: inv.date || "",
        beneficiary: inv.beneficiary_name || "N/A",
        desc: getInvoiceDesc(inv.desc),
        amount: inv.amount || 0,
        category: getCategory(getInvoiceDesc(inv.desc)),
        file_url: inv.file_url
      })),
      ...filteredPayments.map(p => ({
        id: p.id,
        type: "Thanh toán định kỳ",
        code: p.supplierId || "N/A",
        date: p.month || "",
        beneficiary: p.supplierName || "N/A",
        desc: p.content || "",
        amount: p.amount || 0,
        category: getCategory(p.content || p.service || ""),
        file_url: p.fileUrl
      }))
    ];

    const totalAmount = combinedItems.reduce((sum, item) => sum + item.amount, 0);
    const invoiceCount = filteredInvoices.length;
    const recurringCount = filteredPayments.length;

    const categoriesMap: Record<string, number> = {
      "Văn phòng phẩm": 0,
      "Điện nước văn phòng": 0,
      "Cáp quang Internet": 0,
      "Chi phí mua đồ tiếp khách": 0,
      "Chi phí khác": 0,
    };

    combinedItems.forEach(item => {
      const cat = item.category;
      if (categoriesMap[cat] !== undefined) {
        categoriesMap[cat] += item.amount;
      } else {
        categoriesMap["Chi phí khác"] += item.amount;
      }
    });

    return {
      combinedItems,
      totalAmount,
      invoiceCount,
      recurringCount,
      categoriesMap
    };
  };

  const formatDateVN = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const handleApplyDateRange = () => {
    setReportStartDate(tempStartDate);
    setReportEndDate(tempEndDate);
    setShowDatePickerPopover(false);
  };

  const handleCancelDateRange = () => {
    setTempStartDate(reportStartDate);
    setTempEndDate(reportEndDate);
    setShowDatePickerPopover(false);
  };

  const handleQuickSelect = (type: string) => {
    const now = new Date();
    let start: Date;
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    switch (type) {
      case "thisMonth":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "1month":
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case "2months":
        start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        break;
      case "3months":
        start = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const toISO = (d: Date) => d.toISOString().slice(0, 10);
    setTempStartDate(toISO(start));
    setTempEndDate(toISO(end));
  };

  const handleExportChecklistExcel = () => {
    try {
      let csvContent = "\uFEFF";
      
      csvContent += `"BÁO CÁO CHECKLIST PHÂN VIỆC ĐỊNH KỲ"\n`;
      csvContent += `"Ngày xuất báo cáo:","${new Date().toLocaleDateString("vi-VN")}"\n\n`;
      
      csvContent += `"STT","Tên công việc","Người thực hiện","Tần suất","Trạng thái","Mức độ ưu tiên","Ngày tạo"\n`;
      
      checklist.forEach((item, index) => {
        const task = (item.task || "").replace(/"/g, '""');
        const assignee = (item.assignee || "").replace(/"/g, '""');
        const freq = (item.frequency || "").replace(/"/g, '""');
        const status = (item.status || "").replace(/"/g, '""');
        const priority = (item.priority || "Trung bình").replace(/"/g, '""');
        const dateStr = item.date ? new Date(item.date).toLocaleDateString("vi-VN") : "";
        
        csvContent += `"${index + 1}","${task}","${assignee}","${freq}","${status}","${priority}","${dateStr}"\n`;
      });
      
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao_cao_checklist_cong_viec_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Lỗi khi kết xuất báo cáo: " + err.message);
    }
  };

  // --- INTERACTIVE MONTHLY COST REPORT STATE HANDLERS ---
  
  const normalizeText = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s]/g, "")
      .trim();
  };

  const findMatchingRow = (rows: AdminMonthlyReport[], desc: string, supplier: string) => {
    const normDesc = normalizeText(desc || "");
    const normSupplier = normalizeText(supplier || "");
    const fullText = normDesc + " " + normSupplier;

    // Define matching rules
    const rules = [
      { key: "van phong pham", keywords: ["van phong pham", "vpp", "but bi", "giay a4", "kep buom", "tem nhan", "bang keo", "bia ho so"] },
      { key: "photo, in an", keywords: ["photo", "in an", "muc in", "thue may photo", "photocopy"] },
      { key: "hoa chat, vat dung ve sinh", keywords: ["ve sinh", "hoa chat ve sinh", "nuoc lau san", "xa bong", "giay ve sinh", "rua chen"] },
      { key: "ccdc, phan mem ho tro", keywords: ["ccdc", "do dung van phong", "pin", "o cam", "trans can", "pickle ball", "le khoi cong", "hoa khai truong", "tivi 55 inch", "cap hdmi"] },
      { key: "vmb", keywords: ["vmb", "ve may bay", "vietnam airlines", "vietjet", "bamboo airways", "bay"] },
      { key: "thue nha, van phong", keywords: ["thue nha", "thue vp", "thue van phong", "phong ban giam doc", "pgd", "tien thue nha"] },
      { key: "dien vp", keywords: ["dien vp", "tien dien", "evn", "dien luc"] },
      { key: "nuoc (nuoc uong)", keywords: ["tien nuoc", "nuoc khoang", "lavie", "vinh hao", "aquafina", "nuoc sinh hoat"] },
      { key: "chuyen phat nhanh", keywords: ["chuyen phat", "cpn", "buu dien", "viettel post", "giaohangnhanh", "dhl", "fedex", "shopee express", "grabexpress"] },
      { key: "xang dau, cau pha", keywords: ["xang dau", "dau diezel", "gui xe", "rua xe", "cau duong", "ve xe", "nhien lieu"] },
      { key: "sua chua, bao duong o to", keywords: ["sua chua o to", "bao duong o to", "thay nho", "lop xe", "sam xe", "phu tung o to"] },
      { key: "thue xe o to", keywords: ["thue xe o to", "thue xe thang", "thue o to"] },
      { key: "dang kiem, phi duong bo", keywords: ["dang kiem", "duong bo", "phi duong bo"] },
      { key: "qua tang doi tac", keywords: ["qua tang", "qua doi tac", "hoa tang"] },
      { key: "ca na", keywords: ["ca na"] },
      { key: "rach xuyen tam", keywords: ["rach xuyen tam"] },
      { key: "vam leo", keywords: ["vam leo", "au thuyen vam leo"] },
      { key: "tinh lo 8", keywords: ["tinh lo 8"] },
      { key: "tra vinh", keywords: ["tra vinh"] },
      { key: "tay ninh", keywords: ["tay ninh"] }
    ];

    for (const rule of rules) {
      if (rule.keywords.some(kw => fullText.includes(kw))) {
        const found = rows.find(r => normalizeText(r.content).includes(rule.key));
        if (found) return found;
      }
    }

    for (const row of rows) {
      const normContent = normalizeText(row.content);
      if (normContent.length > 4 && (normDesc.includes(normContent) || normSupplier.includes(normContent))) {
        return row;
      }
    }
    return null;
  };

  const computedStats = useMemo(() => {
    const officeRows = reportRows.filter(r => r.category_type === "office");
    const projectRows = reportRows.filter(r => r.category_type === "project");

    const getMonthlySubtotals = (rows: AdminMonthlyReport[]) => {
      const subtotals: Record<string, number> = {};
      for (let i = 1; i <= 12; i++) {
        const key = `m${i}`;
        subtotals[key] = rows.reduce((sum, r) => sum + (Number(r[key as keyof AdminMonthlyReport]) || 0), 0);
      }
      return subtotals;
    };

    const officeMonthlySubtotals = getMonthlySubtotals(officeRows);
    const projectMonthlySubtotals = getMonthlySubtotals(projectRows);

    const officeAnnualSubtotal = Object.values(officeMonthlySubtotals).reduce((a, b) => a + b, 0);
    const projectAnnualSubtotal = Object.values(projectMonthlySubtotals).reduce((a, b) => a + b, 0);

    const grandMonthlyTotals: Record<string, number> = {};
    for (let i = 1; i <= 12; i++) {
      const key = `m${i}`;
      grandMonthlyTotals[key] = officeMonthlySubtotals[key] + projectMonthlySubtotals[key];
    }

    const grandAnnualTotal = officeAnnualSubtotal + projectAnnualSubtotal;

    return {
      officeRows,
      projectRows,
      officeMonthlySubtotals,
      projectMonthlySubtotals,
      officeAnnualSubtotal,
      projectAnnualSubtotal,
      grandMonthlyTotals,
      grandAnnualTotal
    };
  }, [reportRows]);

  const fetchReportRows = useCallback(async () => {
    setReportLoading(true);
    try {
      const { data, error } = await supabase
        .from("admin_monthly_reports")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;

      if (data) {
        setReportRows(data as AdminMonthlyReport[]);
      }
    } catch (err) {
      console.error("Failed to fetch monthly report rows:", err);
    } finally {
      setReportLoading(false);
    }
  }, []);

  const handleUpdateReportCell = async (rowId: string, field: string, value: any) => {
    // Update local state immediately
    setReportRows(prev => prev.map(row => 
      row.id === rowId ? { ...row, [field]: value } : row
    ));

    // Skip Supabase update for temp rows (not yet synced)
    if (rowId.startsWith("temp-")) return;

    try {
      const { error } = await supabase
        .from("admin_monthly_reports")
        .update({ [field]: value })
        .eq("id", rowId);
      if (error) throw error;
    } catch (err) {
      console.error("Failed to update report cell:", err);
    }
  };

  const handleAddReportRow = async (type: "office" | "project") => {
    const existingOfType = reportRows.filter(r => r.category_type === type);
    const nextNum = existingOfType.length + 1;
    const tempId = `temp-${Date.now()}`;
    const newRow: AdminMonthlyReport = {
      id: tempId,
      stt: String(nextNum),
      content: type === "office" ? `Hạng mục VP mới ${nextNum}` : `Hạng mục DA mới ${nextNum}`,
      category_type: type,
      is_custom: true,
      m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0,
      notes: ""
    };

    // Optimistic: add to UI immediately
    setReportRows(prev => [...prev, newRow]);
    setTimeout(() => setEditingCell({ rowId: tempId, field: "content" }), 100);

    // Sync to Supabase in background
    try {
      const { id: _id, created_at: _ca, ...payload } = newRow;
      const { data, error } = await supabase
        .from("admin_monthly_reports")
        .insert(payload)
        .select();

      if (error) {
        console.error("Supabase insert error:", error);
        return;
      }
      if (data && data[0]) {
        const realId = data[0].id;
        // Replace temp ID with real ID, but keep any local edits the user made during temp phase
        setReportRows(prev => {
          const localRow = prev.find(r => r.id === tempId);
          if (!localRow) return prev;
          const mergedRow: AdminMonthlyReport = { ...localRow, id: realId };
          // Sync local edits to Supabase
          const { id: _rid, created_at: _rca, ...updatePayload } = mergedRow;
          supabase
            .from("admin_monthly_reports")
            .update(updatePayload)
            .eq("id", realId)
            .then(({ error: updateErr }) => {
              if (updateErr) console.error("Failed to sync edits:", updateErr);
            });
          return prev.map(r => r.id === tempId ? mergedRow : r);
        });
        setEditingCell(prev => prev?.rowId === tempId ? { rowId: realId, field: prev.field } : prev);
      }
    } catch (err) {
      console.error("Failed to sync row to Supabase:", err);
    }
  };

  const handleDeleteReportRow = async (rowId: string, content: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa hạng mục "${content}" không?`)) return;

    try {
      const { error } = await supabase
        .from("admin_monthly_reports")
        .delete()
        .eq("id", rowId);

      if (error) throw error;
      setReportRows(prev => prev.filter(row => row.id !== rowId));
    } catch (err) {
      console.error("Failed to delete custom row:", err);
      alert("Lỗi khi xóa hạng mục!");
    }
  };

  const handleAutoFillReport = async (customInvoices?: Invoice[], customPayments?: SupplierPayment[], silent: boolean = false) => {
    if (!silent) setAutoFillLoading(true);
    try {
      const activeInvoices = customInvoices || invoices;
      const activePayments = customPayments || pendingPayments;

      // 1. Unpack all invoices (including grouped ones)
      const unpackedItems: Array<{
        date: string;
        desc: string;
        amount: number;
        supplier: string;
      }> = [];

      activeInvoices.filter(inv => !inv.number?.startsWith("HD-DK-")).forEach(inv => {
        const desc = inv.desc || "";
        if (desc.startsWith("{\"")) {
          try {
            const parsed = JSON.parse(desc);
            const groupItems = parsed.items || [];
            groupItems.forEach((item: any) => {
              unpackedItems.push({
                date: item.date || inv.date || "",
                desc: item.desc || "",
                amount: Number(item.amount) || 0,
                supplier: inv.beneficiary_name || ""
              });
            });
          } catch (e) {
            unpackedItems.push({
              date: inv.date || "",
              desc: desc,
              amount: Number(inv.amount) || 0,
              supplier: inv.beneficiary_name || ""
            });
          }
        } else {
          unpackedItems.push({
            date: inv.date || "",
            desc: desc,
            amount: Number(inv.amount) || 0,
            supplier: inv.beneficiary_name || ""
          });
        }
      });

      // 2. Add pending payments (recurring)
      activePayments.forEach(p => {
        // Parse month MM/YYYY to YYYY-MM-DD for consistency
        let dateStr = "";
        if (p.month) {
          const parts = p.month.split("/");
          if (parts.length === 2) {
            dateStr = `${parts[1]}-${parts[0].padStart(2, "0")}-01`;
          }
        }
        unpackedItems.push({
          date: dateStr,
          desc: p.content || "",
          amount: Number(p.amount) || 0,
          supplier: p.supplierName || ""
        });
      });

      // Helper functions for categorization and name cleaning
      const cleanInvoiceDesc = (description: string) => {
        let clean = description || "";
        clean = clean.replace(/^(thanh toán chi phí|thanh toán|chi phí|tt chi phí|tt cp|tt)\s+/i, "");
        clean = clean.replace(/^(thanh toan chi phi|thanh toan|chi phi)\s+/i, "");
        clean = clean.replace(/(tháng\s+\d{1,2}\/\d{4}|thang\s+\d{1,2}\/\d{4}|T\d{1,2}\/\d{4})/gi, "");
        clean = clean.replace(/(tháng\s+\d{1,2}|thang\s+\d{1,2}|T\d{1,2})/gi, "");
        clean = clean.replace(/\s*-\s*(công ty|cty|cổ phần|cp|tnhh|co phan).*/i, "");
        clean = clean.replace(/\s+/g, " ").trim();
        if (clean.length > 0) {
          clean = clean.charAt(0).toUpperCase() + clean.slice(1);
        }
        return clean || "Chi phí khác";
      };

      const getProjectName = (description: string, supplier: string) => {
        const fullText = (description + " " + supplier).toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[đĐ]/g, "d");

        if (fullText.includes("vam leo")) {
          return "BĐH dự án Vàm Lẽo";
        }
        if (fullText.includes("tinh lo 8")) {
          return "BĐH dự án Tỉnh Lộ 8";
        }
        if (fullText.includes("rach xuyen tam")) {
          return "BĐH dự án Rạch Xuyên Tâm";
        }
        if (fullText.includes("tay ninh")) {
          return "BĐH dự án Tây Ninh";
        }
        if (fullText.includes("ca na")) {
          return "BĐH dự án Cà Ná";
        }
        if (fullText.includes("tra vinh")) {
          return "BĐH dự án Trà Vinh";
        }
        return null;
      };

      // 3. Group and compute monthly totals
      const groups: Record<string, {
        content: string;
        category_type: "office" | "project";
        m1: number; m2: number; m3: number; m4: number; m5: number; m6: number;
        m7: number; m8: number; m9: number; m10: number; m11: number; m12: number;
      }> = {};

      unpackedItems.forEach(item => {
        if (!item.date) return;
        // Check 2026
        if (!item.date.includes("2026")) return;
        
        let monthNum = 0;
        if (item.date.includes("-")) {
          const parts = item.date.split("-");
          monthNum = parseInt(parts[1]);
        } else if (item.date.includes("/")) {
          const parts = item.date.split("/");
          monthNum = parseInt(parts[0]);
        }
        if (monthNum < 1 || monthNum > 12) return;

        const projName = getProjectName(item.desc, item.supplier);
        const categoryType = projName ? "project" : "office";
        const contentName = projName || cleanInvoiceDesc(item.desc);
        const key = `${categoryType}::${contentName}`;

        if (!groups[key]) {
          groups[key] = {
            content: contentName,
            category_type: categoryType,
            m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0
          };
        }
        const mKey = `m${monthNum}` as "m1" | "m2" | "m3" | "m4" | "m5" | "m6" | "m7" | "m8" | "m9" | "m10" | "m11" | "m12";
        groups[key][mKey] += item.amount;
      });

      // 4. Merge with existing reportRows (preserving user custom edits & notes)
      const finalRows: AdminMonthlyReport[] = [];
      const usedIds = new Set<string>();

      // Load latest report rows from DB first to get fresh state
      const { data: dbRows, error: fetchErr } = await supabase
        .from("admin_monthly_reports")
        .select("*");
      if (fetchErr) throw fetchErr;
      const currentDbRows = (dbRows || []) as AdminMonthlyReport[];

      // Reconcile
      Object.values(groups).forEach(g => {
        // Find if this category already exists in DB
        const existing = currentDbRows.find(r => 
          r.category_type === g.category_type && 
          normalizeText(r.content) === normalizeText(g.content)
        );

        if (existing) {
          finalRows.push({
            ...existing,
            ...g
          });
          usedIds.add(existing.id);
        } else {
          // Create new row in DB payload later
          finalRows.push({
            id: `new-${Date.now()}-${Math.random()}`,
            stt: "", // will compute sequentially
            content: g.content,
            category_type: g.category_type,
            m1: g.m1, m2: g.m2, m3: g.m3, m4: g.m4, m5: g.m5, m6: g.m6,
            m7: g.m7, m8: g.m8, m9: g.m9, m10: g.m10, m11: g.m11, m12: g.m12,
            notes: "",
            is_custom: false
          });
        }
      });

      // Add custom rows or remaining DB rows that did not match any active invoice
      // But reset their months to 0 (since they have no invoices this year)
      currentDbRows.forEach(r => {
        if (!usedIds.has(r.id)) {
          // If it was custom or has notes, keep it in the spreadsheet (with months = 0)
          // Otherwise, we will delete it below
          if (r.is_custom || (r.notes && r.notes.trim().length > 0)) {
            finalRows.push({
              ...r,
              m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0
            });
            usedIds.add(r.id);
          }
        }
      });

      // Assign sequential STT to finalRows for office and project
      const officeRows = finalRows.filter(r => r.category_type === "office");
      officeRows.forEach((r, idx) => { r.stt = String(idx + 1); });

      const projectRows = finalRows.filter(r => r.category_type === "project");
      projectRows.forEach((r, idx) => { r.stt = String(idx + 1); });

      // 5. Sync updates, inserts, and deletes back to Supabase
      const toUpdate = finalRows.filter(r => !r.id.startsWith("new-"));
      const toInsert = finalRows.filter(r => r.id.startsWith("new-"));
      const toDelete = currentDbRows.filter(r => !usedIds.has(r.id));

      // Run deletions
      const deletePromises = toDelete.map(row => {
        return supabase
          .from("admin_monthly_reports")
          .delete()
          .eq("id", row.id);
      });
      await Promise.all(deletePromises);

      // Run updates
      const updatePromises = toUpdate.map(row => {
        return supabase
          .from("admin_monthly_reports")
          .update({
            stt: row.stt,
            m1: row.m1, m2: row.m2, m3: row.m3, m4: row.m4, m5: row.m5, m6: row.m6,
            m7: row.m7, m8: row.m8, m9: row.m9, m10: row.m10, m11: row.m11, m12: row.m12
          })
          .eq("id", row.id);
      });
      await Promise.all(updatePromises);

      // Run inserts
      const insertPromises = toInsert.map(async (row) => {
        const { id, ...payload } = row;
        const { data, error } = await supabase
          .from("admin_monthly_reports")
          .insert({ ...payload, is_custom: false })
          .select();
        if (error) throw error;
        if (data && data[0]) {
          row.id = data[0].id;
        }
      });
      await Promise.all(insertPromises);

      setReportRows(finalRows);
      if (!silent) {
        alert("Đồng bộ dữ liệu chi phí từ hóa đơn và thanh toán định kỳ thành công!");
      }
    } catch (err: any) {
      console.error("Error during auto fill:", err);
      if (!silent) {
        alert("Lỗi khi đồng bộ dữ liệu: " + err.message);
      }
    } finally {
      if (!silent) setAutoFillLoading(false);
    }
  };

  const handleExportReportExcel = (startDate?: string, endDate?: string) => {
    try {
      if (!startDate || !endDate) {
        let csvContent = "\uFEFF";
        
        csvContent += `"BẢNG TỔNG HỢP CHI PHÍ QUẢN LÝ HÀNH CHÍNH NĂM 2026 - TRUNGNAM E&C"\n`;
        csvContent += `"Ngày xuất báo cáo:","${new Date().toLocaleDateString("vi-VN")}"\n\n`;
        
        csvContent += `"STT","Nội dung","Tổng CP 2026","Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12","Ghi chú"\n`;
        
        csvContent += `"I","Danh mục chi phí Văn phòng","${computedStats.officeAnnualSubtotal}","${computedStats.officeMonthlySubtotals.m1}","${computedStats.officeMonthlySubtotals.m2}","${computedStats.officeMonthlySubtotals.m3}","${computedStats.officeMonthlySubtotals.m4}","${computedStats.officeMonthlySubtotals.m5}","${computedStats.officeMonthlySubtotals.m6}","${computedStats.officeMonthlySubtotals.m7}","${computedStats.officeMonthlySubtotals.m8}","${computedStats.officeMonthlySubtotals.m9}","${computedStats.officeMonthlySubtotals.m10}","${computedStats.officeMonthlySubtotals.m11}","${computedStats.officeMonthlySubtotals.m12}",""\n`;
        
        computedStats.officeRows.forEach(row => {
          const rowTotal = Array.from({ length: 12 }, (_, idx) => Number(row[`m${idx + 1}` as keyof typeof row]) || 0).reduce((a, b) => a + b, 0);
          csvContent += `"${row.stt}","${row.content.replace(/"/g, '""')}","${rowTotal}","${row.m1}","${row.m2}","${row.m3}","${row.m4}","${row.m5}","${row.m6}","${row.m7}","${row.m8}","${row.m9}","${row.m10}","${row.m11}","${row.m12}","${(row.notes || "").replace(/"/g, '""')}"\n`;
        });
        
        csvContent += `"II","Danh mục chi phí Dự án","${computedStats.projectAnnualSubtotal}","${computedStats.projectMonthlySubtotals.m1}","${computedStats.projectMonthlySubtotals.m2}","${computedStats.projectMonthlySubtotals.m3}","${computedStats.projectMonthlySubtotals.m4}","${computedStats.projectMonthlySubtotals.m5}","${computedStats.projectMonthlySubtotals.m6}","${computedStats.projectMonthlySubtotals.m7}","${computedStats.projectMonthlySubtotals.m8}","${computedStats.projectMonthlySubtotals.m9}","${computedStats.projectMonthlySubtotals.m10}","${computedStats.projectMonthlySubtotals.m11}","${computedStats.projectMonthlySubtotals.m12}",""\n`;
        
        computedStats.projectRows.forEach(row => {
          const rowTotal = Array.from({ length: 12 }, (_, idx) => Number(row[`m${idx + 1}` as keyof typeof row]) || 0).reduce((a, b) => a + b, 0);
          csvContent += `"${row.stt}","${row.content.replace(/"/g, '""')}","${rowTotal}","${row.m1}","${row.m2}","${row.m3}","${row.m4}","${row.m5}","${row.m6}","${row.m7}","${row.m8}","${row.m9}","${row.m10}","${row.m11}","${row.m12}","${(row.notes || "").replace(/"/g, '""')}"\n`;
        });
        
        csvContent += `"","TỔNG CỘNG CPQL PHÁT SINH","${computedStats.grandAnnualTotal}","${computedStats.grandMonthlyTotals.m1}","${computedStats.grandMonthlyTotals.m2}","${computedStats.grandMonthlyTotals.m3}","${computedStats.grandMonthlyTotals.m4}","${computedStats.grandMonthlyTotals.m5}","${computedStats.grandMonthlyTotals.m6}","${computedStats.grandMonthlyTotals.m7}","${computedStats.grandMonthlyTotals.m8}","${computedStats.grandMonthlyTotals.m9}","${computedStats.grandMonthlyTotals.m10}","${computedStats.grandMonthlyTotals.m11}","${computedStats.grandMonthlyTotals.m12}",""\n`;
        
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Chi_phi_quan_ly_hanh_chinh_nam_2026.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        return;
      }
      
      const { combinedItems, totalAmount, invoiceCount, recurringCount, categoriesMap } = getReportData(startDate, endDate);
      const rangeLabel = `${formatDateVN(startDate)} - ${formatDateVN(endDate)}`;

      let csvContent = "\uFEFF";

      csvContent += `"BÁO CÁO TỔNG HỢP CHI PHÍ"\n`;
      csvContent += `"Kỳ báo cáo:","${rangeLabel}"\n`;
      csvContent += `"Ngày xuất báo cáo:","${new Date().toLocaleDateString("vi-VN")}"\n`;
      csvContent += `"Tổng chi phí:","${totalAmount}","VNĐ"\n`;
      csvContent += `"Số lượng hóa đơn:","${invoiceCount}","hồ sơ"\n`;
      csvContent += `"Số lượng thanh toán định kỳ:","${recurringCount}","hồ sơ"\n\n`;

      csvContent += `"CƠ CẤU CHI PHÍ THÀNH PHẦN"\n`;
      csvContent += `"Hạng mục","Số tiền (VNĐ)","Tỷ lệ (%)"\n`;
      Object.entries(categoriesMap).forEach(([cat, amount]) => {
        const pct = totalAmount > 0 ? ((amount / totalAmount) * 100).toFixed(1) : "0.0";
        csvContent += `"${cat}","${amount}","${pct}%"\n`;
      });
      csvContent += `\n`;

      csvContent += `"DANH SÁCH CHI TIẾT CÁC KHOẢN CHI"\n`;
      csvContent += `"STT","Loại chứng từ","Số hóa đơn/Mã","Ngày/Tháng","Đơn vị thụ hưởng","Nội dung","Số tiền (VNĐ)","Phân loại"\n`;
      
      combinedItems.forEach((item, index) => {
        const beneficiary = (item.beneficiary || "").replace(/"/g, '""');
        const desc = (item.desc || "").replace(/"/g, '""');
        csvContent += `"${index + 1}","${item.type}","${item.code}","${item.date}","${beneficiary}","${desc}","${item.amount}","${item.category}"\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Bao_cao_chi_phi_${startDate}_den_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Lỗi khi kết xuất báo cáo: " + err.message);
    }
  };

  const exportSingleRecurringPayment = async (p: SupplierPayment) => {
    setExportLoading(true);
    try {
      const response = await fetch("/api/export-invoice-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          employeeName,
          employeeDept,
          mission: p.content,
          projectName: p.project_name || "Văn phòng HCM",
          supplierName: p.supplierName,
          bankAccount: p.account,
          bankNameBranch: p.bank,
          templateType: "transfer",
          items: [
            {
              number: "",
              date: new Date().toISOString().slice(0, 10),
              desc: p.content,
              amount: p.amount
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`Không thể xuất phiếu cho ${p.supplierName}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Giay_De_Nghi_Chuyen_Tien_${p.supplierName.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert("Lỗi khi xuất phiếu đề nghị chuyển tiền: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  // Department Allocation handler
  const handleApproveRequest = async (reqId: string) => {
    const request = deptRequests.find(r => r.id === reqId);
    if (!request || request.status === "Đã cấp phát") return;

    // Check if stock is sufficient
    const supply = findMatchingSupplyDynamic(request.item);
    if (supply && supply.ending < request.qty) {
      const confirmProceed = window.confirm(
        `Cảnh báo: Số lượng tồn kho của "${request.item}" (Còn lại: ${supply.ending} ${supply.unit}) ít hơn số lượng yêu cầu (${request.qty} ${supply.unit}).\nBạn vẫn muốn tiếp tục cấp phát?`
      );
      if (!confirmProceed) return;
    }

    try {
      // Update status in Supabase
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed", progress: 100 })
        .eq("id", reqId);

      if (error) throw error;

      // Update deptRequests state locally (optimistic/immediate update)
      setDeptRequests(prev => prev.map(r => r.id === reqId ? { ...r, status: "Đã cấp phát" } : r));

      alert(`Đã duyệt cấp phát ${request.qty} ${request.item} cho ${request.dept}. Tồn kho đã tự động khấu trừ.`);
      
      // Refresh list from Supabase
      fetchDeptRequests();
    } catch (err: any) {
      console.error("Error approving request in Supabase:", err);
      alert("Lỗi khi phê duyệt cấp phát: " + (err.message || err));
    }
  };

  const handleApproveAllRequests = async (type: "phongban" | "duan") => {
    const filterVal = type === "phongban" ? selectedDeptFilter : selectedProjectFilter;
    const pendingReqs = deptRequests.filter(
      r => r.target === type &&
           r.status === "Chờ duyệt" &&
           (filterVal === "Tất cả" || r.targetName === filterVal)
    );

    if (pendingReqs.length === 0) {
      alert("Không có yêu cầu cấp phát nào đang chờ duyệt.");
      return;
    }

    // Check if any request exceeds stock
    let hasInsufficientStock = false;
    let warningDetails = "";
    pendingReqs.forEach(req => {
      const supply = findMatchingSupplyDynamic(req.item);
      if (supply && supply.ending < req.qty) {
        hasInsufficientStock = true;
        warningDetails += `\n- ${req.item}: Cần ${req.qty}, chỉ còn ${supply.ending} ${supply.unit}`;
      }
    });

    if (hasInsufficientStock) {
      const confirmProceed = window.confirm(
        `Cảnh báo: Có một số vật tư yêu cầu vượt quá lượng tồn kho thực tế:${warningDetails}\n\nBạn vẫn muốn tiếp tục phê duyệt tất cả?`
      );
      if (!confirmProceed) return;
    } else {
      const confirmProceed = window.confirm(`Bạn có chắc chắn muốn phê duyệt toàn bộ ${pendingReqs.length} yêu cầu đang chờ duyệt của bộ phận này không?`);
      if (!confirmProceed) return;
    }

    try {
      const ids = pendingReqs.map(r => r.id);
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed", progress: 100 })
        .in("id", ids);

      if (error) throw error;

      // Update deptRequests state locally (optimistic/immediate update)
      setDeptRequests(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: "Đã cấp phát" } : r));

      alert(`Đã phê duyệt cấp phát thành công ${pendingReqs.length} yêu cầu.`);
      fetchDeptRequests();
    } catch (err: any) {
      console.error("Error approving all requests in Supabase:", err);
      alert("Lỗi khi phê duyệt tất cả: " + (err.message || err));
    }
  };

  // Download Excel VPP Allocation Slip handler
  const handleDownloadExcel = async (targetName: string, type: "phongban" | "duan") => {
    try {
      // 1. Filter approved requests for this target
      const filteredRequests = deptRequests.filter(
        r => r.target === type && r.targetName === targetName && r.status === "Đã cấp phát"
      );

      if (filteredRequests.length === 0) {
        alert("Không có yêu cầu cấp phát đã duyệt nào để điền vào phiếu.");
        return;
      }

      // Get receiver from allocationTargets or custom requesterName
      const targetInfo = allocationTargets.find(t => t.type === type && t.name === targetName);
      const customRequester = filteredRequests.find(r => r.requesterName)?.requesterName;
      const receiverName = customRequester || (targetInfo ? targetInfo.receiver : "");

      // Format items to send to the server
      const itemsToSend = filteredRequests.map(req => {
        const supplyItem = findMatchingSupply(req.item);
        const unit = supplyItem ? supplyItem.unit : "Cái";
        return {
          name: req.item,
          unit: unit,
          qty: req.qty,
          notes: "Đã duyệt cấp phát"
        };
      });

      // 2. Post to the server API endpoint
      const response = await fetch("/api/export-vpp-template", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetName,
          type,
          receiverName,
          items: itemsToSend
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Lỗi khi xuất file Word từ server.");
      }

      // 3. Download the returned file buffer
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Phieu_Cap_Phat_VPP_${targetName.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Lỗi xuất file Word VPP:", err);
      alert("Lỗi xuất file Word: " + err.message);
    }
  };

  // VPP Inventory add supply handler
  const handleAddSupply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplyName.trim() || !newSupplyUnit.trim()) {
      alert("Vui lòng điền đầy đủ thông tin vật tư.");
      return;
    }

    // Check duplicate
    if (supplies.some(s => s.name.toLowerCase() === newSupplyName.trim().toLowerCase())) {
      alert("Vật tư này đã tồn tại trong kho.");
      return;
    }

    const newSupply: SupplyItem = {
      name: newSupplyName.trim(),
      cat: newSupplyCat,
      unit: newSupplyUnit.trim(),
      initialStock: Number(newSupplyStock),
      imported: 0,
      stock: Number(newSupplyStock),
      allocated: 0,
      alert: Number(newSupplyStock) < 15 ? "Cảnh báo" : "Bình thường"
    };

    setSupplies(prev => [...prev, newSupply]);
    setShowAddSupply(false);
    setNewSupplyName("");
    setNewSupplyUnit("");
    setNewSupplyStock(0);
    alert("Đã thêm vật tư mới vào kho thành công.");
  };

  // VPP Edit stock handlers (Beginning and Imported)
  const handleStartEditInitialStock = (item: any) => {
    setEditingInitialStockName(item.name);
    setEditingInitialStockVal(item.initialStock || 0);
  };

  const handleSaveInitialStock = (name: string) => {
    setSupplies(prev => prev.map(s => {
      if (s.name === name) {
        const currentImported = s.imported !== undefined ? s.imported : 0;
        return {
          ...s,
          initialStock: editingInitialStockVal,
          stock: editingInitialStockVal + currentImported
        };
      }
      return s;
    }));
    setEditingInitialStockName(null);
  };

  const handleStartEditImported = (item: any) => {
    setEditingImportedName(item.name);
    setEditingImportedVal(item.imported || 0);
  };

  const handleSaveImported = (name: string) => {
    setSupplies(prev => prev.map(s => {
      if (s.name === name) {
        const currentInitial = s.initialStock !== undefined ? s.initialStock : (s.stock !== undefined ? s.stock : 0);
        return {
          ...s,
          imported: editingImportedVal,
          stock: currentInitial + editingImportedVal
        };
      }
      return s;
    }));
    setEditingImportedName(null);
  };

  // VPP Edit category handlers
  const handleStartEditCat = (item: SupplyItem) => {
    setEditingSupplyCatName(item.name);
    setEditingCatVal(item.cat);
  };

  const handleSaveCat = (name: string) => {
    setSupplies(prev => prev.map(s => {
      if (s.name === name) {
        return {
          ...s,
          cat: editingCatVal
        };
      }
      return s;
    }));
    setEditingSupplyCatName(null);
  };

  // VPP Create new PYC handler
  const handleCreatePYC = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPYCTargetName || !newPYCItem || newPYCQty <= 0) {
      alert("Vui lòng điền đầy đủ thông tin yêu cầu.");
      return;
    }

    const deptName = newPYCTarget === "phongban" ? newPYCTargetName : `Ban điều hành ${newPYCTargetName}`;
    const dateStr = new Date().toISOString().split("T")[0];

    try {
      const { data, error } = await supabase
        .from("tasks")
        .insert([{
          title: `VPP: ${newPYCTargetName} | ${newPYCItem} | ${newPYCQty}`,
          assignee: newPYCTargetName,
          start_date: dateStr,
          due_date: dateStr,
          priority: "Thấp",
          progress: 0,
          status: "pending_approval",
          notes: JSON.stringify({
            dept: deptName,
            target: newPYCTarget,
            targetName: newPYCTargetName,
            item: newPYCItem,
            qty: Number(newPYCQty),
            date: dateStr,
            requesterName: newPYCRequesterName.trim()
          })
        }])
        .select();

      if (error) throw error;

      alert(`Đã tạo thành công Phiếu yêu cầu thành công cho ${deptName}.`);
      setShowNewPYCModal(false);
      
      // Reset fields
      setNewPYCItem("");
      setNewPYCQty(1);
      setNewPYCRequesterName("");
      
      // Refresh list from Supabase
      fetchDeptRequests();
    } catch (err: any) {
      console.error("Error creating PYC in Supabase:", err);
      alert("Lỗi khi tạo phiếu yêu cầu: " + (err.message || err));
    }
  };

  const handleVppFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVppFileUploading(true);
    
    // Clear the file input so the same file can be uploaded again if needed
    const fileInput = document.getElementById("vpp-file-input") as HTMLInputElement;
    if (fileInput) fileInput.value = "";

    try {
      const customKey = localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key") || "";
      const customModel = localStorage.getItem("openai_model_hanh_chinh") || "gpt-4o-mini";

      const currentFilter = vppSubTab === "phongban" ? selectedDeptFilter : selectedProjectFilter;
      const formData = new FormData();
      formData.append("vpp_file", file);
      formData.append("original_filename", file.name);
      formData.append("target_filter", currentFilter);

      const headers: Record<string, string> = {};
      if (customKey) {
        headers["Authorization"] = `Bearer ${customKey}`;
      }
      if (customModel) {
        headers["x-openai-model"] = customModel;
      }

      const res = await fetch("/api/analyze-vpp-document", {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || `Lỗi HTTP ${res.status}`);
      }

      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      // Populate preview states
      setVppPreviewTargetType(data.targetType === "duan" ? "duan" : "phongban");
      setVppPreviewTargetName(data.targetName || "");
      setVppPreviewRequesterName(data.requesterName || "");
      
      const parsedItems = (data.items || []).map((item: any) => ({
        checked: true,
        name: item.name || "",
        unit: item.unit || "Cái",
        qty: Number(item.qty) || 1,
      }));
      
      setVppPreviewItems(parsedItems);
      setShowVppPreviewModal(true);
    } catch (err: any) {
      console.error("Error analyzing VPP document:", err);
      alert("Lỗi khi phân tích tài liệu: " + (err.message || err));
    } finally {
      setVppFileUploading(false);
    }
  };

  const handleConfirmVppPreview = async () => {
    const selectedItems = vppPreviewItems.filter(item => item.checked && item.qty > 0 && item.name.trim() !== "");
    if (selectedItems.length === 0) {
      alert("Vui lòng chọn ít nhất một vật tư hợp lệ để tạo phiếu yêu cầu.");
      return;
    }
    if (!vppPreviewTargetName) {
      alert("Vui lòng chọn phòng ban hoặc dự án yêu cầu.");
      return;
    }

    const deptName = vppPreviewTargetType === "phongban" ? vppPreviewTargetName : `Ban điều hành ${vppPreviewTargetName}`;
    const dateStr = new Date().toISOString().split("T")[0];

    try {
      const payloads = selectedItems.map(item => ({
        title: `VPP: ${vppPreviewTargetName} | ${item.name} | ${item.qty}`,
        assignee: vppPreviewTargetName,
        start_date: dateStr,
        due_date: dateStr,
        priority: "Thấp",
        progress: 0,
        status: "pending_approval",
        notes: JSON.stringify({
          dept: deptName,
          target: vppPreviewTargetType,
          targetName: vppPreviewTargetName,
          item: item.name,
          qty: Number(item.qty),
          date: dateStr,
          requesterName: vppPreviewRequesterName
        })
      }));

      const { error } = await supabase
        .from("tasks")
        .insert(payloads);

      if (error) throw error;

      alert(`Đã tạo thành công ${payloads.length} yêu cầu cấp phát VPP cho ${deptName}.`);
      setShowVppPreviewModal(false);
      setVppPreviewRequesterName("");
      
      // Refresh list from Supabase
      fetchDeptRequests();
    } catch (err: any) {
      console.error("Error creating batch PYC in Supabase:", err);
      alert("Lỗi khi tạo danh sách phiếu yêu cầu: " + (err.message || err));
    }
  };

  const updateVppRequestField = async (reqId: string, field: "qty" | "allocationTime" | "item" | "cat" | "unit", value: any) => {
    const currentReq = deptRequests.find(r => r.id === reqId);
    if (!currentReq) return;

    try {
      const updatedQty = field === "qty" ? Number(value) : currentReq.qty;
      const updatedTime = field === "allocationTime" ? String(value) : (currentReq.allocationTime || "");
      const updatedItem = field === "item" ? String(value) : currentReq.item;
      const updatedCat = field === "cat" ? String(value) : (currentReq.cat || "");
      const updatedUnit = field === "unit" ? String(value) : (currentReq.unit || "");

      const newTitle = `VPP: ${currentReq.targetName} | ${updatedItem} | ${updatedQty}`;
      
      const newNotes = {
        dept: currentReq.dept,
        target: currentReq.target,
        targetName: currentReq.targetName,
        item: updatedItem,
        qty: updatedQty,
        date: currentReq.date,
        allocationTime: updatedTime,
        requesterName: currentReq.requesterName || "",
        cat: updatedCat,
        unit: updatedUnit
      };

      const { error } = await supabase
        .from("tasks")
        .update({
          title: newTitle,
          notes: JSON.stringify(newNotes)
        })
        .eq("id", reqId);

      if (error) throw error;

      setDeptRequests(prev => prev.map(r => {
        if (r.id === reqId) {
          return {
            ...r,
            qty: updatedQty,
            allocationTime: updatedTime,
            item: updatedItem,
            cat: updatedCat,
            unit: updatedUnit
          };
        }
        return r;
      }));
    } catch (err: any) {
      console.error("Error updating VPP field:", err);
      alert("Lỗi khi cập nhật dữ liệu: " + (err.message || err));
    }
  };

  // Add Allocation Target Handler
  const handleAddAllocationTarget = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetName.trim()) return;

    // Check duplicate
    if (allocationTargets.some(t => t.type === newTargetType && t.name.toLowerCase() === newTargetName.trim().toLowerCase())) {
      alert("Đối tượng cấp phát này đã tồn tại trong danh mục.");
      return;
    }

    const newTarget: AllocationTarget = {
      id: `CP-${Date.now().toString().slice(-4)}`,
      type: newTargetType,
      name: newTargetName.trim(),
      receiver: newTargetReceiver.trim(),
      notes: newTargetNotes.trim()
    };

    const updated = [...allocationTargets, newTarget];
    setAllocationTargets(updated);
    localStorage.setItem("tnec_allocation_targets", JSON.stringify(updated));

    // Reset fields
    setNewTargetName("");
    setNewTargetReceiver("");
    setNewTargetNotes("");
    alert("Đã thêm đối tượng cấp phát mới thành công.");
  };

  // Delete Allocation Target Handler
  const handleDeleteAllocationTarget = (id: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa đối tượng cấp phát này không? Các phiếu yêu cầu hiện tại của đối tượng này vẫn được giữ nguyên.")) return;
    const updated = allocationTargets.filter(t => t.id !== id);
    setAllocationTargets(updated);
    localStorage.setItem("tnec_allocation_targets", JSON.stringify(updated));
  };

  // Toggle Checklist Status
  const toggleChecklistStatus = (id: string) => {
    setChecklist(prev => prev.map(item => {
      if (item.id === id) {
        const nextStatus = item.status === "Kế hoạch" ? "Đang xử lý" :
                           item.status === "Đang xử lý" ? "Chờ duyệt" :
                           item.status === "Chờ duyệt" ? "Cần chỉnh sửa" :
                           item.status === "Cần chỉnh sửa" ? "Hoàn thành" : "Kế hoạch";
        return { ...item, status: nextStatus };
      }
      return item;
    }));
  };

  // Batch AI Extraction logic
  const extractBatchInvoices = async () => {
    const pendingItems = invoiceQueue.filter(item => item.status === "pending" || item.status === "error");
    if (pendingItems.length === 0) return;

    setIsExtractingBatch(true);
    
    // Mark pending items as extracting
    setInvoiceQueue(prev => prev.map(item => 
      item.status === "pending" || item.status === "error"
        ? { ...item, status: "extracting", error: undefined }
        : item
    ));

    const customKey = localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key") || "";
    const customModel = localStorage.getItem("openai_model_hanh_chinh") || "gpt-4o-mini";

    for (const item of pendingItems) {
      let uploadedUrl = "";
      try {
        // 1. Tải file gốc lên Supabase Storage (bucket clerical-documents, thư mục invoices/)
        try {
          const cleanFileName = item.file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
          const filePath = `${Date.now()}_${cleanFileName}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from("clerical-documents")
            .upload(`invoices/${filePath}`, item.file, {
              cacheControl: "3600",
              upsert: true,
            });

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from("clerical-documents")
            .getPublicUrl(`invoices/${filePath}`);
          
          uploadedUrl = publicUrl;
        } catch (uploadErr) {
          console.error("Batch upload storage failed for file:", item.file.name, uploadErr);
        }

        // 2. Gửi request trích xuất thông tin hóa đơn từ AI
        const formData = new FormData();
        formData.append("document_file", item.file);

        const headers: Record<string, string> = {};
        if (customKey) {
          headers["Authorization"] = `Bearer ${customKey}`;
        }
        headers["x-openai-model"] = customModel;

        const res = await fetch("/api/analyze-invoice", {
          method: "POST",
          headers,
          body: formData
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ error: "Không phản hồi từ server" }));
          throw new Error(errorData.error || `HTTP ${res.status}: Lỗi máy chủ khi trích xuất.`);
        }

        const data = await res.json();
        
        setInvoiceQueue(prev => prev.map(q => 
          q.id === item.id 
            ? {
                ...q,
                status: "success",
                number: data.number || "",
                date: data.date || new Date().toISOString().slice(0, 10),
                desc: data.desc || "",
                amount: data.amount || 0,
                fileUrl: uploadedUrl,
                beneficiaryName: data.beneficiaryName || "",
                bankAccount: data.bankAccount || "",
                bankNameBranch: data.bankNameBranch || ""
              }
            : q
        ));

        // Auto-fill beneficiary details if extracted
        if (data.beneficiaryName) setSupplierName(data.beneficiaryName);
        if (data.bankAccount) setBankAccount(data.bankAccount);
        if (data.bankNameBranch) setBankNameBranch(data.bankNameBranch);
      } catch (err: any) {
        console.error("Batch extraction item failed:", err);
        
        // Only use simulated fallback if it's a test mock file AND no key is set
        if (item.isMock && !customKey) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          let simulatedDesc = "Thanh toán hóa đơn dịch vụ văn phòng";
          let simulatedAmount = 1500000;
          let simulatedNumber = `HD-${Math.floor(100000 + Math.random() * 900000)}`;
          let simulatedBeneficiary = "Công ty Dịch vụ Văn phòng Việt Nam";
          let simulatedAccount = "1903456789012";
          let simulatedBank = "Techcombank CN Sài Gòn";
          const fname = item.file.name.toLowerCase();
          
          if (fname.includes("katinat") || fname.includes("cafe") || fname.includes("ca phe")) {
            simulatedDesc = "Thanh toán chi phí đồ uống tiếp khách - Katinat Coffee";
            simulatedAmount = 1440000;
            simulatedBeneficiary = "Công ty Cổ phần Katinat Sài Gòn";
            simulatedAccount = "0071001234567";
            simulatedBank = "Vietcombank CN Bến Thành";
          } else if (fname.includes("lavie") || fname.includes("nuoc")) {
            simulatedDesc = "Thanh toán chi phí nước uống Lavie văn phòng";
            simulatedAmount = 1800000;
            simulatedBeneficiary = "Công ty TNHH La Vie";
            simulatedAccount = "110000012345";
            simulatedBank = "Vietinbank CN Long An";
          } else if (fname.includes("giay") || fname.includes("vpp") || fname.includes("but")) {
            simulatedDesc = "Thanh toán 50% giá trị hợp đồng in ấn, ấn phẩm logo mới HĐ số: 176283594";
            simulatedAmount = 7114500;
            simulatedBeneficiary = "CÔNG TY TNHH QUẢNG CÁO ĐỨC AN";
            simulatedAccount = "0602 2024 1532";
            simulatedBank = "Sacombank CN Tân Phú";
          }

          setInvoiceQueue(prev => prev.map(q => 
            q.id === item.id 
              ? {
                  ...q,
                  status: "success",
                  number: simulatedNumber,
                  date: new Date().toISOString().slice(0, 10),
                  desc: simulatedDesc,
                  amount: simulatedAmount,
                  fileUrl: uploadedUrl,
                  beneficiaryName: simulatedBeneficiary,
                  bankAccount: simulatedAccount,
                  bankNameBranch: simulatedBank
                }
              : q
          ));

          // Set form state for mock file
          setSupplierName(simulatedBeneficiary);
          setBankAccount(simulatedAccount);
          setBankNameBranch(simulatedBank);
        } else {
          // Real error logic: show error details
          setInvoiceQueue(prev => prev.map(q => 
            q.id === item.id 
              ? { ...q, status: "error", error: err.message || "Lỗi kết nối API" }
              : q
          ));
        }
      }
    }

    setIsExtractingBatch(false);
  };

  // Export word document from selected success items
  const exportInvoicePaymentRequest = async () => {
    const successItems = activePreviewInvoice 
      ? (activePreviewInvoice.desc.startsWith("{\"")
          ? JSON.parse(activePreviewInvoice.desc).items
          : [{
              number: activePreviewInvoice.number,
              date: activePreviewInvoice.date,
              desc: activePreviewInvoice.desc,
              amount: activePreviewInvoice.amount
            }])
      : invoiceQueue.filter(item => item.status === "success");

    if (successItems.length === 0) return;

    setExportLoading(true);
    try {
      const response = await fetch("/api/export-invoice-payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          employeeName,
          employeeDept,
          mission: activePreviewInvoice 
            ? (activePreviewInvoice.desc.startsWith("{\"") ? JSON.parse(activePreviewInvoice.desc).mission : activePreviewInvoice.desc) 
            : paymentMission,
          projectName,
          supplierName: activePreviewInvoice ? (activePreviewInvoice.beneficiary_name || "") : supplierName,
          bankAccount: activePreviewInvoice ? (activePreviewInvoice.bank_account || "") : bankAccount,
          bankNameBranch: activePreviewInvoice ? (activePreviewInvoice.bank_name_branch || "") : bankNameBranch,
          templateType: documentType,
          items: successItems
        })
      });

      if (!response.ok) {
        throw new Error("Không thể xuất phiếu thanh toán/chuyển tiền");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const docPrefix = documentType === "payment" ? "Phieu_De_Nghi_Thanh_Toan" : "Giay_De_Nghi_Chuyen_Tien";
      a.download = `${docPrefix}_${employeeName.replace(/\s+/g, "_")}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert("Lỗi khi xuất phiếu đề nghị thanh toán: " + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  // Fetch invoices from Supabase
  const fetchInvoices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        const loadedInvs: Invoice[] = data.map((row: any) => ({
          id: row.id,
          number: row.number,
          date: row.date,
          desc: row.description || "",
          amount: Number(row.amount),
          file_url: row.file_url || "",
          beneficiary_name: row.beneficiary_name || "",
          bank_account: row.bank_account || "",
          bank_name_branch: row.bank_name_branch || ""
        }));
        setInvoices(loadedInvs);

        // Dynamically populate pendingPayments (recurring payments) state from HD-DK- invoices
        const recurringInvs = data.filter((row: any) => row.number && row.number.startsWith("HD-DK-"));
        const mappedPayments: SupplierPayment[] = recurringInvs.map((row: any) => {
          // Parse month from date (YYYY-MM-DD) to MM/YYYY
          let monthStr = "06/2026";
          if (row.date) {
            const parts = row.date.split("-");
            if (parts.length >= 2) {
              monthStr = `${parts[1]}/${parts[0]}`;
            }
          }
          return {
            id: row.id,
            supplierId: "",
            supplierName: row.beneficiary_name || "",
            account: row.bank_account || "",
            bank: row.bank_name_branch || "",
            service: "",
            amount: Number(row.amount),
            content: row.description || "",
            month: monthStr,
            fileUrl: row.file_url || ""
          };
        });
        setPendingPayments(mappedPayments);
        setIsTableMissing(false);

        return { invoices: loadedInvs, pendingPayments: mappedPayments };
      }
    } catch (err: any) {
      console.error("Failed to fetch invoices from Supabase:", err);
      if (err.message && (err.message.includes("Could not find the table") || err.message.includes("does not exist"))) {
        setIsTableMissing(true);
      }
    }
    return null;
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Save successful queue items to main processed table (grouped as a single request)
  const saveQueueToHistory = async () => {
    const successItems = invoiceQueue.filter(item => item.status === "success" && item.number && item.amount);
    if (successItems.length === 0) return;

    try {
      const totalAmount = successItems.reduce((sum, item) => sum + item.amount, 0);
      const combinedNumbers = successItems.map(item => item.number).join(", ");
      const combinedFileUrls = successItems.map(item => item.fileUrl).filter(Boolean).join(", ");
      
      const firstItem = successItems[0];
      const mainDesc = JSON.stringify({
        mission: paymentMission || successItems.map(item => item.desc).join(" | "),
        items: successItems.map(item => ({
          number: item.number,
          date: item.date,
          desc: item.desc,
          amount: item.amount
        }))
      });

      const newInvsPayload = [{
        number: combinedNumbers,
        date: firstItem.date,
        description: mainDesc,
        amount: totalAmount,
        file_url: combinedFileUrls,
        beneficiary_name: supplierName || firstItem.beneficiaryName || "",
        bank_account: bankAccount || firstItem.bankAccount || "",
        bank_name_branch: bankNameBranch || firstItem.bankNameBranch || ""
      }];

      const { data, error } = await supabase
        .from("invoices")
        .insert(newInvsPayload)
        .select();

      if (error) throw error;

      const res = await fetchInvoices();
      setInvoiceQueue([]);
      alert("Đã đồng bộ lưu tất cả hóa đơn thành công vào danh sách lịch sử trên Supabase!");
      if (res) {
        await handleAutoFillReport(res.invoices, res.pendingPayments, true);
      }
    } catch (dbErr: any) {
      console.error("Failed to save invoices to Supabase:", dbErr);
      if (dbErr.message && (dbErr.message.includes("Could not find the table") || dbErr.message.includes("does not exist"))) {
        setIsTableMissing(true);
      }
      
      // Local state fallback if Supabase table is not configured
      const totalAmount = successItems.reduce((sum, item) => sum + item.amount, 0);
      const combinedNumbers = successItems.map(item => item.number).join(", ");
      const combinedFileUrls = successItems.map(item => item.fileUrl).filter(Boolean).join(", ");
      const firstItem = successItems[0];
      const mainDesc = JSON.stringify({
        mission: paymentMission || successItems.map(item => item.desc).join(" | "),
        items: successItems.map(item => ({
          number: item.number,
          date: item.date,
          desc: item.desc,
          amount: item.amount
        }))
      });

      const newInvs: Invoice[] = [{
        id: `INV-${Date.now().toString().slice(-2)}-${Math.random().toString(36).substr(2, 4)}`,
        number: combinedNumbers,
        date: firstItem.date,
        desc: mainDesc,
        amount: totalAmount,
        file_url: combinedFileUrls,
        beneficiary_name: supplierName || firstItem.beneficiaryName || "",
        bank_account: bankAccount || firstItem.bankAccount || "",
        bank_name_branch: bankNameBranch || firstItem.bankNameBranch || ""
      }];

      const updatedInvs = [...newInvs, ...invoices];
      setInvoices(updatedInvs);
      setInvoiceQueue([]);
      alert(`Đã lưu hóa đơn thành công vào danh sách tạm thời! Lỗi kết nối Supabase: ${dbErr.message}`);
      await handleAutoFillReport(updatedInvs, pendingPayments, true);
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa hóa đơn này khỏi lịch sử không?")) {
      try {
        // If it's a UUID from Supabase (not starting with INV- and not HD-DK-)
        if (!id.startsWith("INV-") && !id.startsWith("HD-DK-")) {
          const { error } = await supabase
            .from("invoices")
            .delete()
            .eq("id", id);
          if (error) throw error;
        }
        const updated = invoices.filter(inv => inv.id !== id);
        setInvoices(updated);
        // Silent real-time synchronization to master cost report
        handleAutoFillReport(updated, pendingPayments, true);
      } catch (err: any) {
        console.error("Delete invoice error:", err);
        alert("Lỗi khi xóa hóa đơn từ Supabase: " + err.message);
      }
    }
  };

  const handleUpdateInvoiceNumber = async (id: string, newNumber: string) => {
    // 1. Update local state
    const updated = invoices.map(inv => 
      inv.id === id ? { ...inv, number: newNumber } : inv
    );
    setInvoices(updated);

    // 2. If it's a real database UUID, update in Supabase
    if (!id.startsWith("INV-") && !id.startsWith("HD-DK-")) {
      try {
        const { error } = await supabase
          .from("invoices")
          .update({ number: newNumber })
          .eq("id", id);
        if (error) throw error;
      } catch (err: any) {
        console.error("Failed to update invoice number:", err);
        alert("Lỗi khi cập nhật số hóa đơn trên Supabase: " + err.message);
      }
    }

    // Silent real-time synchronization to master cost report
    handleAutoFillReport(updated, pendingPayments, true);
  };

  const handleUploadFileForPayment = async (paymentId: string, file: File) => {
    if (!file) return;
    setUploadingPaymentId(paymentId);
    try {
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const filePath = `${Date.now()}_${cleanFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("clerical-documents")
        .upload(`invoices/${filePath}`, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("clerical-documents")
        .getPublicUrl(`invoices/${filePath}`);

      // Update in Supabase invoices table (using the database UUID if it is one)
      if (!paymentId.startsWith("PAY-") && !paymentId.startsWith("INV-")) {
        const { error: updateError } = await supabase
          .from("invoices")
          .update({ file_url: publicUrl })
          .eq("id", paymentId);
        if (updateError) throw updateError;
      }

      // Update in local state
      const updated = pendingPayments.map(p => 
        p.id === paymentId ? { ...p, fileUrl: publicUrl } : p
      );
      setPendingPayments(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_pending_payments", JSON.stringify(updated));
      }
      alert("Tải lên hóa đơn thành công!");
    } catch (err: any) {
      console.error("Upload payment file error:", err);
      alert("Lỗi khi tải lên hóa đơn: " + (err.message || err));
    } finally {
      setUploadingPaymentId(null);
    }
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;
    try {
      const { id, supplierName, account, bank, content, amount, month } = editingPayment;

      // Update in Supabase invoices table
      if (!id.startsWith("PAY-") && !id.startsWith("INV-")) {
        const { error: updateError } = await supabase
          .from("invoices")
          .update({
            description: content,
            amount: Number(amount),
            beneficiary_name: supplierName,
            bank_account: account,
            bank_name_branch: bank
          })
          .eq("id", id);
        if (updateError) throw updateError;
      }

      // Update in local state
      const updatedPayments = pendingPayments.map(p => 
        p.id === id ? editingPayment : p
      );
      setPendingPayments(updatedPayments);

      const updatedInvs = invoices.map(inv => 
        inv.id === id ? {
          ...inv,
          desc: content,
          amount: Number(amount),
          beneficiary_name: supplierName,
          bank_account: account,
          bank_name_branch: bank
        } : inv
      );
      setInvoices(updatedInvs);

      if (typeof window !== "undefined") {
        localStorage.setItem("tnec_pending_payments", JSON.stringify(updatedPayments));
      }
      alert("Cập nhật thông tin thanh toán thành công!");
      setEditingPayment(null);

      // Trigger silent auto sync with updated lists
      handleAutoFillReport(updatedInvs, updatedPayments, true);
    } catch (err: any) {
      console.error("Update payment error:", err);
      alert("Lỗi khi cập nhật thanh toán: " + (err.message || err));
    }
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header 
          title="Hành chính & Văn phòng phẩm" 
          subtitle="Quản lý văn phòng phẩm, phân chia công việc, và xử lý hồ sơ thanh toán" 
        />

        <main className="flex-1 p-8 overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            
            {/* LEFT COLUMN: Master Navigation List (5 Items) */}
            <div className="lg:col-span-1 space-y-3">
              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Danh mục chức năng
              </div>
              <div className="space-y-2.5">
                {[
                  { id: "checklist", label: "1. Checklist phân việc định kỳ", icon: ClipboardList, desc: "Phân công việc cho nhân sự" },
                  { id: "invoice", label: "2. Đọc hóa đơn thanh toán", icon: Receipt, desc: "AI trích xuất làm HS thanh toán" },
                  { id: "recurring", label: "3. HS thanh toán định kỳ", icon: RefreshCw, desc: "Ghi nhớ TK ngân hàng định kỳ" },
                  { id: "report", label: "4. Báo cáo chi phí tháng", icon: BarChart3, desc: "Tổng hợp toàn bộ HS thanh toán" },
                  { id: "vpp", label: "5. VPP (Văn phòng phẩm)", icon: Package, desc: "Tồn kho & cấp phát phòng ban" }
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setSearchTerm("");
                      }}
                      className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start gap-4 hover-elevate ${
                        isActive
                          ? "bg-gradient-to-r from-blue-600 to-[#005BAC] border-blue-600 text-white shadow-lg shadow-blue-600/15"
                          : "bg-white border-slate-200/60 text-slate-700 hover:border-slate-300 hover:bg-slate-50/20"
                      }`}
                    >
                      <div className={`p-2.5 rounded-xl transition-all ${isActive ? "bg-white/15 text-white" : "bg-blue-50 text-[#005BAC]"}`}>
                        <Icon size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`font-heading font-extrabold text-xs leading-tight ${isActive ? "text-white" : "text-slate-800"}`}>{item.label}</p>
                        <p className={`text-[10px] mt-1 font-medium truncate ${isActive ? "text-blue-100" : "text-slate-400"}`}>
                          {item.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: Detail Pane based on selected Item */}
            <div className="lg:col-span-3 space-y-6">
              
              {/* ─── TAB 5: VPP (Văn phòng phẩm) ─── */}
              {activeTab === "vpp" && (
                <div className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                  {/* KPI Cards (5 Columns with Modern Gradients & Shadow Glows) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Tồn kho Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-blue-50/40 to-indigo-50/20 rounded-2xl p-5 border border-blue-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-blue-500 to-[#005BAC] text-white rounded-xl shadow-lg shadow-blue-500/25">
                        <Package size={20} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Tồn kho Hành chính</p>
                        <p className="font-heading font-black text-3xl text-slate-800 mt-1">
                          {suppliesWithDynamicAllocated.reduce((sum, item) => sum + item.initialStock + item.imported, 0)} <span className="text-xs font-semibold text-slate-500">vật tư</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">{supplies.length} danh mục hàng hóa</p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-blue-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <Package size={80} />
                      </div>
                    </div>
                    
                    {/* Cấp Phòng Ban VP Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-emerald-50/40 to-teal-50/20 rounded-2xl p-5 border border-emerald-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl shadow-lg shadow-emerald-500/25">
                        <Building2 size={20} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Cấp Phòng Ban VP</p>
                        <p className="font-heading font-black text-3xl text-emerald-700 mt-1">
                          {deptRequests.filter(r => r.target === "phongban" && r.status === "Đã cấp phát").reduce((sum, r) => sum + r.qty, 0)} <span className="text-xs font-semibold text-slate-500">cái/ram</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">
                          {deptRequests.filter(r => r.target === "phongban" && r.status === "Đã cấp phát").length} lượt bàn giao
                        </p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-emerald-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <Building2 size={80} />
                      </div>
                    </div>

                    {/* Cấp Ban ĐH Dự Án Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-purple-50/40 to-fuchsia-50/20 rounded-2xl p-5 border border-purple-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white rounded-xl shadow-lg shadow-purple-500/25">
                        <Briefcase size={20} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Cấp Ban ĐH Dự Án</p>
                        <p className="font-heading font-black text-3xl text-purple-700 mt-1">
                          {deptRequests.filter(r => r.target === "duan" && r.status === "Đã cấp phát").reduce((sum, r) => sum + r.qty, 0)} <span className="text-xs font-semibold text-slate-500">cái/ram</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">
                          {deptRequests.filter(r => r.target === "duan" && r.status === "Đã cấp phát").length} lượt bàn giao
                        </p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-purple-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <Briefcase size={80} />
                      </div>
                    </div>

                    {/* Còn lại Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-sky-50/40 to-cyan-50/20 rounded-2xl p-5 border border-sky-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-sky-500 to-cyan-600 text-white rounded-xl shadow-lg shadow-sky-500/25">
                        <CheckCircle size={20} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Còn lại trong kho</p>
                        <p className="font-heading font-black text-3xl text-sky-700 mt-1">
                          {suppliesWithDynamicAllocated.reduce((sum, item) => sum + item.ending, 0)} <span className="text-xs font-semibold text-slate-500">vật tư</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">Khả dụng cấp phát</p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-sky-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <CheckCircle size={80} />
                      </div>
                    </div>

                    {/* Yêu cầu chờ duyệt Card */}
                    <div className="relative overflow-hidden glass bg-gradient-to-br from-amber-50/40 to-orange-50/20 rounded-2xl p-5 border border-amber-100/50 shadow-sm flex items-center gap-4 group hover:shadow-md transition-all duration-300">
                      <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-550 text-white rounded-xl shadow-lg shadow-amber-500/25">
                        <AlertTriangle size={20} className={deptRequests.filter(r => r.status === "Chờ duyệt").length > 0 ? "animate-pulse" : ""} />
                      </div>
                      <div className="z-10">
                        <p className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider">Yêu cầu chờ duyệt</p>
                        <p className="font-heading font-black text-3xl text-amber-700 mt-1">
                          {deptRequests.filter(r => r.status === "Chờ duyệt").length} <span className="text-xs font-semibold text-slate-500">phiếu</span>
                        </p>
                        <p className="text-[10px] text-slate-400 font-semibold">Trừ kho khi phê duyệt</p>
                      </div>
                      <div className="absolute -right-6 -bottom-6 text-amber-500/5 opacity-10 group-hover:scale-110 transition-transform duration-300 pointer-events-none">
                        <AlertTriangle size={80} />
                      </div>
                    </div>
                  </div>

                  {/* VPP Sub-navigation (Modern Capsule Segmented Style) */}
                  <div className="bg-slate-100/90 p-1 rounded-xl flex flex-wrap gap-1.5 w-fit border border-slate-200/50 shadow-sm">
                    <button
                      onClick={() => {
                        setVppSubTab("inventory");
                        setSearchTerm("");
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 active:scale-[0.98] ${
                        vppSubTab === "inventory"
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                      }`}
                    >
                      <Package size={13} />
                      1. Mục tồn kho của Hành chính
                    </button>
                    <button
                      onClick={() => {
                        setVppSubTab("phongban");
                        setSearchTerm("");
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 active:scale-[0.98] ${
                        vppSubTab === "phongban"
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                      }`}
                    >
                      <Building2 size={13} />
                      2. VPP cấp cho từng phòng ban VP
                    </button>
                    <button
                      onClick={() => {
                        setVppSubTab("duan");
                        setSearchTerm("");
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 active:scale-[0.98] ${
                        vppSubTab === "duan"
                          ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                          : "text-slate-500 hover:text-slate-800 hover:bg-white/40"
                      }`}
                    >
                      <Briefcase size={13} />
                      3. VPP cấp cho Ban điều hành dự án
                    </button>
                  </div>

                  {/* Sub-tab 1: Inventory Table */}
                  {vppSubTab === "inventory" && (
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-4 animate-in fade-in-40 duration-200">
                      <div className="flex justify-between items-center gap-4">
                        <div className="relative w-64">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                          <input
                            type="text"
                            placeholder="Tìm kiếm vật tư tồn kho..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            type="button"
                            onClick={() => {
                              const nextState = !showAllocationDirectory;
                              setShowAllocationDirectory(nextState);
                              setShowAddSupply(false);
                              if (nextState) {
                                setNewSupplyCat(""); // Reset to empty string so user can type a custom category
                              }
                            }}
                            className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl shadow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 ${
                              showAllocationDirectory 
                                ? "bg-slate-700 hover:bg-slate-800 text-white" 
                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                          >
                            <Settings size={14} /> {showAllocationDirectory ? "Đóng danh mục" : "Danh mục cấp phát"}
                          </button>
                          
                          <button 
                            type="button"
                            onClick={() => {
                              const nextState = !showAddSupply;
                              setShowAddSupply(nextState);
                              setShowAllocationDirectory(false);
                              if (nextState && uniqueCategories.length > 0) {
                                setNewSupplyCat(uniqueCategories[0]);
                              }
                            }}
                            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                          >
                            <Plus size={14} /> {showAddSupply ? "Đóng lại" : "Nhập kho mới"}
                          </button>
                        </div>
                      </div>

                      {/* Allocation Targets Directory (Danh mục cấp phát) Panel */}
                      {showAllocationDirectory && (
                        <div className="border border-slate-200/80 bg-slate-50/20 p-5 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-2">
                            <h4 className="font-heading font-extrabold text-slate-800 text-xs flex items-center gap-1.5">
                              <span>📂</span> Quản lý Danh mục cấp phát
                            </h4>
                            <span className="text-[10px] text-slate-400 font-semibold">Cấu hình danh mục các loại vật tư văn phòng phẩm cấp phát</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Left Form: Add material */}
                            <div className="md:col-span-1 border border-slate-200/80 bg-white p-4 rounded-xl space-y-3 shadow-sm">
                              <h5 className="font-bold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1">
                                <span>➕</span> Thêm vật tư mới
                              </h5>
                              <form onSubmit={handleAddSupply} className="space-y-3 text-[11px] font-semibold text-slate-600">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase block">Tên Vật tư <span className="text-rose-500">*</span></label>
                                  <input
                                    type="text"
                                    required
                                    value={newSupplyName}
                                    onChange={(e) => setNewSupplyName(e.target.value)}
                                    placeholder="Ví dụ: Giấy A4 Double A..."
                                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase block">Danh mục <span className="text-rose-500">*</span></label>
                                  <input
                                    type="text"
                                    required
                                    value={newSupplyCat}
                                    onChange={(e) => setNewSupplyCat(e.target.value)}
                                    placeholder="Ví dụ: Giấy in, Bút viết, Đồng phục..."
                                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase block">Đơn vị tính <span className="text-rose-500">*</span></label>
                                  <input
                                    type="text"
                                    required
                                    value={newSupplyUnit}
                                    onChange={(e) => setNewSupplyUnit(e.target.value)}
                                    placeholder="Ví dụ: Ram, Hộp, Cái..."
                                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                                  />
                                </div>

                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase block">Số Tồn Kho <span className="text-rose-500">*</span></label>
                                  <input
                                    type="number"
                                    required
                                    value={newSupplyStock === 0 ? "" : newSupplyStock}
                                    onChange={(e) => setNewSupplyStock(Number(e.target.value))}
                                    placeholder="Ví dụ: 100"
                                    min={0}
                                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                                  />
                                </div>

                                <button
                                  type="submit"
                                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow"
                                >
                                  Lưu vật tư
                                </button>
                              </form>
                            </div>

                            {/* Right Table: Supplies list */}
                            <div className="md:col-span-2 space-y-3">
                              <h5 className="font-bold text-slate-700 text-[11px] uppercase tracking-wider flex items-center gap-1">
                                <span>📋</span> Danh sách vật tư ({supplies.length})
                              </h5>
                              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm max-h-[300px] overflow-y-auto">
                                <table className="w-full text-xs text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                                      <th className="py-2.5 px-3 w-12 text-center">STT</th>
                                      <th className="py-2.5 px-3">Tên vật tư</th>
                                      <th className="py-2.5 px-3 w-28">Danh mục</th>
                                      <th className="py-2.5 px-3 w-20">Đơn vị</th>
                                      <th className="py-2.5 px-3 w-24">Số tồn kho</th>
                                      <th className="py-2.5 px-3 w-12 text-center">Xóa</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                    {supplies
                                      .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                                      .map((s, index) => (
                                        <tr key={index} className="hover:bg-slate-50/50 transition-all">
                                          <td className="py-2 px-3 text-center text-slate-400 font-mono text-[10px]">{index + 1}</td>
                                          <td className="py-2 px-3 text-slate-800 font-bold">{s.name}</td>
                                          <td className="py-2 px-3 text-slate-500">{s.cat}</td>
                                          <td className="py-2 px-3 font-mono text-slate-500">{s.unit}</td>
                                          <td className="py-2 px-3 text-slate-800 font-bold">{s.stock}</td>
                                          <td className="py-2 px-3 text-center">
                                            <button
                                              type="button"
                                              onClick={() => handleDeleteSupply(s.name)}
                                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                              title="Xóa vật tư"
                                            >
                                              <Trash2 size={13} />
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    {supplies.length === 0 && (
                                      <tr>
                                        <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                                          Chưa có vật tư nào trong danh mục
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Add Supply Form */}
                      {showAddSupply && (
                        <form onSubmit={handleAddSupply} className="bg-slate-50/60 border border-slate-200 rounded-2xl p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tên vật tư</label>
                              <input
                                type="text"
                                value={newSupplyName}
                                onChange={(e) => setNewSupplyName(e.target.value)}
                                placeholder="Ví dụ: Giấy A4 Double A..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danh mục</label>
                              <select
                                value={newSupplyCat}
                                onChange={(e) => setNewSupplyCat(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold bg-white focus:border-blue-500 focus:outline-none cursor-pointer"
                              >
                                {uniqueCategories.map((cat, idx) => (
                                  <option key={idx} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đơn vị tính</label>
                              <input
                                type="text"
                                value={newSupplyUnit}
                                onChange={(e) => setNewSupplyUnit(e.target.value)}
                                placeholder="Ví dụ: Ram, Hộp, Cái..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white"
                                required
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Số lượng tồn ban đầu</label>
                              <input
                                type="number"
                                value={newSupplyStock}
                                onChange={(e) => setNewSupplyStock(Number(e.target.value))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:border-blue-500 focus:outline-none bg-white"
                                min={0}
                                required
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <button
                              type="button"
                              onClick={() => setShowAddSupply(false)}
                              className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-all active:scale-95"
                            >
                              Hủy
                            </button>
                            <button
                              type="submit"
                              className="px-3.5 py-1.5 bg-[#005BAC] text-white rounded-lg text-xs font-bold hover:bg-blue-700 shadow-sm transition-all active:scale-95"
                            >
                              Thêm vật tư
                            </button>
                          </div>
                        </form>
                      )}

                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4">Vật tư văn phòng</th>
                              <th className="py-3 px-4">Danh mục</th>
                              <th className="py-3 px-4">Đơn vị</th>
                              <th className="py-3 px-4 text-center">Số dư đầu kỳ</th>
                              <th className="py-3 px-4 text-center">Số lượng nhập kho</th>
                              <th className="py-3 px-4 text-center">Số lượng cấp phát</th>
                              <th className="py-3 px-4 text-center">Số lượng còn lại</th>
                              <th className="py-3 px-4 text-center">Số dư cuối kỳ</th>
                              <th className="py-3 px-4 text-center">Trạng thái tồn kho</th>
                              {canDeleteSupplies && <th className="py-3 px-4 w-16 text-center">Thao tác</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                            {suppliesWithDynamicAllocated
                              .filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))
                              .map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 hover:translate-x-[2px] transition-all duration-150">
                                  <td className="py-3.5 px-4 font-bold text-slate-800">{item.name}</td>
                                  <td className="py-3.5 px-4 text-slate-500">
                                    {editingSupplyCatName === item.name ? (
                                      <div className="flex items-center gap-1.5">
                                        <input
                                          type="text"
                                          value={editingCatVal}
                                          onChange={(e) => setEditingCatVal(e.target.value)}
                                          className="w-28 px-2 py-0.5 border border-slate-300 rounded text-xs font-semibold focus:border-blue-500 focus:outline-none"
                                        />
                                        <button
                                          onClick={() => handleSaveCat(item.name)}
                                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                                          title="Lưu"
                                        >
                                          <Check size={12} />
                                        </button>
                                        <button
                                          onClick={() => setEditingSupplyCatName(null)}
                                          className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-all"
                                          title="Hủy"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span>{item.cat}</span>
                                        <button
                                          onClick={() => handleStartEditCat(item)}
                                          className="text-slate-400 hover:text-blue-600 p-1 bg-slate-50 hover:bg-blue-50 border border-slate-200/50 rounded-lg transition-all"
                                          title="Sửa danh mục"
                                        >
                                          <Pencil size={10} />
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3.5 px-4 font-mono text-slate-500">{item.unit}</td>
                                  
                                  {/* Số dư đầu kỳ */}
                                  <td className="py-3.5 px-4 text-center text-slate-800 font-bold">
                                    {editingInitialStockName === item.name ? (
                                      <div className="flex items-center justify-center gap-1.5">
                                        <input
                                          type="number"
                                          value={editingInitialStockVal}
                                          onChange={(e) => setEditingInitialStockVal(Number(e.target.value))}
                                          className="w-16 px-2 py-0.5 border border-slate-300 rounded text-xs font-semibold focus:border-blue-500 focus:outline-none text-center"
                                          min={0}
                                        />
                                        <button
                                          onClick={() => handleSaveInitialStock(item.name)}
                                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                                          title="Lưu"
                                        >
                                          <Check size={12} />
                                        </button>
                                        <button
                                          onClick={() => setEditingInitialStockName(null)}
                                          className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-all"
                                          title="Hủy"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-2">
                                        <span>{item.initialStock}</span>
                                        <button
                                          onClick={() => handleStartEditInitialStock(item)}
                                          className="text-slate-400 hover:text-blue-600 p-1 bg-slate-50 hover:bg-blue-50 border border-slate-200/50 rounded-lg transition-all"
                                          title="Sửa số dư đầu kỳ"
                                        >
                                          <Pencil size={10} />
                                        </button>
                                      </div>
                                    )}
                                  </td>

                                  {/* Số lượng nhập kho */}
                                  <td className="py-3.5 px-4 text-center text-slate-800 font-bold">
                                    {editingImportedName === item.name ? (
                                      <div className="flex items-center justify-center gap-1.5">
                                        <input
                                          type="number"
                                          value={editingImportedVal}
                                          onChange={(e) => setEditingImportedVal(Number(e.target.value))}
                                          className="w-16 px-2 py-0.5 border border-slate-300 rounded text-xs font-semibold focus:border-blue-500 focus:outline-none text-center"
                                          min={0}
                                        />
                                        <button
                                          onClick={() => handleSaveImported(item.name)}
                                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-all"
                                          title="Lưu"
                                        >
                                          <Check size={12} />
                                        </button>
                                        <button
                                          onClick={() => setEditingImportedName(null)}
                                          className="p-1 text-rose-600 hover:bg-rose-50 rounded transition-all"
                                          title="Hủy"
                                        >
                                          <X size={12} />
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center justify-center gap-2">
                                        <span>{item.imported}</span>
                                        <button
                                          onClick={() => handleStartEditImported(item)}
                                          className="text-slate-400 hover:text-blue-600 p-1 bg-slate-50 hover:bg-blue-50 border border-slate-200/50 rounded-lg transition-all"
                                          title="Sửa số lượng nhập kho"
                                        >
                                          <Pencil size={10} />
                                        </button>
                                      </div>
                                    )}
                                  </td>

                                  {/* Số lượng cấp phát */}
                                  <td className="py-3.5 px-4 text-center text-slate-400 font-bold">{item.allocated}</td>

                                  {/* Số lượng còn lại */}
                                  <td className={`py-3.5 px-4 text-center font-bold ${item.remaining < 0 ? "text-rose-600" : "text-slate-600"}`}>{item.remaining}</td>

                                  {/* Số dư cuối kỳ */}
                                  <td className="py-3.5 px-4 text-center text-blue-700 font-black">{item.ending}</td>

                                  {/* Trạng thái tồn kho */}
                                  <td className="py-3.5 px-4 text-center">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      item.ending < 15 ? "bg-amber-100 text-amber-700 animate-pulse" : "bg-emerald-100 text-emerald-700"
                                    }`}>
                                      {item.ending < 15 ? "Cảnh báo" : "Bình thường"}
                                    </span>
                                  </td>
                                  {canDeleteSupplies && (
                                    <td className="py-3.5 px-4 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteSupply(item.name)}
                                        className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                        title="Xóa vật tư"
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

                  {/* Sub-tab 2: Department VP Allocation */}
                  {vppSubTab === "phongban" && (
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-4 animate-in fade-in-40 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="font-heading font-bold text-slate-800 text-xs">VPP cấp phát cho từng Phòng Ban khối Văn Phòng</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Tự động cập nhật số lượng và khấu trừ kho của hành chính khi duyệt cấp</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Phòng ban:</span>
                            <select
                              value={selectedDeptFilter}
                              onChange={(e) => setSelectedDeptFilter(e.target.value)}
                              className="bg-transparent border-none outline-none font-semibold text-slate-700 cursor-pointer text-xs"
                            >
                              <option value="Tất cả">-- Tất cả --</option>
                              {allocationTargets.filter(t => t.type === "phongban").map((t) => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setSlipPreviewTargetType("phongban");
                              setSlipPreviewTargetName(selectedDeptFilter !== "Tất cả" ? selectedDeptFilter : (allocationTargets.filter(t => t.type === "phongban")[0]?.name || ""));
                              setShowSlipPreviewModal(true);
                            }}
                            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                          >
                            <Eye size={14} /> Xem trước phiếu cấp phát
                          </button>

                          {canApproveRequests && (
                            <button
                              type="button"
                              onClick={() => handleApproveAllRequests("phongban")}
                              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                            >
                              <CheckCircle size={14} /> Duyệt tất cả
                            </button>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => {
                              setNewPYCTarget("phongban");
                              const pbs = allocationTargets.filter(t => t.type === "phongban");
                              setNewPYCTargetName(pbs.length > 0 ? pbs[0].name : "");
                              if (supplies.length > 0) setNewPYCItem(supplies[0].name);
                              setNewPYCQty(1);
                              setShowNewPYCModal(true);
                            }}
                            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                          >
                            <Plus size={14} /> Tạo yêu cầu cấp
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById("vpp-file-input");
                              if (input) input.click();
                            }}
                            disabled={vppFileUploading}
                            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50"
                          >
                            {vppFileUploading ? (
                              <Loader2 size={14} className="animate-spin text-slate-500" />
                            ) : (
                              <Upload size={14} className="text-slate-500" />
                            )}
                            {vppFileUploading ? "Đang phân tích..." : "Nhập file yêu cầu"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowAiSettingsModal(true)}
                            className="p-2.5 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shadow-sm"
                            title="Cấu hình AI VPP"
                          >
                            <Settings size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4 w-44">Thời gian cấp phát</th>
                              <th className="py-3 px-4">Phòng ban</th>
                              <th className="py-3 px-4">Vật tư yêu cầu</th>
                              <th className="py-3 px-4">Danh mục</th>
                              <th className="py-3 px-4 w-24">Đơn vị</th>
                              <th className="py-3 px-4 text-center w-32">Số lượng tồn kho</th>
                              <th className="py-3 px-4 text-center w-24">Số lượng</th>
                              <th className="py-3 px-4">Ngày yêu cầu</th>
                              <th className="py-3 px-4">Trạng thái</th>
                              <th className="py-3 px-4 text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                            {deptRequests
                              .filter(r => r.target === "phongban" && (selectedDeptFilter === "Tất cả" || r.targetName === selectedDeptFilter))
                              .map((req) => (
                                <tr key={req.id} className="hover:bg-slate-50/50 hover:translate-x-[2px] transition-all duration-150">
                                  <td className="py-2 px-4">
                                    <input
                                      type="text"
                                      value={req.allocationTime || ""}
                                      onChange={(e) => updateVppRequestField(req.id, "allocationTime", e.target.value)}
                                      placeholder="Điền ngày/giờ..."
                                      className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-semibold bg-white text-slate-700"
                                    />
                                  </td>
                                  <td className="py-3.5 px-4 text-slate-800 font-bold">{req.targetName}</td>
                                  <td className="py-2 px-4">
                                    <input
                                      type="text"
                                      value={req.item}
                                      onChange={(e) => updateVppRequestField(req.id, "item", e.target.value)}
                                      className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-semibold bg-white text-slate-700"
                                    />
                                  </td>
                                  {(() => {
                                    const supplyItem = findMatchingSupplyDynamic(req.item);
                                    const cat = req.cat || (supplyItem ? supplyItem.cat : "Chưa rõ");
                                    const unit = req.unit || (supplyItem ? supplyItem.unit : "Chưa rõ");
                                    
                                    return (
                                      <>
                                        <td className="py-2 px-4">
                                          <input
                                            type="text"
                                            value={cat}
                                            onChange={(e) => updateVppRequestField(req.id, "cat", e.target.value)}
                                            className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-semibold bg-white text-slate-700"
                                          />
                                        </td>
                                        <td className="py-2 px-4">
                                          <input
                                            type="text"
                                            value={unit}
                                            onChange={(e) => updateVppRequestField(req.id, "unit", e.target.value)}
                                            className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-semibold bg-white text-slate-700"
                                          />
                                        </td>
                                        <td className="py-2 px-4 text-center">
                                          {(() => {
                                            if (!supplyItem) {
                                              return (
                                                <div className="flex items-center justify-center gap-1.5">
                                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200">
                                                    Chưa có trong kho
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleQuickAddSupply(req.item)}
                                                    className="p-1 text-amber-500 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-all cursor-pointer shadow-sm"
                                                    title={`Nhấp để thêm nhanh "${req.item}" vào danh mục tồn kho hành chính`}
                                                  >
                                                    <AlertTriangle size={12} className="animate-pulse" />
                                                  </button>
                                                </div>
                                              );
                                            }
                                            
                                            const stockQty = supplyItem.ending;
                                            const isLowStock = stockQty < req.qty;
                                            
                                            return (
                                              <div className="flex items-center justify-center gap-2">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                  isLowStock
                                                    ? "text-rose-600 bg-rose-50 border border-rose-100 animate-pulse"
                                                    : "text-slate-600 bg-slate-50 border border-slate-200"
                                                }`}>
                                                  {stockQty}
                                                </span>
                                              </div>
                                            );
                                          })()}
                                        </td>
                                      </>
                                    );
                                  })()}
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      type="number"
                                      value={req.qty}
                                      min={1}
                                      onChange={(e) => updateVppRequestField(req.id, "qty", parseInt(e.target.value) || 0)}
                                      className="w-16 px-1.5 py-1 text-center border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-bold bg-white text-slate-800"
                                    />
                                  </td>
                                  <td className="py-3.5 px-4 font-mono text-slate-500">{req.date}</td>
                                  <td className="py-3.5 px-4">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      req.status === "Đã cấp phát" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                    }`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                      {req.status === "Chờ duyệt" ? (
                                        canApproveRequests ? (
                                          <button
                                            onClick={() => handleApproveRequest(req.id)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm shrink-0"
                                          >
                                            Duyệt & Cấp phát
                                          </button>
                                        ) : (
                                          <span className="text-slate-400 text-[10px] font-bold italic shrink-0">Chờ duyệt</span>
                                        )
                                      ) : (
                                        <span className="text-slate-350 text-[10px] font-normal italic shrink-0">Đã bàn giao</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRequest(req.id)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors cursor-pointer shrink-0"
                                        title="Xóa yêu cầu"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            {deptRequests.filter(r => r.target === "phongban" && (selectedDeptFilter === "Tất cả" || r.targetName === selectedDeptFilter)).length === 0 && (
                              <tr>
                                <td colSpan={10} className="py-8 text-center text-slate-400 font-medium italic">
                                  Không có yêu cầu cấp phát nào của phòng ban phù hợp với bộ lọc.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 3: Ban Điều Hành Project Allocation */}
                  {vppSubTab === "duan" && (
                    <div className="glass bg-white rounded-2xl p-5 border border-slate-200/50 shadow-premium space-y-4 animate-in fade-in-40 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                        <div>
                          <h4 className="font-heading font-bold text-slate-800 text-xs">VPP cấp phát cho Ban Điều Hành các Dự án</h4>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Tự động cập nhật số lượng và khấu trừ kho của hành chính khi duyệt cấp</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dự án:</span>
                            <select
                              value={selectedProjectFilter}
                              onChange={(e) => setSelectedProjectFilter(e.target.value)}
                              className="bg-transparent border-none outline-none font-semibold text-slate-700 cursor-pointer text-xs"
                            >
                              <option value="Tất cả">-- Tất cả --</option>
                              {allocationTargets.filter(t => t.type === "duan").map((t) => (
                                <option key={t.id} value={t.name}>{t.name}</option>
                              ))}
                            </select>
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              setSlipPreviewTargetType("duan");
                              setSlipPreviewTargetName(selectedProjectFilter !== "Tất cả" ? selectedProjectFilter : (allocationTargets.filter(t => t.type === "duan")[0]?.name || ""));
                              setShowSlipPreviewModal(true);
                            }}
                            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                          >
                            <Eye size={14} /> Xem trước phiếu cấp phát
                          </button>

                          {canApproveRequests && (
                            <button
                              type="button"
                              onClick={() => handleApproveAllRequests("duan")}
                              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                            >
                              <CheckCircle size={14} /> Duyệt tất cả
                            </button>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => {
                              setNewPYCTarget("duan");
                              const das = allocationTargets.filter(t => t.type === "duan");
                              setNewPYCTargetName(das.length > 0 ? das[0].name : "");
                              if (supplies.length > 0) setNewPYCItem(supplies[0].name);
                              setNewPYCQty(1);
                              setShowNewPYCModal(true);
                            }}
                            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                          >
                            <Plus size={14} /> Tạo yêu cầu cấp
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const input = document.getElementById("vpp-file-input");
                              if (input) input.click();
                            }}
                            disabled={vppFileUploading}
                            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-50"
                          >
                            {vppFileUploading ? (
                              <Loader2 size={14} className="animate-spin text-slate-500" />
                            ) : (
                              <Upload size={14} className="text-slate-500" />
                            )}
                            {vppFileUploading ? "Đang phân tích..." : "Nhập file yêu cầu"}
                          </button>

                          <button
                            type="button"
                            onClick={() => setShowAiSettingsModal(true)}
                            className="p-2.5 text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all shadow-sm"
                            title="Cấu hình AI VPP"
                          >
                            <Settings size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-slate-100">
                        <table className="w-full text-xs text-left">
                          <thead>
                            <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                              <th className="py-3 px-4 w-44">Thời gian cấp phát</th>
                              <th className="py-3 px-4">Dự án</th>
                              <th className="py-3 px-4">Vật tư yêu cầu</th>
                              <th className="py-3 px-4">Danh mục</th>
                              <th className="py-3 px-4 w-24">Đơn vị</th>
                              <th className="py-3 px-4 text-center w-32">Số lượng tồn kho</th>
                              <th className="py-3 px-4 text-center w-24">Số lượng</th>
                              <th className="py-3 px-4">Ngày yêu cầu</th>
                              <th className="py-3 px-4">Trạng thái</th>
                              <th className="py-3 px-4 text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                            {deptRequests
                              .filter(r => r.target === "duan" && (selectedProjectFilter === "Tất cả" || r.targetName === selectedProjectFilter))
                              .map((req) => (
                                <tr key={req.id} className="hover:bg-slate-50/50 hover:translate-x-[2px] transition-all duration-150">
                                  <td className="py-2 px-4">
                                    <input
                                      type="text"
                                      value={req.allocationTime || ""}
                                      onChange={(e) => updateVppRequestField(req.id, "allocationTime", e.target.value)}
                                      placeholder="Điền ngày/giờ..."
                                      className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-semibold bg-white text-slate-700"
                                    />
                                  </td>
                                  <td className="py-3.5 px-4 text-slate-800 font-bold">{req.dept}</td>
                                  <td className="py-2 px-4">
                                    <input
                                      type="text"
                                      value={req.item}
                                      onChange={(e) => updateVppRequestField(req.id, "item", e.target.value)}
                                      className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-semibold bg-white text-slate-700"
                                    />
                                  </td>
                                  {(() => {
                                    const supplyItem = findMatchingSupplyDynamic(req.item);
                                    const cat = req.cat || (supplyItem ? supplyItem.cat : "Chưa rõ");
                                    const unit = req.unit || (supplyItem ? supplyItem.unit : "Chưa rõ");
                                    
                                    return (
                                      <>
                                        <td className="py-2 px-4">
                                          <input
                                            type="text"
                                            value={cat}
                                            onChange={(e) => updateVppRequestField(req.id, "cat", e.target.value)}
                                            className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-semibold bg-white text-slate-700"
                                          />
                                        </td>
                                        <td className="py-2 px-4">
                                          <input
                                            type="text"
                                            value={unit}
                                            onChange={(e) => updateVppRequestField(req.id, "unit", e.target.value)}
                                            className="w-full px-2 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-semibold bg-white text-slate-700"
                                          />
                                        </td>
                                        <td className="py-2 px-4 text-center">
                                          {(() => {
                                            if (!supplyItem) {
                                              return (
                                                <div className="flex items-center justify-center gap-1.5">
                                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200">
                                                    Chưa có trong kho
                                                  </span>
                                                  <button
                                                    type="button"
                                                    onClick={() => handleQuickAddSupply(req.item)}
                                                    className="p-1 text-amber-500 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition-all cursor-pointer shadow-sm"
                                                    title={`Nhấp để thêm nhanh "${req.item}" vào danh mục tồn kho hành chính`}
                                                  >
                                                    <AlertTriangle size={12} className="animate-pulse" />
                                                  </button>
                                                </div>
                                              );
                                            }
                                            
                                            const stockQty = supplyItem.ending;
                                            const isLowStock = stockQty < req.qty;
                                            
                                            return (
                                              <div className="flex items-center justify-center gap-2">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                                  isLowStock
                                                    ? "text-rose-600 bg-rose-50 border border-rose-100 animate-pulse"
                                                    : "text-slate-600 bg-slate-50 border border-slate-200"
                                                }`}>
                                                  {stockQty}
                                                </span>
                                              </div>
                                            );
                                          })()}
                                        </td>
                                      </>
                                    );
                                  })()}
                                  <td className="py-2 px-4 text-center">
                                    <input
                                      type="number"
                                      value={req.qty}
                                      min={1}
                                      onChange={(e) => updateVppRequestField(req.id, "qty", parseInt(e.target.value) || 0)}
                                      className="w-16 px-1.5 py-1 text-center border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-bold bg-white text-slate-800"
                                    />
                                  </td>
                                  <td className="py-3.5 px-4 font-mono text-slate-500">{req.date}</td>
                                  <td className="py-3.5 px-4">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${
                                      req.status === "Đã cấp phát" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                    }`}>
                                      {req.status}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4">
                                    <div className="flex items-center justify-center gap-2">
                                      {req.status === "Chờ duyệt" ? (
                                        canApproveRequests ? (
                                          <button
                                            onClick={() => handleApproveRequest(req.id)}
                                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm shrink-0"
                                          >
                                            Duyệt & Cấp phát
                                          </button>
                                        ) : (
                                          <span className="text-slate-400 text-[10px] font-bold italic shrink-0">Chờ duyệt</span>
                                        )
                                      ) : (
                                        <span className="text-slate-350 text-[10px] font-normal italic shrink-0">Đã bàn giao</span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteRequest(req.id)}
                                        className="p-1.5 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-lg transition-colors cursor-pointer shrink-0"
                                        title="Xóa yêu cầu"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            {deptRequests.filter(r => r.target === "duan" && (selectedProjectFilter === "Tất cả" || r.targetName === selectedProjectFilter)).length === 0 && (
                              <tr>
                                <td colSpan={10} className="py-8 text-center text-slate-400 font-medium italic">
                                  Không có yêu cầu cấp phát nào của dự án phù hợp với bộ lọc.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Hidden VPP File Input */}
                  <input
                    type="file"
                    id="vpp-file-input"
                    className="hidden"
                    accept=".xlsx,.xls,.docx,.doc,.pdf,image/*"
                    onChange={handleVppFileUpload}
                  />

                  {/* VPP Allocation Slip Preview Modal */}
                  {showSlipPreviewModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-slate-100 rounded-2xl max-w-4xl w-full p-6 border border-slate-200 shadow-2xl relative flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                        <button
                          onClick={() => setShowSlipPreviewModal(false)}
                          className="absolute right-4 top-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-all"
                        >
                          <X size={16} />
                        </button>
                        
                        <div className="border-b border-slate-200/80 pb-3 shrink-0 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                            <FileSpreadsheet className="text-amber-500" size={18} />
                          </div>
                          <div>
                            <h3 className="font-heading font-extrabold text-sm text-slate-800">Xem trước Phiếu cấp phát VPP</h3>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Biểu mẫu HCNS/BM/053 (Xem trước nội dung điền tự động)</p>
                          </div>
                        </div>

                        {/* Scrollable Container containing the Paper Sheet */}
                        <div className="py-4 overflow-y-auto flex-1 pr-1">
                          
                          {/* Inner Selection Controls */}
                          <div className="max-w-2xl mx-auto mb-4 bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                                {slipPreviewTargetType === "phongban" ? "Chọn bộ phận nhận cấp phát:" : "Chọn dự án nhận cấp phát:"}
                              </label>
                              <select
                                value={slipPreviewTargetName}
                                onChange={(e) => setSlipPreviewTargetName(e.target.value)}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg outline-none focus:border-[#005BAC] text-xs font-bold bg-white text-slate-800 cursor-pointer"
                              >
                                {allocationTargets
                                  .filter(t => t.type === slipPreviewTargetType)
                                  .map(t => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                  ))
                                }
                              </select>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nơi cấp phát</span>
                              <span className="text-xs font-bold text-slate-700 mt-1 block">
                                {slipPreviewTargetType === "phongban" ? "Văn phòng công ty" : "Ban điều hành dự án"}
                              </span>
                            </div>
                          </div>

                          {/* Paper Sheet Preview */}
                          <div className="bg-white border border-slate-200 shadow-md p-8 rounded-xl font-sans text-slate-800 leading-normal max-w-2xl mx-auto w-full select-none relative mb-4">
                            
                            {/* Company Header Block */}
                            <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
                              <div className="text-left">
                                <div className="text-base font-black text-[#005BAC] font-sans">TRUNG <span className="text-red-500">N</span>AM <span className="text-sky-400 text-xs font-normal italic">E&C</span></div>
                                <div className="text-[7.5px] font-bold text-slate-800 font-sans mt-0.5">CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM</div>
                                <div className="text-[6.5px] text-slate-500 font-sans mt-1 leading-tight">
                                  A: Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br/>
                                  T: (+84) 834 70 75 79 &nbsp; E: info.tnec@trungnamgroup.com.vn
                                </div>
                              </div>
                              <div className="text-center">
                                <div className="text-[13px] font-black tracking-wide">PHIẾU CẤP PHÁT VPP</div>
                                <div className="text-[9.5px] font-bold underline mt-0.5">HCNS/BM/053</div>
                              </div>
                            </div>

                            {/* Metadata Grid */}
                            <div className="grid grid-cols-2 gap-y-2 text-xs mb-4">
                              <div>
                                <span className="font-bold text-slate-600">Yêu cầu VPP tháng:</span> &nbsp;Tháng {new Date().getMonth() + 1}
                              </div>
                              <div>
                                <span className="font-bold text-slate-600">Định mức được duyệt:</span> &nbsp;___________________
                              </div>
                              <div>
                                <span className="font-bold text-slate-600">Người đề xuất:</span> &nbsp;
                                {(() => {
                                  const filtered = deptRequests.filter(
                                    r => r.target === slipPreviewTargetType && r.targetName === slipPreviewTargetName && r.status === "Đã cấp phát"
                                  );
                                  const customRequester = filtered.find(r => r.requesterName)?.requesterName;
                                  return customRequester || allocationTargets.find(t => t.type === slipPreviewTargetType && t.name === slipPreviewTargetName)?.receiver || "Người nhận";
                                })()}
                              </div>
                              <div>
                                <span className="font-bold text-slate-600">Bộ phận:</span> &nbsp;{slipPreviewTargetName}
                              </div>
                            </div>

                            <div className="text-xs mb-3 italic">
                              Đề xuất cấp phát các loại văn phòng phẩm cho {slipPreviewTargetName} như sau:
                            </div>

                            {/* Items Table with Green Headers */}
                            <table className="w-full text-left border-collapse text-xs border border-slate-400 mb-6">
                              <thead>
                                <tr className="bg-[#D9EAD3] border-b border-slate-400 font-bold text-slate-800">
                                  <th className="py-2 px-2 text-center border-r border-slate-400 w-10">TT</th>
                                  <th className="py-2 px-2 border-r border-slate-400">Tên văn phòng phẩm</th>
                                  <th className="py-2 px-2 border-r border-slate-400 w-16 text-center">Đơn vị</th>
                                  <th className="py-2 px-2 border-r border-slate-400 text-center w-16">Số lượng</th>
                                  <th className="py-2 px-2 border-r border-slate-400 text-right w-20">Đơn giá dự kiến</th>
                                  <th className="py-2 px-2 border-r border-slate-400 text-right w-20">Thành tiền</th>
                                  <th className="py-2 px-2">Ghi chú</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-300">
                                {(() => {
                                  const filtered = deptRequests.filter(
                                    r => r.target === slipPreviewTargetType && r.targetName === slipPreviewTargetName && r.status === "Đã cấp phát"
                                  );
                                  
                                  if (filtered.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={7} className="py-8 text-center text-slate-400 italic">
                                          Không có yêu cầu cấp phát nào đã được duyệt cho bộ phận này.
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return (
                                    <>
                                      {filtered.map((req, idx) => {
                                        const supplyItem = findMatchingSupply(req.item);
                                        const unit = supplyItem ? supplyItem.unit : "Cái";
                                        return (
                                          <tr key={req.id} className="hover:bg-slate-50/30">
                                            <td className="py-1.5 px-2 text-center border-r border-slate-300 font-mono text-slate-500">{idx + 1}</td>
                                            <td className="py-1.5 px-2 border-r border-slate-300 font-bold text-slate-800">{req.item}</td>
                                            <td className="py-1.5 px-2 border-r border-slate-300 text-center text-slate-600">{unit}</td>
                                            <td className="py-1.5 px-2 border-r border-slate-300 text-center font-bold text-slate-800 bg-amber-50/20">{req.qty}</td>
                                            <td className="py-1.5 px-2 border-r border-slate-300 text-right text-slate-400"></td>
                                            <td className="py-1.5 px-2 border-r border-slate-300 text-right text-slate-400"></td>
                                            <td className="py-1.5 px-2 text-slate-400 italic text-[10px]">Đã duyệt cấp phát</td>
                                          </tr>
                                        );
                                      })}
                                      {/* Total Row */}
                                      <tr className="font-bold bg-slate-50 border-t border-slate-400">
                                        <td colSpan={5} className="py-2 px-2 text-center border-r border-slate-300 text-slate-700">Tổng cộng</td>
                                        <td className="py-2 px-2 border-r border-slate-300 text-right text-slate-700">0</td>
                                        <td></td>
                                      </tr>
                                    </>
                                  );
                                })()}
                              </tbody>
                            </table>

                            {/* Footer Signatures Block */}
                            <div className="mt-8 text-xs">
                              <div className="text-right italic text-slate-500 mb-6">
                                TPHCM, ngày {String(new Date().getDate()).padStart(2, "0")} tháng {String(new Date().getMonth() + 1).padStart(2, "0")} năm {new Date().getFullYear()}
                              </div>
                              <div className="flex justify-between font-bold text-center px-10 text-slate-700">
                                <div>NGƯỜI NHẬN</div>
                                <div>NGƯỜI LẬP</div>
                              </div>
                              <div className="h-20"></div>
                            </div>
                          </div>

                        </div>

                        {/* Modal Footer Controls */}
                        <div className="border-t border-slate-200/80 pt-3 shrink-0 flex justify-end gap-2 bg-slate-100">
                          <button
                            onClick={() => setShowSlipPreviewModal(false)}
                            className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-200/60 bg-white text-xs transition-all active:scale-[0.98] shadow-sm cursor-pointer"
                          >
                            Đóng lại
                          </button>
                          <button
                            onClick={() => {
                              handleDownloadExcel(slipPreviewTargetName, slipPreviewTargetType);
                              setShowSlipPreviewModal(false);
                            }}
                            disabled={deptRequests.filter(
                              r => r.target === slipPreviewTargetType && r.targetName === slipPreviewTargetName && r.status === "Đã cấp phát"
                            ).length === 0}
                            className="flex items-center gap-1.5 bg-[#10B981] hover:bg-[#059669] disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-md transition-all active:scale-[0.98] cursor-pointer"
                          >
                            <Download size={14} /> Tải xuống file Word
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* AI VPP Preview & Confirmation Modal */}
                  {showVppPreviewModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 border border-slate-100 shadow-2xl relative flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                        <button
                          onClick={() => setShowVppPreviewModal(false)}
                          className="absolute right-4 top-4 p-1 text-slate-400 hover:bg-slate-50 rounded-lg transition-all"
                        >
                          <X size={16} />
                        </button>
                        
                        <div className="border-b border-slate-100 pb-3 shrink-0 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-[#005BAC]">
                            <Brain className="text-[#005BAC] animate-pulse" size={18} />
                          </div>
                          <div>
                            <h3 className="font-heading font-extrabold text-sm text-slate-800">Chi Tiết Phiếu Yêu Cầu Trích Xuất Bằng AI</h3>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Vui lòng rà soát lại thông tin phòng ban/dự án và danh sách vật tư trước khi lưu vào hệ thống</p>
                          </div>
                        </div>

                        <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
                          {/* Target Type Selector */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đối tượng nhận cấp phát</label>
                              <div className="grid grid-cols-2 gap-2 mt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVppPreviewTargetType("phongban");
                                    const pbs = allocationTargets.filter(t => t.type === "phongban");
                                    setVppPreviewTargetName(pbs.length > 0 ? pbs[0].name : "");
                                  }}
                                  className={`py-2.5 px-3 border rounded-xl font-bold transition-all text-center text-xs active:scale-[0.98] ${
                                    vppPreviewTargetType === "phongban"
                                      ? "border-[#005BAC] bg-blue-50/45 text-[#005BAC] shadow-sm"
                                      : "border-slate-200 text-slate-500 hover:bg-slate-50/50"
                                  }`}
                                >
                                  Phòng Ban VP
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVppPreviewTargetType("duan");
                                    const das = allocationTargets.filter(t => t.type === "duan");
                                    setVppPreviewTargetName(das.length > 0 ? das[0].name : "");
                                  }}
                                  className={`py-2.5 px-3 border rounded-xl font-bold transition-all text-center text-xs active:scale-[0.98] ${
                                    vppPreviewTargetType === "duan"
                                      ? "border-[#005BAC] bg-blue-50/45 text-[#005BAC] shadow-sm"
                                      : "border-slate-200 text-slate-500 hover:bg-slate-50/50"
                                  }`}
                                >
                                  BĐH Dự Án
                                </button>
                              </div>
                            </div>

                            {/* Specific Department/Project Selection */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                {vppPreviewTargetType === "phongban" ? "Chọn Phòng Ban VP" : "Chọn Dự Án BĐH"}
                              </label>
                              <select
                                value={vppPreviewTargetName}
                                onChange={(e) => setVppPreviewTargetName(e.target.value)}
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 cursor-pointer text-xs"
                              >
                                {vppPreviewTargetType === "phongban"
                                  ? allocationTargets.filter(t => t.type === "phongban").map((t) => (
                                      <option key={t.id} value={t.name}>{t.name}</option>
                                    ))
                                  : allocationTargets.filter(t => t.type === "duan").map((t) => (
                                      <option key={t.id} value={t.name}>{t.name}</option>
                                    ))}
                              </select>
                            </div>

                            {/* Requester Name Input */}
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Người yêu cầu / Đề xuất</label>
                              <input
                                type="text"
                                value={vppPreviewRequesterName}
                                onChange={(e) => setVppPreviewRequesterName(e.target.value)}
                                placeholder="Tên người yêu cầu..."
                                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 text-xs"
                              />
                            </div>
                          </div>

                          {/* Items Table */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Danh sách vật tư yêu cầu</label>
                              <button
                                type="button"
                                onClick={() => {
                                  setVppPreviewItems([
                                    ...vppPreviewItems,
                                    { checked: true, name: "", unit: "Cái", qty: 1 }
                                  ]);
                                }}
                                className="flex items-center gap-1 text-[#005BAC] hover:text-blue-700 text-xs font-bold transition-all"
                              >
                                <Plus size={14} /> Thêm dòng
                              </button>
                            </div>

                            <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                              <table className="w-full text-xs text-left">
                                <thead>
                                  <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                                    <th className="py-2.5 px-3 w-10 text-center">
                                      <input
                                        type="checkbox"
                                        checked={vppPreviewItems.length > 0 && vppPreviewItems.every(i => i.checked)}
                                        onChange={(e) => {
                                          const val = e.target.checked;
                                          setVppPreviewItems(vppPreviewItems.map(i => ({ ...i, checked: val })));
                                        }}
                                        className="cursor-pointer rounded border-slate-300 text-[#005BAC] focus:ring-[#005BAC]"
                                      />
                                    </th>
                                    <th className="py-2.5 px-3">Tên vật tư</th>
                                    <th className="py-2.5 px-3 w-28">ĐVT</th>
                                    <th className="py-2.5 px-3 w-28 text-center">Số lượng</th>
                                    <th className="py-2.5 px-3 w-16 text-center">Thao tác</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                                  {vppPreviewItems.map((item, index) => {
                                    const matchedSupply = supplies.find(s => s.name.trim().toLowerCase() === item.name.trim().toLowerCase());
                                    const exists = !!matchedSupply;
                                    return (
                                      <tr key={index} className={`hover:bg-slate-50/50 ${!item.checked ? 'opacity-50' : ''}`}>
                                        <td className="py-2 px-3 text-center">
                                          <input
                                            type="checkbox"
                                            checked={item.checked}
                                            onChange={(e) => {
                                              const val = e.target.checked;
                                              setVppPreviewItems(vppPreviewItems.map((it, idx) => idx === index ? { ...it, checked: val } : it));
                                            }}
                                            className="cursor-pointer rounded border-slate-300 text-[#005BAC] focus:ring-[#005BAC]"
                                          />
                                        </td>
                                        <td className="py-2 px-3">
                                          <div className="space-y-1">
                                            <input
                                              type="text"
                                              value={item.name}
                                              onChange={(e) => {
                                                const val = e.target.value;
                                                setVppPreviewItems(vppPreviewItems.map((it, idx) => idx === index ? { ...it, name: val } : it));
                                              }}
                                              placeholder="Tên vật tư (nhập tay hoặc chọn từ kho...)"
                                              className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-slate-700 placeholder-slate-400 p-0"
                                            />
                                            {!exists && item.name.trim() !== "" && (
                                              <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                                <AlertTriangle size={10} /> Chưa có trong danh mục kho
                                              </div>
                                            )}
                                            {exists && (
                                              <div className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5">
                                                <Check size={10} /> Khớp danh mục (Tồn: {matchedSupply.stock} {matchedSupply.unit})
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-2 px-3">
                                          <input
                                            type="text"
                                            value={item.unit}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              setVppPreviewItems(vppPreviewItems.map((it, idx) => idx === index ? { ...it, unit: val } : it));
                                            }}
                                            placeholder="Cái"
                                            className="w-full bg-transparent border-none focus:outline-none focus:ring-0 text-slate-700 p-0"
                                          />
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          <input
                                            type="number"
                                            value={item.qty}
                                            min={1}
                                            onChange={(e) => {
                                              const val = parseInt(e.target.value) || 0;
                                              setVppPreviewItems(vppPreviewItems.map((it, idx) => idx === index ? { ...it, qty: val } : it));
                                            }}
                                            className="w-16 px-1.5 py-1 text-center border border-slate-200 rounded-lg outline-none focus:border-[#005BAC]"
                                          />
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setVppPreviewItems(vppPreviewItems.filter((_, idx) => idx !== index));
                                            }}
                                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                            title="Xóa dòng"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {vppPreviewItems.length === 0 && (
                                    <tr>
                                      <td colSpan={5} className="py-6 text-center text-slate-400 font-medium italic">
                                        Không có vật tư nào. Nhấp "Thêm dòng" để tự thêm vật tư.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-slate-100 pt-3 shrink-0 flex items-center justify-between gap-3">
                          <div className="text-[10px] text-slate-400 font-semibold">
                            Tổng cộng: <span className="font-bold text-slate-700">{vppPreviewItems.filter(i => i.checked).length}</span> / {vppPreviewItems.length} vật tư được chọn
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setShowVppPreviewModal(false)}
                              className="py-2 px-4 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 text-xs font-bold transition-all"
                            >
                              Hủy bỏ
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirmVppPreview}
                              className="py-2 px-4 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                            >
                              <Check size={14} /> Xác nhận & Tạo phiếu
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Create New PYC Modal */}
                  {showNewPYCModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-100 shadow-2xl relative space-y-4 animate-in zoom-in-95 duration-200">
                        <button
                          onClick={() => setShowNewPYCModal(false)}
                          className="absolute right-4 top-4 p-1 text-slate-400 hover:bg-slate-50 rounded-lg transition-all"
                        >
                          <X size={16} />
                        </button>
                        
                        <div className="border-b border-slate-100 pb-3">
                          <h3 className="font-heading font-extrabold text-sm text-slate-800">Tạo Phiếu Yêu Cầu Văn Phòng Phẩm</h3>
                          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Khởi tạo phiếu yêu cầu cấp phát vật tư</p>
                        </div>

                        <form onSubmit={handleCreatePYC} className="space-y-4 text-xs font-semibold text-slate-700">
                          {/* Target Type Selector */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Đối tượng nhận cấp phát</label>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setNewPYCTarget("phongban");
                                  const pbs = allocationTargets.filter(t => t.type === "phongban");
                                  setNewPYCTargetName(pbs.length > 0 ? pbs[0].name : "");
                                }}
                                className={`py-2.5 px-3 border rounded-xl font-bold transition-all text-center active:scale-[0.98] ${
                                  newPYCTarget === "phongban"
                                    ? "border-[#005BAC] bg-blue-50/45 text-[#005BAC] shadow-sm"
                                    : "border-slate-200 text-slate-500 hover:bg-slate-50/50"
                                }`}
                              >
                                Phòng Ban VP
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setNewPYCTarget("duan");
                                  const das = allocationTargets.filter(t => t.type === "duan");
                                  setNewPYCTargetName(das.length > 0 ? das[0].name : "");
                                }}
                                className={`py-2.5 px-3 border rounded-xl font-bold transition-all text-center active:scale-[0.98] ${
                                  newPYCTarget === "duan"
                                    ? "border-[#005BAC] bg-blue-50/45 text-[#005BAC] shadow-sm"
                                    : "border-slate-200 text-slate-500 hover:bg-slate-50/50"
                                }`}
                              >
                                BĐH Dự Án
                              </button>
                            </div>
                          </div>

                          {/* Specific Department/Project Selection */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {newPYCTarget === "phongban" ? "Chọn Phòng Ban VP" : "Chọn Dự Án BĐH"}
                            </label>
                            <select
                              value={newPYCTargetName}
                              onChange={(e) => setNewPYCTargetName(e.target.value)}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-white font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 cursor-pointer"
                            >
                              {newPYCTarget === "phongban"
                                ? allocationTargets.filter(t => t.type === "phongban").map((t) => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                  ))
                                : allocationTargets.filter(t => t.type === "duan").map((t) => (
                                    <option key={t.id} value={t.name}>{t.name}</option>
                                  ))}
                            </select>
                          </div>

                          {/* Supply Item Selector */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chọn vật tư yêu cầu</label>
                            <select
                              value={newPYCItem}
                              onChange={(e) => setNewPYCItem(e.target.value)}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg bg-white font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 cursor-pointer"
                              required
                            >
                              {suppliesWithDynamicAllocated.length === 0 ? (
                                <option value="">-- Không có vật tư nào trong kho --</option>
                              ) : (
                                suppliesWithDynamicAllocated.map((item, i) => (
                                  <option key={i} value={item.name}>
                                    {item.name} (Còn lại: {item.ending} {item.unit})
                                  </option>
                                ))
                              )}
                            </select>
                          </div>

                          {/* Quantity Input */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Số lượng yêu cầu</label>
                            <input
                              type="number"
                              min={1}
                              value={newPYCQty}
                              onChange={(e) => setNewPYCQty(Number(e.target.value))}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 bg-white"
                              required
                            />
                          </div>

                          {/* Requester Input */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Người yêu cầu / đề xuất</label>
                            <input
                              type="text"
                              value={newPYCRequesterName}
                              onChange={(e) => setNewPYCRequesterName(e.target.value)}
                              placeholder="Tên người yêu cầu (để trống sẽ lấy mặc định bộ phận)..."
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg font-semibold text-slate-700 focus:border-blue-500 focus:outline-none mt-1 bg-white"
                            />
                          </div>

                          {/* Actions */}
                          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => setShowNewPYCModal(false)}
                              className="px-4 py-2 border border-slate-200 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all active:scale-95"
                            >
                              Hủy bỏ
                            </button>
                            <button
                              type="submit"
                              disabled={supplies.length === 0}
                              className="px-4 py-2 bg-[#005BAC] disabled:bg-slate-300 hover:bg-blue-700 text-white rounded-xl font-bold shadow-sm transition-all active:scale-95"
                            >
                              Tạo phiếu yêu cầu
                            </button>
                          </div>
                        </form>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ─── TAB 2: Checklist phân việc định kỳ ─── */}
              {activeTab === "checklist" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Checklist phân việc định kỳ</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Phân công công việc định kỳ hàng ngày/tuần/tháng cho nhân sự hành chính & văn thư</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setActiveTab("report")}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all active:scale-95 shadow cursor-pointer"
                      >
                        <FileSpreadsheet size={13} /> Báo Cáo
                      </button>
                      <button 
                        onClick={() => setShowAddTask(!showAddTask)}
                        className="flex items-center gap-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow"
                      >
                        <Plus size={13} /> {showAddTask ? "Đóng lại" : "Thêm công việc"}
                      </button>
                    </div>
                  </div>

                  {/* Add Task Form */}
                  {showAddTask && (
                    <form onSubmit={handleAddTask} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2 space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Tên công việc</label>
                          <input
                            type="text"
                            value={newTaskName}
                            onChange={(e) => setNewTaskName(e.target.value)}
                            placeholder="Nhập tên công việc cần làm..."
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Người thực hiện</label>
                          <select
                            value={newTaskAssignee}
                            onChange={(e) => setNewTaskAssignee(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold bg-white"
                          >
                            <option value="Như Quỳnh">Như Quỳnh</option>
                            <option value="Thanh Hằng">Thanh Hằng</option>
                            <option value="Thanh Ngân">Thanh Ngân</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Độ ưu tiên</label>
                          <select
                            value={newTaskPriority}
                            onChange={(e) => setNewTaskPriority(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold bg-white"
                          >
                            <option value="Thấp">Thấp</option>
                            <option value="Trung bình">Trung bình</option>
                            <option value="Cao">Cao</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex justify-between items-center gap-4">
                        <div className="space-y-1 w-48">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Tần suất</label>
                          <select
                            value={newTaskFreq}
                            onChange={(e) => setNewTaskFreq(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold bg-white"
                          >
                            <option value="Hàng ngày">Hàng ngày</option>
                            <option value="Hàng tuần">Hàng tuần</option>
                            <option value="Hàng tháng">Hàng tháng</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className="bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl shadow mt-4 self-end"
                        >
                          Xác nhận thêm
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Personnel summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Nhân sự: <strong>Như Quỳnh (Phó phòng Hành chính)</strong></p>
                      <p className="text-[11px] text-slate-600 font-semibold mt-1">Nhiệm vụ: Phụ trách hậu cần, kho VPP, phòng họp, tiếp khách & làm hồ sơ thanh toán, đối soát hóa đơn</p>
                    </div>
                    <div className="border-l border-slate-200 pl-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Nhân sự: <strong>Thanh Hằng (Văn thư)</strong></p>
                      <p className="text-[11px] text-slate-600 font-semibold mt-1">Nhiệm vụ: Phụ trách tiếp nhận, phân loại, lưu trữ và chuyển phát công văn</p>
                    </div>
                    <div className="border-l border-slate-200 pl-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Nhân sự: <strong>Thanh Ngân (Hành chính)</strong></p>
                      <p className="text-[11px] text-slate-600 font-semibold mt-1">Nhiệm vụ: Phụ trách hỗ trợ công tác hành chính, quản lý văn phòng phẩm & cấp phát vật tư</p>
                    </div>
                  </div>

                  {/* Kanban Drag and Drop Board */}
                  <div className="overflow-x-auto pb-4">
                    <div className="flex gap-4 min-w-[1000px] select-none">
                      {KANBAN_COLUMNS.map((col) => {
                        const colItems = checklist.filter(item => item.status === col.id);
                        const isOver = draggedOverCol === col.id;
                        
                        return (
                          <div 
                            key={col.id}
                            onDragOver={(e) => e.preventDefault()}
                            onDragEnter={() => setDraggedOverCol(col.id)}
                            onDragLeave={() => setDraggedOverCol(null)}
                            onDrop={(e) => {
                              handleDropCard(e, col.id);
                              setDraggedOverCol(null);
                            }}
                            className={`flex-1 min-w-[200px] max-w-[240px] rounded-2xl p-3 flex flex-col gap-3 transition-all ${
                              isOver 
                                ? "bg-blue-50/50 border-2 border-dashed border-blue-400" 
                                : "bg-slate-50/70 border border-slate-200/50"
                            }`}
                          >
                            {/* Column Header */}
                            <div className="flex items-center justify-between px-1.5 py-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`w-2.5 h-2.5 rounded-full ${col.dotColor} shrink-0`} />
                                <h4 className="font-heading font-extrabold text-[10px] text-slate-700 tracking-wider truncate">{col.label}</h4>
                              </div>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${col.badgeBg} shrink-0`}>
                                {colItems.length}
                              </span>
                            </div>

                            {/* Cards List */}
                            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[420px] min-h-[300px] pr-0.5">
                              {colItems.map((item) => (
                                <div
                                  key={item.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, item.id)}
                                  className="bg-white border border-slate-200/60 rounded-xl p-3.5 shadow-sm hover:shadow-md hover:border-slate-350 transition-all cursor-grab active:cursor-grabbing flex flex-col gap-2 relative group"
                                >
                                  {/* Delete card button */}
                                  <button
                                    onClick={() => handleDeleteTask(item.id)}
                                    className="absolute top-2 right-2 text-slate-300 hover:text-rose-600 p-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                                    title="Xoá công việc"
                                  >
                                    <Trash2 size={12} />
                                  </button>

                                  {/* Priority tag */}
                                  <div className="flex items-center justify-between">
                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                                      item.priority === "Cao" ? "bg-rose-50 text-rose-600" :
                                      item.priority === "Thấp" ? "bg-slate-100 text-slate-500" :
                                      "bg-blue-50 text-[#005BAC]"
                                    }`}>
                                      {item.priority || "Trung bình"}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400">
                                      {item.frequency}
                                    </span>
                                  </div>

                                  {/* Task title */}
                                  <p className="font-heading font-extrabold text-[11px] text-slate-800 leading-snug uppercase break-words pr-4">
                                    {item.task}
                                  </p>

                                  {/* Footer: Assignee & Date */}
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                    {/* Assignee indicator */}
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white uppercase shrink-0 ${
                                        item.assignee === "Như Quỳnh" ? "bg-pink-500" :
                                        item.assignee === "Thùy Quyên" ? "bg-emerald-500" :
                                        "bg-blue-500"
                                      }`}>
                                        {item.assignee === "Như Quỳnh" ? "NQ" : item.assignee === "Thùy Quyên" ? "TQ" : "TH"}
                                      </div>
                                      <span className="text-[9px] font-bold text-slate-500 truncate">{item.assignee}</span>
                                    </div>

                                    {/* Date */}
                                    {item.date && (
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded font-mono">
                                        {item.date}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}

                              {colItems.length === 0 && (
                                <div className="flex-1 flex items-center justify-center border border-dashed border-slate-200 rounded-xl py-10 text-[10px] text-slate-400 italic">
                                  Kéo thả công việc vào đây
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 3: Đọc hóa đơn thanh toán ─── */}
              {activeTab === "invoice" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6">
                  <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Đọc hóa đơn & Làm nhanh hồ sơ thanh toán</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Trích xuất tự động thông tin số hóa đơn, ngày hóa đơn, nội dung, số tiền</p>
                    </div>
                    <button 
                      onClick={() => setShowAiSettingsModal(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-600 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                    >
                      <Settings size={13} /> Cấu hình AI
                    </button>
                  </div>

                  {isTableMissing && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-800 animate-in fade-in slide-in-from-top-1 duration-200">
                      <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={16} />
                      <div className="text-xs space-y-1">
                        <p className="font-bold">Bảng lưu trữ 'invoices' chưa được khởi tạo trên Supabase!</p>
                        <p className="font-medium text-slate-600 leading-relaxed font-sans">
                          Hiện tại dữ liệu hóa đơn của bạn chỉ đang được lưu tạm thời trên bộ nhớ trình duyệt, điều này dẫn đến việc <strong>bị mất hết dữ liệu khi bạn F5 hoặc tải lại trang</strong>.
                        </p>
                        <button
                          onClick={() => setShowSqlGuideModal(true)}
                          className="mt-2 text-[10px] font-extrabold text-[#005BAC] hover:underline flex items-center gap-1 bg-transparent border-none cursor-pointer p-0"
                        >
                          Xem hướng dẫn khởi tạo bảng (chỉ mất 1 phút) <ArrowRight size={10} />
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                    {/* Left Column: upload queue and buttons */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="border-2 border-dashed border-slate-200 bg-slate-50/50 hover:border-blue-400 rounded-2xl p-5 text-center flex flex-col items-center justify-center gap-3 transition-all min-h-[150px] relative">
                        <Upload className="text-slate-400 animate-bounce" size={24} />
                        <div>
                          <p className="text-xs font-bold text-blue-600 hover:underline cursor-pointer">Chọn các tệp hóa đơn</p>
                          <p className="text-[10px] text-slate-400 mt-1">Hỗ trợ chọn nhiều file PDF, DOCX, PNG, JPG cùng lúc</p>
                        </div>
                        <input
                          type="file"
                          multiple
                          onChange={(e) => {
                            if (e.target.files) {
                              const newFiles = Array.from(e.target.files);
                              const newQueue = newFiles.map(file => ({
                                id: `QUEUE-${Math.random().toString(36).substr(2, 9)}`,
                                file,
                                status: "pending" as const,
                                number: "",
                                date: new Date().toISOString().slice(0, 10),
                                desc: "",
                                amount: 0
                              }));
                              setInvoiceQueue(prev => [...prev, ...newQueue]);
                            }
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer"
                        />
                      </div>

                      {/* Upload queue list */}
                      {invoiceQueue.length > 0 && (
                        <div className="border border-slate-200 rounded-xl bg-white p-3.5 space-y-3 shadow-sm max-h-[300px] overflow-y-auto">
                          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase">Hàng đợi tải lên ({invoiceQueue.length})</span>
                            <button 
                              onClick={() => setInvoiceQueue([])} 
                              className="text-[9px] text-rose-500 hover:underline font-bold"
                            >
                              Xóa tất cả
                            </button>
                          </div>
                          
                          <div className="space-y-2">
                            {invoiceQueue.map((item) => (
                              <div key={item.id} className="flex flex-col bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <FileText size={14} className={
                                      item.status === "success" ? "text-emerald-500" :
                                      item.status === "error" ? "text-rose-500" :
                                      item.status === "extracting" ? "text-blue-500 animate-spin" :
                                      "text-slate-400"
                                    } />
                                    <span className="font-semibold text-slate-700 truncate block text-[10px]">{item.file.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {item.status === "pending" && <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold border">Chờ xử lý</span>}
                                    {item.status === "extracting" && <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold border border-blue-100 flex items-center gap-1"><Loader2 size={8} className="animate-spin" /> Đang đọc...</span>}
                                    {item.status === "success" && <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-bold border border-emerald-100">Đã đọc xong</span>}
                                    {item.status === "error" && <span className="text-[9px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded font-bold border border-rose-100">Lỗi API</span>}
                                    
                                    <button 
                                      onClick={() => setInvoiceQueue(prev => prev.filter(q => q.id !== item.id))} 
                                      className="text-slate-400 hover:text-rose-500 transition-colors p-0.5 rounded"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                </div>
                                {item.status === "error" && (
                                  <div className="text-[9px] text-rose-500 font-bold mt-1.5 bg-rose-50/50 p-1.5 rounded border border-rose-100/50 break-words">
                                    {item.error || "Không thể gọi OpenAI API. Hãy kiểm tra lại API Key."}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={extractBatchInvoices}
                          disabled={isExtractingBatch || invoiceQueue.length === 0}
                          className={`flex-1 py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all shadow ${
                            isExtractingBatch || invoiceQueue.length === 0
                              ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                              : "bg-[#005BAC] hover:bg-blue-700 text-white active:scale-95 cursor-pointer"
                          }`}
                        >
                          {isExtractingBatch ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Đang phân tích AI...
                            </>
                          ) : (
                            <>
                              <Brain size={13} />
                              Trích xuất hàng loạt bằng AI
                            </>
                          )}
                        </button>
                      </div>


                    </div>

                    {/* Right Column: preview table + form + export buttons */}
                    <div className="lg:col-span-3 border border-slate-150 rounded-2xl p-5 bg-slate-50/50 space-y-4 min-h-[300px] flex flex-col justify-between">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                          <span className="text-[10px] font-extrabold text-[#005BAC] uppercase">Bản xem trước & chỉnh sửa kết quả</span>
                        </div>

                        {invoiceQueue.length === 0 ? (
                          <div className="h-48 flex items-center justify-center text-slate-400 italic text-[11px]">
                            Vui lòng tải các hóa đơn lên ở cột bên trái và bấm nút "Trích xuất hàng loạt bằng AI"
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {/* Invoices edit table */}
                            <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white max-h-[220px] overflow-y-auto shadow-sm">
                              <table className="w-full text-left border-collapse text-[10px]">
                                <thead>
                                  <tr className="bg-slate-50 text-slate-400 font-extrabold uppercase text-[8px] border-b border-slate-200">
                                    <th className="p-2.5">Tên file</th>
                                    <th className="p-2.5">Số HĐ</th>
                                    <th className="p-2.5">Ngày HĐ</th>
                                    <th className="p-2.5">Nội dung trích yếu</th>
                                    <th className="p-2.5 text-right">Số tiền (đ)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                                  {invoiceQueue.map((item) => (
                                    <tr key={item.id} className="hover:bg-slate-50/40">
                                      <td className="p-2.5 max-w-[85px] truncate text-slate-500" title={item.file.name}>
                                        {item.file.name}
                                      </td>
                                      <td className="p-2">
                                        <input
                                          type="text"
                                          value={item.number}
                                          disabled={item.status !== "success"}
                                          onChange={(e) => {
                                            setInvoiceQueue(prev => prev.map(q => q.id === item.id ? { ...q, number: e.target.value } : q));
                                          }}
                                          placeholder="..."
                                          className="w-full px-1.5 py-1 border border-slate-200 rounded font-mono text-[10px] font-bold bg-white text-slate-800 disabled:bg-slate-50 outline-none focus:border-blue-500/50"
                                        />
                                      </td>
                                      <td className="p-2">
                                        <input
                                          type="date"
                                          value={item.date}
                                          disabled={item.status !== "success"}
                                          onChange={(e) => {
                                            setInvoiceQueue(prev => prev.map(q => q.id === item.id ? { ...q, date: e.target.value } : q));
                                          }}
                                          className="w-full px-1 py-1 border border-slate-200 rounded text-[9px] font-medium bg-white text-slate-700 disabled:bg-slate-50 outline-none focus:border-blue-500/50"
                                        />
                                      </td>
                                      <td className="p-2">
                                        <input
                                          type="text"
                                          value={item.desc}
                                          disabled={item.status !== "success"}
                                          onChange={(e) => {
                                            setInvoiceQueue(prev => prev.map(q => q.id === item.id ? { ...q, desc: e.target.value } : q));
                                          }}
                                          placeholder="Chờ trích xuất..."
                                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-[10px] font-semibold bg-white text-slate-700 disabled:bg-slate-50 outline-none focus:border-blue-500/50"
                                        />
                                      </td>
                                      <td className="p-2">
                                        <input
                                          type="number"
                                          value={item.amount}
                                          disabled={item.status !== "success"}
                                          onChange={(e) => {
                                            setInvoiceQueue(prev => prev.map(q => q.id === item.id ? { ...q, amount: Number(e.target.value) } : q));
                                          }}
                                          className="w-[75px] px-1 py-1 border border-slate-200 rounded text-[10px] text-right font-mono font-bold bg-white text-[#005BAC] disabled:bg-slate-50 outline-none focus:border-blue-500/50"
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Payment document metadata form */}
                            {invoiceQueue.some(item => item.status === "success") && (
                              <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-sm text-xs">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                                  <div className="text-[10px] font-extrabold text-slate-500 uppercase">
                                    Thông tin làm hồ sơ chứng từ
                                  </div>
                                  <div className="flex gap-1.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[9px] font-bold">
                                    <button
                                      type="button"
                                      onClick={() => setDocumentType("transfer")}
                                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${documentType === "transfer" ? "bg-white text-[#005BAC] shadow-sm" : "text-slate-400"}`}
                                    >
                                      Đề nghị Chuyển tiền
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDocumentType("payment")}
                                      className={`px-2 py-0.5 rounded transition-all cursor-pointer ${documentType === "payment" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400"}`}
                                    >
                                      Đề nghị Thanh toán
                                    </button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Họ tên người đề nghị</label>
                                    <input
                                      type="text"
                                      value={employeeName}
                                      onChange={(e) => setEmployeeName(e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase">Bộ phận / Phòng ban</label>
                                    <input
                                      type="text"
                                      value={employeeDept}
                                      onChange={(e) => setEmployeeDept(e.target.value)}
                                      className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase">Lý do xin thanh toán/chuyển tiền chung</label>
                                  <input
                                    type="text"
                                    value={paymentMission}
                                    onChange={(e) => setPaymentMission(e.target.value)}
                                    placeholder="Ví dụ: Thanh toán chi phí tiếp khách văn phòng..."
                                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                  />
                                </div>

                                {documentType === "transfer" && (
                                  <>
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Tên dự án</label>
                                      <input
                                        type="text"
                                        value={projectName}
                                        onChange={(e) => setProjectName(e.target.value)}
                                        placeholder="Ví dụ: Văn phòng HCM"
                                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                      />
                                    </div>

                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase">Tên đơn vị thụ hưởng (Nhà cung cấp)</label>
                                      <input
                                        type="text"
                                        value={supplierName}
                                        onChange={(e) => setSupplierName(e.target.value)}
                                        placeholder="Tên công ty bán hàng..."
                                        className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Số tài khoản chuyển tiền</label>
                                        <input
                                          type="text"
                                          value={bankAccount}
                                          onChange={(e) => setBankAccount(e.target.value)}
                                          placeholder="Số tài khoản..."
                                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                        />
                                      </div>
                                      <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Tại Ngân hàng & Chi nhánh</label>
                                        <input
                                          type="text"
                                          value={bankNameBranch}
                                          onChange={(e) => setBankNameBranch(e.target.value)}
                                          placeholder="Sacombank CN Tân Phú..."
                                          className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white outline-none focus:ring-1 focus:ring-blue-500/30"
                                        />
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {invoiceQueue.some(item => item.status === "success") && (
                        <div className="flex gap-2 justify-end pt-3 border-t border-slate-250/30">
                          <button
                            onClick={saveQueueToHistory}
                            className="px-3.5 py-2 border border-slate-200 rounded-lg text-[10px] text-slate-500 hover:bg-slate-50 font-bold active:scale-95 transition-all shadow-sm cursor-pointer"
                          >
                            Lưu vào danh sách
                          </button>

                          <button
                            onClick={() => setShowPreviewModal(true)}
                            className="px-3.5 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#005BAC] text-[10px] font-bold rounded-lg flex items-center gap-1.5 active:scale-95 transition-all shadow-sm cursor-pointer"
                          >
                            <Eye size={12} />
                            Xem trước
                          </button>
                          
                          <button
                            onClick={exportInvoicePaymentRequest}
                            disabled={exportLoading}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-4 py-2 rounded-lg shadow flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                          >
                            {exportLoading ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                Đang tạo...
                              </>
                            ) : (
                              <>
                                <Download size={12} />
                                {documentType === "payment" ? "Xuất phiếu thanh toán (Word)" : "Xuất giấy chuyển tiền (Word)"}
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Processed list */}
                  <div className="space-y-3.5 pt-2">
                    <h4 className="font-heading font-extrabold text-slate-800 text-xs">Danh sách hóa đơn đã xử lý</h4>
                    <div className="overflow-x-auto border border-slate-150 rounded-xl bg-slate-50/20">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[9px] p-3">
                            <th className="p-3">Số hóa đơn</th>
                            <th className="p-3">Ngày nhận</th>
                            <th className="p-3">Nội dung hóa đơn</th>
                            <th className="p-3 text-right">Số tiền sau thuế</th>
                            <th className="p-3 text-center">Trạng thái</th>
                            <th className="p-3 text-center">File gốc</th>
                            <th className="p-3 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                          {invoices.filter(inv => !inv.number?.startsWith("HD-DK-")).map((inv) => (
                            <tr key={inv.id} className="hover:bg-slate-50/50 bg-white">
                              <td className="p-3 font-mono text-slate-800 font-bold max-w-[150px]">
                                {editingInvoiceNumberId === inv.id ? (
                                  <input
                                    type="text"
                                    defaultValue={inv.number || ""}
                                    onBlur={(e) => {
                                      setEditingInvoiceNumberId(null);
                                      const newVal = e.target.value.trim();
                                      if (newVal && newVal !== inv.number) {
                                        handleUpdateInvoiceNumber(inv.id, newVal);
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        (e.target as HTMLInputElement).blur();
                                      }
                                      if (e.key === "Escape") {
                                        setEditingInvoiceNumberId(null);
                                      }
                                    }}
                                    className="w-full text-xs font-bold font-mono px-1 py-0.5 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/20 text-slate-800 bg-white"
                                    autoFocus
                                  />
                                ) : (
                                  <div
                                    onClick={() => setEditingInvoiceNumberId(inv.id)}
                                    className="cursor-pointer hover:bg-slate-100 px-1 py-0.5 rounded transition-colors inline-block"
                                    title="Click để sửa số hóa đơn"
                                  >
                                    {inv.number || "N/A"}
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-slate-500">{inv.date}</td>
                              <td className="p-3 text-slate-600 max-w-xs truncate">{getInvoiceDesc(inv.desc)}</td>
                              <td className="p-3 text-right text-[#005BAC] font-mono font-bold">
                                {inv.amount.toLocaleString("vi-VN")} đ
                              </td>
                              <td className="p-3 text-center">
                                <span className="inline-flex items-center justify-center bg-emerald-50 text-emerald-600 text-[9px] font-bold px-2 py-0.5 rounded-lg border border-emerald-100">
                                  Đã trích xuất
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {inv.file_url ? (
                                    <button
                                      onClick={() => {
                                        setPreviewFileUrl(inv.file_url || "");
                                        setPreviewFileName(`Hóa đơn số ${inv.number}`);
                                        setPreviewFileIndex(0);
                                      }}
                                      className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 rounded-lg hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center bg-transparent border-none"
                                      title="Xem file gốc"
                                    >
                                      <Eye size={14} />
                                    </button>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                  <button
                                    onClick={() => {
                                      setActivePreviewInvoice(inv);
                                      setShowPreviewModal(true);
                                    }}
                                    className="text-emerald-600 hover:text-emerald-800 transition-colors p-1.5 rounded-lg hover:bg-emerald-50 cursor-pointer inline-flex items-center justify-center bg-transparent border-none"
                                    title="Xem trước Giấy đề nghị chuyển tiền / thanh toán"
                                  >
                                    <FileText size={14} />
                                  </button>
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  onClick={() => handleDeleteInvoice(inv.id)}
                                  className="text-slate-400 hover:text-rose-500 transition-colors p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                                  title="Xóa hóa đơn"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ─── TAB 4: Hồ sơ thanh toán định kỳ ─── */}
              {/* ─── TAB 4: Hồ sơ thanh toán định kỳ ─── */}
              {activeTab === "recurring" && (
                <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-5">
                  <div className="flex flex-col md:flex-row border-b border-slate-100 pb-4 justify-between items-start md:items-center gap-4">
                    <div>
                      <h3 className="font-heading font-bold text-slate-800 text-sm">Hồ sơ thanh toán định kỳ hàng tháng</h3>
                      <p className="text-slate-400 text-[10px] font-semibold mt-1">Quản lý danh mục nhà cung cấp và lập hồ sơ thanh toán nhanh chóng</p>
                    </div>
                    
                    {/* Sub-tab navigation */}
                    <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-semibold shrink-0">
                      <button
                        onClick={() => setRecurringSubTab("suppliers")}
                        className={`px-4 py-1.5 rounded-lg transition-all text-[11px] font-bold cursor-pointer ${
                          recurringSubTab === "suppliers"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        📁 Danh mục Nhà Cung Cấp ({suppliers.length})
                      </button>
                      <button
                        onClick={() => setRecurringSubTab("payments")}
                        className={`px-4 py-1.5 rounded-lg transition-all text-[11px] font-bold cursor-pointer ${
                          recurringSubTab === "payments"
                            ? "bg-white text-slate-800 shadow-sm"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        ✍️ Bảng thanh toán tháng ({pendingPayments.filter(p => p.month === payMonth).length})
                      </button>
                    </div>
                  </div>

                  {/* SUB-TAB 1: suppliers (Danh mục NCC) */}
                  {recurringSubTab === "suppliers" && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Left form */}
                      <div className="md:col-span-1 border border-slate-200/80 bg-slate-50/20 p-5 rounded-2xl space-y-4">
                        <h4 className="font-heading font-extrabold text-slate-800 text-xs flex items-center gap-1.5 border-b border-slate-105 pb-2">
                          <span>➕</span> Thêm nhà cung cấp mới
                        </h4>
                        <form onSubmit={handleAddSupplier} className="space-y-3 text-[11px] font-semibold text-slate-600">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Mã Nhà cung cấp (Tùy chọn)</label>
                            <input
                              type="text"
                              value={supplierIdState}
                              onChange={(e) => setSupplierIdState(e.target.value)}
                              placeholder={`Ví dụ: NCC-${String(suppliers.length + 1).padStart(2, "0")}`}
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Tên nhà cung cấp <span className="text-rose-500">*</span></label>
                            <input
                              type="text"
                              required
                              value={supplierNameState}
                              onChange={(e) => setSupplierNameState(e.target.value)}
                              placeholder="Ví dụ: CÔNG TY CỔ PHẦN HAI BỐN BẢY"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Số tài khoản ngân hàng <span className="text-rose-500">*</span></label>
                            <input
                              type="text"
                              required
                              value={supplierAccountState}
                              onChange={(e) => setSupplierAccountState(e.target.value)}
                              placeholder="Ví dụ: 14020592925013"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-mono font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Ngân hàng & Chi nhánh <span className="text-rose-500">*</span></label>
                            <input
                              type="text"
                              required
                              value={supplierBankState}
                              onChange={(e) => setSupplierBankState(e.target.value)}
                              placeholder="Ví dụ: Techcombank - CN Quang Trung"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Hàng hóa / Dịch vụ cung cấp</label>
                            <input
                              type="text"
                              value={supplierServiceState}
                              onChange={(e) => setSupplierServiceState(e.target.value)}
                              placeholder="Ví dụ: Chuyển phát nhanh tài liệu"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Dự án / Văn phòng phụ trách</label>
                            <select
                              value={supplierProjectState}
                              onChange={(e) => setSupplierProjectState(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            >
                              <option value="Văn phòng HCM">Văn phòng HCM</option>
                              {PROJECTS.map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow"
                          >
                            Lưu nhà cung cấp
                          </button>
                        </form>
                      </div>

                      {/* Right list table */}
                      <div className="md:col-span-2 space-y-4">
                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm max-h-[460px] overflow-y-auto overflow-x-auto custom-scrollbar">
                          <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                                <th className="py-2.5 px-3 w-16 text-center">Mã NCC</th>
                                <th className="py-2.5 px-3">Tên Nhà Cung Cấp</th>
                                <th className="py-2.5 px-3">Tài Khoản</th>
                                <th className="py-2.5 px-3">Ngân Hàng Thụ Hưởng</th>
                                <th className="py-2.5 px-3">Hàng Hóa / Dịch Vụ</th>
                                <th className="py-2.5 px-3">Dự án / Bộ phận</th>
                                <th className="py-2.5 px-3 w-12 text-center">Xóa</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                              {suppliers.map((s) => (
                                <tr key={s.id} className="hover:bg-slate-50/50 transition-all font-semibold">
                                  <td className="py-3 px-3 text-center text-slate-400 font-mono text-[10px]">{s.id}</td>
                                  <td className="py-3 px-3 text-slate-850 font-bold">{s.name}</td>
                                  <td className="py-3 px-3 font-mono font-bold text-slate-800 text-[11px]">{s.account}</td>
                                  <td className="py-3 px-3 text-slate-500 text-[11px] leading-snug">{s.bank}</td>
                                  <td className="py-3 px-3 text-slate-400 italic text-[11px]">{s.service || "—"}</td>
                                  <td className="py-3 px-3 text-slate-600 font-bold text-[11px]">{s.project_name || "Văn phòng HCM"}</td>
                                  <td className="py-3 px-3 text-center">
                                    <button
                                      onClick={() => handleDeleteSupplier(s.id)}
                                      className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                      title="Xóa nhà cung cấp"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {suppliers.length === 0 && (
                                <tr>
                                  <td colSpan={7} className="py-10 text-center text-slate-400 italic">Danh sách NCC trống. Hãy thêm nhà cung cấp mới.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUB-TAB 2: payments (Bảng lập thanh toán NCC) */}
                  {recurringSubTab === "payments" && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {/* Left form */}
                      <div className="md:col-span-1 border border-slate-200/80 bg-slate-50/20 p-5 rounded-2xl space-y-4">
                        <h4 className="font-heading font-extrabold text-slate-800 text-xs flex items-center gap-1.5 border-b border-slate-105 pb-2">
                          <span>📁</span> Danh sách nhà cung cấp
                        </h4>
                        <form onSubmit={handleAddPendingPayment} className="space-y-3 text-[11px] font-semibold text-slate-600">
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Chọn Nhà Cung Cấp <span className="text-rose-500">*</span></label>
                            <select
                              required
                              value={selectedSupplierId}
                              onChange={(e) => handleSupplierSelect(e.target.value)}
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800 cursor-pointer"
                            >
                              <option value="">-- Chọn Nhà cung cấp --</option>
                              {suppliers.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                              ))}
                            </select>
                          </div>

                          {selectedSupplierId && (() => {
                            const s = suppliers.find(x => x.id === selectedSupplierId);
                            if (!s) return null;
                            return (
                              <div className="p-3 bg-white border border-slate-100 rounded-xl space-y-1 text-[10px] text-slate-500 leading-normal animate-in fade-in duration-200 font-bold">
                                <p>🏦 Tài khoản: <strong className="text-slate-700 font-mono">{s.account}</strong></p>
                                <p>🏢 Ngân hàng: <strong className="text-slate-700">{s.bank}</strong></p>
                                <p>📦 Dịch vụ mặc định: <strong className="text-slate-750 italic">{s.service || "—"}</strong></p>
                              </div>
                            );
                          })()}

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Số tiền thanh toán (VNĐ) <span className="text-rose-500">*</span></label>
                            <input
                              type="number"
                              required
                              value={payAmount}
                              onChange={(e) => setPayAmount(e.target.value)}
                              placeholder="Nhập số tiền chuyển, ví dụ: 3500000"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Tháng thanh toán <span className="text-rose-500">*</span></label>
                            <input
                              type="text"
                              required
                              value={payMonth}
                              onChange={(e) => setPayMonth(e.target.value)}
                              placeholder="Ví dụ: 06/2026"
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase block">Nội dung thanh toán</label>
                            <textarea
                              value={payContent}
                              onChange={(e) => setPayContent(e.target.value)}
                              placeholder="Ví dụ: Thanh toan cuoc internet thang 06/2026"
                              rows={2}
                              className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white text-xs font-semibold text-slate-800 resize-none font-medium text-slate-700"
                            />
                          </div>

                          <button
                            type="submit"
                            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl active:scale-95 transition-all text-xs cursor-pointer shadow"
                          >
                            + Thêm & Đồng bộ lên Hóa Đơn
                          </button>
                        </form>
                      </div>

                      {/* Right list and export */}
                      <div className="md:col-span-2 space-y-4">
                        <div className="flex justify-between items-center bg-slate-50/50 p-4 border border-slate-200/65 rounded-2xl">
                          <div>
                            <span className="text-[10px] font-black text-slate-400 uppercase block">Tổng cộng tháng {payMonth}</span>
                            <span className="text-base font-black text-[#005BAC]">
                              {pendingPayments
                                .filter(p => p.month === payMonth)
                                .reduce((sum, p) => sum + p.amount, 0)
                                .toLocaleString("vi-VN")} đ
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const currentMonthPayments = pendingPayments.filter(p => p.month === payMonth);
                                if (currentMonthPayments.length === 0) {
                                  alert("Danh sách thanh toán trống, không thể xem trước!");
                                  return;
                                }
                                setSelectedRecurringPreviewIdx(0);
                                setShowRecurringPreviewModal(true);
                              }}
                              className="px-4 py-2.5 bg-blue-50 border border-blue-200 hover:bg-blue-100 text-[#005BAC] text-xs font-bold rounded-xl flex items-center gap-1.5 active:scale-95 transition-all shadow cursor-pointer"
                            >
                              <Eye size={14} />
                              Xem trước
                            </button>
                            <button
                              type="button"
                              onClick={handleExportDeNghiChuyenTien}
                              disabled={exportLoading}
                              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                            >
                              {exportLoading ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" />
                                  Đang tạo...
                                </>
                              ) : (
                                <>
                                  <Download size={13} />
                                  Xuất đề nghị chuyển tiền (Word)
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-sm max-h-[365px] overflow-y-auto overflow-x-auto custom-scrollbar">
                          <table className="w-full text-xs text-left border-collapse min-w-[900px]">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider text-[10px]">
                                <th className="py-2.5 px-3">Tên Nhà Cung Cấp</th>
                                <th className="py-2.5 px-3">Tài khoản & Ngân hàng</th>
                                <th className="py-2.5 px-3">Nội dung</th>
                                <th className="py-2.5 px-3">Ban điều hành</th>
                                <th className="py-2.5 px-3 text-right">Số tiền (đ)</th>
                                <th className="py-2.5 px-3 text-center">File gốc</th>
                                <th className="py-2.5 px-3 w-20 text-center">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                              {pendingPayments
                                .filter(p => p.month === payMonth)
                                .map((p) => (
                                  <tr 
                                    key={p.id} 
                                    onClick={() => handlePreviewSpecificPayment(p.id)}
                                    className="hover:bg-blue-50/50 transition-all font-semibold cursor-pointer group"
                                    title="Click để xem trước chứng từ thanh toán"
                                  >
                                    <td className="py-3 px-3 text-slate-850 font-bold group-hover:text-blue-700">{p.supplierName}</td>
                                    <td className="py-3 px-3 leading-snug">
                                      <div className="font-mono text-slate-800 font-bold text-[11px] group-hover:text-blue-700">{p.account}</div>
                                      <div className="text-slate-450 text-[10px] font-semibold">{p.bank}</div>
                                    </td>
                                    <td className="py-3 px-3 text-slate-500 text-[11.5px] leading-snug font-medium">{p.content}</td>
                                    <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                                      <select
                                        value={p.project_name || "Văn phòng HCM"}
                                        onChange={(e) => handleUpdatePaymentProject(p.id, e.target.value)}
                                        className="px-2 py-1 border border-slate-200 rounded-xl bg-slate-50 text-[11px] font-bold text-slate-700 outline-none cursor-pointer focus:bg-white transition-all shadow-sm"
                                      >
                                        <option value="Văn phòng HCM">Văn phòng HCM</option>
                                        {PROJECTS.map(proj => (
                                          <option key={proj} value={proj}>{proj}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-3 px-3 text-right font-black text-slate-800 group-hover:text-blue-700">{p.amount.toLocaleString("vi-VN")}</td>
                                    <td className="py-3 px-3 text-center animate-in fade-in" onClick={(e) => e.stopPropagation()}>
                                      {uploadingPaymentId === p.id ? (
                                        <Loader2 className="animate-spin text-blue-600 mx-auto" size={14} />
                                          ) : p.fileUrl ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPreviewFileUrl(p.fileUrl || "");
                                              setPreviewFileName(`Hóa đơn ${p.supplierName}`);
                                              setPreviewFileIndex(0);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 rounded-lg hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center bg-transparent border-none"
                                            title="Xem file gốc"
                                          >
                                            <Eye size={14} />
                                          </button>
                                          <label className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer inline-flex items-center justify-center relative">
                                            <Upload size={13} />
                                            <input
                                              type="file"
                                              className="hidden"
                                              onChange={(e) => {
                                                if (e.target.files && e.target.files[0]) {
                                                  handleUploadFileForPayment(p.id, e.target.files[0]);
                                                }
                                              }}
                                            />
                                          </label>
                                        </div>
                                      ) : (
                                        <label className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 rounded-lg hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center relative">
                                          <Upload size={14} />
                                          <input
                                            type="file"
                                            className="hidden"
                                            onChange={(e) => {
                                              if (e.target.files && e.target.files[0]) {
                                                handleUploadFileForPayment(p.id, e.target.files[0]);
                                              }
                                            }}
                                          />
                                        </label>
                                      )}
                                    </td>
                                    <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setActivePreviewPayment(p);
                                            setShowRecurringPreviewModal(true);
                                          }}
                                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer bg-transparent border-none"
                                          title="Chỉnh sửa thanh toán"
                                        >
                                          <Pencil size={13} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleDeletePendingPayment(p.id)}
                                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer bg-transparent border-none"
                                          title="Xóa thanh toán"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              {pendingPayments.filter(p => p.month === payMonth).length === 0 && (
                                <tr>
                                  <td colSpan={6} className="py-10 text-center text-slate-400 italic">Không có khoản thanh toán nào cho tháng {payMonth}.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}

              {/* ─── TAB 4: Báo cáo chi phí tháng ─── */}
              {activeTab === "report" && (() => {
                const { combinedItems, totalAmount, invoiceCount, recurringCount } = getReportData(reportStartDate, reportEndDate);
                
                const renderEditableCell = (row: AdminMonthlyReport, field: string, value: any, type: "number" | "text") => {
                  const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
                  
                  if (isEditing) {
                    return (
                      <input
                        type={type}
                        defaultValue={value === 0 && type === "number" ? "" : value}
                        onBlur={(e) => {
                          setEditingCell(null);
                          let newVal: any = e.target.value;
                          if (type === "number") {
                            const parsed = parseFloat(newVal);
                            newVal = isNaN(parsed) ? 0 : parsed;
                          }
                          if (newVal !== value) {
                            handleUpdateReportCell(row.id, field, newVal);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            (e.target as HTMLInputElement).blur();
                          }
                          if (e.key === "Escape") {
                            setEditingCell(null);
                          }
                        }}
                        className="w-full text-xs font-bold font-mono px-1 py-0.5 border border-blue-500 rounded focus:outline-none focus:ring-1 focus:ring-blue-500/20 text-slate-800 bg-white"
                        style={{ textAlign: type === "number" ? "right" : "left" }}
                        autoFocus
                      />
                    );
                  }

                  const displayVal = type === "number"
                    ? (value > 0 ? value.toLocaleString("vi-VN") : "-")
                    : value;

                  return (
                    <div
                      onClick={() => setEditingCell({ rowId: row.id, field })}
                      className={`cursor-pointer hover:bg-slate-100 px-1.5 py-0.5 rounded transition-colors w-full h-full min-h-[22px] flex items-center ${type === "number" ? "justify-end text-right font-mono text-slate-700" : "justify-start text-left text-slate-600 font-medium"}`}
                    >
                      {displayVal}
                    </div>
                  );
                };

                const renderRow = (row: AdminMonthlyReport) => {
                  const rowTotal = Array.from({ length: 12 }, (_, idx) => Number(row[`m${idx + 1}` as keyof typeof row]) || 0).reduce((a, b) => a + b, 0);
                  const isChild = row.stt.includes(".");
                  
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100">
                      <td className="py-2 px-3 text-center text-slate-400 sticky left-0 bg-white z-10 border-r border-slate-200 font-mono text-[10px]">
                        {row.is_custom ? renderEditableCell(row, "stt", row.stt, "text") : row.stt}
                      </td>
                      <td className={`py-2 px-3 sticky left-[60px] bg-white z-10 border-r border-slate-200 text-[11px] max-w-[280px] truncate ${isChild ? "pl-6 text-slate-500 font-medium" : "text-slate-800 font-bold"}`}>
                        {row.is_custom ? renderEditableCell(row, "content", row.content, "text") : row.content}
                      </td>
                      <td className="py-2 px-3 text-right bg-slate-50/40 border-r border-slate-200 font-mono text-slate-800 font-extrabold text-[11px]">
                        {rowTotal > 0 ? rowTotal.toLocaleString("vi-VN") : "-"}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => {
                        const field = `m${i + 1}`;
                        const val = row[field as keyof typeof row] as number;
                        return (
                          <td key={i} className="py-2 px-1 text-right border-r border-slate-200 font-mono text-[11px]">
                            {renderEditableCell(row, field, val, "number")}
                          </td>
                        );
                      })}
                      <td className="py-2 px-1 border-r border-slate-200 text-[11px]">
                        {renderEditableCell(row, "notes", row.notes || "", "text")}
                      </td>
                      <td className="py-2 px-1 text-center">
                        {row.is_custom && (
                          <button
                            onClick={() => handleDeleteReportRow(row.id, row.content)}
                            className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Xóa hạng mục"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                };

                return (
                  <div className="space-y-6">
                    {/* Header Controls */}
                    <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                        <div>
                          <h3 className="font-heading font-extrabold text-[#005BAC] text-sm">CHI PHÍ QUẢN LÝ HÀNH CHÍNH NĂM 2026 - TRUNGNAM E&C</h3>
                          <p className="text-slate-400 text-[10px] font-semibold mt-1">Bảng tính tự động & chỉnh sửa trực tiếp. Click vào ô số tiền/ghi chú để sửa. Blur để tự động lưu lên Supabase.</p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleAutoFillReport()}
                            disabled={autoFillLoading}
                            className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-[11px] font-bold px-3.5 py-2 rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                          >
                            {autoFillLoading ? (
                              <>
                                <Loader2 size={12} className="animate-spin" />
                                Đang đồng bộ...
                              </>
                            ) : (
                              <>
                                <RefreshCw size={12} />
                                Đồng bộ từ Hóa đơn
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => handleAddReportRow("office")}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3.5 py-2 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                          >
                            <Plus size={12} />
                            Thêm dòng văn phòng
                          </button>

                          <button
                            onClick={() => handleAddReportRow("project")}
                            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold px-3.5 py-2 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                          >
                            <Plus size={12} />
                            Thêm dòng dự án
                          </button>

                          <button
                            onClick={() => handleExportReportExcel()}
                            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-bold px-3.5 py-2 rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
                          >
                            <FileSpreadsheet size={12} /> Xuất Excel
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Master Spreadsheet Grid */}
                    <div className="glass bg-white rounded-2xl border border-slate-200/50 shadow-premium overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/40 flex justify-between items-center">
                        <div>
                          <h4 className="font-heading font-bold text-slate-800 text-xs">Bảng tính chi phí quản lý hành chính năm 2026</h4>
                          <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Tự động cộng dồn Subtotals khối Văn phòng/Dự án và tính Tổng cộng thời gian thực</p>
                        </div>
                        {reportLoading && (
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold">
                            <Loader2 size={12} className="animate-spin text-[#005BAC]" /> Tải dữ liệu...
                          </div>
                        )}
                      </div>

                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[1700px]">
                          <thead>
                            <tr className="bg-slate-50/70 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <th className="py-3 px-3 text-center sticky left-0 bg-slate-50 z-20 w-[60px] border-r border-slate-200">STT</th>
                              <th className="py-3 px-3 sticky left-[60px] bg-slate-50 z-20 w-[280px] border-r border-slate-200">Nội dung</th>
                              <th className="py-3 px-3 text-right bg-slate-100/55 w-[140px] border-r border-slate-200 font-extrabold text-slate-600">Tổng CP 2026</th>
                              {Array.from({ length: 12 }, (_, i) => (
                                <th key={i} className="py-3 px-3 text-right w-[105px] border-r border-slate-200">Tháng {i + 1}</th>
                              ))}
                              <th className="py-3 px-3 w-[220px] border-r border-slate-200">Ghi chú</th>
                              <th className="py-3 px-3 text-center w-[70px]">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 text-[11px] font-semibold text-slate-600">
                            
                            {/* SECTION I: VĂN PHÒNG */}
                            <tr className="bg-slate-100/60 font-extrabold text-[#005BAC] border-b border-slate-200">
                              <td className="py-2.5 px-3 text-center sticky left-0 bg-slate-100 z-10 border-r border-slate-200 font-black">I</td>
                              <td className="py-2.5 px-3 sticky left-[60px] bg-slate-100 z-10 border-r border-slate-200 uppercase tracking-wider text-[11.5px]">Danh mục chi phí Văn phòng</td>
                              <td className="py-2.5 px-3 text-right bg-slate-200/50 border-r border-slate-200 font-mono font-black text-slate-800">
                                {computedStats.officeAnnualSubtotal.toLocaleString("vi-VN")}
                              </td>
                              {Array.from({ length: 12 }, (_, i) => {
                                const val = computedStats.officeMonthlySubtotals[`m${i + 1}`];
                                return (
                                  <td key={i} className="py-2.5 px-3 text-right border-r border-slate-200 font-mono font-black text-slate-700">
                                    {val > 0 ? val.toLocaleString("vi-VN") : "-"}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 px-3 border-r border-slate-200 bg-slate-50/10"></td>
                              <td className="py-2.5 px-3 bg-slate-50/10"></td>
                            </tr>

                            {computedStats.officeRows.map(row => renderRow(row))}

                            {/* SECTION II: DỰ ÁN */}
                            <tr className="bg-slate-100/60 font-extrabold text-[#005BAC] border-b border-slate-200">
                              <td className="py-2.5 px-3 text-center sticky left-0 bg-slate-100 z-10 border-r border-slate-200 font-black">II</td>
                              <td className="py-2.5 px-3 sticky left-[60px] bg-slate-100 z-10 border-r border-slate-200 uppercase tracking-wider text-[11.5px]">Danh mục chi phí Dự án</td>
                              <td className="py-2.5 px-3 text-right bg-slate-200/50 border-r border-slate-200 font-mono font-black text-slate-800">
                                {computedStats.projectAnnualSubtotal.toLocaleString("vi-VN")}
                              </td>
                              {Array.from({ length: 12 }, (_, i) => {
                                const val = computedStats.projectMonthlySubtotals[`m${i + 1}`];
                                return (
                                  <td key={i} className="py-2.5 px-3 text-right border-r border-slate-200 font-mono font-black text-slate-700">
                                    {val > 0 ? val.toLocaleString("vi-VN") : "-"}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 px-3 border-r border-slate-200 bg-slate-50/10"></td>
                              <td className="py-2.5 px-3 bg-slate-50/10"></td>
                            </tr>

                            {computedStats.projectRows.map(row => renderRow(row))}

                            {/* GRAND TOTAL ROW */}
                            <tr className="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-extrabold text-xs border-t-2 border-orange-600 shadow-md">
                              <td className="py-3 px-3 text-center sticky left-0 bg-orange-600 z-10 border-r border-orange-400 font-black"></td>
                              <td className="py-3 px-3 sticky left-[60px] bg-orange-600 z-10 border-r border-orange-400 uppercase tracking-wider text-[11.5px]">TỔNG CỘNG CPQL PHÁT SINH</td>
                              <td className="py-3 px-3 text-right bg-orange-700/30 border-r border-orange-400 font-mono font-black text-[12.5px]">
                                {computedStats.grandAnnualTotal.toLocaleString("vi-VN")}
                              </td>
                              {Array.from({ length: 12 }, (_, i) => {
                                const val = computedStats.grandMonthlyTotals[`m${i + 1}`];
                                return (
                                  <td key={i} className="py-3 px-3 text-right border-r border-orange-400 font-mono font-black text-[11.5px]">
                                    {val > 0 ? val.toLocaleString("vi-VN") : "-"}
                                  </td>
                                );
                              })}
                              <td className="py-3 px-3 border-r border-orange-400"></td>
                              <td className="py-3 px-3"></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Filter Controls for raw transactions below */}
                    <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <h4 className="font-heading font-bold text-slate-800 text-xs">Đối soát hóa đơn & chứng từ gốc</h4>
                          <p className="text-slate-400 text-[10px] font-semibold mt-1">Lọc danh sách hóa đơn gốc và các khoản định kỳ theo khoảng ngày cụ thể bên dưới</p>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Date Range Trigger Button */}
                          <div className="relative">
                            <button
                              onClick={() => {
                                setTempStartDate(reportStartDate);
                                setTempEndDate(reportEndDate);
                                setShowDatePickerPopover(!showDatePickerPopover);
                              }}
                              className="flex items-center gap-2 bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 rounded-xl px-3.5 py-2 transition-all group cursor-pointer"
                            >
                              <Calendar size={13} className="text-[#005BAC]" />
                              <span className="text-[10px] font-bold text-slate-700">
                                {formatDateVN(reportStartDate)} <span className="text-slate-400 font-normal">→</span> {formatDateVN(reportEndDate)}
                              </span>
                              <ChevronDown size={11} className={`text-slate-400 transition-transform duration-200 ${showDatePickerPopover ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Date Range Popover */}
                            {showDatePickerPopover && (
                              <>
                                <div className="fixed inset-0 z-[90]" onClick={handleCancelDateRange} />
                                <div className="absolute right-0 top-full mt-2 z-[100] w-[420px] bg-white rounded-2xl border border-slate-200/80 shadow-2xl overflow-hidden">
                                  <div className="bg-gradient-to-r from-[#005BAC]/5 to-indigo-50/30 px-5 py-3.5 border-b border-slate-100">
                                    <div className="flex items-center gap-2">
                                      <div className="bg-[#005BAC]/10 p-1.5 rounded-lg">
                                        <Calendar size={13} className="text-[#005BAC]" />
                                      </div>
                                      <div>
                                        <h4 className="text-[11px] font-bold text-slate-700">Chọn khoảng thời gian</h4>
                                        <p className="text-[9px] text-slate-400 font-semibold">Chọn nhanh hoặc tùy chỉnh ngày bắt đầu và kết thúc</p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="p-5 space-y-5">
                                    <div className="space-y-2.5">
                                      <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Chọn nhanh</span>
                                      <div className="grid grid-cols-2 gap-2">
                                        {[
                                          { label: "Tháng này", value: "thisMonth" },
                                          { label: "1 Tháng gần nhất", value: "1month" },
                                          { label: "2 Tháng gần nhất", value: "2months" },
                                          { label: "3 Tháng gần nhất", value: "3months" },
                                        ].map((opt) => (
                                          <button
                                            key={opt.value}
                                            onClick={() => handleQuickSelect(opt.value)}
                                            className="px-3 py-2 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-[#005BAC]/5 hover:border-[#005BAC]/30 text-[11px] font-bold text-slate-600 hover:text-[#005BAC] transition-all duration-150 cursor-pointer"
                                          >
                                            {opt.label}
                                          </button>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-px bg-slate-100" />
                                      <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">hoặc chọn tùy chỉnh</span>
                                      <div className="flex-1 h-px bg-slate-100" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-1.5">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Từ ngày</label>
                                        <input
                                          type="date"
                                          value={tempStartDate}
                                          onChange={(e) => setTempStartDate(e.target.value)}
                                          className="w-full bg-white border border-slate-200/80 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#005BAC]/20 focus:border-[#005BAC]/40 transition-all"
                                        />
                                      </div>
                                      <div className="space-y-1.5">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Đến ngày</label>
                                        <input
                                          type="date"
                                          value={tempEndDate}
                                          onChange={(e) => setTempEndDate(e.target.value)}
                                          className="w-full bg-white border border-slate-200/80 rounded-xl px-3 py-2 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#005BAC]/20 focus:border-[#005BAC]/40 transition-all"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="bg-slate-50/50 border-t border-slate-100 px-5 py-3 flex items-center justify-end gap-2">
                                    <button
                                      onClick={handleCancelDateRange}
                                      className="px-4 py-2 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
                                    >
                                      Hủy
                                    </button>
                                    <button
                                      onClick={handleApplyDateRange}
                                      className="px-4 py-2 rounded-xl bg-[#005BAC] hover:bg-blue-700 text-white text-[11px] font-bold shadow-md transition-all cursor-pointer"
                                    >
                                      Áp dụng
                                    </button>
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* KPI Summary Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="glass bg-gradient-to-br from-blue-50/50 to-indigo-50/20 rounded-2xl p-5 border border-blue-100/60 shadow-premium flex items-center justify-between">
                        <div className="space-y-1.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Chi phí trong kỳ lọc</span>
                          <h3 className="text-lg font-black text-[#005BAC] tracking-tight">{totalAmount.toLocaleString("vi-VN")} đ</h3>
                          <p className="text-[9px] text-slate-400 font-semibold">Cộng dồn từ hóa đơn & định kỳ trong kỳ lọc</p>
                        </div>
                        <div className="bg-blue-500/10 text-[#005BAC] p-3 rounded-2xl">
                          <Receipt size={22} />
                        </div>
                      </div>

                      <div className="glass bg-gradient-to-br from-emerald-50/50 to-teal-50/20 rounded-2xl p-5 border border-emerald-100/60 shadow-premium flex items-center justify-between">
                        <div className="space-y-1.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Hóa đơn trong kỳ lọc</span>
                          <h3 className="text-lg font-black text-emerald-600 tracking-tight">{invoiceCount} Hồ sơ</h3>
                          <p className="text-[9px] text-slate-400 font-semibold">Hóa đơn quét AI trong kỳ lọc</p>
                        </div>
                        <div className="bg-emerald-500/10 text-emerald-600 p-3 rounded-2xl">
                          <FileText size={22} />
                        </div>
                      </div>

                      <div className="glass bg-gradient-to-br from-purple-50/50 to-pink-50/20 rounded-2xl p-5 border border-purple-100/60 shadow-premium flex items-center justify-between">
                        <div className="space-y-1.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Thanh toán định kỳ kỳ lọc</span>
                          <h3 className="text-lg font-black text-purple-600 tracking-tight">{recurringCount} Hồ sơ</h3>
                          <p className="text-[9px] text-slate-400 font-semibold">Các khoản chi cố định trong kỳ lọc</p>
                        </div>
                        <div className="bg-purple-500/10 text-purple-600 p-3 rounded-2xl">
                          <RefreshCw size={22} />
                        </div>
                      </div>
                    </div>

                    {/* Detail Inspection Table */}
                    <div className="glass bg-white rounded-2xl border border-slate-200/50 shadow-premium overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/40 flex justify-between items-center">
                        <div>
                          <h4 className="font-heading font-bold text-slate-800 text-xs">Bảng đối soát chi tiết các khoản chi gốc</h4>
                          <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Hiển thị hóa đơn trích xuất và khoản thanh toán định kỳ nằm trong kỳ lọc</p>
                        </div>
                        <span className="bg-slate-100 text-slate-600 text-[9px] font-extrabold px-2.5 py-1 rounded-full border border-slate-200/50">
                          {combinedItems.length} Bản ghi
                        </span>
                      </div>

                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[1100px]">
                          <thead>
                            <tr className="border-b border-slate-150 text-[10px] font-bold text-slate-400 bg-slate-50/20 uppercase tracking-wider">
                              <th className="py-2.5 px-4 w-12 text-center">STT</th>
                              <th className="py-2.5 px-4 w-36">Loại chứng từ</th>
                              <th className="py-2.5 px-4 w-32">Số hóa đơn/Mã</th>
                              <th className="py-2.5 px-4 w-28">Ngày nhận</th>
                              <th className="py-2.5 px-4">Đơn vị thụ hưởng</th>
                              <th className="py-2.5 px-4">Nội dung</th>
                              <th className="py-2.5 px-4">Phân loại</th>
                              <th className="py-2.5 px-4 text-center w-24">File gốc</th>
                              <th className="py-2.5 px-4 text-right w-36">Số tiền</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-600">
                            {combinedItems.map((item, index) => (
                              <tr key={item.id} className="hover:bg-slate-50/30 transition-all">
                                <td className="py-2.5 px-4 text-center text-slate-400">{index + 1}</td>
                                <td className="py-2.5 px-4">
                                  {item.type === "Hóa đơn" ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                      <FileText size={10} /> Hóa đơn
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-purple-50 text-purple-700 border border-purple-100">
                                      <RefreshCw size={10} /> Định kỳ
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-slate-500 font-bold">{item.code}</td>
                                <td className="py-2.5 px-4 text-slate-400">{item.date}</td>
                                <td className="py-2.5 px-4 font-bold text-slate-700 max-w-[180px] truncate">{item.beneficiary}</td>
                                <td className="py-2.5 px-4 max-w-[240px] truncate" title={item.desc}>{item.desc}</td>
                                <td className="py-2.5 px-4">
                                  <span className="bg-slate-100 text-slate-500 text-[9px] font-bold px-2 py-0.5 rounded-full border border-slate-200">
                                    {item.category}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-center">
                                  {item.file_url ? (
                                    <button
                                      onClick={() => {
                                        setPreviewFileUrl(item.file_url || "");
                                        setPreviewFileName(item.type === "Hóa đơn" ? `Hóa đơn số ${item.code}` : `Thanh toán ${item.beneficiary}`);
                                        setPreviewFileIndex(0);
                                      }}
                                      className="text-blue-600 hover:text-blue-800 transition-colors p-1.5 rounded-lg hover:bg-blue-50 cursor-pointer inline-flex items-center justify-center bg-transparent border-none"
                                      title="Xem file gốc"
                                    >
                                      <Eye size={14} />
                                    </button>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-right font-extrabold text-slate-800 font-mono">{item.amount.toLocaleString("vi-VN")} đ</td>
                              </tr>
                            ))}

                            {combinedItems.length === 0 && (
                              <tr>
                                <td colSpan={9} className="py-12 text-center text-slate-400 italic">
                                  Không có dữ liệu chi phí nào cho kỳ {formatDateVN(reportStartDate)} → {formatDateVN(reportEndDate)}.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        </main>
      </div>

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 flex flex-col space-y-5 animate-in fade-in-50 zoom-in-95 duration-150 relative">
            
            {/* Close Button */}
            <button
              onClick={() => {
                setShowPreviewModal(false);
                setActivePreviewInvoice(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer"
            >
              <X size={16} />
            </button>

            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#005BAC]">
                  <Eye size={15} />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-slate-800 text-sm">
                    {documentType === "payment" ? "Xem trước Phiếu đề nghị thanh toán" : "Xem trước Giấy đề nghị chuyển tiền"}
                  </h3>
                  <p className="text-slate-400 text-[10px] font-semibold mt-0.5">
                    {documentType === "payment" ? "Biểu mẫu TCKT/BM/003" : "Biểu mẫu HC-BM021/ĐNCT"} (Xem trước nội dung điền tự động)
                  </p>
                </div>
              </div>
            </div>

            {/* Paper Container */}
            <div className="bg-white border border-slate-200 shadow p-8 rounded-xl font-serif text-[#1e293b] leading-relaxed max-w-2xl mx-auto w-full select-none" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
              
              {/* Header block */}
              <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
                <div className="text-left">
                  <div className="text-base font-black text-[#005BAC] font-sans">TRUNG <span className="text-red-500">N</span>AM <span className="text-sky-400 text-xs font-normal italic">E&C</span></div>
                  <div className="text-[7.5px] font-bold text-slate-800 font-sans mt-0.5">CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM</div>
                  <div className="text-[6.5px] text-slate-500 font-sans mt-1 leading-tight">
                    A: Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br/>
                    T: (+84) 834 70 75 79 &nbsp; E: info.tnec@trungnamgroup.com.vn
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-[13px] font-bold tracking-wide">
                    {documentType === "payment" ? "PHIẾU ĐỀ NGHỊ THANH TOÁN" : "GIẤY ĐỀ NGHỊ CHUYỂN TIỀN"}
                  </div>
                  <div className="text-[9.5px] font-bold underline mt-0.5">
                    {documentType === "payment" ? "TCKT/BM/003" : "HC-BM021/ĐNCT"}
                  </div>
                </div>
              </div>

              {/* Destination */}
              <div className="mb-4 text-xs font-bold leading-normal">
                Kính gửi: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Ban lãnh đạo Công ty CP XD và LM Trung Nam;<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - {documentType === "payment" ? "Phòng HCSN công ty," : "Phòng Kế toán công ty,"}
              </div>

              {/* Form Details */}
              <div className="space-y-1.5 text-xs mb-4">
                <div>
                  <span className="underline">Họ và tên người đề nghị {documentType === "payment" ? "thanh toán" : "" }</span>: <span className="font-bold">{employeeName}</span>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                  <span className="underline">Bộ phận</span>: <span className="font-bold">{employeeDept}</span>
                </div>
                <div>
                  <span className="underline">{documentType === "payment" ? "Nội dung thanh toán" : "Lý do xin đề nghị chuyển tiền"}</span>: <span>{activePreviewInvoice ? getInvoiceDesc(activePreviewInvoice.desc) : paymentMission}</span>
                </div>
                {(documentType === "transfer" || activePreviewInvoice) && (
                  <>
                    <div>
                      <span className="underline">Tên dự án</span>: <span className="font-bold">{projectName}</span>
                    </div>
                    <div>
                      <span className="underline">Tên đơn vị thụ hưởng</span>: <span className="font-bold">{activePreviewInvoice ? activePreviewInvoice.beneficiary_name : supplierName}</span>
                    </div>
                    <div>
                      <span className="underline">Số tài khoản</span>: <span className="font-bold">{activePreviewInvoice ? activePreviewInvoice.bank_account : bankAccount}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; tại Ngân hàng <span className="font-bold">{activePreviewInvoice ? activePreviewInvoice.bank_name_branch : bankNameBranch}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Invoice list table */}
              <table className="w-full border-collapse border border-slate-900 text-[10px] mb-4 text-left">
                <thead>
                  <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center">
                    <th className="border border-slate-900 p-1 text-center" rowSpan={2}>TT</th>
                    <th className="border border-slate-900 p-1 text-center" colSpan={2}>HÓA ĐƠN</th>
                    <th className="border border-slate-900 p-1 text-center" rowSpan={2}>
                      {documentType === "payment" ? "NỘI DUNG THANH TOÁN" : "NỘI DUNG THANH TOÁN"}
                    </th>
                    <th className="border border-slate-900 p-1 text-center" rowSpan={2}>SỐ TIỀN (VNĐ)</th>
                    <th className="border border-slate-900 p-1 text-center" rowSpan={2}>GHI CHÚ</th>
                  </tr>
                  <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center">
                    <th className="border border-slate-900 p-1 text-center">SỐ</th>
                    <th className="border border-slate-900 p-1 text-center">NGÀY</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const previewItems = activePreviewInvoice
                      ? (activePreviewInvoice.desc.startsWith("{\"")
                          ? JSON.parse(activePreviewInvoice.desc).items
                          : [{
                              number: activePreviewInvoice.number,
                              date: activePreviewInvoice.date,
                              desc: activePreviewInvoice.desc,
                              amount: activePreviewInvoice.amount
                            }])
                      : invoiceQueue
                          .filter(item => item.status === "success")
                          .map(item => ({
                            number: item.number,
                            date: item.date,
                            desc: item.desc,
                            amount: item.amount
                          }));
                    return previewItems.map((item: any, idx: number) => (
                      <tr key={idx} className="border-b border-slate-900">
                        <td className="border border-slate-900 p-1 text-center">{idx + 1}</td>
                        <td className="border border-slate-900 p-1 font-mono font-bold text-center">{item.number}</td>
                        <td className="border border-slate-900 p-1 text-center">{item.date ? new Date(item.date).toLocaleDateString("vi-VN") : ""}</td>
                        <td className="border border-slate-900 p-1">{item.desc}</td>
                        <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                          {item.amount.toLocaleString("vi-VN")}
                        </td>
                        <td className="border border-slate-900 p-1"></td>
                      </tr>
                    ));
                  })()}
                  <tr className="font-bold border-b border-slate-900">
                    <td className="border border-slate-900 p-1 text-center" colSpan={4}>Tổng cộng</td>
                    <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                      {(activePreviewInvoice 
                        ? activePreviewInvoice.amount 
                        : invoiceQueue
                            .filter(item => item.status === "success")
                            .reduce((sum, item) => sum + item.amount, 0)
                      ).toLocaleString("vi-VN")}
                    </td>
                    <td className="border border-slate-900 p-1"></td>
                  </tr>
                </tbody>
              </table>

              {/* Undertakings */}
              <div className="text-xs space-y-1.5 mb-6 leading-relaxed">
                <div className="italic">
                  <span className="font-bold">Bằng chữ: </span>
                  {docSoVietNam(
                    activePreviewInvoice 
                      ? activePreviewInvoice.amount 
                      : invoiceQueue
                          .filter(item => item.status === "success")
                          .reduce((sum, item) => sum + item.amount, 0)
                  )}
                </div>
                <div>
                  {documentType === "payment" 
                    ? "Tôi xin chịu trách nhiệm về nội dung thanh toán và các hóa đơn chứng từ kèm theo."
                    : "Tôi xin chịu trách nhiệm về nội dung đề nghị và các hóa đơn chứng từ kèm theo."}
                </div>
                <div className="italic">(Kèm theo .................................................... chứng từ gốc).</div>
              </div>

              {/* Signatures */}
              <div className="text-[10px]">
                <div className="text-right italic mb-3">
                  Tp.hcm, ngày ...... tháng ...... năm ........
                </div>
                <div className="grid grid-cols-4 font-bold text-center gap-1.5">
                  <div>{documentType === "payment" ? "GIÁM ĐỐC" : "BAN LÃNH ĐẠO"}</div>
                  <div>KẾ TOÁN TRƯỞNG</div>
                  <div>TRƯỞNG BỘ PHẬN</div>
                  <div>NGƯỜI ĐỀ NGHỊ</div>
                </div>
                <div className="h-16"></div>
              </div>

            </div>

            {/* Modal Actions */}
            <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setActivePreviewInvoice(null);
                }}
                className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                Đóng lại
              </button>
              <button
                onClick={async () => {
                  await exportInvoicePaymentRequest();
                  setShowPreviewModal(false);
                  setActivePreviewInvoice(null);
                }}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer"
              >
                <Download size={13} /> Tải xuống file Word
              </button>
            </div>

          </div>
        </div>
      )}

      {/* AI Settings Modal */}
      {showAiSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="glass bg-white rounded-2xl w-full max-w-md overflow-hidden p-6 space-y-5 border border-white animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-[#005BAC]">
                <Settings size={18} />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-slate-800 text-sm">Cấu hình AI Hành chính</h3>
                <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Thiết lập kết nối OpenAI để đọc hóa đơn</p>
              </div>
            </div>

            <form onSubmit={saveSettings} className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
                <p className="text-[9px] text-slate-400 font-semibold leading-normal mt-1">
                  Khóa API này được lưu trữ cục bộ trên trình duyệt của bạn. Nếu để trống, hệ thống sẽ tự động dùng khóa chung được thiết lập trên server.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Mô hình AI sử dụng</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white cursor-pointer text-xs"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Nhanh chóng & Rất tiết kiệm)</option>
                  <option value="gpt-4o">gpt-4o (Độ chính xác cao & Đọc ảnh hóa đơn tốt nhất)</option>
                </select>
              </div>

              {settingsSaved && (
                <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100 text-[10px] font-bold">
                  <CheckCircle size={12} /> Đã lưu cấu hình thành công!
                </div>
              )}

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAiSettingsModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Đóng lại
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow"
                >
                  <Save size={13} /> Lưu cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SQL Guide Modal */}
      {showSqlGuideModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden p-6 space-y-5 border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150 relative">
            <button
              onClick={() => setShowSqlGuideModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer bg-transparent border-none outline-none"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500">
                <AlertTriangle size={18} />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-slate-800 text-sm">Hướng dẫn khởi tạo bảng Supabase</h3>
                <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Khắc phục lỗi mất dữ liệu khi nhấn F5</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs text-slate-600 leading-relaxed font-semibold">
              <p>Để lưu trữ vĩnh viễn hóa đơn trên hệ thống, bạn cần tạo bảng <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-rose-600">invoices</code> trong Supabase SQL Editor:</p>
              <ol className="list-decimal pl-5 space-y-2 font-medium">
                <li>Sao chép đoạn mã SQL dưới đây.</li>
                <li>Truy cập vào trang quản trị <strong>Supabase Dashboard</strong> của dự án.</li>
                <li>Chọn menu <strong>SQL Editor</strong> ở cột bên trái và bấm <strong>New query</strong>.</li>
                <li>Dán đoạn mã SQL vào và nhấn <strong>Run</strong>.</li>
              </ol>

              <div className="relative mt-2">
                <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-[10px] overflow-x-auto max-h-40 select-all font-semibold">
{`CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  number TEXT NOT NULL,
  date DATE,
  description TEXT,
  amount NUMERIC,
  file_url TEXT,
  beneficiary_name TEXT,
  bank_account TEXT,
  bank_name_branch TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(number);
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for invoices" ON public.invoices;
CREATE POLICY "Allow public select for invoices" ON public.invoices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert for invoices" ON public.invoices;
CREATE POLICY "Allow public insert for invoices" ON public.invoices FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update for invoices" ON public.invoices;
CREATE POLICY "Allow public update for invoices" ON public.invoices FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete for invoices" ON public.invoices;
CREATE POLICY "Allow public delete for invoices" ON public.invoices FOR DELETE USING (true);`}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  number TEXT NOT NULL,
  date DATE,
  description TEXT,
  amount NUMERIC,
  file_url TEXT,
  beneficiary_name TEXT,
  bank_account TEXT,
  bank_name_branch TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(number);
ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for invoices" ON public.invoices;
CREATE POLICY "Allow public select for invoices" ON public.invoices FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert for invoices" ON public.invoices;
CREATE POLICY "Allow public insert for invoices" ON public.invoices FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update for invoices" ON public.invoices;
CREATE POLICY "Allow public update for invoices" ON public.invoices FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete for invoices" ON public.invoices;
CREATE POLICY "Allow public delete for invoices" ON public.invoices FOR DELETE USING (true);`);
                    alert('Đã sao chép mã SQL vào Clipboard!');
                  }}
                  className="absolute top-2 right-2 px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[9px] font-bold transition-all cursor-pointer border-none"
                >
                  Sao chép SQL
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowSqlGuideModal(false)}
                className="px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer border-none"
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewFileUrl && (() => {
        const previewUrls = previewFileUrl.split(",").map(url => url.trim()).filter(Boolean);
        const currentPreviewUrl = previewUrls[previewFileIndex] || previewUrls[0] || "";
        
        let fileTabs: string[] = [];
        if (previewUrls.length > 1) {
          const match = previewFileName.match(/(?:Hóa đơn số|Hóa đơn|Thanh toán)\s*(.+)/i);
          if (match && match[1]) {
            const codes = match[1].split(',').map(s => s.trim()).filter(Boolean);
            if (codes.length === previewUrls.length) {
              fileTabs = codes.map(code => `HĐ ${code}`);
            }
          }
          if (fileTabs.length !== previewUrls.length) {
            fileTabs = previewUrls.map((_, idx) => `Tài liệu ${idx + 1}`);
          }
        }

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl h-[85vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in fade-in-50 zoom-in-95 duration-150">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-blue-50 text-[#005BAC] rounded-xl flex-shrink-0">
                    <FileText size={16} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-extrabold text-slate-800 text-xs truncate" title={previewFileName}>
                      {previewFileName}
                    </h3>
                    <p className="text-[10px] text-slate-400 font-semibold">
                      {previewUrls.length > 1 ? `Xem hóa đơn ${previewFileIndex + 1} trên tổng số ${previewUrls.length}` : "Tài liệu hóa đơn gốc"}
                    </p>
                  </div>
                </div>

                {/* Tabs for multiple files */}
                {previewUrls.length > 1 && (
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200/50">
                    {fileTabs.map((tabLabel, idx) => (
                      <button
                        key={idx}
                        onClick={() => setPreviewFileIndex(idx)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold transition-all border-none cursor-pointer select-none active:scale-95 ${
                          (previewFileIndex === idx || (idx === 0 && previewFileIndex >= previewUrls.length))
                            ? "bg-white text-[#005BAC] shadow-sm font-black"
                            : "text-slate-500 hover:text-slate-800 hover:bg-white/50"
                        }`}
                      >
                        {tabLabel}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-3 flex-shrink-0">
                  <a
                    href={currentPreviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-bold shadow-sm transition-all cursor-pointer border-none"
                  >
                    Mở tab mới
                  </a>
                  <button
                    onClick={() => {
                      setPreviewFileUrl("");
                      setPreviewFileName("");
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer bg-transparent border-none"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
              {/* Body */}
              <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center relative">
                {(() => {
                  if (!currentPreviewUrl) {
                    return <div className="text-slate-400 font-semibold text-xs">Không tìm thấy đường dẫn file</div>;
                  }
                  const isImage = /\.(jpeg|jpg|gif|png|webp|svg)/i.test(currentPreviewUrl.split(/[?#]/)[0]);
                  if (isImage) {
                    return (
                      <div className="w-full h-full overflow-auto flex items-center justify-center bg-white rounded-xl shadow-inner p-4 animate-in fade-in-50 duration-200">
                        <img 
                          src={currentPreviewUrl} 
                          alt={`${previewFileName} - Phần ${previewFileIndex + 1}`} 
                          className="max-w-full max-h-full object-contain rounded-lg shadow-md"
                        />
                      </div>
                    );
                  }
                  
                  return (
                    <iframe 
                      src={currentPreviewUrl} 
                      className="w-full h-full border-none bg-white rounded-xl shadow-inner animate-in fade-in-50 duration-200" 
                      title={`Invoice File Preview - Part ${previewFileIndex + 1}`}
                    />
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Recurring Preview Modal */}
      {showRecurringPreviewModal && (() => {
        const currentMonthPayments = pendingPayments.filter(p => p.month === payMonth);
        const p = activePreviewPayment || currentMonthPayments[selectedRecurringPreviewIdx];
        if (!p) return null;

        const totalAmountVal = p.amount;
        const textAmountStr = docSoVietNam(totalAmountVal);

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100 flex flex-col space-y-5 animate-in fade-in-50 zoom-in-95 duration-150 relative">
              
              {/* Close Button */}
              <button
                onClick={() => {
                  setShowRecurringPreviewModal(false);
                  setActivePreviewPayment(null);
                }}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer"
              >
                <X size={16} />
              </button>

              {/* Modal Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-100 pb-3 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#005BAC]">
                    <Eye size={15} />
                  </div>
                  <div>
                    <h3 className="font-heading font-extrabold text-slate-800 text-sm">
                      Xem trước Giấy đề nghị chuyển tiền (Định kỳ)
                    </h3>
                    <p className="text-slate-400 text-[10px] font-semibold mt-0.5">
                      Biểu mẫu HC-BM021/ĐNCT (Xem trước nội dung điền tự động)
                    </p>
                  </div>
                </div>

                {/* Dropdown to switch between payments */}
                {!activePreviewPayment && currentMonthPayments.length > 1 && (
                  <div className="flex items-center gap-2 pr-8">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Chọn Nhà Cung Cấp:</span>
                    <select
                      value={selectedRecurringPreviewIdx}
                      onChange={(e) => setSelectedRecurringPreviewIdx(Number(e.target.value))}
                      className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold bg-white text-slate-700 outline-none cursor-pointer"
                    >
                      {currentMonthPayments.map((pay, idx) => (
                        <option key={pay.id} value={idx}>{pay.supplierName} ({pay.amount.toLocaleString("vi-VN")} đ)</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Paper Container */}
              <div className="bg-white border border-slate-200 shadow p-8 rounded-xl font-serif text-[#1e293b] leading-relaxed max-w-2xl mx-auto w-full select-none font-medium" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                
                {/* Header block */}
                <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
                  <div className="text-left font-sans">
                    <div className="text-base font-black text-[#005BAC]">TRUNG <span className="text-red-500">N</span>AM <span className="text-sky-400 text-xs font-normal italic">E&C</span></div>
                    <div className="text-[7.5px] font-bold text-slate-800 mt-0.5">CÔNG TY CP XÂY DỰNG VÀ LẮP MÁY TRUNG NAM</div>
                    <div className="text-[6.5px] text-slate-500 mt-1 leading-tight">
                      A: Tầng trệt tòa nhà Safomec, 7/1 Thành Thái, Phường 14, Quận 10, TPHCM<br/>
                      T: (+84) 834 70 75 79 &nbsp; E: info.tnec@trungnamgroup.com.vn
                    </div>
                  </div>
                  <div className="text-center font-sans">
                    <div className="text-[13px] font-bold tracking-wide">
                      GIẤY ĐỀ NGHỊ CHUYỂN TIỀN
                    </div>
                    <div className="text-[9.5px] font-bold underline mt-0.5">
                      HC-BM021/ĐNCT
                    </div>
                  </div>
                </div>

                {/* Destination */}
                <div className="mb-4 text-xs font-bold leading-normal">
                  Kính gửi: &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Ban lãnh đạo Công ty CP XD và LM Trung Nam;<br/>
                  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; - Phòng Kế toán công ty,
                </div>

                {/* Form Details */}
                <div className="space-y-1.5 text-xs mb-4">
                  <div>
                    <span className="underline">Họ và tên người đề nghị</span>: <span className="font-bold">{employeeName}</span>
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                    <span className="underline">Bộ phận</span>: <span className="font-bold">{employeeDept}</span>
                  </div>
                  <div>
                    <span className="underline">Lý do xin đề nghị chuyển tiền</span>: <span>{p.content}</span>
                  </div>
                  <div>
                    <span className="underline">Tên dự án</span>: <span className="font-bold">{p.project_name || "Văn phòng HCM"}</span>
                  </div>
                  <div>
                    <span className="underline">Tên đơn vị thụ hưởng</span>: <span className="font-bold">{p.supplierName}</span>
                  </div>
                  <div>
                    <span className="underline">Số tài khoản</span>: <span className="font-bold">{p.account}</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; tại Ngân hàng <span className="font-bold">{p.bank}</span>
                  </div>
                </div>

                {/* Invoice list table */}
                <table className="w-full border-collapse border border-slate-900 text-[10px] mb-4 text-left">
                  <thead>
                    <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center font-sans">
                      <th className="border border-slate-900 p-1 text-center" rowSpan={2}>TT</th>
                      <th className="border border-slate-900 p-1 text-center" colSpan={2}>HÓA ĐƠN</th>
                      <th className="border border-slate-900 p-1 text-center" rowSpan={2}>NỘI DUNG THANH TOÁN</th>
                      <th className="border border-slate-900 p-1 text-center" rowSpan={2}>SỐ TIỀN (VNĐ)</th>
                      <th className="border border-slate-900 p-1 text-center" rowSpan={2}>GHI CHÚ</th>
                    </tr>
                    <tr className="bg-slate-50 text-slate-900 font-bold border-b border-slate-900 text-center font-sans">
                      <th className="border border-slate-900 p-1 text-center">SỐ</th>
                      <th className="border border-slate-900 p-1 text-center">NGÀY</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-900">
                      <td className="border border-slate-900 p-1 text-center">1</td>
                      <td className="border border-slate-900 p-1 font-mono font-bold text-center">—</td>
                      <td className="border border-slate-900 p-1 text-center">{new Date().toLocaleDateString("vi-VN")}</td>
                      <td className="border border-slate-900 p-1">{p.content}</td>
                      <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                        {p.amount.toLocaleString("vi-VN")}
                      </td>
                      <td className="border border-slate-900 p-1"></td>
                    </tr>
                    <tr className="font-bold border-b border-slate-900">
                      <td className="border border-slate-900 p-1 text-center" colSpan={4}>Tổng cộng</td>
                      <td className="border border-slate-900 p-1 text-right font-mono font-bold">
                        {p.amount.toLocaleString("vi-VN")}
                      </td>
                      <td className="border border-slate-900 p-1"></td>
                    </tr>
                  </tbody>
                </table>

                {/* Undertakings */}
                <div className="text-xs space-y-1.5 mb-6 leading-relaxed">
                  <div className="italic">
                    <span className="font-bold">Bằng chữ: </span>
                    {textAmountStr}
                  </div>
                  <div>
                    Tôi xin chịu trách nhiệm về nội dung thanh toán và các hóa đơn chứng từ kèm theo.
                  </div>
                  <div><i>(Kèm theo .................................................... chứng từ gốc).</i></div>
                </div>

                {/* Signatures */}
                <table className="w-full text-center text-[10px] leading-normal font-sans">
                  <tbody>
                    <tr>
                      <td colSpan={3} className="text-right italic pr-6 pb-2">
                        Tp.HCM, ngày {new Date().getDate()} tháng {new Date().getMonth() + 1} năm {new Date().getFullYear()}
                      </td>
                    </tr>
                    <tr className="font-bold">
                      <td className="w-1/3">BAN GIÁM ĐỐC</td>
                      <td className="w-1/3">KẾ TOÁN TRƯỞNG</td>
                      <td className="w-1/3">NGƯỜI ĐỀ NGHỊ</td>
                    </tr>
                    <tr className="h-16">
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Modal Actions */}
              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    setShowRecurringPreviewModal(false);
                    setActivePreviewPayment(null);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Đóng lại
                </button>
                <button
                  onClick={async () => {
                    setShowRecurringPreviewModal(false);
                    setActivePreviewPayment(null);
                    await exportSingleRecurringPayment(p);
                  }}
                  disabled={exportLoading}
                  className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer"
                >
                  {exportLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      Đang tải...
                    </>
                  ) : (
                    <>
                      <Download size={13} />
                      Tải xuống file Word
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden p-6 space-y-5 border border-slate-100 animate-in fade-in-50 zoom-in-95 duration-150 relative">
            <button
              onClick={() => setEditingPayment(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-full cursor-pointer bg-transparent border-none outline-none"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-[#005BAC]">
                <Settings size={18} />
              </div>
              <div>
                <h3 className="font-heading font-extrabold text-slate-800 text-sm">Chỉnh sửa thanh toán định kỳ</h3>
                <p className="text-slate-400 text-[10px] font-semibold mt-0.5">Thay đổi thông tin chi tiết thanh toán của nhà cung cấp</p>
              </div>
            </div>

            <form onSubmit={handleUpdatePayment} className="space-y-4 text-xs font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">Tên Nhà Cung Cấp</label>
                <input
                  type="text"
                  required
                  value={editingPayment.supplierName || ""}
                  onChange={(e) => setEditingPayment(prev => prev ? { ...prev, supplierName: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-bold text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Số tài khoản ngân hàng</label>
                  <input
                    type="text"
                    required
                    value={editingPayment.account || ""}
                    onChange={(e) => setEditingPayment(prev => prev ? { ...prev, account: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-mono font-bold text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Ngân hàng & Chi nhánh</label>
                  <input
                    type="text"
                    required
                    value={editingPayment.bank || ""}
                    onChange={(e) => setEditingPayment(prev => prev ? { ...prev, bank: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-medium text-slate-700"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Nội dung thanh toán</label>
                <textarea
                  required
                  rows={2}
                  value={editingPayment.content || ""}
                  onChange={(e) => setEditingPayment(prev => prev ? { ...prev, content: e.target.value } : null)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs text-slate-800 resize-none font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Số tiền thanh toán (VNĐ)</label>
                  <input
                    type="number"
                    required
                    value={editingPayment.amount || 0}
                    onChange={(e) => setEditingPayment(prev => prev ? { ...prev, amount: Number(e.target.value) } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs font-bold text-[#005BAC]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Tháng thanh toán</label>
                  <input
                    type="text"
                    required
                    value={editingPayment.month || ""}
                    onChange={(e) => setEditingPayment(prev => prev ? { ...prev, month: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs text-slate-800"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPayment(null)}
                  className="px-5 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer bg-transparent"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-5 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow cursor-pointer border-none"
                >
                  <Save size={13} /> Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

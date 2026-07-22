"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect, useMemo, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { exportPhieuThanhToan, exportPhieuCongTac, downloadDocFile } from "@/lib/wordExporter";
import {
  getGroupLeaderNameForMember,
  getRequestStage,
  isLeaveTripCap1Approver,
  getLeaveExceptionApproversForAssignee,
  normalizeName,
} from "@/lib/approvers";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  Plane,
  CalendarDays,
  Settings,
  User,
  AlertCircle,
  FileText,
  CheckCircle2,
  HelpCircle,
  Loader2,
  CalendarDays as CalendarIcon,
  X,
  Compass,
  Coins,
  Trash2
} from "lucide-react";

interface Task {
  id: string;
  title: string;
  priority: string;
  assignee: string;
  due_date: string;
  start_date: string;
  progress: number;
  status: string;
  description?: string;
  link?: string;
  notes?: string;
  approval_stage?: string | null;
  manager_approved_by?: string | null;
}

interface Employee {
  id: string;
  name: string;
  avatar: string;
}

interface RouteSegment {
  from: string;
  to: string;
  distance: string;
  date: string;
  transport: string;
  nights: number;
  reason: string;
}

interface OtherExpense {
  name: string;
  amount: number;
  notes: string;
}

export default function CalendarPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date State
  const [currentDate, setCurrentDate] = useState(new Date(2026, 5, 5)); // Default to June 2026 for demo alignment
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>("Tất cả");

  // Right sidebar tab state: 'nodate' | 'leave' | 'trip'
  const [activeTab, setActiveTab] = useState<'nodate' | 'leave' | 'trip'>('nodate');

  // User info
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);

  // Modal State for Request Leave / Business Trip
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [modalName, setModalName] = useState("");
  const [modalStart, setModalStart] = useState("2026-06-05");
  const [modalEnd, setModalEnd] = useState("2026-06-05");
  const [modalNotes, setModalNotes] = useState("");
  const [leaveType, setLeaveType] = useState("Nghỉ phép năm hưởng lương");

  // Leave specific states
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState<"Sáng" | "Chiều">("Sáng");
  const [selectedApprover, setSelectedApprover] = useState("");
  const [allStaffList, setAllStaffList] = useState<{ id: string; name: string; role: string }[]>([]);
  const [managersList, setManagersList] = useState<{ id: string; name: string; role: string }[]>([]);
  // Ô chọn người duyệt kiểu search — tìm tên nhanh thay vì cuộn dropdown dài
  const [approverSearch, setApproverSearch] = useState("");
  const [showApproverDropdown, setShowApproverDropdown] = useState(false);
  const approverPickerRef = useRef<HTMLDivElement>(null);
  // Danh bạ email/phòng ban tra theo tên — dùng để gửi email thông báo duyệt (tasks không có cột email)
  const [employeeDirectory, setEmployeeDirectory] = useState<{ name: string; email: string; department: string; role: string }[]>([]);

  // Business trip specific states
  const [tripDestination, setTripDestination] = useState("");
  const [tripTransport, setTripTransport] = useState("🚗 Xe công ty");
  const [tripMission, setTripMission] = useState("");
  const [tripRoutes, setTripRoutes] = useState<RouteSegment[]>([
    { from: "TPHCM", to: "", distance: "", date: "2026-06-05", transport: "Xe công ty", nights: 0, reason: "" }
  ]);
  const [tripTravelEstimate, setTripTravelEstimate] = useState<number>(0);
  const [tripOtherExpenses, setTripOtherExpenses] = useState<OtherExpense[]>([]);
  const [hotelRate, setHotelRate] = useState<number>(350000);

  const selectedMonth = currentDate.getMonth();
  const selectedYear = currentDate.getFullYear();

  const fetchCurrentUser = async () => {
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
        .from("employees_directory")
        .select("name, role, department")
        .like("email", `%${email}%`)
        .maybeSingle();

      const displayName = empData?.name || user.user_metadata?.full_name || user.user_metadata?.name || "Người dùng";
      setCurrentUser({
        email,
        name: displayName,
        role: empData?.role || (isAdmin ? "Admin" : "Nhân viên"),
        department: empData?.department || "Chưa xếp phòng",
        isAdmin
      });

      setModalName(displayName);
    } catch (err) {
      console.error("Error fetching current user info:", err);
    }
  };

  const isManager = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isAdmin) return true;
    const roleLower = (currentUser.role || "").toLowerCase();
    return (
      roleLower.includes("trưởng phòng") ||
      roleLower.includes("phó phòng") ||
      roleLower.includes("giám đốc")
    );
  }, [currentUser]);

  const handleDeleteTripTask = async (taskId: string) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa lịch đi công tác này không? Hành động này không thể hoàn tác.")) {
      return;
    }
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId);
      
      if (error) throw error;
      alert("Đã xóa lịch đi công tác thành công!");
      setIsDetailsModalOpen(false);
      setSelectedTask(null);
      fetchData();
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi xóa lịch đi công tác: " + (err.message || err));
    }
  };

  // Fetch Tasks & Employees
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch Tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (tasksError) throw tasksError;
      
      if (tasksData) {
        setTasks(tasksData.map((t: any) => ({
          id: t.id,
          title: t.title,
          priority: t.priority || "Trung bình",
          assignee: t.assignee || "Chưa phân công",
          due_date: t.due_date || "",
          start_date: t.start_date || "",
          progress: t.progress || 0,
          status: t.status || "planning",
          description: t.description || "",
          link: t.link || "",
          notes: t.notes || "",
          approval_stage: t.approval_stage || null,
          manager_approved_by: t.manager_approved_by || null
        })));
      }

      // Fetch Employees
      const { data: empsData, error: empsError } = await supabase
        .from("employees_directory")
        .select("id, name, avatar, role, email, department")
        .order("name", { ascending: true });

      if (empsError) throw empsError;

      if (empsData) {
        setEmployees(empsData.map((e: any) => ({
          id: e.id,
          name: e.name,
          avatar: e.avatar || e.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
        })));

        setEmployeeDirectory(empsData.map((e: any) => ({
          name: e.name,
          email: e.email || "",
          department: e.department || "",
          role: e.role || ""
        })));

        // Toàn bộ nhân sự — dùng để đối chiếu người duyệt ĐẶC CÁCH nghỉ 1 ngày.
        //
        // Trước đây chỗ này lọc theo chức danh ("phó phòng"/"leader") rồi phải viết
        // cứng thêm tên "hoành anh" cho khớp. Sai từ gốc: người duyệt đặc cách đã
        // được ghi TÊN rõ ràng trong bảng leave_exceptions, nên chức danh của họ
        // không liên quan gì cả — Dương Nhật Hoành Anh là "Tổ trưởng nhân sự",
        // không khớp mẫu nào, nên mới phải chèn tên vào code.
        //
        // Giờ đối chiếu thẳng tên trong leave_exceptions với toàn bộ nhân sự: đổi
        // người đặc cách trong Cài đặt là có hiệu lực ngay, không cần sửa code, và
        // bàn giao tài khoản không làm mất luồng duyệt.
        setAllStaffList(empsData);

        // Filter managers (Trưởng phòng)
        let managers = empsData.filter((e: any) => 
          e.role && (
            e.role.toLowerCase().includes("trưởng phòng") || 
            e.role.toLowerCase().includes("truong phong") ||
            e.role.toLowerCase() === "admin"
          )
        );
        if (managers.length === 0) {
          managers = empsData;
        }
        setManagersList(managers);
      }
    } catch (err) {
      console.error("Error fetching calendar data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchData();

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("action") === "request_leave" || params.get("leave") === "true") {
        setIsLeaveModalOpen(true);
      }
    }
  }, []);

  // Format month title
  const monthTitle = `Tháng ${selectedMonth + 1} Năm ${selectedYear}`;

  // Calendar Calculation Helpers
  const calendarCells = useMemo(() => {
    // Start of current month
    const startOfMonth = new Date(selectedYear, selectedMonth, 1);
    // End of current month
    const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0);

    const numDays = endOfMonth.getDate();
    
    // Day of the week of first day (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    // Map to Mon=0, Tue=1, ..., Sun=6
    let startDayOfWeek = startOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6; // Sunday

    const cells = [];

    // Previous month padding
    const prevMonthEnd = new Date(selectedYear, selectedMonth, 0);
    const prevMonthNumDays = prevMonthEnd.getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        dayNumber: prevMonthNumDays - i,
        isCurrentMonth: false,
        date: new Date(selectedYear, selectedMonth - 1, prevMonthNumDays - i)
      });
    }

    // Current month days
    for (let i = 1; i <= numDays; i++) {
      cells.push({
        dayNumber: i,
        isCurrentMonth: true,
        date: new Date(selectedYear, selectedMonth, i)
      });
    }

    // Next month padding to make full weeks (grid is 35 or 42 cells)
    const totalCells = cells.length > 35 ? 42 : 35;
    const nextMonthPadding = totalCells - cells.length;
    for (let i = 1; i <= nextMonthPadding; i++) {
      cells.push({
        dayNumber: i,
        isCurrentMonth: false,
        date: new Date(selectedYear, selectedMonth + 1, i)
      });
    }

    return cells;
  }, [selectedMonth, selectedYear]);

  // Navigate Months
  const handlePrevMonth = () => {
    setCurrentDate(new Date(selectedYear, selectedMonth - 1, 5));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(selectedYear, selectedMonth + 1, 5));
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  };

  // Toggle Priority Filter
  const togglePriority = (priority: string) => {
    setSelectedPriorities(prev =>
      prev.includes(priority)
        ? prev.filter(p => p !== priority)
        : [...prev, priority]
    );
  };

  // Filter Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // Role-based permission: non-managers/non-admins can only see their own tasks
      if (currentUser && !isManager) {
        if ((t.assignee || "").toLowerCase() !== currentUser.name.toLowerCase()) {
          return false;
        }
      }

      // 1. Search Query
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            t.assignee.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // 2. Priorities
      if (selectedPriorities.length > 0 && !selectedPriorities.includes(t.priority)) {
        return false;
      }

      // 3. Member Filter
      if (selectedMember !== "Tất cả" && t.assignee !== selectedMember) {
        return false;
      }

      return true;
    });
  }, [tasks, searchQuery, selectedPriorities, selectedMember, currentUser, isManager]);

  // Tasks categorized
  const tasksWithDate = useMemo(() => {
    return filteredTasks.filter(t => t.due_date || t.start_date);
  }, [filteredTasks]);

  const tasksWithoutDate = useMemo(() => {
    return filteredTasks.filter(t => !t.due_date && !t.start_date);
  }, [filteredTasks]);

  // Leave tasks (title starting with "Nghỉ phép" or status represents a leave event)
  const leaveTasks = useMemo(() => {
    return filteredTasks.filter(t => t.title.toLowerCase().startsWith("nghỉ phép") || t.title.toLowerCase().includes("nghi phep"));
  }, [filteredTasks]);

  // Business trip tasks
  const tripTasks = useMemo(() => {
    return filteredTasks.filter(t => t.title.toLowerCase().startsWith("công tác") || t.title.toLowerCase().includes("cong tac"));
  }, [filteredTasks]);

  // Get tasks for a specific date cell
  const getTasksForDate = (date: Date) => {
    const compareDateStr = date.toLocaleDateString("en-CA"); // YYYY-MM-DD
    
    return tasksWithDate.filter(t => {
      const start = t.start_date;
      const end = t.due_date;
      
      if (start && end) {
        return compareDateStr >= start && compareDateStr <= end;
      }
      if (start) {
        return compareDateStr === start;
      }
      if (end) {
        return compareDateStr === end;
      }
      return false;
    });
  };

  // Calculate leave days duration
  const leaveDaysCount = useMemo(() => {
    if (!modalStart || !modalEnd) return 0;
    const start = new Date(modalStart);
    const end = new Date(modalEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    if (start > end) return 0;
    
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    if (diffDays === 1 && isHalfDay) {
      return 0.5;
    }
    return diffDays;
  }, [modalStart, modalEnd, isHalfDay]);

  const isSingleDay = useMemo(() => {
    if (!modalStart || !modalEnd) return false;
    return modalStart === modalEnd;
  }, [modalStart, modalEnd]);

  // Handle start/end date changes to toggle isHalfDay safely
  useEffect(() => {
    if (!isSingleDay) {
      setIsHalfDay(false);
    }
  }, [isSingleDay]);

  // Danh sách người duyệt hợp lệ: đơn 1 ngày của người có đặc cách trong bảng
  // leave_exceptions chỉ được chọn đúng người duyệt đặc cách đó (VD Hằng->Quỳnh,
  // Quyên->Hoành Anh); còn lại là mọi Trưởng phòng/Admin. Tên cứng đã bỏ —
  // thêm/bớt cặp đặc cách chỉ cần sửa bảng leave_exceptions.
  const approverOptions = useMemo(() => {
    // Đặc cách nghỉ 1 ngày CHỈ áp cho đơn nghỉ phép. Đơn công tác dùng chung ô
    // chọn người duyệt này nhưng không có khái niệm "nghỉ 1 ngày", nếu không chặn
    // thì đơn công tác đúng 1 ngày sẽ bị thu hẹp nhầm về người duyệt đặc cách.
    if (isLeaveModalOpen && leaveDaysCount === 1) {
      const exceptionApprovers = getLeaveExceptionApproversForAssignee(modalName);
      if (exceptionApprovers.length > 0) {
        const matched = allStaffList.filter(d =>
          exceptionApprovers.some(a => normalizeName(d.name).includes(normalizeName(a)))
        );
        if (matched.length > 0) return matched;
      }
    }
    return managersList;
  }, [modalName, leaveDaysCount, allStaffList, managersList, isLeaveModalOpen]);

  // Đề xuất người duyệt theo ĐÚNG 2 BẬC của phòng ban người xin nghỉ, không suy diễn thêm:
  //   1. Trưởng phòng
  //   2. Không có Trưởng phòng -> Phó phòng
  //   3. Không có cả hai -> ĐỂ TRỐNG, người dùng tự chọn bằng ô tìm kiếm bên dưới
  //
  // Tổ trưởng CỐ Ý không nằm trong danh sách này: tổ có luồng duyệt riêng qua bảng
  // approval_groups (thành viên tổ do tổ trưởng duyệt, xem lib/approvers.ts) nên
  // không cần — và không nên — đề xuất tổ trưởng ở đây.
  //
  // Trước đây bậc 2 là "bất kỳ ai có chức danh quản lý trong phòng" (deptManagers[0]),
  // nên có thể rơi vào tổ trưởng/quản lý/giám đốc một cách khó đoán.
  //
  // So khớp phòng ban qua normalizeName (bỏ dấu + thường hoá): trước đây so chuỗi
  // tuyệt đối nên lệch một dấu là trượt, mà trượt thì im lặng — ô để trống, không
  // báo gì, người dùng không biết vì sao.
  const recommendedApprover = useMemo(() => {
    if (approverOptions.length === 0) return "";
    const dept = normalizeName(currentUser?.department || "");
    if (dept) {
      const sameDept = employeeDirectory.filter(e => normalizeName(e.department || "") === dept);
      const isTruongPhong = (role: string) => {
        const r = normalizeName(role);
        return r.includes("truong phong") && !r.includes("pho");
      };
      const isPhoPhong = (role: string) => {
        const r = normalizeName(role);
        return r.includes("pho phong") || r.includes("pho truong phong");
      };
      const primary = sameDept.find(e => isTruongPhong(e.role)) || sameDept.find(e => isPhoPhong(e.role));
      if (primary && approverOptions.some(o => o.name === primary.name)) {
        return primary.name;
      }
    }
    // Giữ nguyên: đơn 1 ngày có đặc cách thì approverOptions chỉ còn đúng 1 người
    // duyệt đặc cách -> chọn sẵn cho người dùng.
    return approverOptions.length === 1 ? approverOptions[0].name : "";
  }, [approverOptions, currentUser, employeeDirectory]);

  // Đặt người duyệt mặc định khi mở modal nghỉ phép HOẶC công tác.
  // Hai modal không bao giờ mở cùng lúc nên dùng chung state selectedApprover.
  useEffect(() => {
    if (isLeaveModalOpen || isTripModalOpen) {
      setSelectedApprover(prev => prev || recommendedApprover);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeaveModalOpen, isTripModalOpen]);

  // Nếu lựa chọn hiện tại không còn hợp lệ với bộ tuỳ chọn mới (vd đổi từ đơn 1 ngày
  // sang nhiều ngày), tự động chọn lại người được đề xuất
  useEffect(() => {
    if (!isLeaveModalOpen) return;
    if (selectedApprover && !approverOptions.some(o => o.name === selectedApprover)) {
      setSelectedApprover(recommendedApprover || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approverOptions]);

  // Đóng dropdown tìm người duyệt khi bấm ra ngoài
  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (approverPickerRef.current && !approverPickerRef.current.contains(e.target as Node)) {
        setShowApproverDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filteredApproverOptions = useMemo(() => {
    const q = approverSearch.trim().toLowerCase();
    if (!q) return approverOptions;
    return approverOptions.filter(m => m.name.toLowerCase().includes(q) || (m.role || "").toLowerCase().includes(q));
  }, [approverOptions, approverSearch]);

  // Business trip calculation helpers
  const tripDaysCount = useMemo(() => {
    if (!modalStart || !modalEnd) return 0;
    const start = new Date(modalStart);
    const end = new Date(modalEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    if (start > end) return 0;
    
    const diffTime = end.getTime() - start.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [modalStart, modalEnd]);

  const totalNights = useMemo(() => {
    return tripRoutes.reduce((sum, r) => sum + (Number(r.nights) || 0), 0);
  }, [tripRoutes]);

  const totalOtherExpenses = useMemo(() => {
    return tripOtherExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }, [tripOtherExpenses]);

  const totalTripAmount = useMemo(() => {
    const allowance = tripDaysCount * 120000;
    const hotel = totalNights * hotelRate;
    const travel = Number(tripTravelEstimate) || 0;
    return allowance + hotel + travel + totalOtherExpenses;
  }, [tripDaysCount, totalNights, hotelRate, tripTravelEstimate, totalOtherExpenses]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("vi-VN").format(val) + " VNĐ";
  };

  // Update dates in first route segment when modalStart changes
  useEffect(() => {
    if (modalStart) {
      setTripRoutes(routes => 
        routes.map((r, i) => i === 0 ? { ...r, date: modalStart } : r)
      );
    }
  }, [modalStart]);

  // Auto-calculate nights for the first route segment when tripDaysCount changes
  useEffect(() => {
    if (tripDaysCount >= 2) {
      const calculatedNights = tripDaysCount - 1;
      setTripRoutes(prev => {
        if (prev[0] && prev[0].nights !== calculatedNights) {
          const updated = [...prev];
          updated[0] = { ...updated[0], nights: calculatedNights };
          return updated;
        }
        return prev;
      });
    } else {
      setTripRoutes(prev => {
        if (prev[0] && prev[0].nights !== 0) {
          const updated = [...prev];
          updated[0] = { ...updated[0], nights: 0 };
          return updated;
        }
        return prev;
      });
    }
  }, [tripDaysCount]);

  // Đọc cấu hình SMTP dùng chung (Cài đặt hệ thống / C&B) — email hệ thống trên server luôn
  // được API ưu tiên trước, đây chỉ là phương án dự phòng khi server chưa cấu hình.
  const readSmtpConfig = () => ({
    user: typeof window !== "undefined" ? localStorage.getItem("tnec_cb_smtp_user") || "" : "",
    pass: typeof window !== "undefined" ? localStorage.getItem("tnec_cb_smtp_pass") || "" : "",
    host: typeof window !== "undefined" ? localStorage.getItem("tnec_cb_smtp_host") || "smtp.gmail.com" : "smtp.gmail.com",
    port: typeof window !== "undefined" ? Number(localStorage.getItem("tnec_cb_smtp_port")) || 465 : 465,
    secure: typeof window === "undefined" || localStorage.getItem("tnec_cb_smtp_secure") !== "false",
  });

  // Danh sách CẤP 1 (Trưởng phòng/Tổ trưởng xác nhận) chờ người dùng hiện tại xử lý.
  // Cấp 2 (HCNS duyệt cuối) chỉ hiển thị & xử lý tại Cài đặt hệ thống > Duyệt yêu cầu,
  // để tránh 2 nơi cùng có quyền duyệt cuối và lỡ bỏ qua bước chuyển HCNS.
  const pendingApprovals = useMemo(() => {
    if (!currentUser) return [];
    // Ngoại lệ tên cứng (Giáp Nhân/Duy Hưng coi như Admin) đã bỏ — Ban giám đốc vẫn
    // duyệt cấp 1 được qua isManagerRole("giám đốc") trong isLeaveTripCap1Approver
    const isUserAdmin = currentUser.isAdmin ||
                        (currentUser.role || "").toLowerCase() === "admin";

    return tasks.filter(t => {
      if (t.status !== "pending_approval") return false;
      if (getRequestStage(t) !== "manager") return false;
      const titleLower = t.title.toLowerCase();
      const isLeave = titleLower.startsWith("nghỉ phép") || titleLower.includes("nghi phep");
      const isTrip = titleLower.startsWith("công tác") || titleLower.includes("cong tac");
      if (!isLeave && !isTrip) return false;

      return isLeaveTripCap1Approver({
        currentUserName: currentUser.name,
        currentUserRole: currentUser.role,
        currentUserIsAdmin: isUserAdmin,
        assigneeName: t.assignee,
        taskNotes: t.notes,
        taskTitleLower: titleLower,
      });
    });
  }, [tasks, currentUser]);

  // Gửi email KHÔNG chặn giao diện — bắt tay SMTP với Gmail mất vài giây, nếu
  // `await` thì nút duyệt/từ chối đứng im khiến người dùng tưởng bấm hụt.
  // Ghi DB xong là phản hồi ngay; chỉ báo thêm khi email LỖI.
  const sendRequestEmailInBackground = (payload: any, failPrefix: string) => {
    void (async () => {
      try {
        const res = await apiFetch("/api/send-request-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) alert(`⚠️ ${failPrefix}: ${result.error}`);
      } catch (mailErr: any) {
        alert(`⚠️ ${failPrefix}: ${mailErr.message || "lỗi kết nối"}`);
      }
    })();
  };

  // Cấp 1 xác nhận -> chuyển sang HCNS duyệt cuối + báo email cho người có quyền duyệt cuối
  const handleCap1Confirm = async (taskId: string) => {
    if (!currentUser) return;
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;
      const isTrip = task.title.toLowerCase().startsWith("công tác") || task.title.toLowerCase().includes("cong tac");

      const { error } = await supabase
        .from("tasks")
        .update({
          approval_stage: "pending_hcns",
          manager_approved_by: currentUser.name,
          manager_approved_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      if (error) throw error;

      alert("Đã xác nhận! Yêu cầu được chuyển sang HCNS để duyệt cuối.\n📧 Email báo HCNS đang được gửi.");
      fetchData();

      // Tra cứu người duyệt cấp 2 + gửi mail: chạy nền
      void (async () => {
        try {
          const { data: perms } = await supabase
            .from("approval_permissions")
            .select("email, can_approve_trip, can_approve_leave");
          const approverEmails = (perms || [])
            .filter((p: any) => (isTrip ? p.can_approve_trip : p.can_approve_leave) && p.email)
            .map((p: any) => p.email)
            .join(", ");
          if (!approverEmails) return;
          sendRequestEmailInBackground(
            {
              mode: "notify_approver",
              stage: "hcns",
              requestType: isTrip ? "trip" : "leave",
              smtpConfig: readSmtpConfig(),
              task: { ...task, manager_approved_by: currentUser.name },
              approverEmails,
              siteUrl: window.location.origin,
            },
            "Chưa gửi được email báo HCNS"
          );
        } catch (mailErr: any) {
          alert(`⚠️ Chưa gửi được email báo HCNS: ${mailErr.message || "lỗi kết nối"}`);
        }
      })();
    } catch (err) {
      console.error(err);
      alert("Lỗi khi xác nhận yêu cầu!");
    }
  };

  // Cấp 1 từ chối luôn (không cần chuyển HCNS) — bắt buộc nhập lý do, gửi email cho người gửi đơn
  const handleCap1Reject = async (taskId: string) => {
    if (!currentUser) return;
    const reason = window.prompt("Nhập lý do từ chối (sẽ được gửi email cho người gửi đơn):") || "";
    if (!reason.trim()) {
      alert("Vui lòng nhập lý do từ chối!");
      return;
    }
    try {
      const task = tasks.find(t => t.id === taskId);
      if (!task) return;

      const { error } = await supabase
        .from("tasks")
        .update({
          status: "need_revision",
          reject_reason: reason.trim(),
          final_decision_by: currentUser.name,
          final_decision_at: new Date().toISOString(),
        })
        .eq("id", taskId);

      if (error) throw error;

      const requesterEmail = employeeDirectory.find(e => e.name === task.assignee)?.email || "";

      alert(`Đã từ chối yêu cầu.${requesterEmail ? "\n📧 Email đang được gửi cho người làm đơn." : ""}`);
      fetchData();

      if (requesterEmail) {
        const isTrip = task.title.toLowerCase().startsWith("công tác") || task.title.toLowerCase().includes("cong tac");
        sendRequestEmailInBackground(
          {
            requestType: isTrip ? "trip" : "leave",
            smtpConfig: readSmtpConfig(),
            task,
            requesterEmail,
            decision: "rejected",
            rejectReason: reason.trim(),
            deciderName: currentUser.name,
          },
          "Chưa gửi được email kết quả"
        );
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi khi từ chối yêu cầu!");
    }
  };

  // Handle Request Leave
  const handleRequestLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName || !modalStart || !modalEnd) {
      alert("Vui lòng điền đầy đủ thông tin!");
      return;
    }

    const duration = leaveDaysCount;
    if (duration <= 0) {
      alert("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu!");
      return;
    }

    let status = "pending_approval";
    let titleStr = `Nghỉ phép (${leaveType}): ${modalName} (${duration} ngày)`;
    let notesStr = modalNotes || "";

    if (duration === 0.5) {
      status = "completed"; // Auto-approved
      titleStr = `Nghỉ phép (${leaveType}): ${modalName} (Nửa ngày ${halfDayPeriod})`;
      notesStr = `Loại nghỉ phép: ${leaveType}. Được duyệt tự động. ${modalNotes ? `Lý do: ${modalNotes}` : ""}`;
    } else {
      if (!selectedApprover) {
        alert("Vui lòng chọn người duyệt!");
        return;
      }
      notesStr = `Loại nghỉ phép: ${leaveType}. Người duyệt: ${selectedApprover}. ${modalNotes ? `Lý do: ${modalNotes}` : ""}`;
    }

    try {
      const { error } = await supabase
        .from("tasks")
        .insert([{
          title: titleStr,
          assignee: modalName,
          start_date: modalStart,
          due_date: modalEnd,
          priority: "Thấp",
          progress: duration === 0.5 ? 100 : 0,
          status: status,
          notes: notesStr,
          approval_stage: duration === 0.5 ? null : "pending_manager"
        }]);

      if (error) throw error;

      // Gửi email xác nhận — chạy nền, không chặn việc nộp đơn nếu gửi mail lỗi
      const taskForEmail = { title: titleStr, assignee: modalName, start_date: modalStart, due_date: modalEnd, notes: notesStr };
      const smtpConfig = readSmtpConfig();
      try {
        if (duration === 0.5) {
          // Nửa ngày: tự động duyệt ngay, vẫn gửi email xác nhận cho người xin nghỉ
          const requesterEmail = employeeDirectory.find(e => e.name === modalName)?.email || "";
          if (requesterEmail) {
            apiFetch("/api/send-request-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                requestType: "leave",
                smtpConfig,
                task: taskForEmail,
                requesterEmail,
                decision: "approved",
                deciderName: "Hệ thống (Tự động duyệt - Nghỉ nửa ngày)",
              }),
            }).catch(e => console.warn("Không gửi được email xác nhận nghỉ nửa ngày:", e));
          }
        } else {
          // Báo email cho người được chọn duyệt cấp 1 (Trưởng/Phó phòng đã chọn trong form)
          const approverEmail = employeeDirectory.find(e => e.name === selectedApprover)?.email || "";
          if (approverEmail) {
            apiFetch("/api/send-request-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "notify_approver",
                stage: "manager",
                requestType: "leave",
                smtpConfig,
                task: taskForEmail,
                approverEmails: approverEmail,
                siteUrl: window.location.origin,
              }),
            }).catch(e => console.warn("Không gửi được email báo người duyệt cấp 1:", e));
          }
        }
      } catch (notifyErr) {
        console.warn("Bỏ qua lỗi gửi email nghỉ phép:", notifyErr);
      }

      // Reset
      setModalStart("2026-06-05");
      setModalEnd("2026-06-05");
      setModalNotes("");
      setIsHalfDay(false);
      setSelectedApprover("");
      setApproverSearch("");
      setShowApproverDropdown(false);
      setLeaveType("Nghỉ phép năm hưởng lương");
      setIsLeaveModalOpen(false);
      fetchData();
      alert(duration === 0.5 ? "Đơn xin nghỉ phép đã được tự động duyệt thành công!" : "Đã gửi đơn xin nghỉ phép chờ Trưởng phòng/Tổ trưởng xác nhận.");
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi xin nghỉ phép: " + (err.message || err));
    }
  };

  // Handle Request Business Trip
  const handleRequestTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName || !modalStart || !modalEnd || !tripDestination || !tripMission) {
      alert("Vui lòng điền đầy đủ thông tin!");
      return;
    }

    const duration = tripDaysCount;
    if (duration <= 0) {
      alert("Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu!");
      return;
    }

    // Đơn công tác đi cùng luồng duyệt với đơn nghỉ phép: chọn đích danh người
    // duyệt cấp 1 thay vì phát tán mail cho mọi quản lý trong phòng.
    if (!selectedApprover) {
      alert("Vui lòng chọn người duyệt!");
      return;
    }

    const tripMetadata = {
      employeeName: modalName,
      employeeRole: currentUser?.role || "Chuyên viên",
      employeeDept: currentUser?.department || "Hành chính nhân sự",
      destination: tripDestination,
      modalStart,
      modalEnd,
      mission: tripMission,
      transport: tripTransport,
      days: duration,
      nights: totalNights,
      hotelRate: hotelRate,
      travelEstimate: tripTravelEstimate,
      otherExpenses: tripOtherExpenses,
      totalAmount: totalTripAmount,
      routes: tripRoutes,
      dateStr: new Date().toLocaleDateString("vi-VN")
    };

    // Construct Markdown notes for the business trip details
    let notesMarkdown = `### THÔNG TIN ĐĂNG KÝ CÔNG TÁC
- **Điểm công tác chính**: ${tripDestination}
- **Phương tiện chính**: ${tripTransport}
- **Nhiệm vụ cụ thể**: ${tripMission}

### LỘ TRÌNH CHI TIẾT
${tripRoutes.map((r, i) => `Chặng ${i + 1}:
  - Từ ${r.from || "Chưa ghi"} đến ${r.to || "Chưa ghi"} (${r.distance ? `${r.distance} km` : "N/A"})
  - Ngày di chuyển: ${r.date ? new Date(r.date).toLocaleDateString("vi-VN") : "N/A"}
  - Phương tiện: ${r.transport || "N/A"}
  - Số đêm lưu trú: ${r.nights} đêm ${r.reason ? `(Lý do: ${r.reason})` : ""}`).join("\n")}

### CHI PHÍ & PHỤ CẤP ĐỀ NGHỊ
- **Phụ cấp công tác phí**: ${formatCurrency(duration * 120000)} (${duration} ngày)
- **Tiền khách sạn (tạm tính)**: ${formatCurrency(totalNights * hotelRate)} (${totalNights} đêm với giá ${formatCurrency(hotelRate)}/đêm)
- **Vé di chuyển (tạm tính)**: ${formatCurrency(tripTravelEstimate)}
- **Chi phí khác**: ${formatCurrency(totalOtherExpenses)}
  ${tripOtherExpenses.map(exp => `  + ${exp.name || "Chi phí không tên"}: ${formatCurrency(exp.amount)} ${exp.notes ? `(${exp.notes})` : ""}`).join("\n")}

---
**TỔNG ĐỀ NGHỊ THANH TOÁN**: ${formatCurrency(totalTripAmount)}

Người duyệt: ${selectedApprover}

<!--METADATA:${JSON.stringify(tripMetadata)}-->`;

    const tripTitle = `Công tác: ${modalName} - ${tripDestination} (${duration} ngày)`;

    try {
      const { error } = await supabase
        .from("tasks")
        .insert([{
          title: tripTitle,
          assignee: modalName,
          start_date: modalStart,
          due_date: modalEnd,
          priority: "Trung bình",
          progress: 0,
          status: "pending_approval",
          notes: notesMarkdown,
          approval_stage: "pending_manager"
        }]);

      if (error) throw error;

      // Báo email cho người duyệt cấp 1: tổ trưởng nhóm duyệt riêng (nếu người gửi
      // thuộc nhóm trong bảng approval_groups, VD tổ Marketing) hoặc
      // Trưởng/Phó phòng cùng phòng ban với người đăng ký — chạy nền, không chặn việc gửi đơn
      try {
        let approverEmails = "";
        const groupLeaderName = getGroupLeaderNameForMember(modalName);
        if (groupLeaderName) {
          approverEmails = employeeDirectory
            .filter(e => e.name.trim().toLowerCase() === groupLeaderName.trim().toLowerCase())
            .map(e => e.email)
            .filter(Boolean)
            .join(", ");
        } else {
          // Gửi đúng người được chọn ở ô "Người duyệt" — giống hệt đơn nghỉ phép.
          // Trước đây đơn công tác phát tán mail cho MỌI quản lý trong phòng, nên
          // không ai biết rõ trách nhiệm thuộc về ai và người xin cũng không chọn được.
          approverEmails = employeeDirectory
            .filter(e => e.name.trim().toLowerCase() === selectedApprover.trim().toLowerCase())
            .map(e => e.email)
            .filter(Boolean)
            .join(", ");
        }

        if (approverEmails) {
          apiFetch("/api/send-request-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: "notify_approver",
              stage: "manager",
              requestType: "trip",
              smtpConfig: readSmtpConfig(),
              task: { title: tripTitle, assignee: modalName, start_date: modalStart, due_date: modalEnd, notes: notesMarkdown },
              approverEmails,
              siteUrl: window.location.origin,
            }),
          }).catch(e => console.warn("Không gửi được email báo người duyệt cấp 1 (công tác):", e));
        }
      } catch (notifyErr) {
        console.warn("Bỏ qua lỗi gửi email báo duyệt cấp 1 (công tác):", notifyErr);
      }

      // Reset states
      setTripDestination("");
      setTripTransport("🚗 Xe công ty");
      setTripMission("");
      setTripRoutes([
        { from: "TPHCM", to: "", distance: "", date: "2026-06-05", transport: "Xe công ty", nights: 0, reason: "" }
      ]);
      setTripTravelEstimate(0);
      setTripOtherExpenses([]);
      setModalStart("2026-06-05");
      setModalEnd("2026-06-05");
      setModalNotes("");
      // Xoá lựa chọn người duyệt để lần mở modal sau lấy lại đề xuất theo phòng ban
      // (state này dùng chung với đơn nghỉ phép).
      setSelectedApprover("");
      setIsTripModalOpen(false);
      fetchData();
      alert("Đã đăng ký lịch đi công tác thành công! Đang chờ Trưởng phòng/Tổ trưởng xác nhận.");
    } catch (err: any) {
      console.error(err);
      alert("Lỗi khi đăng ký đi công tác: " + (err.message || err));
    }
  };

  const handleRouteChange = (idx: number, field: keyof RouteSegment, value: any) => {
    const updated = tripRoutes.map((r, i) => {
      if (i === idx) {
        return { ...r, [field]: value };
      }
      return r;
    });
    setTripRoutes(updated);
  };

  const handleAddRoute = () => {
    setTripRoutes([
      ...tripRoutes,
      { from: "", to: "", distance: "", date: modalStart || "2026-06-05", transport: tripTransport || "Xe công ty", nights: 0, reason: "" }
    ]);
  };

  const handleRemoveRoute = (idx: number) => {
    if (tripRoutes.length === 1) return;
    setTripRoutes(tripRoutes.filter((_, i) => i !== idx));
  };

  const handleAddOtherExpense = () => {
    setTripOtherExpenses([
      ...tripOtherExpenses,
      { name: "", amount: 0, notes: "" }
    ]);
  };

  const handleOtherExpenseChange = (idx: number, field: keyof OtherExpense, value: any) => {
    const updated = tripOtherExpenses.map((exp, i) => {
      if (i === idx) {
        return { ...exp, [field]: value };
      }
      return exp;
    });
    setTripOtherExpenses(updated);
  };

  const handleRemoveOtherExpense = (idx: number) => {
    setTripOtherExpenses(tripOtherExpenses.filter((_, i) => i !== idx));
  };

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setIsDetailsModalOpen(true);
  };

  const handleDownloadReport = async (task: Task, type: 'payment' | 'trip') => {
    if (!task.notes) {
      alert("Đơn công tác này không có dữ liệu chi phí!");
      return;
    }

    let metadata: any = null;
    const metaMatch = task.notes.match(/<!--METADATA:(.*?)-->/);
    if (metaMatch) {
      try {
        metadata = JSON.parse(metaMatch[1]);
      } catch (e) {
        console.error("Error parsing task metadata JSON:", e);
      }
    }

    // Fallback metadata for old tasks
    if (!metadata) {
      const days = task.start_date && task.due_date 
        ? Math.max(1, Math.round((new Date(task.due_date).getTime() - new Date(task.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
        : 1;
      const nights = days >= 2 ? days - 1 : 0;
      const hotelRate = 350000;
      
      let destination = "Tây Ninh";
      const destMatch = task.notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
      if (destMatch) destination = destMatch[1].trim();
      
      let transport = "🚗 Xe công ty";
      const transMatch = task.notes.match(/-\s+\*\*Phương tiện chính\*\*:\s*(.*)/i);
      if (transMatch) transport = transMatch[1].trim();

      let mission = "Công tác";
      const missionMatch = task.notes.match(/-\s+\*\*Nhiệm vụ cụ thể\*\*:\s*(.*)/i);
      if (missionMatch) mission = missionMatch[1].trim();

      const totalAmount = days * 120000 + nights * hotelRate;

      metadata = {
        employeeName: task.assignee || "Người dùng",
        employeeRole: "Chuyên viên",
        employeeDept: "Hành chính nhân sự",
        destination,
        modalStart: task.start_date || new Date().toISOString(),
        modalEnd: task.due_date || new Date().toISOString(),
        mission,
        transport,
        days,
        nights,
        hotelRate,
        travelEstimate: 0,
        otherExpenses: [],
        totalAmount,
        routes: [
          {
            from: "TPHCM",
            to: destination,
            distance: "",
            date: task.start_date || new Date().toISOString(),
            transport,
            nights,
            reason: ""
          }
        ],
        dateStr: task.start_date ? new Date(task.start_date).toLocaleDateString("vi-VN") : new Date().toLocaleDateString("vi-VN")
      };
    }

    try {
      // 1. Try downloading from the API (which uses their original template docx files) with cache busting.
      // Send the session token so the API can read the task through RLS.
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session?.access_token) headers["x-supabase-auth"] = session.access_token;

      const response = await apiFetch(`/api/export-template?taskId=${task.id}&type=${type}&t=${Date.now()}`, { headers });
      
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const outputFilename = type === "payment" 
          ? `Phieu_De_Nghi_Thanh_Toan_${(metadata.employeeName || "User").replace(/\s+/g, "_")}.docx`
          : `Phieu_Di_Cong_Tac_${(metadata.employeeName || "User").replace(/\s+/g, "_")}.docx`;
          
        a.href = url;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return;
      }

      // Check if it's a template not found error
      const errData = await response.json().catch(() => ({}));
      if (errData.error === "template_not_found") {
        alert(
          `Hệ thống chưa tìm thấy file template gốc: "${errData.fileName}" trong thư mục "dashboard/public/templates/".\n\n` +
          `Vui lòng upload/sao chép file template gốc của anh vào thư mục đó.\n\n` +
          `Để tránh gián đoạn công việc, hệ thống sẽ tự động tải xuống file Word mẫu do hệ thống tự dựng làm phương án tạm thời!`
        );
      } else {
        alert("Lỗi khi kết nối đến API xuất bản biểu mẫu. Hệ thống sẽ tải về file Word mẫu tạm thời!");
      }

      // 2. Fallback to generating and downloading the styled HTML-Doc file
      if (type === 'payment') {
        const html = exportPhieuThanhToan(metadata);
        downloadDocFile(html, `Phieu_De_Nghi_Thanh_Toan_${(metadata.employeeName || "User").replace(/\s+/g, "_")}`);
      } else {
        const html = exportPhieuCongTac(metadata);
        downloadDocFile(html, `Phieu_Di_Cong_Tac_${(metadata.employeeName || "User").replace(/\s+/g, "_")}`);
      }

    } catch (err) {
      console.error(err);
      alert("Có lỗi xảy ra khi tải biểu mẫu!");
    }
  };

  // Helper to extract clean destination or department from task notes metadata
  const getCleanLocation = (notes: string) => {
    if (!notes) return "Hồ Chí Minh";
    const metaMatch = notes.match(/<!--METADATA:(.*?)-->/);
    if (metaMatch) {
      try {
        const metadata = JSON.parse(metaMatch[1]);
        if (metadata.destination) return metadata.destination;
      } catch (e) {
        // ignore
      }
    }
    // Fallback if notes contains markdown
    if (notes.includes("### THÔNG TIN ĐĂNG KÝ CÔNG TÁC")) {
      const match = notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
      if (match) return match[1].trim();
    }
    return notes.length > 50 ? notes.substring(0, 50) + "..." : notes;
  };

  const getCleanDept = (notes: string) => {
    if (!notes) return "Hành chính nhân sự";
    const metaMatch = notes.match(/<!--METADATA:(.*?)-->/);
    if (metaMatch) {
      try {
        const metadata = JSON.parse(metaMatch[1]);
        if (metadata.employeeDept) return metadata.employeeDept;
      } catch (e) {
        // ignore
      }
    }
    if (notes.includes("Người duyệt:")) {
      const parts = notes.split("Lý do:");
      if (parts[1]) return "Lý do: " + parts[1].trim();
      return "Nghỉ phép chờ duyệt";
    }
    return notes.length > 50 ? notes.substring(0, 50) + "..." : notes;
  };

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Lịch công việc" subtitle="Theo dõi lịch trình công việc, nghỉ phép và đi công tác của nhân sự" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto flex flex-col">
          {/* Top filter bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/50 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              {/* Search input */}
              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Tìm kiếm công việc..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 hover:bg-slate-100/60 focus:bg-white text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              </div>

              {/* Priority Filter */}
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <span className="text-slate-400">ĐỘ ƯU TIÊN:</span>
                <div className="flex gap-1.5">
                  {[
                    { name: "Khẩn cấp", color: "bg-red-50 text-red-700 border-red-200" },
                    { name: "Cao", color: "bg-orange-50 text-orange-700 border-orange-200" },
                    { name: "Trung bình", color: "bg-amber-50 text-amber-700 border-amber-200" },
                    { name: "Thấp", color: "bg-blue-50 text-blue-700 border-blue-200" },
                  ].map(p => {
                    const isActive = selectedPriorities.includes(p.name);
                    return (
                      <button
                        key={p.name}
                        onClick={() => togglePriority(p.name)}
                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-bold cursor-pointer transition-all ${
                          isActive 
                            ? `${p.color} ring-2 ring-blue-500/20` 
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Member avatar filter */}
            <div className="flex items-center gap-3 border-t border-slate-100 pt-3 overflow-x-auto">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">THÀNH VIÊN:</span>
              <button
                onClick={() => setSelectedMember("Tất cả")}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer transition-all border ${
                  selectedMember === "Tất cả"
                    ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                    : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200/50"
                }`}
              >
                Tất cả
              </button>
              {employees
                .filter(emp => !currentUser || isManager || emp.name.toLowerCase() === currentUser.name.toLowerCase())
                .slice(0, 8)
                .map(emp => {
                const isActive = selectedMember === emp.name;
                return (
                  <button
                    key={emp.id}
                    onClick={() => setSelectedMember(emp.name)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold cursor-pointer transition-all border ${
                      isActive
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[8px]">
                      {emp.avatar}
                    </span>
                    {emp.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar and Sidebar Grid */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
            
            {/* Left Calendar view */}
            <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-200/50 shadow-sm flex flex-col space-y-4">
              
              {/* Calendar control bar */}
              <div className="flex items-center justify-between">
                <h2 className="font-heading font-extrabold text-base text-slate-800 tracking-tight">
                  {monthTitle}
                </h2>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsLeaveModalOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[10px] font-bold rounded-xl transition-all cursor-pointer"
                  >
                    🌴 Xin nghỉ phép
                  </button>
                  <button
                    onClick={() => setIsTripModalOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-[10px] font-bold rounded-xl transition-all cursor-pointer"
                  >
                    💼 Đi công tác
                  </button>
                  <button
                    className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-all border border-slate-200/40"
                    title="Cấu hình lịch"
                  >
                    <Settings size={14} />
                  </button>
                  
                  <div className="h-4 w-px bg-slate-200 mx-1" />
                  
                  <button
                    onClick={handleToday}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-[10px] font-bold rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
                  >
                    Hôm nay
                  </button>
                  
                  <div className="flex items-center bg-slate-100 border border-slate-200/80 p-0.5 rounded-xl">
                    <button
                      onClick={handlePrevMonth}
                      className="p-1 hover:bg-white hover:shadow-sm text-slate-600 rounded-lg transition-all cursor-pointer"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      onClick={handleNextMonth}
                      className="p-1 hover:bg-white hover:shadow-sm text-slate-600 rounded-lg transition-all cursor-pointer"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Calendar grid container */}
              <div className="flex-1 flex flex-col min-h-[500px]">
                {/* Week days labels */}
                <div className="grid grid-cols-7 border-b border-slate-100 pb-2.5 text-center">
                  {["THỨ 2", "THỨ 3", "THỨ 4", "THỨ 5", "THỨ 6", "THỨ 7", "CHỦ NHẬT"].map((day, idx) => (
                    <span 
                      key={day} 
                      className={`text-[9px] font-extrabold tracking-widest ${
                        idx >= 5 ? "text-amber-500" : "text-slate-400"
                      }`}
                    >
                      {day}
                    </span>
                  ))}
                </div>

                {/* Days cells grid */}
                {loading ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <Loader2 className="animate-spin text-blue-600" size={28} />
                    <p className="text-xs font-semibold">Đang tải lịch trình...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-7 grid-rows-5 flex-1 border-l border-t border-slate-100">
                    {calendarCells.map((cell, idx) => {
                      const dayTasks = getTasksForDate(cell.date);
                      const isToday = cell.date.toDateString() === new Date().toDateString();
                      
                      return (
                        <div
                          key={idx}
                          className={`min-h-[100px] border-r border-b border-slate-100 p-2 flex flex-col space-y-1.5 transition-all ${
                            cell.isCurrentMonth ? "bg-white" : "bg-slate-50/50 text-slate-350"
                          } ${isToday ? "bg-blue-50/30 ring-1 ring-blue-500/10" : ""}`}
                        >
                          {/* Day number */}
                          <div className="flex items-center justify-between">
                            <span 
                              className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${
                                isToday 
                                  ? "bg-blue-600 text-white shadow"
                                  : cell.isCurrentMonth ? "text-slate-800" : "text-slate-400"
                              }`}
                            >
                              {cell.dayNumber}
                            </span>
                            {dayTasks.length > 0 && (
                              <span className="text-[8px] font-extrabold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {dayTasks.length} việc
                              </span>
                            )}
                          </div>

                          {/* Cell tasks lists */}
                          <div className="flex-1 space-y-1 overflow-y-auto max-h-[85px] scrollbar-thin">
                             {dayTasks.map(t => {
                              const isLeave = t.title.toLowerCase().startsWith("nghỉ phép");
                              const isTrip = t.title.toLowerCase().startsWith("công tác");
                              const taskOverdue = t.due_date && t.status !== "completed" && t.progress < 100 && t.due_date < new Date().toLocaleDateString("en-CA");

                              let styleClass = "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100/50";
                              if (taskOverdue) {
                                styleClass = "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/70 font-bold ring-1 ring-rose-500/20";
                              } else if (isLeave) {
                                styleClass = "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100/50 font-semibold";
                              } else if (isTrip) {
                                styleClass = "bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100/50 font-semibold";
                              } else if (t.priority === "Khẩn cấp") {
                                styleClass = "bg-red-50 text-red-700 border-red-100 hover:bg-red-100/50";
                              } else if (t.priority === "Cao") {
                                styleClass = "bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100/50";
                              } else if (t.priority === "Trung bình") {
                                styleClass = "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100/50";
                              }

                              return (
                                <div
                                  key={t.id}
                                  title={`${t.title} - ${t.assignee} (${t.progress}%)`}
                                  onClick={() => handleTaskClick(t)}
                                  className={`px-1.5 py-1 rounded text-[8px] border leading-tight truncate cursor-pointer transition-all ${styleClass}`}
                                >
                                  {taskOverdue && "⚠️ "}{isLeave ? "🌴" : isTrip ? "💼" : ""} {t.title.replace(/^Nghỉ phép:\s*|^Công tác:\s*/i, "")}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Sidebar list */}
            <div className="bg-white rounded-2xl border border-slate-200/50 shadow-sm p-4 flex flex-col space-y-4">
              {/* Approval Queue Section */}
              {pendingApprovals.length > 0 && (
                <div className="space-y-2.5 border-b border-slate-100 pb-4">
                  <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider block">📥 Chờ bạn xác nhận - Cấp 1 ({pendingApprovals.length})</span>
                  <div className="space-y-2">
                    {pendingApprovals.map(t => (
                      <div key={t.id} className="p-3 bg-indigo-50/30 border border-indigo-100 rounded-xl space-y-2 text-left">
                        <p className="font-heading font-bold text-xs text-indigo-900 leading-snug">{t.title}</p>
                        <p className="text-[9px] text-indigo-600 font-semibold leading-relaxed">
                          Nhân sự: <span className="font-bold text-slate-800">{t.assignee}</span> <br />
                          Thời gian: {t.start_date ? new Date(t.start_date).toLocaleDateString("vi-VN") : ""} ➔ {t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN") : ""}
                        </p>
                        <p className="text-[8px] text-indigo-400 font-semibold leading-relaxed">Xác nhận xong sẽ tự động chuyển sang HCNS duyệt cuối.</p>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleCap1Confirm(t.id)}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-bold rounded-lg cursor-pointer transition-colors text-center active:scale-95"
                          >
                            Xác nhận
                          </button>
                          <button
                            onClick={() => handleCap1Reject(t.id)}
                            className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-bold rounded-lg cursor-pointer transition-colors text-center active:scale-95"
                          >
                            Từ chối
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="grid grid-cols-3 bg-slate-100 p-0.5 rounded-xl text-center text-[10px] font-bold">
                <button
                  onClick={() => setActiveTab('nodate')}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    activeTab === 'nodate' 
                      ? "bg-white text-slate-800 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Chưa hạn ({tasksWithoutDate.length})
                </button>
                <button
                  onClick={() => setActiveTab('leave')}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    activeTab === 'leave' 
                      ? "bg-white text-slate-800 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Nghỉ phép ({leaveTasks.length})
                </button>
                <button
                  onClick={() => setActiveTab('trip')}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    activeTab === 'trip' 
                      ? "bg-white text-slate-800 shadow-sm" 
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Công tác ({tripTasks.length})
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin">
                {activeTab === 'nodate' && (
                  <div className="space-y-3">
                    <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex gap-2">
                      <AlertCircle className="text-rose-500 shrink-0" size={16} />
                      <div className="text-[10px] leading-relaxed">
                        <span className="font-bold text-rose-800 block">🚨 CHƯA CÓ NGÀY HẠN</span>
                        <span className="text-rose-600 font-medium">
                          Danh sách công việc chưa được thiết lập deadline. Hãy nhấp để mở rộng và cấu hình hạn hoàn thành.
                        </span>
                      </div>
                    </div>
                    {tasksWithoutDate.map(t => (
                      <div
                        key={t.id}
                        onClick={() => handleTaskClick(t)}
                        className="p-3 bg-white border border-slate-200/80 rounded-xl hover-elevate shadow-sm space-y-1.5 text-left cursor-pointer hover:shadow-md transition-all"
                      >
                        <p className="font-heading font-semibold text-xs text-slate-800 line-clamp-2">{t.title}</p>
                        <div className="flex items-center justify-between text-[9px] text-slate-400">
                          <span className="font-semibold text-slate-500 flex items-center gap-1"><User size={9} /> {t.assignee}</span>
                          <span className={`badge text-[8px] font-bold ${
                            t.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"
                          }`}>
                            {t.status === "completed" ? "Đã xong" : "Kế hoạch"}
                          </span>
                        </div>
                      </div>
                    ))}
                    {tasksWithoutDate.length === 0 && (
                      <p className="text-center text-slate-400 text-xs italic py-10">Tất cả việc đều đã có hạn</p>
                    )}
                  </div>
                )}

                {activeTab === 'leave' && (
                  <div className="space-y-3">
                    {leaveTasks.map(t => (
                      <div
                        key={t.id}
                        onClick={() => handleTaskClick(t)}
                        className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl space-y-1.5 text-left cursor-pointer hover:shadow-md transition-all"
                      >
                        <p className="font-heading font-bold text-xs text-emerald-800">🌴 {t.title.replace(/^Nghỉ phép:\s*/i, "")}</p>
                        <div className="flex items-center justify-between text-[9px] text-emerald-600 font-semibold">
                          <span>Phòng ban/Lý do: {getCleanDept(t.notes || "")}</span>
                          <span>Hạn: {t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN") : "N/A"}</span>
                        </div>
                      </div>
                    ))}
                    {leaveTasks.length === 0 && (
                      <p className="text-center text-slate-400 text-xs italic py-10">Không có lịch nghỉ phép nào</p>
                    )}
                  </div>
                )}

                {activeTab === 'trip' && (
                  <div className="space-y-3">
                    {tripTasks.map(t => (
                      <div
                        key={t.id}
                        onClick={() => handleTaskClick(t)}
                        className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl space-y-1.5 text-left cursor-pointer hover:shadow-md transition-all"
                      >
                        <p className="font-heading font-bold text-xs text-indigo-800">💼 {t.title.replace(/^Công tác:\s*/i, "")}</p>
                        <div className="flex items-center justify-between text-[9px] text-indigo-600 font-semibold">
                          <span>Địa điểm: {getCleanLocation(t.notes || "")}</span>
                          <span>Hạn: {t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN") : "N/A"}</span>
                        </div>
                      </div>
                    ))}
                    {tripTasks.length === 0 && (
                      <p className="text-center text-slate-400 text-xs italic py-10">Không có lịch đi công tác nào</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Xin nghỉ phép modal */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🌴</span>
                <h3 className="font-heading font-extrabold text-sm text-slate-800">Xin nghỉ phép</h3>
              </div>
              <button type="button" onClick={() => setIsLeaveModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRequestLeave} className="space-y-4 text-xs font-semibold text-slate-700">
              {/* Chọn loại nghỉ phép */}
              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] font-bold">Loại nghỉ phép <span className="text-rose-500">*</span></label>
                <select
                  value={leaveType}
                  onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white font-semibold text-slate-800 text-xs cursor-pointer"
                >
                  <option value="Nghỉ phép năm hưởng lương">Nghỉ phép năm hưởng lương</option>
                  <option value="Nghỉ việc riêng không hưởng lương">Nghỉ việc riêng không hưởng lương</option>
                  <option value="Nghỉ việc riêng hưởng nguyên lương">Nghỉ việc riêng hưởng nguyên lương (Hiếu hỷ...)</option>
                  <option value="Nghỉ ốm đau hưởng BHXH">Nghỉ ốm đau hưởng BHXH</option>
                  <option value="Nghỉ thai sản hưởng BHXH">Nghỉ thai sản hưởng BHXH</option>
                  <option value="Nghỉ tai nạn lao động hưởng BHXH">Nghỉ tai nạn lao động hưởng BHXH</option>
                  <option value="Nghỉ chế độ khác">Nghỉ chế độ khác</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-500 text-[11px] font-bold">Ngày bắt đầu <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={modalStart}
                    onChange={(e) => setModalStart(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800 text-xs bg-slate-50/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 text-[11px] font-bold">Ngày kết thúc <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={modalEnd}
                    onChange={(e) => setModalEnd(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800 text-xs bg-slate-50/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] font-bold">Số ngày nghỉ</label>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-indigo-600 tracking-tight">{leaveDaysCount}</span>
                  <span className="text-xs font-semibold text-slate-500">ngày</span>
                </div>
              </div>

              {isSingleDay && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsHalfDay(false)}
                    className={`py-3 px-4 font-bold rounded-xl border text-center transition-all cursor-pointer text-xs ${
                      !isHalfDay
                        ? "border-indigo-600 bg-indigo-50/40 text-indigo-600 shadow-sm shadow-indigo-500/5"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Cả ngày (1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHalfDay(true)}
                    className={`py-3 px-4 font-bold rounded-xl border text-center transition-all cursor-pointer text-xs ${
                      isHalfDay
                        ? "border-indigo-600 bg-indigo-50/40 text-indigo-600 shadow-sm shadow-indigo-500/5"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                    }`}
                  >
                    Nửa ngày (0.5)
                  </button>
                </div>
              )}

              {isSingleDay && isHalfDay && (
                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-slate-500 text-[11px] font-bold">Chọn buổi nghỉ</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setHalfDayPeriod("Sáng")}
                      className={`py-2 px-3 font-semibold rounded-xl border text-center transition-all cursor-pointer text-[11px] ${
                        halfDayPeriod === "Sáng"
                          ? "border-indigo-500 bg-indigo-50/40 text-indigo-600 shadow-sm"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      Sáng
                    </button>
                    <button
                      type="button"
                      onClick={() => setHalfDayPeriod("Chiều")}
                      className={`py-2 px-3 font-semibold rounded-xl border text-center transition-all cursor-pointer text-[11px] ${
                        halfDayPeriod === "Chiều"
                          ? "border-indigo-500 bg-indigo-50/40 text-indigo-600 shadow-sm"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      Chiều
                    </button>
                  </div>
                </div>
              )}

              {leaveDaysCount === 0.5 && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-2 text-emerald-700 animate-in fade-in duration-200">
                  <span className="text-sm font-bold">✓</span>
                  <span className="text-[10px] font-bold">Đơn nghỉ nửa ngày sẽ được tự động duyệt ngay lập tức.</span>
                </div>
              )}

              {leaveDaysCount >= 1 && (
                <div className="space-y-1.5 animate-in fade-in duration-200" ref={approverPickerRef}>
                  <label className="text-slate-500 text-[11px] font-bold">
                    {/* Nhãn suy ra từ BẢNG leave_exceptions, không so tên cứng.
                        Trước đây viết thẳng "hằng"/"quyên" trong điều kiện — sót lại
                        sau đợt chuyển đặc cách sang bảng dữ liệu, nên đổi người đặc
                        cách trong Cài đặt thì nhãn vẫn hiện sai. */}
                    {leaveDaysCount === 1 && getLeaveExceptionApproversForAssignee(modalName).length > 0
                      ? "Người duyệt (Phó phòng) *"
                      : "Người duyệt (Trưởng phòng) *"}
                  </label>
                  <div className="relative">
                    <div className="relative">
                      <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        required
                        value={showApproverDropdown ? approverSearch : selectedApprover}
                        onFocus={() => { setShowApproverDropdown(true); setApproverSearch(""); }}
                        onChange={(e) => setApproverSearch(e.target.value)}
                        placeholder="Tìm tên người duyệt..."
                        className="w-full pl-8 pr-3 border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white font-semibold text-slate-800 text-xs"
                      />
                    </div>
                    {showApproverDropdown && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-20 max-h-48 overflow-y-auto animate-in fade-in duration-150">
                        {filteredApproverOptions.length === 0 ? (
                          <p className="text-center text-slate-400 text-[11px] italic py-3">Không tìm thấy người phù hợp.</p>
                        ) : (
                          filteredApproverOptions.map(m => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => { setSelectedApprover(m.name); setShowApproverDropdown(false); setApproverSearch(""); }}
                              className={`w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer text-xs ${m.name === selectedApprover ? "bg-indigo-50/60" : ""}`}
                            >
                              <span className="font-bold text-slate-700 truncate">{m.name}</span>
                              <span className="flex items-center gap-1.5 shrink-0">
                                {m.name === recommendedApprover && (
                                  <span className="text-[8px] font-extrabold text-indigo-500 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">ĐỀ XUẤT</span>
                                )}
                                <span className="text-[10px] text-slate-400">{m.role}</span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {recommendedApprover && selectedApprover === recommendedApprover && (
                    <p className="text-[10px] text-indigo-400 font-semibold">💡 Tự động chọn theo phòng ban: {currentUser?.department}</p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] font-bold">Lý do</label>
                <textarea
                  placeholder="Nhập lý do nghỉ phép (không bắt buộc)..."
                  value={modalNotes}
                  onChange={(e) => setModalNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800 text-xs placeholder:text-slate-400 bg-white resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="flex-1 py-2.5 bg-indigo-50/60 hover:bg-slate-150 border border-slate-100 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs text-center"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-md shadow-indigo-500/10 text-xs text-center"
                >
                  Gửi đơn nghỉ phép
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Đi công tác modal */}
      {isTripModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto scrollbar-thin">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">💼</span>
                <h3 className="font-heading font-extrabold text-sm text-slate-800">Đăng ký lịch đi công tác</h3>
              </div>
              <button type="button" onClick={() => setIsTripModalOpen(false)} className="text-slate-400 hover:text-slate-650 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleRequestTrip} className="space-y-4 text-xs font-semibold text-slate-700">
              
              {/* Row 1 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-slate-500 text-[11px] font-bold">Điểm công tác chính <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    required
                    value={tripDestination}
                    onChange={(e) => setTripDestination(e.target.value)}
                    placeholder="Ví dụ: Vũng Tàu, Tây Ninh"
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 text-[11px] font-bold">Phương tiện chính <span className="text-rose-500">*</span></label>
                  <select
                    required
                    value={tripTransport}
                    onChange={(e) => setTripTransport(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white font-semibold text-slate-800 text-xs"
                  >
                    <option value="🚗 Xe công ty">🚗 Xe công ty</option>
                    <option value="✈️ Máy bay">✈️ Máy bay</option>
                    <option value="🚄 Tàu hỏa">🚄 Tàu hỏa</option>
                    <option value="🚌 Xe khách">🚌 Xe khách</option>
                    <option value="🚗 Taxi / Grab">🚗 Taxi / Grab</option>
                    <option value="🏍️ Xe máy">🏍️ Xe máy</option>
                  </select>
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-3 gap-4 items-end">
                <div className="space-y-1.5">
                  <label className="text-slate-500 text-[11px] font-bold">Từ ngày <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={modalStart}
                    onChange={(e) => setModalStart(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800 text-xs bg-slate-50/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-slate-500 text-[11px] font-bold">Đến ngày <span className="text-rose-500">*</span></label>
                  <input
                    type="date"
                    required
                    value={modalEnd}
                    onChange={(e) => setModalEnd(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800 text-xs bg-slate-50/50"
                  />
                </div>
                <div className="pb-1.5">
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl py-2 px-3 flex items-center gap-1.5 text-indigo-700 text-[11px] font-extrabold shadow-sm shadow-indigo-500/5">
                    <span>⚡</span>
                    <span>{tripDaysCount} ngày công tác</span>
                  </div>
                </div>
              </div>

              {/* Row 3 */}
              <div className="space-y-1.5">
                <label className="text-slate-500 text-[11px] font-bold">Nhiệm vụ công tác cụ thể <span className="text-rose-500">*</span></label>
                <textarea
                  required
                  placeholder="Ví dụ: Quay chụp ảnh cao tốc Châu Đốc, làm việc với chủ đầu tư..."
                  value={tripMission}
                  onChange={(e) => setTripMission(e.target.value)}
                  rows={2}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 font-semibold text-slate-800 text-xs placeholder:text-slate-400 bg-white resize-none"
                />
              </div>

              {/* Dynamic Route segments */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-slate-850 text-[11px] uppercase tracking-wider">
                    <Compass size={14} className="text-indigo-600" /> Lộ trình chi tiết (Các chặng đi)
                  </span>
                  <button
                    type="button"
                    onClick={handleAddRoute}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    + Thêm chặng đi
                  </button>
                </div>

                <div className="space-y-3">
                  {tripRoutes.map((route, idx) => (
                    <div key={idx} className="p-3.5 bg-slate-50/50 border border-slate-100 rounded-xl space-y-3.5 relative">
                      {tripRoutes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveRoute(idx)}
                          className="absolute top-2 right-2 text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
                          title="Xóa chặng đi"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}

                      {/* Sub-row 1 */}
                      <div className="grid grid-cols-4 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-450 font-bold uppercase">Nơi đi</label>
                          <input
                            type="text"
                            required
                            value={route.from}
                            onChange={(e) => handleRouteChange(idx, "from", e.target.value)}
                            placeholder="TPHCM"
                            className="w-full border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-[11px] text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-450 font-bold uppercase">Nơi đến</label>
                          <input
                            type="text"
                            required
                            value={route.to}
                            onChange={(e) => handleRouteChange(idx, "to", e.target.value)}
                            placeholder="VD: Tây Ninh"
                            className="w-full border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-[11px] text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-450 font-bold uppercase">Độ dài (KM)</label>
                          <input
                            type="text"
                            value={route.distance}
                            onChange={(e) => handleRouteChange(idx, "distance", e.target.value)}
                            placeholder="Auto"
                            className="w-full border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-[11px] text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-450 font-bold uppercase">Ngày đi</label>
                          <input
                            type="date"
                            required
                            value={route.date}
                            onChange={(e) => handleRouteChange(idx, "date", e.target.value)}
                            className="w-full border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-[11px] text-slate-800"
                          />
                        </div>
                      </div>

                      {/* Sub-row 2 */}
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-455 font-bold uppercase">Phương tiện</label>
                          <input
                            type="text"
                            value={route.transport}
                            onChange={(e) => handleRouteChange(idx, "transport", e.target.value)}
                            placeholder="Xe công ty"
                            className="w-full border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-[11px] text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-455 font-bold uppercase">Số đêm lưu trú</label>
                          <input
                            type="number"
                            required
                            min={0}
                            value={route.nights}
                            onChange={(e) => handleRouteChange(idx, "nights", Number(e.target.value) || 0)}
                            className="w-full border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-[11px] text-slate-800"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-455 font-bold uppercase">Lý do lưu trú</label>
                          <input
                            type="text"
                            value={route.reason}
                            onChange={(e) => handleRouteChange(idx, "reason", e.target.value)}
                            placeholder="VD: Qua đêm..."
                            className="w-full border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-medium text-[11px] text-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Allowance and hotel config */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <span className="flex items-center gap-1.5 font-bold text-slate-850 text-[11px] uppercase tracking-wider">
                  <Coins size={14} className="text-indigo-600" /> Chi phí và Phụ cấp công tác
                </span>

                <div className="grid grid-cols-3 gap-3">
                  {/* Phụ cấp phí */}
                  <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-[9px] text-slate-450 font-bold uppercase block">Phụ cấp công tác phí</span>
                    <span className="text-[11px] font-black text-indigo-600 block">120.000đ/ngày</span>
                    <span className="text-[9px] text-slate-500 block leading-tight">Thành tiền = {formatCurrency(tripDaysCount * 120000)}</span>
                  </div>

                  {/* Tiền khách sạn */}
                  <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-1">
                    <span className="text-[9px] text-slate-450 font-bold uppercase block">Giá lưu trú Ks / đêm</span>
                    <select
                      value={hotelRate}
                      onChange={(e) => setHotelRate(Number(e.target.value))}
                      className="w-full border border-slate-200 rounded-lg p-1 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-semibold text-[11px] text-slate-800 cursor-pointer"
                    >
                      <option value={350000}>350.000 VNĐ / đêm</option>
                      <option value={400000}>400.000 VNĐ / đêm</option>
                      <option value={450000}>450.000 VNĐ / đêm</option>
                      <option value={500000}>500.000 VNĐ / đêm</option>
                      <option value={550000}>550.000 VNĐ / đêm</option>
                      <option value={600000}>600.000 VNĐ / đêm</option>
                    </select>
                    <span className="text-[9px] text-slate-500 block leading-tight pt-0.5">
                      Thành tiền ({totalNights} đêm) = {formatCurrency(totalNights * hotelRate)}
                    </span>
                  </div>

                  {/* Di chuyển tạm tính */}
                  <div className="p-3 bg-slate-50/50 border border-slate-100 rounded-xl space-y-1">
                    <label className="text-[9px] text-slate-450 font-bold uppercase block leading-tight">Vé tàu hỏa / xe / di chuyển (Tạm tính)</label>
                    <input
                      type="number"
                      min={0}
                      value={tripTravelEstimate}
                      onChange={(e) => setTripTravelEstimate(Number(e.target.value) || 0)}
                      className="w-full border border-slate-200 rounded-lg p-1 outline-none focus:ring-1 focus:ring-indigo-500 bg-white font-semibold text-[11px] text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Other expenses dynamic */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold text-slate-850 text-[11px] uppercase tracking-wider">
                    <FileText size={14} className="text-indigo-600" /> Hóa đơn & Chi phí khác đề nghị thanh toán
                  </span>
                  <button
                    type="button"
                    onClick={handleAddOtherExpense}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    + Thêm chi phí khác
                  </button>
                </div>

                {tripOtherExpenses.length > 0 && (
                  <div className="space-y-2">
                    {tripOtherExpenses.map((exp, idx) => (
                      <div key={idx} className="flex gap-2 items-center bg-slate-50/30 p-2 border border-slate-100 rounded-xl relative animate-in fade-in duration-100">
                        <input
                          type="text"
                          required
                          value={exp.name}
                          onChange={(e) => handleOtherExpenseChange(idx, "name", e.target.value)}
                          placeholder="Tên chi phí"
                          className="flex-2 border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-[11px] font-medium text-slate-800"
                        />
                        <input
                          type="number"
                          required
                          min={0}
                          value={exp.amount}
                          onChange={(e) => handleOtherExpenseChange(idx, "amount", Number(e.target.value) || 0)}
                          placeholder="Số tiền"
                          className="flex-1 border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-[11px] font-medium text-slate-800"
                        />
                        <input
                          type="text"
                          value={exp.notes}
                          onChange={(e) => handleOtherExpenseChange(idx, "notes", e.target.value)}
                          placeholder="Ghi chú"
                          className="flex-2 border border-slate-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500 bg-white text-[11px] font-medium text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveOtherExpense(idx)}
                          className="text-rose-500 hover:text-rose-700 transition-colors p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grand Total */}
              <div className="bg-indigo-50/60 p-4 border border-indigo-100 rounded-2xl flex items-center justify-between shadow-sm shadow-indigo-500/5">
                <span className="font-extrabold text-slate-700 text-xs tracking-wider uppercase">Tổng cộng đề nghị thanh toán:</span>
                <span className="text-lg font-black text-indigo-700">{formatCurrency(totalTripAmount)}</span>
              </div>

              {/* Người duyệt — dùng chung state với đơn nghỉ phép (hai modal không
                  bao giờ mở cùng lúc). Đề xuất theo phòng ban: Trưởng phòng, không
                  có thì Phó phòng, không có cả hai thì để trống tự tìm. */}
              <div className="space-y-1.5" ref={approverPickerRef}>
                <label className="text-slate-500 text-[11px] font-bold">Người duyệt (Trưởng phòng) *</label>
                <div className="relative">
                  <div className="relative">
                    <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      required
                      value={showApproverDropdown ? approverSearch : selectedApprover}
                      onFocus={() => { setShowApproverDropdown(true); setApproverSearch(""); }}
                      onChange={(e) => setApproverSearch(e.target.value)}
                      placeholder="Tìm tên người duyệt..."
                      className="w-full pl-8 pr-3 border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white font-semibold text-slate-800 text-xs"
                    />
                  </div>
                  {showApproverDropdown && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-20 max-h-48 overflow-y-auto animate-in fade-in duration-150">
                      {filteredApproverOptions.length === 0 ? (
                        <p className="text-center text-slate-400 text-[11px] italic py-3">Không tìm thấy người phù hợp.</p>
                      ) : (
                        filteredApproverOptions.map(m => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => { setSelectedApprover(m.name); setShowApproverDropdown(false); setApproverSearch(""); }}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer text-xs ${m.name === selectedApprover ? "bg-indigo-50/60" : ""}`}
                          >
                            <span className="font-bold text-slate-700 truncate">{m.name}</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              {m.name === recommendedApprover && (
                                <span className="text-[8px] font-extrabold text-indigo-500 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">ĐỀ XUẤT</span>
                              )}
                              <span className="text-[10px] text-slate-400">{m.role}</span>
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {recommendedApprover && selectedApprover === recommendedApprover && (
                  <p className="text-[10px] text-indigo-400 font-semibold">💡 Tự động chọn theo phòng ban: {currentUser?.department}</p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTripModalOpen(false)}
                  className="px-6 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs text-center"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-md shadow-indigo-500/10 text-xs text-center"
                >
                  Gửi đơn công tác
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Chi tiết công việc modal */}
      {isDetailsModalOpen && selectedTask && (() => {
        const isTrip = selectedTask.title.toLowerCase().startsWith("công tác");
        
        let metadata: any = null;
        if (isTrip && selectedTask.notes) {
          const metaMatch = selectedTask.notes.match(/<!--METADATA:(.*?)-->/);
          if (metaMatch) {
            try {
              metadata = JSON.parse(metaMatch[1]);
            } catch (e) {
              console.error(e);
            }
          }
          
          if (!metadata) {
            // Fallback parsing for old tasks
            const days = selectedTask.start_date && selectedTask.due_date 
              ? Math.max(1, Math.round((new Date(selectedTask.due_date).getTime() - new Date(selectedTask.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
              : 1;
            const nights = days >= 2 ? days - 1 : 0;
            const hotelRateVal = 350000;
            
            let destination = "Tây Ninh";
            const destMatch = selectedTask.notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
            if (destMatch) destination = destMatch[1].trim();
            
            let transport = "🚗 Xe công ty";
            const transMatch = selectedTask.notes.match(/-\s+\*\*Phương tiện chính\*\*:\s*(.*)/i);
            if (transMatch) transport = transMatch[1].trim();

            let mission = "Công tác";
            const missionMatch = selectedTask.notes.match(/-\s+\*\*Nhiệm vụ cụ thể\*\*:\s*(.*)/i);
            if (missionMatch) mission = missionMatch[1].trim();

            const totalAmount = days * 120000 + nights * hotelRateVal;

            metadata = {
              employeeName: selectedTask.assignee || "Người dùng",
              employeeRole: "Chuyên viên",
              employeeDept: "Hành chính nhân sự",
              destination,
              modalStart: selectedTask.start_date,
              modalEnd: selectedTask.due_date,
              mission,
              transport,
              days,
              nights,
              hotelRate: hotelRateVal,
              travelEstimate: 0,
              otherExpenses: [],
              totalAmount,
              routes: [
                {
                  from: "TPHCM",
                  to: destination,
                  distance: "",
                  date: selectedTask.start_date,
                  transport,
                  nights,
                  reason: ""
                }
              ],
              dateStr: selectedTask.start_date ? new Date(selectedTask.start_date).toLocaleDateString("vi-VN") : new Date().toLocaleDateString("vi-VN")
            };
          }
        }

        if (isTrip && metadata) {
          const days = metadata.days || 1;
          const nights = metadata.nights || 0;
          const hotelRateVal = metadata.hotelRate || 350000;
          const travelEstimateVal = metadata.travelEstimate || 0;
          const phuCapVal = days * 120000;
          const hotelTotal = nights * hotelRateVal;
          const totalVal = Number(metadata.totalAmount) || (phuCapVal + hotelTotal + travelEstimateVal);

          return (
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-3xl p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in-50 zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto scrollbar-thin text-xs text-slate-700">
                {/* Header block */}
                <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl bg-indigo-50 p-2 rounded-xl text-indigo-600">💼</span>
                    <div>
                      <h3 className="font-heading font-extrabold text-base text-slate-800 leading-tight">Chi tiết lịch đi công tác</h3>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        Người đề xuất: {(metadata.employeeName || selectedTask.assignee || "").toUpperCase()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge text-[10px] py-1 px-2.5 rounded-full font-bold ${
                      selectedTask.status === "completed" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                      selectedTask.status === "pending_approval" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                      "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}>
                      {selectedTask.status === "completed" ? "Đã duyệt" :
                       selectedTask.status === "pending_approval" ? "Chờ phê duyệt" : "Đang thực hiện"}
                    </span>
                    <button type="button" onClick={() => { setIsDetailsModalOpen(false); setSelectedTask(null); }} className="text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-100 rounded-lg">
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {selectedTask.due_date && selectedTask.status !== "completed" && selectedTask.progress < 100 && selectedTask.due_date < new Date().toLocaleDateString("en-CA") && (
                  <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex gap-2 items-center text-rose-700 animate-in fade-in duration-200">
                    <AlertCircle className="text-rose-500 shrink-0" size={16} />
                    <div className="text-[10.5px] font-bold leading-normal">
                      Lịch trình đi công tác này đã quá hạn ngày về! Ngày về dự kiến là ngày {new Date(selectedTask.due_date).toLocaleDateString("vi-VN")}.
                    </div>
                  </div>
                )}

                {/* Basic Info grid */}
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 pb-4 border-b border-slate-100">
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Điểm công tác chính</span>
                      <span className="text-xs font-bold text-slate-850 block">{metadata.destination}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Thời gian đi</span>
                      <span className="text-xs font-bold text-slate-850 block">
                        Từ {metadata.modalStart ? new Date(metadata.modalStart).toLocaleDateString("vi-VN") : ""} Đến {metadata.modalEnd ? new Date(metadata.modalEnd).toLocaleDateString("vi-VN") : ""} ({days} ngày)
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Phương tiện di chuyển</span>
                      <span className="text-xs font-bold text-slate-850 block">{metadata.transport}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Mục tiêu & nhiệm vụ</span>
                      <span className="text-xs font-bold text-slate-855 block">{metadata.mission}</span>
                    </div>
                  </div>
                </div>

                {/* Route table */}
                <div className="space-y-2">
                  <h4 className="font-heading font-extrabold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🧭</span> Chi tiết lộ trình chặng đi
                  </h4>
                  <div className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50">
                    <table className="w-full text-[10px] border-collapse text-left">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                          <th className="py-2 px-3 text-center w-12">STT</th>
                          <th className="py-2 px-3">Hành trình chặng</th>
                          <th className="py-2 px-3 text-center">Cự ly (km)</th>
                          <th className="py-2 px-3 text-center">Phương tiện</th>
                          <th className="py-2 px-3 text-center">Nights</th>
                          <th className="py-2 px-3 text-center">Lý do ở lại</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white font-medium">
                        {(metadata.routes || []).map((route: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/40 text-slate-700 font-semibold">
                            <td className="py-2.5 px-3 text-center text-slate-400">{idx + 1}</td>
                            <td className="py-2.5 px-3">
                              <div className="text-slate-850">Đi: {route.from}</div>
                              <div className="text-slate-400 text-[9px] mt-0.5">Đến: {route.to}</div>
                            </td>
                            <td className="py-2.5 px-3 text-center text-indigo-600 font-black">
                              {route.distance ? `${route.distance} km` : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-500">{route.transport}</td>
                            <td className="py-2.5 px-3 text-center text-slate-800 font-bold">{route.nights}</td>
                            <td className="py-2.5 px-3 text-center text-slate-400 text-[9px]">{route.reason || "—"}</td>
                          </tr>
                        ))}
                        {(!metadata.routes || metadata.routes.length === 0) && (
                          <tr>
                            <td colSpan={6} className="py-4 text-center text-slate-400 italic">Không có thông tin lộ trình</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Expense details */}
                <div className="space-y-3">
                  <h4 className="font-heading font-extrabold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>💰</span> Quyết toán công tác phí & phụ cấp
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Phụ cấp công tác phí</span>
                      <div className="text-[11px] text-slate-800 font-black">{formatCurrency(phuCapVal)}</div>
                      <span className="text-[9px] text-slate-400">({days} ngày x 120.000đ)</span>
                    </div>
                    <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Tiền khách sạn lưu trú</span>
                      <div className="text-[11px] text-slate-800 font-black">{formatCurrency(hotelTotal)}</div>
                      <span className="text-[9px] text-slate-400">({nights} đêm)</span>
                    </div>
                    <div className="p-3 border border-slate-100 rounded-xl bg-slate-50/30">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1">Vé tàu hỏa / máy bay</span>
                      <div className="text-[11px] text-slate-800 font-black">{formatCurrency(travelEstimateVal)}</div>
                      <span className="text-[9px] text-slate-400">Tạm tính di chuyển</span>
                    </div>
                  </div>

                  {/* Total banner */}
                  <div className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl flex items-center justify-between text-indigo-750">
                    <span className="font-black text-[10px] tracking-wider uppercase text-indigo-950">Tổng cộng đề nghị quyết toán:</span>
                    <span className="text-sm font-black text-indigo-600">{formatCurrency(totalVal)}</span>
                  </div>
                </div>

                {/* Print documents section */}
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <h4 className="font-heading font-extrabold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📁</span> Tài liệu biểu mẫu in ấn
                  </h4>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => alert("Tính năng tải biểu mẫu Excel đang được phát triển. Vui lòng sử dụng biểu mẫu Word để in ấn!")}
                      className="py-2 px-3 border border-emerald-250 bg-emerald-50 hover:bg-emerald-100/60 text-emerald-700 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer text-[10px] transition-colors"
                    >
                      📊 Tải biểu mẫu Excel (2 Sheet)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadReport(selectedTask, 'trip')}
                      className="py-2 px-3 border border-indigo-250 bg-indigo-50 hover:bg-indigo-100/65 text-indigo-700 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer text-[10px] transition-colors"
                    >
                      📝 Tải Phiếu công tác (Word)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadReport(selectedTask, 'payment')}
                      className="py-2 px-3 border border-indigo-250 bg-indigo-50 hover:bg-indigo-100/65 text-indigo-700 rounded-xl font-bold flex items-center justify-center gap-1.5 cursor-pointer text-[10px] transition-colors"
                    >
                      📝 Tải Đề nghị thanh toán (Word)
                    </button>
                  </div>
                </div>


                {/* Footer action buttons */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                  <div>
                    {isManager && (
                      <button
                        type="button"
                        onClick={() => handleDeleteTripTask(selectedTask.id)}
                        className="py-2 px-3 border border-red-200 hover:bg-red-50 text-red-650 rounded-xl font-bold flex items-center justify-center gap-1 cursor-pointer text-[10px] transition-colors"
                      >
                        🗑️ Xóa lịch công tác
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setIsDetailsModalOpen(false); setSelectedTask(null); }}
                    className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-[10px]"
                  >
                    Đóng lại
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // Non-trip task details modal (Nghỉ phép or other events)
        return (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto scrollbar-thin text-xs font-semibold text-slate-700">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {selectedTask.title.toLowerCase().startsWith("nghỉ phép") ? "🌴" : "📌"}
                  </span>
                  <h3 className="font-heading font-extrabold text-sm text-slate-800">Chi tiết lịch trình</h3>
                </div>
                <button type="button" onClick={() => { setIsDetailsModalOpen(false); setSelectedTask(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {selectedTask.due_date && selectedTask.status !== "completed" && selectedTask.progress < 100 && selectedTask.due_date < new Date().toLocaleDateString("en-CA") && (
                <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex gap-2 items-center text-rose-700 animate-in fade-in duration-200">
                  <AlertCircle className="text-rose-500 shrink-0" size={16} />
                  <div className="text-[10.5px] font-bold leading-normal">
                    Lịch trình / công việc này đã quá hạn hoàn thành! Hạn chót là ngày {new Date(selectedTask.due_date).toLocaleDateString("vi-VN")}.
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-slate-400 font-bold block">Tên sự kiện / công việc:</span>
                  <div className="text-sm font-heading font-extrabold text-slate-800">{selectedTask.title}</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold block">Nhân sự thực hiện:</span>
                    <div className="text-slate-800 font-bold text-xs flex items-center gap-1">
                      <User size={13} className="text-slate-400" /> {selectedTask.assignee}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold block">Trạng thái:</span>
                    <div>
                      <span className={`badge text-[10px] ${
                        selectedTask.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                        selectedTask.status === "pending_approval" ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"
                      }`}>
                        {selectedTask.status === "completed" ? "✓ Đã xong / Phê duyệt" :
                         selectedTask.status === "pending_approval" ? "⏳ Chờ phê duyệt" : "Đang thực hiện"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold block">Ngày bắt đầu:</span>
                    <div className="text-slate-800 font-bold text-xs">
                      {selectedTask.start_date ? new Date(selectedTask.start_date).toLocaleDateString("vi-VN") : "N/A"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-slate-400 font-bold block">Hạn chót:</span>
                    <div className="text-slate-800 font-bold text-xs">
                      {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString("vi-VN") : "N/A"}
                    </div>
                  </div>
                </div>

                <div className="space-y-1 border-t border-slate-100 pt-3">
                  <span className="text-slate-400 font-bold block">Ghi chú / Nhật ký chi tiết:</span>
                  <div className="bg-slate-50 p-3 rounded-xl max-h-[200px] overflow-y-auto font-medium text-slate-600 leading-relaxed whitespace-pre-line border border-slate-100 scrollbar-thin">
                    {selectedTask.notes ? selectedTask.notes.replace(/<!--METADATA:(.*?)-->/, "").trim() : "Không có ghi chú nào."}
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-3 border-t border-slate-100">
                <div>
                  {isManager && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (window.confirm("Bạn có chắc chắn muốn xóa lịch này không?")) {
                          try {
                            const { error } = await supabase.from("tasks").delete().eq("id", selectedTask.id);
                            if (error) throw error;
                            alert("Đã xóa thành công!");
                            setIsDetailsModalOpen(false);
                            setSelectedTask(null);
                            fetchData();
                          } catch (err: any) {
                            alert("Lỗi: " + err.message);
                          }
                        }
                      }}
                      className="py-1.5 px-3 border border-red-200 hover:bg-red-50 text-red-600 rounded-xl font-bold flex items-center justify-center gap-1 cursor-pointer text-[10px] transition-colors"
                    >
                      🗑️ Xóa lịch trình
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setIsDetailsModalOpen(false); setSelectedTask(null); }}
                  className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer text-xs"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

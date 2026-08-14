"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { exportPhieuThanhToan, exportPhieuCongTac, downloadDocFile } from "@/lib/wordExporter";
import {
  getGroupLeaderNameForMember,
  getRequestStage,
  isLeaveTripCap1Approver,
  getLeaveExceptionApproversForAssignee,
  isManagerRole,
  normalizeName,
} from "@/lib/approvers";
import { useCurrentUser } from "@/lib/useCurrentUser";
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

// Ghi chú lịch cá nhân (bảng calendar_notes, migration 027). Riêng tư tuyệt đối:
// RLS chỉ trả về dòng của chính người đang đăng nhập.
interface CalendarNote {
  id: string;
  note_date: string; // YYYY-MM-DD
  content: string;
}

/**
 * Ngày hôm nay dạng YYYY-MM-DD theo giờ MÁY NGƯỜI DÙNG (không phải giờ UTC).
 * Dùng "en-CA" vì locale này trả đúng định dạng YYYY-MM-DD mà ô <input type="date">
 * yêu cầu. KHÔNG dùng toISOString(): hàm đó quy về UTC nên trước 7h sáng giờ VN
 * sẽ trả về ngày hôm qua.
 */
const todayISO = () => new Date().toLocaleDateString("en-CA");

function CalendarContent() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date State
  // Mở lịch ở THÁNG HIỆN TẠI theo giờ máy người dùng. (Trước đây ghi cứng
  // new Date(2026, 5, 5) từ thời làm demo, khiến ai vào cũng thấy tháng 6.)
  const [currentDate, setCurrentDate] = useState(() => new Date());
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>("Tất cả");

  // Right sidebar tab state: 'nodate' | 'leave' | 'trip'

  // User info — hook chung (thay khối allowed_users + employees copy-paste).
  const user = useCurrentUser();
  const currentUser = user.authenticated ? user : null;

  // Modal State for Request Leave / Business Trip
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isTripModalOpen, setIsTripModalOpen] = useState(false);
  // ─── Hộp thoại báo / xác nhận dùng chung cho cả trang ───
  // Thay cho alert() và window.confirm() của trình duyệt: hai hộp đó không theo
  // được giao diện chung, luôn dính ở mép trên và hiện tên miền website.
  const [notice, setNotice] = useState<{
    kind: "success" | "error" | "warning";
    title: string;
    message?: string;
  } | null>(null);
  const showNotice = (kind: "success" | "error" | "warning", title: string, message?: string) =>
    setNotice({ kind, title, message });

  // Hỏi trước khi làm việc không hoàn tác. Việc cần làm đặt trong onConfirm vì
  // modal không dừng luồng chạy như window.confirm().
  const [confirmBox, setConfirmBox] = useState<{
    title: string;
    message?: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  // Ô nhập lý do từ chối — thay cho window.prompt(). Chỉ đổi chỗ nhập liệu,
  // phần xử lý từ chối vẫn là handleCap1Reject như cũ.
  const [rejectBox, setRejectBox] = useState<{ taskId: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // ─── Ghi chú lịch cá nhân ───
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  // Hộp soạn ghi chú: id = null nghĩa là đang thêm mới cho ngày đó
  const [noteModal, setNoteModal] = useState<{ date: string; id: string | null; content: string } | null>(null);
  const [savingNote, setSavingNote] = useState(false);

  // Lối vào từ sidebar "Quản lý Đăng ký": /calendar?dk=nghi-phep | cong-tac chỉ
  // bật đúng form đã có sẵn dưới đây, không phải luồng riêng.
  const searchParams = useSearchParams();
  const router = useRouter();
  const dkParam = searchParams.get("dk");

  useEffect(() => {
    if (!dkParam) return;
    if (dkParam === "nghi-phep") {
      setIsLeaveModalOpen(true);
    } else if (dkParam === "cong-tac") {
      // Giống hệt nút cũ: nạp lại ngày hôm nay rồi mới mở form
      setModalStart(todayISO());
      setModalEnd(todayISO());
      setIsTripModalOpen(true);
    }
    // Gỡ tham số khỏi URL ngay sau khi mở. Nếu để nguyên, lần sau bấm lại đúng
    // mục đó URL không đổi -> effect không chạy -> form không mở lên nữa.
    router.replace("/calendar", { scroll: false });
  }, [dkParam, router]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [modalName, setModalName] = useState("");
  const [modalStart, setModalStart] = useState(todayISO);
  const [modalEnd, setModalEnd] = useState(todayISO);
  const [modalNotes, setModalNotes] = useState("");
  const [leaveType, setLeaveType] = useState("Nghỉ phép năm hưởng lương");

  // Leave specific states
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState<"Sáng" | "Chiều">("Sáng");
  // Toàn bộ nhân sự — dùng để tra người duyệt ĐẶC CÁCH nghỉ 1 ngày trong
  // resolveCap1Approver. Ô chọn người duyệt đã bỏ: hệ thống tự suy ra.
  const [allStaffList, setAllStaffList] = useState<{ id: string; name: string; role: string }[]>([]);
  // Danh bạ email/phòng ban tra theo tên — dùng để gửi email thông báo duyệt (tasks không có cột email)
  const [employeeDirectory, setEmployeeDirectory] = useState<{ name: string; email: string; department: string; role: string }[]>([]);

  // Business trip specific states
  const [tripDestination, setTripDestination] = useState("");
  const [tripTransport, setTripTransport] = useState("🚗 Xe công ty");
  const [tripMission, setTripMission] = useState("");
  const [tripRoutes, setTripRoutes] = useState<RouteSegment[]>(() => [
    { from: "TPHCM", to: "", distance: "", date: todayISO(), transport: "Xe công ty", nights: 0, reason: "" }
  ]);
  const [tripTravelEstimate, setTripTravelEstimate] = useState<number>(0);
  const [tripOtherExpenses, setTripOtherExpenses] = useState<OtherExpense[]>([]);
  const [hotelRate, setHotelRate] = useState<number>(350000);

  const selectedMonth = currentDate.getMonth();
  const selectedYear = currentDate.getFullYear();

  // Điền sẵn tên người xin nghỉ/công tác theo danh tính khi đã tải xong.
  useEffect(() => {
    if (currentUser) setModalName((prev) => prev || currentUser.name);
  }, [currentUser]);

  const isManager = useMemo(() => {
    if (!currentUser) return false;
    // Dùng nhận diện quản lý trung tâm (đồng bộ với luồng duyệt cấp 1).
    return currentUser.isAdmin || isManagerRole(currentUser.role);
  }, [currentUser]);

  const handleDeleteTripTask = (taskId: string) => {
    setConfirmBox({
      title: "Xoá lịch đi công tác?",
      message: "Lịch đi công tác này sẽ bị xoá khỏi hệ thống và không khôi phục lại được.",
      confirmLabel: "Xoá lịch",
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", taskId);

          if (error) throw error;
          setIsDetailsModalOpen(false);
          setSelectedTask(null);
          fetchData();
          showNotice("success", "Đã xoá lịch đi công tác");
        } catch (err: any) {
          console.error(err);
          showNotice("error", "Không xoá được lịch đi công tác", err.message || String(err));
        }
      },
    });
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
      }
    } catch (err) {
      console.error("Error fetching calendar data:", err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Ghi chú lịch cá nhân ───
  // Không cần lọc theo email: RLS của bảng chỉ trả về dòng của chính mình.
  const fetchNotes = async () => {
    try {
      const { data, error } = await supabase
        .from("calendar_notes")
        .select("id, note_date, content")
        .order("note_date", { ascending: true });

      if (error) throw error;
      setNotes(data || []);
    } catch (err) {
      console.error("Error fetching calendar notes:", err);
    }
  };

  // Chờ có phiên đăng nhập rồi mới đọc, nếu không RLS trả về rỗng.
  useEffect(() => {
    if (!currentUser?.email) return;
    fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.email]);

  const notesOfDate = (dateStr: string) => notes.filter(n => n.note_date === dateStr);

  const handleSaveNote = async () => {
    if (!noteModal || !currentUser?.email) return;
    const content = noteModal.content.trim();
    if (!content) {
      showNotice("warning", "Chưa nhập nội dung ghi chú", "Ghi chú để trống thì không lưu được.");
      return;
    }
    setSavingNote(true);
    try {
      if (noteModal.id) {
        const { error } = await supabase
          .from("calendar_notes")
          .update({ content })
          .eq("id", noteModal.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("calendar_notes").insert([{
          owner_email: currentUser.email.toLowerCase(),
          note_date: noteModal.date,
          content,
        }]);
        if (error) throw error;
      }
      setNoteModal(null);
      fetchNotes();
    } catch (err: any) {
      console.error(err);
      showNotice("error", "Không lưu được ghi chú", err.message || String(err));
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = () => {
    if (!noteModal?.id) return;
    const id = noteModal.id;
    setConfirmBox({
      title: "Xoá ghi chú này?",
      message: "Ghi chú sẽ bị xoá khỏi lịch và không khôi phục lại được.",
      confirmLabel: "Xoá ghi chú",
      onConfirm: async () => {
        try {
          const { error } = await supabase.from("calendar_notes").delete().eq("id", id);
          if (error) throw error;
          setNoteModal(null);
          fetchNotes();
          showNotice("success", "Đã xoá ghi chú");
        } catch (err: any) {
          showNotice("error", "Không xoá được ghi chú", err.message || String(err));
        }
      },
    });
  };

  useEffect(() => {
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

  // Ai được xem lịch của TOÀN CÔNG TY. Giữ đúng bộ điều kiện của Kanban công việc
  // (app/tasks/page.tsx) để hai trang không nói hai luật khác nhau về cùng dữ liệu.
  const seesAllDepartments = useMemo(() => !!currentUser && (
    currentUser.isAdmin ||
    (currentUser.role || "").toLowerCase() === "admin" ||
    currentUser.isDirector ||
    !!currentUser.perms?.canViewAllTasks
  ), [currentUser]);

  const myDeptKey = normalizeName(currentUser?.department || "");

  // Nhân sự được liệt kê ở ô lọc "Thành viên" — phải khớp đúng phạm vi xem ở
  // filteredTasks, nếu không quản lý bấm vào một cái tên phòng khác rồi thấy lịch
  // trống trơn mà không hiểu vì sao.
  const visibleMemberNames = useMemo(() => {
    const names = new Set<string>();
    if (!currentUser) return names;
    if (seesAllDepartments) {
      employees.forEach(e => names.add(normalizeName(e.name)));
      return names;
    }
    names.add(normalizeName(currentUser.name));
    if (isManager && myDeptKey) {
      employeeDirectory.forEach(e => {
        if (normalizeName(e.department || "") === myDeptKey) names.add(normalizeName(e.name));
      });
    }
    return names;
  }, [currentUser, seesAllDepartments, isManager, myDeptKey, employees, employeeDirectory]);

  // Filter Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // ─── Phạm vi xem (siết 07/08/2026) ───
      // Trước đây HỄ LÀ QUẢN LÝ là thấy lịch toàn công ty. Nay:
      //   Admin / Giám đốc / Ban lãnh đạo / cờ can_view_all_tasks -> toàn công ty
      //   Quản lý đơn vị (TP, PP, Tổ trưởng, Chỉ huy trưởng/phó) -> CÙNG ĐƠN VỊ
      //   Nhân viên                                              -> chỉ của mình
      if (currentUser && !seesAllDepartments) {
        const isMine = normalizeName(t.assignee || "") === normalizeName(currentUser.name);
        if (!isMine) {
          if (!isManager) return false;
          // Quản lý: chỉ nhân sự cùng đơn vị. Thiếu dữ liệu phòng ban ở một trong
          // hai bên thì không suy đoán — thà không thấy còn hơn thấy nhầm phòng khác.
          const theirDept = normalizeName(
            employeeDirectory.find(e => normalizeName(e.name) === normalizeName(t.assignee || ""))?.department || ""
          );
          if (!myDeptKey || !theirDept || theirDept !== myDeptKey) return false;
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
  }, [tasks, searchQuery, selectedPriorities, selectedMember, currentUser, isManager, seesAllDepartments, myDeptKey, employeeDirectory]);

  // Nghỉ phép và công tác PHẢI trải hết số ngày: nhìn vào ngày 16 là biết ai
  // đang vắng hôm đó. Việc thường thì không — một việc kéo 3 tuần mà vẽ ở cả 21
  // ô sẽ lấp kín lịch và che mất mọi thứ khác, nên chỉ hiện một mốc mỗi tháng.
  //
  // PHẢI khai TRƯỚC `tasksWithDate`: useMemo chạy ngay trong lượt render này, mà
  // `const` khai sau thì lúc đó còn nằm trong vùng chết (TDZ) -> sập trang Lịch.
  const isSpanningType = (t: Task) => {
    const titleLower = t.title.toLowerCase();
    return titleLower.startsWith("nghỉ phép") || titleLower.includes("nghi phep")
        || titleLower.startsWith("công tác") || titleLower.includes("cong tac");
  };

  // Tasks categorized
  const tasksWithDate = useMemo(() => {
    return filteredTasks.filter(t => {
      if (!t.due_date && !t.start_date) return false;

      // Việc đã xác nhận hoàn thành thì RỜI KHỎI LỊCH cho gọn — lịch là chỗ nhìn
      // xem sắp tới phải làm gì, việc đóng sổ rồi nằm lại chỉ tổ che mất phần
      // còn phải chạy. Xem lại việc cũ thì sang bảng Kanban cột "Đã hoàn thành".
      //
      // TRỪ nghỉ phép và công tác: với hai loại này `completed` KHÔNG có nghĩa là
      // xong việc mà là ĐÃ DUYỆT (xem nhãn "Đã duyệt" ở khung chi tiết đơn) — ẩn
      // đi là xoá sạch lịch nghỉ của cả công ty, đúng thứ mà lịch sinh ra để xem.
      if (t.status === "completed" && !isSpanningType(t)) return false;

      return true;
    });
  }, [filteredTasks]);

  /** Cắt lấy phần ngày — cột có lúc là 'YYYY-MM-DD', có lúc kèm giờ. */
  const dk = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

  /**
   * Ô này có phải chỗ vẽ thẻ "GIAO VIỆC" (chứ không phải thẻ deadline) không.
   * Chỉ đúng với việc thường có đủ hai mốc và hai mốc KHÁC ngày nhau — giao và
   * hết hạn cùng ngày thì vẽ một thẻ deadline là đủ, hai thẻ chồng nhau vô nghĩa.
   */
  const isStartAnchor = (t: Task, dateStr: string) =>
    !isSpanningType(t) && !!dk(t.start_date) && !!dk(t.due_date) &&
    dk(t.start_date) !== dk(t.due_date) && dateStr === dk(t.start_date);

  /**
   * Ô này có phải MỐC THÁNG GIỮA không — tháng nằm giữa tháng giao và tháng hạn.
   *
   * Việc giao 14/08 hạn 10/10 mà chỉ vẽ hai đầu thì mở lịch tháng 9 trống trơn,
   * không biết có việc nào đang chạy. Nay tháng giữa cũng vẽ, đặt ở ĐÚNG NGÀY SỐ
   * của deadline (hạn 10/10 -> tháng 9 nằm ở ô 10/09) để mắt tìm quen một chỗ.
   *
   * Ngày 31 rơi vào tháng chỉ có 30 ngày thì lùi về ngày cuối tháng, không thì
   * thẻ rơi mất không vẽ ở đâu cả.
   */
  const isMidMonthAnchor = (t: Task, date: Date) => {
    if (isSpanningType(t)) return false;
    const start = dk(t.start_date);
    const end = dk(t.due_date);
    if (!start || !end) return false;

    const cellYm = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (cellYm <= start.slice(0, 7) || cellYm >= end.slice(0, 7)) return false;

    const lastDayOfCellMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const anchorDay = Math.min(parseInt(end.slice(8, 10), 10), lastDayOfCellMonth);
    return date.getDate() === anchorDay;
  };

  // Get tasks for a specific date cell
  const getTasksForDate = (date: Date) => {
    const compareDateStr = date.toLocaleDateString("en-CA"); // YYYY-MM-DD

    return tasksWithDate.filter(t => {
      const start = dk(t.start_date);
      const end = dk(t.due_date);

      if (start && end) {
        if (isSpanningType(t)) {
          return compareDateStr >= start && compareDateStr <= end;
        }
        // Việc thường: MỘT MỐC MỖI THÁNG, không trải hết ngày ở giữa (một việc
        // kéo 3 tuần mà tô cả 21 ô sẽ lấp kín lịch — đó là lý do luật cũ gom về
        // một ô duy nhất).
        //   tháng giao  -> ô ngày giao
        //   tháng giữa  -> ô cùng ngày số với deadline
        //   tháng hạn   -> ô deadline
        return compareDateStr === end
            || compareDateStr === start
            || isMidMonthAnchor(t, date);
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

  /**
   * Người duyệt cấp 1 của một đơn — hệ thống TỰ suy ra, người gửi không phải chọn.
   *
   * Thứ tự dưới đây bám ĐÚNG thứ tự trong isLeaveTripCap1Approver (lib/approvers.ts)
   * để người nhận mail luôn trùng với người thật sự bấm duyệt được. Đổi thứ tự ở
   * đây mà không đổi bên đó là mail bay một nẻo, quyền duyệt một đằng.
   *   1. Thuộc tổ có nhóm duyệt riêng  -> tổ trưởng của tổ đó
   *   2. Đơn nghỉ ĐÚNG 1 NGÀY có đặc cách -> người duyệt đặc cách
   *   3. Còn lại -> Trưởng phòng cùng phòng ban, không có thì Phó phòng
   * Trả về "" khi không tìm được ai; lúc đó không gửi mail, đơn vẫn nằm chờ ở
   * trang Duyệt yêu cầu cho cấp quản lý xử lý.
   */
  const resolveCap1Approver = (assigneeName: string, isOneDayLeave: boolean): string => {
    const groupLeader = getGroupLeaderNameForMember(assigneeName);
    if (groupLeader) return groupLeader;

    if (isOneDayLeave) {
      const exceptions = getLeaveExceptionApproversForAssignee(assigneeName);
      if (exceptions.length > 0) {
        const matched = allStaffList.find(s =>
          exceptions.some(ex => normalizeName(s.name).includes(normalizeName(ex)))
        );
        if (matched) return matched.name;
      }
    }

    // Phòng ban lấy từ hồ sơ NGƯỜI GỬI trong danh bạ, không lấy của tài khoản đang
    // đăng nhập — hai thứ này khác nhau khi HCNS nộp đơn hộ người khác.
    const dept = normalizeName(
      employeeDirectory.find(e => normalizeName(e.name) === normalizeName(assigneeName))?.department
      || currentUser?.department
      || ""
    );
    if (!dept) return "";

    const sameDept = employeeDirectory.filter(e => normalizeName(e.department || "") === dept);
    const isTruongPhong = (role: string) => {
      const r = normalizeName(role || "");
      return r.includes("truong phong") && !r.includes("pho truong phong");
    };
    const isPhoPhong = (role: string) => {
      const r = normalizeName(role || "");
      return r.includes("pho phong") || r.includes("pho truong phong");
    };
    const primary = sameDept.find(e => isTruongPhong(e.role)) || sameDept.find(e => isPhoPhong(e.role));
    return primary?.name || "";
  };

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
        currentUserIsDirector: currentUser.isDirector,
        currentUserDepartment: currentUser.department,
        assigneeName: t.assignee,
        assigneeDepartment: employeeDirectory.find(
          e => normalizeName(e.name) === normalizeName(t.assignee || "")
        )?.department || "",
        taskNotes: t.notes,
        taskTitleLower: titleLower,
      });
    });
  }, [tasks, currentUser, employeeDirectory]);

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
        if (!res.ok) showNotice("warning", failPrefix, result.error);
      } catch (mailErr: any) {
        showNotice("warning", failPrefix, mailErr.message || "lỗi kết nối");
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

      showNotice(
        "success",
        "Đã xác nhận yêu cầu",
        "Yêu cầu được chuyển sang HCNS để duyệt cuối. Email báo HCNS đang được gửi."
      );
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
          showNotice("warning", "Chưa gửi được email báo HCNS", mailErr.message || "lỗi kết nối");
        }
      })();
    } catch (err) {
      console.error(err);
      showNotice("error", "Không xác nhận được yêu cầu", "Vui lòng thử lại hoặc báo bộ phận kỹ thuật.");
    }
  };

  // Cấp 1 từ chối luôn (không cần chuyển HCNS) — bắt buộc nhập lý do, gửi email cho người gửi đơn
  const handleCap1Reject = async (taskId: string, reason: string) => {
    if (!currentUser) return;
    if (!reason.trim()) {
      showNotice("warning", "Chưa nhập lý do từ chối", "Lý do sẽ được gửi email cho người làm đơn nên bắt buộc phải có.");
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

      showNotice(
        "success",
        "Đã từ chối yêu cầu",
        requesterEmail ? "Email thông báo đang được gửi cho người làm đơn." : undefined
      );
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
      showNotice("error", "Không từ chối được yêu cầu", "Vui lòng thử lại hoặc báo bộ phận kỹ thuật.");
    }
  };

  // Handle Request Leave
  const handleRequestLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName || !modalStart || !modalEnd) {
      showNotice("warning", "Chưa điền đủ thông tin", "Vui lòng nhập họ tên và khoảng thời gian nghỉ.");
      return;
    }

    const duration = leaveDaysCount;
    if (duration <= 0) {
      showNotice("warning", "Khoảng ngày chưa hợp lệ", "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      return;
    }

    // Nghỉ NỬA NGÀY trước đây được duyệt tự động ngay lúc gửi. Bỏ hẳn cơ chế đó:
    // mọi đơn nghỉ phép, kể cả 0,5 ngày, đều phải qua cấp quản lý duyệt y như đơn
    // 1 ngày. Chỉ còn khác nhau ở chuỗi tiêu đề để bảng công vẫn chấm ra "P/2"
    // (cb/page.tsx parseTaskToLeave đọc chữ "Nửa ngày").
    const titleStr = duration === 0.5
      ? `Nghỉ phép (${leaveType}): ${modalName} (Nửa ngày ${halfDayPeriod})`
      : `Nghỉ phép (${leaveType}): ${modalName} (${duration} ngày)`;

    // Người duyệt cấp 1 do hệ thống suy ra, không bắt người gửi chọn nữa.
    // Rỗng cũng vẫn cho gửi đơn: đơn nằm chờ ở trang Duyệt yêu cầu, cấp quản lý
    // vẫn duyệt được — chặn ở đây chỉ làm người dùng bí mà không giải quyết gì.
    // `duration <= 1` để nửa ngày dùng chung nhánh người duyệt đặc cách với đơn
    // 1 ngày — phải khớp với isLeaveTripCap1Approver (lib/approvers.ts), lệch là
    // mail bay một nẻo còn quyền duyệt một đằng.
    const cap1Approver = resolveCap1Approver(modalName, duration <= 1);

    // Giữ nguyên chuỗi "Người duyệt: X" trong notes — isLeaveTripCap1Approver và
    // getCleanDept đều đọc chuỗi này, đổi dạng là gãy cả hai.
    const notesStr = `Loại nghỉ phép: ${leaveType}.${cap1Approver ? ` Người duyệt: ${cap1Approver}.` : ""} ${modalNotes ? `Lý do: ${modalNotes}` : ""}`;

    try {
      const { error } = await supabase
        .from("tasks")
        .insert([{
          title: titleStr,
          assignee: modalName,
          start_date: modalStart,
          due_date: modalEnd,
          priority: "Thấp",
          progress: 0,
          status: "pending_approval",
          notes: notesStr,
          approval_stage: "pending_manager"
        }]);

      if (error) throw error;

      // Gửi email xác nhận — chạy nền, không chặn việc nộp đơn nếu gửi mail lỗi
      const taskForEmail = { title: titleStr, assignee: modalName, start_date: modalStart, due_date: modalEnd, notes: notesStr };
      const smtpConfig = readSmtpConfig();
      try {
        // Báo email cho người duyệt cấp 1 mà hệ thống đã suy ra ở trên — áp dụng
        // cho MỌI độ dài đơn, kể cả nửa ngày (trước đây nửa ngày gửi thẳng thư
        // "đã duyệt" cho người xin nghỉ vì hệ thống tự duyệt).
        const approverEmail = employeeDirectory.find(e => e.name === cap1Approver)?.email || "";
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
      } catch (notifyErr) {
        console.warn("Bỏ qua lỗi gửi email nghỉ phép:", notifyErr);
      }

      // Reset
      setModalStart(todayISO());
      setModalEnd(todayISO());
      setModalNotes("");
      setIsHalfDay(false);
      setLeaveType("Nghỉ phép năm hưởng lương");
      setIsLeaveModalOpen(false);
      fetchData();
      showNotice("success", "Đã gửi đơn nghỉ phép", "Đang chờ Trưởng phòng / Tổ trưởng xác nhận.");
    } catch (err: any) {
      console.error(err);
      showNotice("error", "Không gửi được đơn nghỉ phép", err.message || String(err));
    }
  };

  // Handle Request Business Trip
  const handleRequestTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalName || !modalStart || !modalEnd || !tripDestination || !tripMission) {
      showNotice("warning", "Chưa điền đủ thông tin", "Vui lòng nhập điểm công tác, nhiệm vụ và khoảng thời gian đi.");
      return;
    }

    const duration = tripDaysCount;
    if (duration <= 0) {
      showNotice("warning", "Khoảng ngày chưa hợp lệ", "Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu.");
      return;
    }

    // Đơn công tác đi cùng luồng duyệt với đơn nghỉ phép: gửi đích danh MỘT người
    // duyệt cấp 1 thay vì phát tán mail cho mọi quản lý trong phòng. Người này do
    // hệ thống suy ra (không có khái niệm "nghỉ 1 ngày" nên tham số thứ 2 là false).
    const cap1Approver = resolveCap1Approver(modalName, false);

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

${cap1Approver ? `Người duyệt: ${cap1Approver}` : ""}

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
        // resolveCap1Approver đã xử lý sẵn trường hợp thuộc tổ có nhóm duyệt riêng
        // (trả về tổ trưởng), nên ở đây chỉ việc tra mail của một cái tên duy nhất.
        const approverEmails = cap1Approver
          ? employeeDirectory
              .filter(e => e.name.trim().toLowerCase() === cap1Approver.trim().toLowerCase())
              .map(e => e.email)
              .filter(Boolean)
              .join(", ")
          : "";

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
        { from: "TPHCM", to: "", distance: "", date: todayISO(), transport: "Xe công ty", nights: 0, reason: "" }
      ]);
      setTripTravelEstimate(0);
      setTripOtherExpenses([]);
      setModalStart(todayISO());
      setModalEnd(todayISO());
      setModalNotes("");
      setIsTripModalOpen(false);
      fetchData();
      showNotice("success", "Đã gửi đơn công tác", "Đang chờ Trưởng phòng / Tổ trưởng xác nhận.");
    } catch (err: any) {
      console.error(err);
      showNotice("error", "Không gửi được đơn công tác", err.message || String(err));
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
      { from: "", to: "", distance: "", date: modalStart || todayISO(), transport: tripTransport || "Xe công ty", nights: 0, reason: "" }
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
      showNotice("warning", "Đơn này chưa có dữ liệu chi phí", "Không đủ thông tin để dựng biểu mẫu.");
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
        showNotice(
          "warning",
          "Chưa có file biểu mẫu gốc",
          `Không tìm thấy "${errData.fileName}" trong thư mục dashboard/public/templates/. ` +
          `Hệ thống tải tạm file Word tự dựng để không gián đoạn công việc.`
        );
      } else {
        showNotice(
          "warning",
          "Không kết nối được máy chủ biểu mẫu",
          "Hệ thống tải tạm file Word tự dựng thay thế."
        );
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
      showNotice("error", "Không tải được biểu mẫu", "Vui lòng thử lại hoặc báo bộ phận kỹ thuật.");
    }
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
                .filter(emp => visibleMemberNames.has(normalizeName(emp.name)))
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
            
            {/* Left Calendar view — chiếm hết bề ngang khi cột phải không có gì
                để hiện (bảng 3 tab đã dời sang trang Duyệt yêu cầu) */}
            <div className={`${pendingApprovals.length > 0 ? "lg:col-span-3" : "lg:col-span-4"} bg-white p-6 rounded-2xl border border-slate-200/50 shadow-sm flex flex-col space-y-4`}>
              
              {/* Calendar control bar */}
              <div className="flex items-center justify-between">
                <h2 className="font-heading font-extrabold text-base text-slate-800 tracking-tight">
                  {monthTitle}
                </h2>
                
                {/* Hai nút "Xin nghỉ phép" / "Đi công tác" đã dời ra sidebar,
                    nhóm "Quản lý Đăng ký". Form vẫn nằm nguyên ở trang này. */}
                <div className="flex items-center gap-2">
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
                      const cellDateStr = cell.date.toLocaleDateString("en-CA");
                      const dayNotes = notesOfDate(cellDateStr);
                      const isToday = cell.date.toDateString() === new Date().toDateString();

                      return (
                        <div
                          key={idx}
                          // Nhấn đúp vào ô để tự ghi chú cho ngày đó
                          onDoubleClick={() => setNoteModal({ date: cellDateStr, id: null, content: "" })}
                          title="Nhấn đúp để thêm ghi chú cho ngày này"
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

                          {/* Ghi chú cá nhân của ngày — bấm 1 lần để sửa/xoá */}
                          {dayNotes.map(n => (
                            <div
                              key={n.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setNoteModal({ date: n.note_date, id: n.id, content: n.content });
                              }}
                              title={n.content}
                              className="px-1.5 py-1 rounded text-[8px] border leading-tight truncate cursor-pointer transition-all bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/70 font-semibold"
                            >
                              📌 {n.content}
                            </div>
                          ))}

                          {/* Cell tasks lists */}
                          <div className="flex-1 space-y-1 overflow-y-auto max-h-[85px] scrollbar-thin">
                             {dayTasks.map(t => {
                              const isLeave = t.title.toLowerCase().startsWith("nghỉ phép");
                              const isTrip = t.title.toLowerCase().startsWith("công tác");
                              const taskOverdue = t.due_date && t.status !== "completed" && t.progress < 100 && t.due_date < new Date().toLocaleDateString("en-CA");
                              // Thẻ ở ô NGÀY GIAO — không phải mốc phải xong, nên để nhạt
                              // hẳn và ghi rõ chữ "Giao". Cùng một việc sẽ xuất hiện lần
                              // nữa ở ô deadline với kiểu bình thường.
                              const startCard = isStartAnchor(t, cellDateStr);
                              // Mốc tháng giữa — việc đang chạy, chưa tới hạn thật.
                              const midCard = isMidMonthAnchor(t, cell.date);

                              let styleClass = "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100/50";
                              if (startCard) {
                                styleClass = "bg-white text-slate-500 border-slate-200 border-dashed hover:bg-slate-50 hover:text-slate-700";
                              } else if (midCard) {
                                styleClass = "bg-amber-50/50 text-amber-700 border-amber-200 border-dashed hover:bg-amber-100/50";
                              } else if (taskOverdue) {
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
                                  key={`${t.id}-${startCard ? "start" : midCard ? "mid" : "due"}`}
                                  title={
                                    startCard
                                      ? `NGÀY GIAO — ${t.title} - ${t.assignee}. Hạn: ${t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN") : "—"}`
                                      : midCard
                                        ? `ĐANG CHẠY — ${t.title} - ${t.assignee} (${t.progress}%). Hạn thật: ${t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN") : "—"}`
                                        : `${t.title} - ${t.assignee} (${t.progress}%)`
                                  }
                                  onClick={() => handleTaskClick(t)}
                                  // Nhấn đúp lên thẻ việc là mở chi tiết, không phải tạo ghi chú
                                  onDoubleClick={(e) => e.stopPropagation()}
                                  className={`px-1.5 py-1 rounded text-[8px] border leading-tight truncate cursor-pointer transition-all ${styleClass}`}
                                >
                                  {startCard
                                    ? <><span className="font-bold opacity-70">Giao ·</span> {t.title}</>
                                    : midCard
                                      ? <><span className="font-bold opacity-70">Đang chạy ·</span> {t.title}</>
                                      : <>{taskOverdue && "⚠️ "}{isLeave ? "🌴" : isTrip ? "💼" : ""} {t.title.replace(/^Nghỉ phép:\s*|^Công tác:\s*/i, "")}</>}
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

            {/* Right Sidebar list — chỉ còn hàng chờ xác nhận cấp 1, hiện khi có đơn */}
            {pendingApprovals.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200/50 shadow-sm p-4 flex flex-col space-y-4">
                <div className="space-y-2.5">
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
                            onClick={() => { setRejectReason(""); setRejectBox({ taskId: t.id }); }}
                            className="flex-1 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-bold rounded-lg cursor-pointer transition-colors text-center active:scale-95"
                          >
                            Từ chối
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
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

              {/* Người duyệt cấp 1 do hệ thống tự xác định — chỉ hiện để người gửi
                  biết đơn sẽ tới tay ai, không phải ô nhập liệu. Nửa ngày cũng phải
                  qua duyệt nên khối này hiện với mọi độ dài đơn. */}
              {leaveDaysCount > 0 && (
                <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3 flex items-start gap-2 animate-in fade-in duration-200">
                  <CheckCircle2 size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    {resolveCap1Approver(modalName, leaveDaysCount <= 1) ? (
                      <>
                        <span className="text-slate-500 font-semibold">Đơn sẽ chuyển tới </span>
                        <span className="font-extrabold text-indigo-700">
                          {resolveCap1Approver(modalName, leaveDaysCount <= 1)}
                        </span>
                        <span className="text-slate-500 font-semibold"> xác nhận, sau đó HCNS duyệt cuối.</span>
                      </>
                    ) : (
                      <span className="text-slate-500 font-semibold">
                        Đơn sẽ nằm ở mục Duyệt yêu cầu để cấp quản lý xác nhận, sau đó HCNS duyệt cuối.
                      </span>
                    )}
                  </div>
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
      {/* Hộp báo dùng chung — căn giữa màn hình, cùng ngôn ngữ thiết kế với các
          modal khác của trang (nền mờ, thẻ trắng bo góc, hiệu ứng phóng nhẹ) */}
      {notice && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setNotice(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm p-7 shadow-2xl border border-slate-100 text-center space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
          >
            <div className="flex justify-center">
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center ring-8 ${
                  notice.kind === "success"
                    ? "bg-emerald-50 text-emerald-500 ring-emerald-500/10"
                    : notice.kind === "warning"
                    ? "bg-amber-50 text-amber-500 ring-amber-500/10"
                    : "bg-rose-50 text-rose-500 ring-rose-500/10"
                }`}
              >
                {notice.kind === "success"
                  ? <CheckCircle2 size={36} strokeWidth={2.2} />
                  : <AlertCircle size={36} strokeWidth={2.2} />}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-heading font-extrabold text-sm text-slate-800">{notice.title}</h3>
              {notice.message && (
                <p className="text-[11px] font-semibold text-slate-500 leading-relaxed whitespace-pre-line">
                  {notice.message}
                </p>
              )}
            </div>

            <button
              type="button"
              autoFocus
              onClick={() => setNotice(null)}
              className="w-full bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm shadow-blue-500/20 transition-all active:scale-95"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}

      {/* Hộp hỏi trước khi xoá — nút xác nhận màu đỏ để không bấm nhầm */}
      {confirmBox && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setConfirmBox(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-sm p-7 shadow-2xl border border-slate-100 text-center space-y-5 animate-in fade-in-50 zoom-in-95 duration-200"
          >
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center ring-8 ring-rose-500/10">
                <Trash2 size={32} strokeWidth={2.2} />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-heading font-extrabold text-sm text-slate-800">{confirmBox.title}</h3>
              {confirmBox.message && (
                <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">{confirmBox.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmBox(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => {
                  const run = confirmBox.onConfirm;
                  setConfirmBox(null);
                  run();
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm shadow-rose-500/20 transition-all active:scale-95"
              >
                {confirmBox.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hộp soạn ghi chú cá nhân — mở bằng nhấn đúp vào ô ngày */}
      {noteModal && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setNoteModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">📌</span>
                <div className="space-y-0.5">
                  <h3 className="font-heading font-extrabold text-sm text-slate-800">
                    {noteModal.id ? "Sửa ghi chú" : "Ghi chú cho ngày này"}
                  </h3>
                  <p className="text-[10px] font-semibold text-slate-400">
                    {new Date(noteModal.date).toLocaleDateString("vi-VN", {
                      weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
                    })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <textarea
              autoFocus
              rows={4}
              maxLength={500}
              value={noteModal.content}
              onChange={(e) => setNoteModal({ ...noteModal, content: e.target.value })}
              placeholder="Ví dụ: Họp giao ban 8h, nhắc nộp báo cáo tuần, bận đi công trường Vàm Láng..."
              className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 font-semibold text-slate-800 text-xs bg-slate-50/50 resize-none scrollbar-thin"
            />

            <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1.5">
              <span>🔒</span> Chỉ mình bạn thấy ghi chú này. Còn {500 - noteModal.content.length} ký tự.
            </p>

            <div className="flex items-center gap-2.5">
              {noteModal.id && (
                <button
                  type="button"
                  onClick={handleDeleteNote}
                  className="px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95"
                >
                  <Trash2 size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={savingNote}
                className="flex-1 bg-[#005BAC] hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm shadow-blue-500/20 transition-all active:scale-95"
              >
                {savingNote ? "Đang lưu..." : "Lưu ghi chú"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ô nhập lý do từ chối — z-50 để hộp báo (z-60) nổi lên trên khi bỏ trống */}
      {rejectBox && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setRejectBox(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-200"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 shrink-0 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center ring-8 ring-rose-500/10">
                <AlertCircle size={22} strokeWidth={2.2} />
              </div>
              <div className="space-y-0.5">
                <h3 className="font-heading font-extrabold text-sm text-slate-800">Từ chối yêu cầu</h3>
                <p className="text-[10px] font-semibold text-slate-400">
                  Lý do sẽ được gửi email cho người làm đơn.
                </p>
              </div>
            </div>

            <textarea
              autoFocus
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ví dụ: Trùng lịch họp phòng, đề nghị dời sang tuần sau."
              className="w-full border border-slate-200 rounded-xl p-3 outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 font-semibold text-slate-800 text-xs bg-slate-50/50 resize-none scrollbar-thin"
            />

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setRejectBox(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl transition-all active:scale-95"
              >
                Huỷ bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!rejectReason.trim()) {
                    showNotice(
                      "warning",
                      "Chưa nhập lý do từ chối",
                      "Lý do sẽ được gửi email cho người làm đơn nên bắt buộc phải có."
                    );
                    return;
                  }
                  const taskId = rejectBox.taskId;
                  const reason = rejectReason;
                  setRejectBox(null);
                  handleCap1Reject(taskId, reason);
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 rounded-xl shadow-sm shadow-rose-500/20 transition-all active:scale-95"
              >
                Từ chối yêu cầu
              </button>
            </div>
          </div>
        </div>
      )}

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

              {/* Người duyệt cấp 1 do hệ thống tự xác định — xem ghi chú ở
                  resolveCap1Approver. Chỉ hiện để người gửi biết đơn tới tay ai. */}
              <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-3 flex items-start gap-2">
                <CheckCircle2 size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  {resolveCap1Approver(modalName, false) ? (
                    <>
                      <span className="text-slate-500 font-semibold">Đơn sẽ chuyển tới </span>
                      <span className="font-extrabold text-indigo-700">{resolveCap1Approver(modalName, false)}</span>
                      <span className="text-slate-500 font-semibold"> xác nhận, sau đó HCNS duyệt cuối.</span>
                    </>
                  ) : (
                    <span className="text-slate-500 font-semibold">
                      Đơn sẽ nằm ở mục Duyệt yêu cầu để cấp quản lý xác nhận, sau đó HCNS duyệt cuối.
                    </span>
                  )}
                </div>
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
                      onClick={() => showNotice("warning", "Tính năng đang phát triển", "Biểu mẫu Excel chưa sẵn sàng. Vui lòng dùng biểu mẫu Word để in ấn.")}
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
                      onClick={() => {
                        const taskId = selectedTask.id;
                        setConfirmBox({
                          title: "Xoá lịch trình này?",
                          message: "Lịch sẽ bị xoá khỏi hệ thống và không khôi phục lại được.",
                          confirmLabel: "Xoá lịch",
                          onConfirm: async () => {
                            try {
                              const { error } = await supabase.from("tasks").delete().eq("id", taskId);
                              if (error) throw error;
                              setIsDetailsModalOpen(false);
                              setSelectedTask(null);
                              fetchData();
                              showNotice("success", "Đã xoá lịch trình");
                            } catch (err: any) {
                              showNotice("error", "Không xoá được lịch trình", err.message || String(err));
                            }
                          },
                        });
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

// useSearchParams (đọc ?dk= từ sidebar) bắt buộc phải nằm trong Suspense —
// cùng cách bọc như trang Cài đặt hệ thống.
export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-[#F7F9FC] items-center justify-center">
        <span className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <CalendarContent />
    </Suspense>
  );
}

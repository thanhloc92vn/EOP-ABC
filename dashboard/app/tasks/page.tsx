"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect, useMemo, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { isHrDept, isDirectorRole } from "@/lib/access";
import { normalizeName } from "@/lib/approvers";
import { useDepartments } from "@/lib/departments";
import {
  Calendar,
  Paperclip,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  User,
  ArrowUpDown,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Users,
  Filter
} from "lucide-react";

// Một dòng trong "Danh sách nhân viên" — gốc để suy ra task thuộc phòng nào.
interface EmployeeRef {
  id: string;
  name: string;
  department?: string | null;
  role?: string | null;
  email?: string | null;
}

interface Task {
  id: string;
  title: string;
  priority: string;
  assignee: string;
  due_date: string;
  progress: number;
  attachments: number;
  comments: number;
  status: string;
  description?: string;
  start_date?: string;
  link?: string;
  notes?: string;
}

// Trưởng phòng / Phó phòng / Tổ trưởng — quản lý cấp phòng: thấy cả phòng mình,
// và khi họ giao việc cho người khác thì hệ thống gửi email báo nhân viên.
// Quản lý cấp đơn vị — hai khối ĐỐI XỨNG NHAU, quyền như nhau:
//   Khối Văn phòng : Trưởng phòng / Phó phòng / Tổ trưởng
//   Khối Dự án     : Chỉ huy trưởng / Chỉ huy phó / Tổ trưởng
// Thiếu hai chức danh chỉ huy thì cả Ban điều hành dự án không giao được việc và
// không nhận được email khi giao — trong khi họ quản lý y hệt trưởng/phó phòng.
const isDeptManagerRole = (role?: string | null) => {
  const r = normalizeName(role || "");
  return (
    r.includes("truong phong") || r.includes("pho phong") ||
    r.includes("pho truong phong") || r.includes("quyen truong phong") ||
    r.includes("chi huy truong") || r.includes("chi huy pho") ||
    r.includes("to truong")
  );
};

// Tiện ích khoảng tháng cho bộ lọc thời gian — giống hệt bộ lọc Tuyển dụng ở Trang chủ.
const monthFirstDay = (mk: string) => `${mk}-01`;
const monthLastDay = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return `${mk}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const fmtD = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
// Cắt phần giờ nếu cột ngày lưu dạng timestamp — so sánh chuỗi "YYYY-MM-DD" mới đúng.
const dayKey = (v?: string | null) => (v ? String(v).slice(0, 10) : "");

// Cấu hình SMTP dự phòng đọc từ trình duyệt (Cài đặt hệ thống / C&B). Email hệ thống
// trên server (SMTP_USER/SMTP_PASS) luôn được API ưu tiên trước.
const readSmtpConfig = () => ({
  user: typeof window !== "undefined" ? localStorage.getItem("tnec_cb_smtp_user") || "" : "",
  pass: typeof window !== "undefined" ? localStorage.getItem("tnec_cb_smtp_pass") || "" : "",
  host: typeof window !== "undefined" ? localStorage.getItem("tnec_cb_smtp_host") || "smtp.gmail.com" : "smtp.gmail.com",
  port: typeof window !== "undefined" ? Number(localStorage.getItem("tnec_cb_smtp_port")) || 465 : 465,
  secure: typeof window === "undefined" || localStorage.getItem("tnec_cb_smtp_secure") !== "false",
});

const COLUMNS = [
  { id: "planning", title: "Lập kế hoạch", color: "border-t-slate-400" },
  { id: "in_progress", title: "Đang thực hiện", color: "border-t-blue-500" },
  { id: "pending_approval", title: "Chờ phê duyệt", color: "border-t-purple-500" },
  { id: "need_revision", title: "Cần chỉnh sửa", color: "border-t-rose-500" },
  { id: "completed", title: "Đã hoàn thành", color: "border-t-emerald-500" },
];

const getCardStyles = (status: string) => {
  switch (status) {
    case "planning":
      return {
        bg: "bg-gradient-to-br from-slate-50/90 to-slate-100/40 border-slate-200/60 border-l-4 border-l-slate-400",
        title: "text-slate-800",
        shadow: "shadow-sm hover:shadow-md hover:shadow-slate-200/40",
      };
    case "in_progress":
      return {
        bg: "bg-gradient-to-br from-blue-50/60 to-sky-50/20 border-blue-200/45 border-l-4 border-l-blue-500",
        title: "text-blue-950",
        shadow: "shadow-sm shadow-blue-500/5 hover:shadow-md hover:shadow-blue-500/10",
      };
    case "pending_approval":
      return {
        bg: "bg-gradient-to-br from-purple-50/60 to-fuchsia-50/20 border-purple-200/45 border-l-4 border-l-purple-500",
        title: "text-purple-950",
        shadow: "shadow-sm shadow-purple-500/5 hover:shadow-md hover:shadow-purple-500/10",
      };
    case "need_revision":
      return {
        bg: "bg-gradient-to-br from-rose-50/65 to-pink-50/20 border-rose-200/45 border-l-4 border-l-rose-500",
        title: "text-rose-950",
        shadow: "shadow-sm shadow-rose-500/5 hover:shadow-md hover:shadow-rose-500/10",
      };
    case "completed":
      return {
        bg: "bg-gradient-to-br from-emerald-50/60 to-teal-50/20 border-emerald-200/45 border-l-4 border-l-emerald-500",
        title: "text-emerald-950",
        shadow: "shadow-sm shadow-emerald-500/5 hover:shadow-md hover:shadow-emerald-500/10",
      };
    default:
      return {
        bg: "bg-white border-slate-200/40 border-l-4 border-l-slate-400",
        title: "text-slate-800",
        shadow: "shadow-sm",
      };
  }
};

export default function TaskManagementPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  // Danh tính người dùng — hook chung (thay khối allowed_users + employees +
  // fetchApprovalPermissions từng copy-paste ở mỗi trang).
  const user = useCurrentUser();
  const currentUser = user.authenticated ? user : null;
  const perms = user.perms;
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newPriority, setNewPriority] = useState("Trung bình");
  const [newDueDate, setNewDueDate] = useState("");
  const [newProgress, setNewProgress] = useState(0);
  const [newDescription, setNewDescription] = useState("");
  const [newStatus, setNewStatus] = useState("planning");
  const [newStartDate, setNewStartDate] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [newLink, setNewLink] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [isAiSuggesting, setIsAiSuggesting] = useState(false);
  const [employeesList, setEmployeesList] = useState<EmployeeRef[]>([]);

  // Ô "Người nhận" — picker có ô tìm kiếm, dựng theo đúng ô "Nhân viên tham dự"
  // ở trang Đăng ký phòng họp / xe để hai màn hình nhìn giống nhau.
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const assigneePickerRef = useRef<HTMLDivElement>(null);

  // Bộ lọc thời gian của bảng Kanban — mặc định THÁNG HIỆN TẠI, cho phép chỉnh
  // từ ngày / đến ngày. Dựng theo đúng bộ lọc Tuyển dụng ở Trang chủ.
  const nowD = new Date();
  const currentMonthKey = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  // Ngày hôm nay theo giờ máy người dùng — dùng để bật cảnh báo đỏ "đến hạn hôm nay".
  const todayKey = `${currentMonthKey}-${String(nowD.getDate()).padStart(2, "0")}`;
  // Ngày mai — bật cảnh báo VÀNG "sắp đến hạn" (trước hạn 1 ngày). Phải dựng qua
  // Date rồi format lại, không được cộng 1 vào chuỗi ngày: cộng thẳng là sai bét
  // ở cuối tháng (31 -> 32) và cuối năm (31/12 -> 32/12).
  const tomorrowD = new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() + 1);
  const tomorrowKey = `${tomorrowD.getFullYear()}-${String(tomorrowD.getMonth() + 1).padStart(2, "0")}-${String(tomorrowD.getDate()).padStart(2, "0")}`;
  const [taskMonth, setTaskMonth] = useState<string>(currentMonthKey);
  const [taskFrom, setTaskFrom] = useState<string>(monthFirstDay(currentMonthKey));
  const [taskTo, setTaskTo] = useState<string>(monthLastDay(currentMonthKey));
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Bộ lọc Phòng ban / Ban điều hành — mượn nguyên từ trang Danh sách nhân viên.
  // Danh mục đọc từ bảng `departments` nên thêm/bớt phòng chỉ cần sửa dữ liệu.
  const { phongBan: DEPARTMENTS, bdh: BDH_OPTIONS } = useDepartments();
  const [filterDept, setFilterDept] = useState("all");
  const [filterBdh, setFilterBdh] = useState("all");

  const handleTaskMonthChange = (mk: string) => {
    if (!mk) return;
    setTaskMonth(mk);
    setTaskFrom(monthFirstDay(mk));
    setTaskTo(monthLastDay(mk));
  };

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editPriority, setEditPriority] = useState("Trung bình");
  const [editDueDate, setEditDueDate] = useState("");
  const [editProgress, setEditProgress] = useState(0);
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("planning");
  const [editStartDate, setEditStartDate] = useState("");
  const [editLink, setEditLink] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Drag State
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  // Thẻ vừa được kéo vào "Đã hoàn thành" — dùng để bật hiệu ứng chúc mừng
  const [justCompletedId, setJustCompletedId] = useState<string | null>(null);

  // Grouped columns: collapse tasks that share the same assignee (name or department)
  const GROUPED_COLUMNS = new Set(["planning", "completed"]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Fetch Tasks from Supabase
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      if (data) {
        // Auto-migrate old VPP task statuses (runs under authenticated user session)
        const vppTasksToMigrate = data.filter((t: any) => 
          t.title.toLowerCase().startsWith("vpp:") && 
          (t.status === "pending_approval" || t.status === "completed")
        );

        if (vppTasksToMigrate.length > 0) {
          console.log("Auto-migrating old VPP task statuses in tasks page...", vppTasksToMigrate.length);
          for (const t of vppTasksToMigrate) {
            const newStatus = t.status === "pending_approval" ? "Chờ duyệt" : "Hoàn thành";
            let notesObj: any = {};
            try {
              notesObj = JSON.parse(t.notes || "{}");
            } catch (e) {}
            notesObj.frequency = notesObj.frequency || "Cấp phát";

            await supabase
              .from("tasks")
              .update({ status: newStatus, notes: JSON.stringify(notesObj) })
              .eq("id", t.id);
          }
          // Re-fetch tasks after migration
          setTimeout(() => {
            fetchTasks();
          }, 500);
          return;
        }

        // Map database fields to interface
        const mappedTasks = data.map((t: any) => ({
          id: t.id,
          title: t.title,
          priority: t.priority || "Trung bình",
          assignee: t.assignee || "Chưa phân công",
          due_date: t.due_date || "",
          progress: t.progress || 0,
          attachments: t.attachments || 0,
          comments: t.comments || 0,
          status: t.status || "planning",
          description: t.description || "",
          start_date: t.start_date || "",
          link: t.link || "",
          notes: t.notes || ""
        }));
        setTasks(mappedTasks);
      }
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployeesList = async () => {
    try {
      // Lấy kèm phòng ban + chức danh: "Danh sách nhân viên" là GỐC để biết task
      // thuộc phòng nào và ai là Trưởng/Phó phòng/Tổ trưởng của phòng đó.
      const { data, error } = await supabase
        .from("employees_directory")
        .select("id, name, department, role, email")
        .order("name", { ascending: true });
      if (data) {
        setEmployeesList(data as EmployeeRef[]);
      }
    } catch (err) {
      console.error("Error fetching employees list:", err);
    }
  };

  const handleAiSuggest = async () => {
    if (!newTitle) {
      alert("Vui lòng nhập Tên công việc trước khi tạo mô tả bằng AI!");
      return;
    }
    
    setIsAiSuggesting(true);
    try {
      const key = localStorage.getItem("openai_api_key");
      const headers: any = { "Content-Type": "application/json" };
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }
      
      const res = await apiFetch("/api/suggest-task-desc", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: newTitle }),
      });
      
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.description) {
        setNewDescription(data.description);
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối khi gọi AI!");
    } finally {
      setIsAiSuggesting(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchEmployeesList();
  }, []);

  // Bấm ra ngoài thì đóng dropdown "Người nhận"
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) {
        setShowAssigneeDropdown(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Handle Drag Start
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedTaskId(id);
    e.dataTransfer.setData("text/plain", id);
  };

  // Handle Drop
  const handleDrop = async (e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    const taskId = draggedTaskId || e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    const isCompleting = columnId === "completed";

    // Chỉ Trưởng phòng / Phó phòng / Tổ trưởng / Admin được kết luận công việc
    // đã xong — nhân viên tự kéo vào "Đã hoàn thành" sẽ bị chặn.
    if (isCompleting && !canManageTasks) {
      alert(
        'Chỉ Trưởng phòng, Phó phòng, Tổ trưởng hoặc Admin mới được chuyển công việc sang "Đã hoàn thành".\n\n' +
        "Bạn hãy cập nhật tiến độ và chuyển sang \"Chờ phê duyệt\" để cấp quản lý xác nhận."
      );
      setDraggedTaskId(null);
      return;
    }

    // Vào cột hoàn thành thì tiến độ tự nhảy 100%
    const patch = isCompleting ? { status: columnId, progress: 100 } : { status: columnId };

    // Optimistic UI Update
    setTasks(prev => prev.map(t => (t.id === taskId ? { ...t, ...patch } : t)));
    if (isCompleting) {
      // Bật hiệu ứng chúc mừng trên thẻ vừa hoàn thành, tự tắt sau ~1.4s
      setJustCompletedId(taskId);
      setTimeout(() => setJustCompletedId(cur => (cur === taskId ? null : cur)), 1400);
    }

    // Update in Supabase
    try {
      const { error } = await supabase
        .from("tasks")
        .update(patch)
        .eq("id", taskId);

      if (error) throw error;
    } catch (err) {
      console.error("Error updating task status:", err);
      // Rollback on error
      fetchTasks();
    } finally {
      setDraggedTaskId(null);
    }
  };

  // Gửi email báo "bạn được giao việc mới". Im lặng bỏ qua khi không đủ điều kiện —
  // việc đã tạo xong rồi, lỗi email không được làm hỏng thao tác của người dùng.
  const notifyAssignee = async (task: {
    title: string; assignee: string; priority: string;
    due_date?: string; start_date?: string; description?: string; link?: string;
  }) => {
    try {
      if (!currentUser) return;

      const amIManagerOrLeader =
        currentUser.isAdmin ||
        currentUser.isDirector ||
        isDirectorRole(currentUser.department) ||
        isDeptManagerRole(currentUser.role);
      if (!amIManagerOrLeader) return; // nhân viên thường tự tạo việc -> không gửi

      // Giao cho chính mình -> không gửi
      const meKey = normalizeName(currentUser.name);
      const targetKey = normalizeName(task.assignee);
      if (!targetKey || targetKey === meKey) return;

      const emp = employeesList.find(e => normalizeName(e.name) === targetKey);
      if (!emp?.email) {
        // Báo rõ thay vì im lặng — nếu không, người giao việc tưởng tính năng hỏng.
        alert(
          `Đã tạo công việc, nhưng KHÔNG gửi được email báo ${task.assignee}:\n` +
          `nhân sự này chưa có email trong Danh sách nhân viên.\n\n` +
          `Vào Danh sách nhân viên bổ sung email công ty cho họ để lần sau hệ thống gửi được.`
        );
        return;
      }

      const res = await apiFetch("/api/send-task-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtpConfig: readSmtpConfig(),
          task,
          assigneeEmails: emp.email,
          assigneeName: emp.name,
          assignedByName: currentUser.name,
          assignedByRole: currentUser.role,
          siteUrl: typeof window !== "undefined" ? window.location.origin : "",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data?.error) {
        alert(`Đã tạo công việc, nhưng KHÔNG gửi được email báo ${task.assignee}:\n${data.error}`);
      }
    } catch (err: any) {
      alert(`Đã tạo công việc, nhưng KHÔNG gửi được email báo ${task.assignee}:\n${err?.message || err}`);
    }
  };

  // Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      alert("Vui lòng điền Tên công việc!");
      return;
    }
    if (!newAssignee) {
      alert("Vui lòng chọn Người nhận!");
      return;
    }
    // Ô Người nhận giờ là ô GÕ TỰ DO (có gợi ý datalist) nên phải chốt lại tên
    // đúng người trong danh sách — tránh giao việc cho một cái tên gõ sai, task
    // sẽ không hiện với ai và không gửi được email báo.
    if (!assignableEmployees.some(emp => emp.name === newAssignee.trim())) {
      alert("Người nhận không hợp lệ!\nHãy gõ và CHỌN tên từ danh sách gợi ý.");
      return;
    }

    const assigneeName = newAssignee.trim();

    try {
      const { error } = await supabase
        .from("tasks")
        .insert([{
          title: newTitle,
          assignee: assigneeName,
          priority: newPriority,
          due_date: newDueDate || null,
          progress: Number(newProgress),
          status: newStatus,
          description: newDescription,
          start_date: newStartDate || null,
          link: newLink,
          notes: newNotes
        }]);

      if (error) throw error;

      // ─── Báo email cho nhân viên khi CẤP QUẢN LÝ giao việc ───
      // Nhân viên tự tạo việc cho mình -> KHÔNG gửi. Chỉ gửi khi người tạo là
      // Trưởng/Phó phòng, Tổ trưởng, Ban lãnh đạo hoặc Admin, VÀ giao cho người khác.
      // Người gửi luôn là email hệ thống cấu hình ở Cài đặt hệ thống; người nhận lấy
      // email trong Danh sách nhân viên (ưu tiên email công ty).
      notifyAssignee({
        title: newTitle,
        assignee: assigneeName,
        priority: newPriority,
        due_date: newDueDate,
        start_date: newStartDate,
        description: newDescription,
        link: newLink,
      });

      // Reset Form & Close Modal
      setNewTitle("");
      setNewAssignee("");
      setAssigneeSearch("");
      setShowAssigneeDropdown(false);
      setNewPriority("Trung bình");
      setNewDueDate("");
      setNewProgress(0);
      setNewDescription("");
      setNewStatus("planning");
      setNewLink("");
      setNewNotes("");
      setIsModalOpen(false);

      // Refresh tasks
      fetchTasks();
    } catch (err) {
      console.error("Error creating task:", err);
      alert("Lỗi khi tạo công việc!");
    }
  };

  // Delete Task
  const handleDeleteTask = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa công việc này?")) return;
    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      if (editingTask?.id === id) {
        setIsEditModalOpen(false);
        setEditingTask(null);
      }
      fetchTasks();
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

  const handleOpenEditModal = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditAssignee(task.assignee);
    setEditPriority(task.priority);
    setEditDueDate(task.due_date || "");
    setEditProgress(task.progress || 0);
    setEditDescription(task.description || "");
    setEditStatus(task.status || "planning");
    setEditStartDate(task.start_date || "");
    setEditLink(task.link || "");
    setEditNotes(task.notes || "");
    setIsEditModalOpen(true);
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    if (!editTitle.trim()) {
      alert("Vui lòng điền Tên công việc!");
      return;
    }
    if (!editAssignee) {
      alert("Vui lòng chọn Người nhận!");
      return;
    }

    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          title: editTitle,
          assignee: editAssignee,
          priority: editPriority,
          due_date: editDueDate || null,
          progress: Number(editProgress),
          status: editStatus,
          description: editDescription,
          start_date: editStartDate || null,
          link: editLink,
          notes: editNotes
        })
        .eq("id", editingTask.id);

      if (error) throw error;

      setIsEditModalOpen(false);
      setEditingTask(null);
      fetchTasks();
    } catch (err) {
      console.error("Error updating task:", err);
      alert("Lỗi khi cập nhật công việc!");
    }
  };

  const handleAiSuggestEdit = async () => {
    if (!editTitle) {
      alert("Vui lòng nhập Tên công việc trước khi tạo mô tả bằng AI!");
      return;
    }
    
    setIsAiSuggesting(true);
    try {
      const key = localStorage.getItem("openai_api_key");
      const headers: any = { "Content-Type": "application/json" };
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }
      
      const res = await apiFetch("/api/suggest-task-desc", {
        method: "POST",
        headers,
        body: JSON.stringify({ title: editTitle }),
      });
      
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      } else if (data.description) {
        setEditDescription(data.description);
      }
    } catch (err) {
      console.error(err);
      alert("Lỗi kết nối khi gọi AI!");
    } finally {
      setIsAiSuggesting(false);
    }
  };

  // ─── GỐC PHÂN QUYỀN: "Danh sách nhân viên" (employees_directory) ───
  // Task chỉ lưu TÊN người nhận, nên phòng ban của task = phòng ban của người nhận
  // tra trong Danh sách nhân viên. Đổi phòng cho ai trong danh sách -> quyền tự theo.
  const findEmployeeByName = (name: string): EmployeeRef | null => {
    const key = normalizeName(name || "");
    if (!key) return null;
    return (
      employeesList.find(e => normalizeName(e.name) === key) ||
      employeesList.find(e => {
        const n = normalizeName(e.name);
        return !!n && (n.includes(key) || key.includes(n));
      }) ||
      null
    );
  };

  const myDeptKey = normalizeName(currentUser?.department || "");
  const amIDeptManager = isDeptManagerRole(currentUser?.role);

  // Ai được giao việc cho toàn công ty (không giới hạn phòng)
  const seesAllDepartments = !!currentUser && (
    currentUser.isAdmin ||
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.isDirector ||
    isDirectorRole(currentUser.department) ||
    perms.canViewAllTasks
  );

  // Ô "Người nhận" chỉ liệt kê nhân sự CÙNG PHÒNG với tài khoản đang dùng —
  // Trưởng phòng Thị trường chỉ giao được cho người phòng Thị trường.
  // Admin / Ban lãnh đạo / người có cờ xem toàn bộ thì vẫn chọn được mọi phòng.
  const assignableEmployees = seesAllDepartments || !myDeptKey
    ? employeesList
    : employeesList.filter(e => normalizeName(e.department || "") === myDeptKey);

  // Lọc gợi ý cho ô "Người nhận": khớp cả TÊN lẫn PHÒNG BAN, cắt còn 30 dòng để
  // danh sách 112 người không làm dropdown ì. Giống hệt ô "Nhân viên tham dự".
  const filteredAssignees = useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    return assignableEmployees
      .filter(e => !q || e.name.toLowerCase().includes(q) || (e.department || "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [assignableEmployees, assigneeSearch]);

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.assignee.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    // ─── Lọc theo khoảng thời gian: căn theo DEADLINE ───
    // Việc thuộc "Tháng 7" khi DEADLINE rơi vào tháng 7, bất kể bắt đầu từ bao giờ.
    // Việc KHÔNG có deadline thì luôn hiện — không có căn cứ để loại, ẩn đi sẽ làm
    // người dùng tưởng mất việc.
    if (taskFrom && taskTo) {
      const d = dayKey(t.due_date);
      if (d && (d < taskFrom || d > taskTo)) return false;
    }

    // ─── Lọc theo Phòng ban / Ban điều hành ───
    // Bảng `tasks` chỉ lưu TÊN người nhận, không lưu phòng — nên phải tra ngược ra
    // phòng qua Danh sách nhân viên. Một số việc đặt thẳng tên phòng vào ô người
    // nhận (giao cho cả phòng), nên tra không ra người thì lấy chính ô đó làm phòng.
    if (filterDept !== "all" || filterBdh !== "all") {
      const wanted = normalizeName(filterDept !== "all" ? filterDept : filterBdh);
      const taskDept = normalizeName(findEmployeeByName(t.assignee)?.department || t.assignee);
      if (taskDept !== wanted) return false;
    }

    if (!currentUser) return false;

    // Đơn NGHỈ PHÉP / CÔNG TÁC không thuộc bảng Kanban này — chúng hiển thị ở
    // trang Lịch công việc và được duyệt ở Lịch công việc / Duyệt yêu cầu.
    // Chúng nằm chung bảng `tasks` chỉ vì lý do lưu trữ, nên trước đây lọt vào
    // đây thành thẻ trùng lặp ở cột "Chờ phê duyệt" / "Cần chỉnh sửa", và kéo
    // thả còn đổi nhầm trạng thái duyệt của đơn.
    const titleLower = t.title.toLowerCase();
    const isLeaveRequest = titleLower.startsWith("nghỉ phép") || titleLower.includes("nghi phep");
    const isTripRequest = titleLower.startsWith("công tác") || titleLower.includes("cong tac");
    if (isLeaveRequest || isTripRequest) return false;

    const userEmail = currentUser.email.toLowerCase().trim();
    const userName = currentUser.name;

    // 1. THẤY TOÀN BỘ CÔNG TY: Admin, Giám đốc/Ban lãnh đạo, hoặc được cấp cờ riêng
    //    can_view_all_tasks (cờ đọc từ approval_permissions nên bàn giao tài khoản là
    //    quyền tự chuyển sang người tiếp nhận).
    //    LƯU Ý: Trưởng/Phó phòng & Tổ trưởng KHÔNG còn nằm ở đây — họ chỉ thấy phòng
    //    mình (xử lý ở bước 2), theo đúng quy định phân quyền theo phòng ban.
    const seesEverything =
      currentUser.isAdmin ||
      currentUser.role.toLowerCase() === "admin" ||
      currentUser.isDirector ||
      // người thuộc Ban Giám đốc (phòng ban, không phải chức danh) — giữ như trước
      isDirectorRole(currentUser.department) ||
      perms.canViewAllTasks;

    if (seesEverything) return true;

    // --- VPP TASK FILTER SYNC ---
    // If it is a VPP (Stationery) request task, apply custom visibility rules
    const isVppTask = t.title.toLowerCase().startsWith("vpp:") || t.title.toLowerCase().includes("vpp");
    if (isVppTask) {
      // 1. HR Department staff who handle VPP see all VPP tasks
      const userDept = currentUser.department ? currentUser.department.toLowerCase().trim() : "";
      // Nhận diện phòng HCNS qua helper trung tâm (thay so chuỗi rời rạc).
      const isUserInHr = isHrDept(currentUser.department) || perms.canManageVpp;
      if (isUserInHr) return true;

      // 2. The requester sees their own requested VPP tasks
      let requesterName = "";
      try {
        const notesObj = JSON.parse(t.notes || "{}");
        requesterName = notesObj.requesterName || "";
      } catch (e) {}

      const isRequester = requesterName && (
        requesterName.toLowerCase().includes(userName.toLowerCase()) ||
        userName.toLowerCase().includes(requesterName.toLowerCase())
      );
      if (isRequester) return true;

      // 3. Employees in the target department see tasks of their department
      const targetAssignee = t.assignee.toLowerCase().trim();
      if (
        userDept && (
          targetAssignee === userDept ||
          targetAssignee.includes(userDept) ||
          userDept.includes(targetAssignee)
        )
      ) {
        return true;
      }

      // Hide if none of the criteria are met
      return false;
    }

    // 2. QUẢN LÝ CẤP PHÒNG (Trưởng phòng / Phó phòng / Tổ trưởng theo chức danh trong
    //    Danh sách nhân viên): thấy mọi task của nhân viên CÙNG PHÒNG với mình.
    //    Phòng của task = phòng của người nhận, tra trong Danh sách nhân viên.
    if (amIDeptManager && myDeptKey) {
      const taskDeptKey = normalizeName(findEmployeeByName(t.assignee)?.department || "");
      if (taskDeptKey && taskDeptKey === myDeptKey) return true;
      // không khớp phòng -> rơi xuống các luật dưới (giám sát / task của chính mình)
    }

    // 3. Quan hệ giám sát (approval_permissions.supervises_name): người này thấy task
    // của người họ giám sát + của chính mình. Trước đây so cứng "Như Quỳnh thấy Thanh
    // Hằng" / "Hoành Anh thấy Thùy Quyên" — giờ là dữ liệu, tự chuyển giao khi đổi người.
    if (perms.supervisesName) {
      const supervisedLower = perms.supervisesName.toLowerCase();
      const targetAssignee = t.assignee.toLowerCase();
      const cleanUserName = userName.toLowerCase();
      return targetAssignee.includes(supervisedLower) || supervisedLower.includes(targetAssignee) ||
             targetAssignee === userEmail ||
             targetAssignee.includes(cleanUserName) || cleanUserName.includes(targetAssignee);
    }

    // 4. Các nhân viên, chuyên viên khác thì tự thấy task của chính họ
    const targetAssignee = t.assignee.toLowerCase();
    const cleanUserName = userName.toLowerCase();
    return targetAssignee === cleanUserName || 
           targetAssignee.includes(cleanUserName) ||
           cleanUserName.includes(targetAssignee) ||
           targetAssignee === userEmail;
  });

  // Chỉ huy trưởng / Chỉ huy phó của Ban điều hành dự án có quyền y hệt
  // Trưởng phòng / Phó phòng khối Văn phòng — xem isDeptManagerRole ở đầu file.
  //
  // Giám đốc / Phó Giám đốc (currentUser.isDirector = isDirectorRole(role)) trước
  // đây BỊ QUÊN ở đây: danh sách chỉ có cấp phòng nên Giám đốc không xoá được việc
  // và không kết luận được "Đã hoàn thành" — dù hàm SQL caller_can_manage_tasks()
  // của migration 010 vẫn cho phép. Giao diện chặt hơn CSDL, nay bổ sung cho khớp.
  const canManageTasks = !!(currentUser && (
    currentUser.isAdmin ||
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.isDirector ||
    currentUser.role.toLowerCase().includes("trưởng phòng") ||
    currentUser.role.toLowerCase().includes("truong phong") ||
    currentUser.role.toLowerCase().includes("phó phòng") ||
    currentUser.role.toLowerCase().includes("pho phong") ||
    currentUser.role.toLowerCase().includes("phó trưởng phòng") ||
    currentUser.role.toLowerCase().includes("pho truong phong") ||
    currentUser.role.toLowerCase().includes("chỉ huy trưởng") ||
    currentUser.role.toLowerCase().includes("chi huy truong") ||
    currentUser.role.toLowerCase().includes("chỉ huy phó") ||
    currentUser.role.toLowerCase().includes("chi huy pho") ||
    currentUser.role.toLowerCase().includes("tổ trưởng") ||
    currentUser.role.toLowerCase().includes("to truong") ||
    currentUser.role.toLowerCase().includes("leader")
  ));

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        {/* Phụ đề nói đúng phạm vi người xem đang thấy (trước đây cứng là "phòng
            Hành chính Nhân sự" với mọi người). */}
        <Header
          title="Quản lý Công việc"
          subtitle={
            !currentUser
              ? "Bảng theo dõi và quản lý công việc"
              : (currentUser.isAdmin || currentUser.isDirector || perms.canViewAllTasks)
                ? "Bảng theo dõi công việc — toàn công ty"
                : amIDeptManager && currentUser.department
                  ? `Bảng theo dõi công việc — ${currentUser.department}`
                  : "Bảng theo dõi công việc của bạn"
          }
        />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Subheader Filters */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm nhiệm vụ, người làm..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                />
              </div>
              <button
                onClick={fetchTasks}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-xs font-semibold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
              >
                Tải lại
              </button>

              {/* Lọc Phòng ban / Ban điều hành — CHỈ hiện với người xem được toàn công
                  ty. Người khác vốn chỉ thấy việc phòng mình, bày ra chỉ tổ rối. */}
              {seesAllDepartments && (
                <>
                  <div className="flex items-center gap-2 bg-white px-3 py-2 border border-slate-200 rounded-xl shadow-sm">
                    <Filter size={13} className="text-slate-400" />
                    <select
                      value={filterDept}
                      onChange={(e) => {
                        setFilterDept(e.target.value);
                        if (e.target.value !== "all") setFilterBdh("all");
                      }}
                      className="text-xs text-slate-600 bg-transparent outline-none font-semibold cursor-pointer"
                    >
                      <option value="all">Tất cả phòng ban</option>
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 bg-white px-3 py-2 border border-slate-200 rounded-xl shadow-sm">
                    <Filter size={13} className="text-slate-400" />
                    <select
                      value={filterBdh}
                      onChange={(e) => {
                        setFilterBdh(e.target.value);
                        if (e.target.value !== "all") setFilterDept("all");
                      }}
                      className="text-xs text-slate-600 bg-transparent outline-none font-semibold cursor-pointer"
                    >
                      <option value="all">Tất cả Ban điều hành</option>
                      {BDH_OPTIONS.map(bdh => (
                        <option key={bdh} value={bdh}>{bdh}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
            {/* Bộ lọc thời gian dạng nút gọn — bấm mới bung lịch chọn */}
            <div className="relative">
              <button
                onClick={() => setShowDateFilter(v => !v)}
                className="flex items-center gap-2 bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 px-3 py-2 rounded-xl shadow-sm text-xs font-bold text-slate-700 transition-colors cursor-pointer"
              >
                <span>📅</span>
                <span>
                  {taskFrom === monthFirstDay(taskMonth) && taskTo === monthLastDay(taskMonth)
                    ? `Tháng ${parseInt(taskMonth.slice(5), 10)}/${taskMonth.slice(0, 4)}`
                    : `${fmtD(taskFrom)} – ${fmtD(taskTo)}`}
                </span>
                <ChevronRight size={12} className={`transition-transform ${showDateFilter ? "rotate-90" : ""}`} />
              </button>

              {showDateFilter && (
                <>
                  {/* Lớp phủ trong suốt: bấm ra ngoài để đóng */}
                  <div className="fixed inset-0 z-20" onClick={() => setShowDateFilter(false)} />
                  <div className="absolute right-0 top-full mt-2 z-30 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 w-64 space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Chọn nhanh theo tháng</label>
                      <input
                        type="month"
                        value={taskMonth}
                        onChange={(e) => handleTaskMonthChange(e.target.value)}
                        className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-blue-300 cursor-pointer"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Từ ngày</label>
                        <input
                          type="date"
                          value={taskFrom}
                          onChange={(e) => { setTaskFrom(e.target.value); if (e.target.value) setTaskMonth(e.target.value.slice(0, 7)); }}
                          className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-blue-300 cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Đến ngày</label>
                        <input
                          type="date"
                          value={taskTo}
                          onChange={(e) => setTaskTo(e.target.value)}
                          className="w-full text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-blue-300 cursor-pointer"
                        />
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDateFilter(false)}
                      className="w-full text-xs font-black text-white bg-[#005BAC] hover:bg-blue-700 rounded-lg py-2 transition-colors cursor-pointer"
                    >
                      Xong
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => {
                if (currentUser) {
                  setNewAssignee(currentUser.name);
                }
                setNewStatus("planning");
                setIsModalOpen(true);
              }}
              className="flex items-center gap-1.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all active:scale-95 shadow-md shadow-blue-600/10 cursor-pointer"
            >
              <Plus size={14} /> Thêm công việc
            </button>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-[400px] text-slate-400 gap-2">
              <Loader2 className="animate-spin text-blue-600" size={28} />
              <p className="text-xs font-semibold">Đang tải công việc từ Supabase...</p>
            </div>
          ) : (
            /* Kanban Board Container */
            <div className="flex overflow-x-auto pb-4 gap-4 items-start md:grid md:grid-cols-2 lg:grid-cols-5 md:overflow-x-visible">
              {COLUMNS.map((col) => {
                const colTasks = filteredTasks.filter(t => t.status === col.id);

                // Group tasks by assignee when the column benefits from it (planning/completed).
                // Groups of size 1 render as a normal card; only groups with 2+ tasks collapse.
                const groups: { key: string; assignee: string; tasks: Task[] }[] = [];
                if (GROUPED_COLUMNS.has(col.id)) {
                  const order: string[] = [];
                  const map = new Map<string, Task[]>();
                  colTasks.forEach(t => {
                    if (!map.has(t.assignee)) {
                      map.set(t.assignee, []);
                      order.push(t.assignee);
                    }
                    map.get(t.assignee)!.push(t);
                  });
                  order.forEach(assignee => {
                    groups.push({ key: `${col.id}:${assignee}`, assignee, tasks: map.get(assignee)! });
                  });
                }

                return (
                  <div 
                    key={col.id} 
                    onDragOver={(e) => {
                      e.preventDefault();
                      // Người không đủ quyền kéo qua cột "Đã hoàn thành" -> con trỏ
                      // hiện dấu cấm ngay, không đợi thả xong mới báo.
                      if (col.id === "completed" && !canManageTasks) {
                        e.dataTransfer.dropEffect = "none";
                      }
                    }}
                    onDrop={(e) => handleDrop(e, col.id)}
                    className={`flex flex-col gap-4 min-w-[220px] shrink-0 bg-slate-100/50 p-3 rounded-2xl border border-slate-200/50 min-h-[500px] ${
                      col.id === "completed" && !canManageTasks && draggedTaskId ? "opacity-60" : ""
                    }`}
                  >
                    {/* Column Header */}
                    <div className={`flex items-center justify-between border-t-2 ${col.color} pt-2`}>
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold text-xs text-slate-700">{col.title}</span>
                        <span className="text-[10px] font-extrabold text-slate-400 bg-slate-200/80 px-2 py-0.5 rounded-full">{colTasks.length}</span>
                      </div>
                      <button 
                        onClick={() => {
                          if (currentUser) {
                            setNewAssignee(currentUser.name);
                          }
                          setNewStatus(col.id);
                          setIsModalOpen(true);
                        }}
                        className="text-slate-400 hover:text-slate-600"
                        title={`Thêm công việc vào cột ${col.title}`}
                      >
                        <Plus size={13} />
                      </button>
                    </div>

                    {/* Task Cards */}
                    <div className="space-y-3 flex-1">
                      {(() => {
                        const renderCard = (task: Task) => {
                          const cardStyle = getCardStyles(task.status);
                          // Đến hạn ĐÚNG HÔM NAY -> viền + nền đỏ cảnh báo. Việc đã xong
                          // thì thôi, không còn gì để nhắc.
                          const isDueToday = dayKey(task.due_date) === todayKey && task.status !== "completed";
                          // Trước hạn ĐÚNG 1 NGÀY -> cảnh báo vàng. Luôn xét sau
                          // isDueToday để hạn hôm nay giữ màu đỏ, không bị vàng đè.
                          const isDueTomorrow = dayKey(task.due_date) === tomorrowKey && task.status !== "completed";
                          // Phải THAY nền theo trạng thái chứ không chồng thêm class: nền
                          // gốc là gradient (background-image) nên sẽ phủ lên màu đỏ
                          // (background-color) và cảnh báo coi như mất.
                          const cardBg = isDueToday
                            ? "bg-rose-500/20 border-rose-300/70 border-l-4 border-l-rose-600"
                            : isDueTomorrow
                              ? "bg-amber-500/20 border-amber-300/70 border-l-4 border-l-amber-600"
                              : cardStyle.bg;
                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest('button')) {
                                  return;
                                }
                                handleOpenEditModal(task);
                              }}
                              className={`rounded-xl p-4 transition-all duration-300 hover:scale-[1.015] hover:-translate-y-0.5 border flex flex-col justify-between h-40 cursor-pointer active:cursor-grabbing relative group ${cardBg} ${cardStyle.shadow} ${
                                justCompletedId === task.id
                                  ? "scale-[1.04] ring-2 ring-emerald-400/80 shadow-xl shadow-emerald-500/25"
                                  : isDueToday
                                    ? "ring-2 ring-rose-500 shadow-lg shadow-rose-500/25"
                                    : isDueTomorrow
                                      ? "ring-2 ring-amber-500 shadow-lg shadow-amber-500/25"
                                      : ""
                              }`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <span className={`text-[8px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                    task.priority === "Cao" ? "bg-rose-600 text-white shadow-sm shadow-rose-500/20" :
                                    task.priority === "Trung bình" ? "bg-amber-500 text-white shadow-sm shadow-amber-500/20" :
                                    "bg-blue-500 text-white shadow-sm shadow-blue-500/20"
                                  }`}>
                                    {task.priority}
                                  </span>
                                  {/* Chỉ cấp quản lý mới thấy dấu X xoá. Trước đây còn nối
                                      thêm vế "là người phụ trách task này" nên nhân viên
                                      thường rê chuột vào thẻ của mình là xoá được, dù nút
                                      "Xóa Task" trong modal (gate bằng canManageTasks) đã ẩn
                                      — hai chỗ lệch nhau. Nay dùng chung một điều kiện. */}
                                  {canManageTasks && (
                                    <button
                                      onClick={() => handleDeleteTask(task.id)}
                                      className="text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white/60 p-0.5 rounded-full shadow-sm hover:scale-105 active:scale-95 transition-all"
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </div>
                                <p className={`font-heading font-bold text-xs leading-snug line-clamp-2 ${cardStyle.title}`}>{task.title}</p>
                              </div>

                              <div className="space-y-2 pt-2 border-t border-slate-200/40">
                                {/* Assignee & Progress */}
                                <div className="flex items-center justify-between text-[9px]">
                                  <span className="flex items-center gap-1 font-extrabold text-slate-700">
                                    <User size={10} className="opacity-70" /> {task.assignee}
                                  </span>
                                  <span className={`font-extrabold transition-colors duration-500 ${
                                    task.progress >= 100 ? "text-emerald-600" : "text-slate-800"
                                  }`}>
                                    {task.progress}%
                                  </span>
                                </div>

                                {/* Thanh tiến độ — chạy mượt tới mốc mới, xanh lá khi đủ 100% */}
                                <div className="h-1.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full transition-[width,background-color] duration-700 ease-out ${
                                      task.progress >= 100
                                        ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
                                        : "bg-gradient-to-r from-blue-400 to-blue-500"
                                    }`}
                                    style={{ width: `${Math.min(100, Math.max(0, task.progress || 0))}%` }}
                                  />
                                </div>

                                {/* Footer Info */}
                                <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold">
                                  <span className={`flex items-center gap-0.5 ${isDueToday ? "text-rose-600 font-extrabold" : isDueTomorrow ? "text-amber-600 font-extrabold" : ""}`}>
                                    <Calendar size={10} className="opacity-75" /> {task.due_date ? new Date(task.due_date).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit' }) : "Không hạn"}
                                    {isDueToday && <span className="ml-1 bg-rose-600 text-white px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-wide">Hôm nay</span>}
                                    {isDueTomorrow && <span className="ml-1 bg-amber-600 text-white px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-wide">Ngày mai</span>}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    {task.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip size={10} /> {task.attachments}</span>}
                                    {task.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare size={10} /> {task.comments}</span>}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        };

                        if (GROUPED_COLUMNS.has(col.id)) {
                          return groups.map((group) => {
                            if (group.tasks.length === 1) {
                              return renderCard(group.tasks[0]);
                            }
                            const isExpanded = expandedGroups.has(group.key);
                            return (
                              <div key={group.key} className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => toggleGroup(group.key)}
                                  className="w-full flex items-center justify-between gap-2 bg-white/70 hover:bg-white border border-slate-200/60 rounded-xl px-3 py-2 shadow-sm transition-colors cursor-pointer"
                                >
                                  <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-slate-700 truncate">
                                    <Users size={11} className="opacity-70 shrink-0" />
                                    <span className="truncate">{group.assignee}</span>
                                    {/* Phòng ban của người nhận — tra từ Danh sách nhân viên */}
                                    {findEmployeeByName(group.assignee)?.department && (
                                      <span className="shrink-0 text-[9px] font-bold text-slate-400 normal-case">
                                        · {findEmployeeByName(group.assignee)!.department}
                                      </span>
                                    )}
                                  </span>
                                  <span className="flex items-center gap-1 shrink-0">
                                    <span className="text-[9px] font-extrabold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{group.tasks.length}</span>
                                    {isExpanded ? <ChevronDown size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                                  </span>
                                </button>
                                {isExpanded && (
                                  <div className="space-y-3 pl-1">
                                    {group.tasks.map(renderCard)}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        }

                        return colTasks.map(renderCard);
                      })()}
                      {colTasks.length === 0 && (
                        <div className="h-32 border-2 border-dashed border-slate-200/50 rounded-xl flex items-center justify-center text-slate-300 text-xs italic">
                          Kéo thả vào đây
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Add Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-heading font-extrabold text-sm text-slate-800">Tạo công việc mới</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-4 text-xs font-semibold text-slate-700">
              {/* Task Title */}
              <div className="space-y-1">
                <label className="text-slate-500">Tên công việc <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Nhập tên công việc..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-slate-800 font-medium placeholder:text-slate-400"
                />
              </div>

              {/* Description & AI suggest */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-slate-500">Mô tả</label>
                  <button
                    type="button"
                    onClick={handleAiSuggest}
                    disabled={isAiSuggesting}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-50 text-[10px] text-indigo-600 disabled:text-slate-400 rounded-lg font-bold transition-all border border-indigo-150/50 cursor-pointer active:scale-95"
                  >
                    {isAiSuggesting ? "Đang tạo gợi ý..." : "✨ Gợi ý bằng AI"}
                  </button>
                </div>
                <textarea
                  placeholder="Mô tả chi tiết công việc..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-slate-800 font-medium placeholder:text-slate-400 resize-none"
                />
              </div>

              {/* Assignee & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  {/* Nói rõ đang lấy nhân sự của phòng nào và bao nhiêu người — để
                      người dùng kiểm chứng được bộ lọc, không phải đoán. */}
                  <label className="text-slate-500">
                    Người nhận <span className="text-rose-500">*</span>
                    <span className="ml-1 text-[11px] font-semibold text-slate-400">
                      {seesAllDepartments
                        ? `(toàn công ty — ${assignableEmployees.length} người)`
                        : `(${currentUser?.department || "phòng của bạn"} — ${assignableEmployees.length} người)`}
                    </span>
                  </label>
                  {/* Picker có ô tìm kiếm — dựng theo đúng ô "Nhân viên tham dự" ở
                      trang Đăng ký phòng họp/xe: chọn xong hiện thẻ tên có avatar,
                      bấm X để đổi người. Danh sách 112 người nên bỏ <select> cuộn tay. */}
                  <div className="relative" ref={assigneePickerRef}>
                    <div className="w-full min-h-[42px] px-3 py-2 border border-slate-200 rounded-xl flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/40 bg-white">
                      {newAssignee ? (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1 text-[10px] font-bold">
                          {newAssignee}
                          <button
                            type="button"
                            onClick={() => { setNewAssignee(""); setAssigneeSearch(""); setShowAssigneeDropdown(true); }}
                            className="hover:text-rose-500 transition-colors cursor-pointer"
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                          <Search size={12} className="text-slate-400 shrink-0" />
                          <input
                            type="text"
                            value={assigneeSearch}
                            onChange={(e) => { setAssigneeSearch(e.target.value); setShowAssigneeDropdown(true); }}
                            onFocus={() => setShowAssigneeDropdown(true)}
                            placeholder="Tìm tên nhân viên hoặc bấm để chọn nhanh..."
                            className="flex-1 min-w-0 py-1 outline-none text-xs font-semibold placeholder:font-normal"
                          />
                        </div>
                      )}
                    </div>

                    {showAssigneeDropdown && !newAssignee && (
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-premium z-20 max-h-56 overflow-y-auto animate-in fade-in duration-150">
                        {filteredAssignees.length === 0 ? (
                          <p className="text-center text-slate-400 text-[11px] italic py-4">Không tìm thấy nhân viên phù hợp.</p>
                        ) : (
                          filteredAssignees.map((emp) => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => { setNewAssignee(emp.name); setAssigneeSearch(""); setShowAssigneeDropdown(false); }}
                              className="w-full flex items-center gap-2.5 px-4 py-2 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                            >
                              <span className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                                {emp.name.split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-xs font-bold text-slate-700 truncate">{emp.name}</span>
                                <span className="block text-[10px] text-slate-400 font-semibold truncate">{emp.department || "Chưa xếp phòng"}{emp.role ? ` • ${emp.role}` : ""}</span>
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Trạng thái</label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="planning">Kế hoạch</option>
                    <option value="in_progress">Đang làm</option>
                    <option value="pending_approval">Chờ duyệt</option>
                    <option value="need_revision">Cần sửa</option>
                    <option value="completed">Đã xong</option>
                  </select>
                </div>
              </div>

              {/* Start Date & Deadline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Ngày bắt đầu</label>
                  <input
                    type="date"
                    value={newStartDate}
                    onChange={(e) => setNewStartDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Deadline</label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Priority Segmented Control */}
              <div className="space-y-1">
                <label className="text-slate-500">Ưu tiên</label>
                <div className="flex gap-2">
                  {["Thấp", "Trung bình", "Cao"].map((p) => {
                    const isActive = newPriority === p;
                    let activeClass = "";
                    if (p === "Thấp") activeClass = "border-blue-500 bg-blue-50 text-blue-800 font-bold ring-1 ring-blue-500/20";
                    else if (p === "Trung bình") activeClass = "border-amber-500 bg-amber-50 text-amber-800 font-bold ring-1 ring-amber-500/20";
                    else activeClass = "border-rose-500 bg-rose-50 text-rose-800 font-bold ring-1 ring-rose-500/20";

                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setNewPriority(p)}
                        className={`flex-1 py-2.5 text-xs font-medium rounded-xl border text-center transition-all cursor-pointer ${
                          isActive ? activeClass : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Attached link & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Link sản phẩm đính kèm</label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 placeholder:text-slate-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Ghi chú</label>
                  <input
                    type="text"
                    placeholder="Ghi chú thêm..."
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-md shadow-blue-500/10"
                >
                  Tạo Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Task Modal */}
      {isEditModalOpen && editingTask && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl border border-slate-100 space-y-4 animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-heading font-extrabold text-sm text-slate-800">Chỉnh sửa công việc</h3>
              <button onClick={() => { setIsEditModalOpen(false); setEditingTask(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateTask} className="space-y-4 text-xs font-semibold text-slate-700">
              {/* Task Title */}
              <div className="space-y-1">
                <label className="text-slate-500">Tên công việc <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Nhập tên công việc..."
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-slate-800 font-medium placeholder:text-slate-400"
                />
              </div>

              {/* Description & AI suggest */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-slate-500">Mô tả</label>
                  <button
                    type="button"
                    onClick={handleAiSuggestEdit}
                    disabled={isAiSuggesting}
                    className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-50 text-[10px] text-indigo-600 disabled:text-slate-400 rounded-lg font-bold transition-all border border-indigo-150/50 cursor-pointer active:scale-95"
                  >
                    {isAiSuggesting ? "Đang tạo gợi ý..." : "✨ Gợi ý bằng AI"}
                  </button>
                </div>
                <textarea
                  placeholder="Mô tả chi tiết công việc..."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-slate-800 font-medium placeholder:text-slate-400 resize-none"
                />
              </div>

              {/* Assignee & Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Người nhận <span className="text-rose-500">*</span></label>
                  <select
                    required
                    value={editAssignee}
                    onChange={(e) => setEditAssignee(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="">Chọn...</option>
                    {assignableEmployees.map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Trạng thái</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="planning">Kế hoạch</option>
                    <option value="in_progress">Đang làm</option>
                    <option value="pending_approval">Chờ duyệt</option>
                    <option value="need_revision">Cần sửa</option>
                    <option value="completed">Đã xong</option>
                  </select>
                </div>
              </div>

              {/* Start Date & Deadline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Ngày bắt đầu</label>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Deadline</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800"
                  />
                </div>
              </div>

              {/* Priority Segmented Control */}
              <div className="space-y-1">
                <label className="text-slate-500">Ưu tiên</label>
                <div className="flex gap-2">
                  {["Thấp", "Trung bình", "Cao"].map((p) => {
                    const isActive = editPriority === p;
                    let activeClass = "";
                    if (p === "Thấp") activeClass = "border-blue-500 bg-blue-50 text-blue-800 font-bold ring-1 ring-blue-500/20";
                    else if (p === "Trung bình") activeClass = "border-amber-500 bg-amber-50 text-amber-800 font-bold ring-1 ring-amber-500/20";
                    else activeClass = "border-rose-500 bg-rose-50 text-rose-800 font-bold ring-1 ring-rose-500/20";

                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setEditPriority(p)}
                        className={`flex-1 py-2.5 text-xs font-medium rounded-xl border text-center transition-all cursor-pointer ${
                          isActive ? activeClass : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Progress Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-slate-500">Tiến độ công việc (%)</label>
                  <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-lg text-xs">{editProgress}%</span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={editProgress}
                    onChange={(e) => setEditProgress(Number(e.target.value))}
                    className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editProgress}
                    onChange={(e) => {
                      let val = Number(e.target.value);
                      if (val < 0) val = 0;
                      if (val > 100) val = 100;
                      setEditProgress(val);
                    }}
                    className="w-16 border border-slate-200 rounded-xl p-1.5 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-center font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Attached link & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Link sản phẩm đính kèm</label>
                  <input
                    type="text"
                    placeholder="https://..."
                    value={editLink}
                    onChange={(e) => setEditLink(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 placeholder:text-slate-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Ghi chú</label>
                  <input
                    type="text"
                    placeholder="Ghi chú thêm..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 font-medium text-slate-800 placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Form Buttons */}
              <div className="flex justify-between items-center gap-3 pt-3 border-t border-slate-100">
                {/* Delete button only for managers */}
                {canManageTasks ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteTask(editingTask.id)}
                    className="py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl border border-rose-200 transition-colors cursor-pointer active:scale-95 flex items-center gap-1"
                  >
                    Xóa Task
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setIsEditModalOpen(false); setEditingTask(null); }}
                    className="py-2.5 px-5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors cursor-pointer shadow-md shadow-blue-500/10"
                  >
                    Lưu thay đổi
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

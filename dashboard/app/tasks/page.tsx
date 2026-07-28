"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { isHrDept, isDirectorRole } from "@/lib/access";
import { normalizeName } from "@/lib/approvers";
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
  Users
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
const isDeptManagerRole = (role?: string | null) => {
  const r = normalizeName(role || "");
  return (
    r.includes("truong phong") || r.includes("pho phong") ||
    r.includes("pho truong phong") || r.includes("quyen truong phong") ||
    r.includes("to truong")
  );
};

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

    // Optimistic UI Update
    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status: columnId } : t);
    setTasks(updatedTasks);

    // Update in Supabase
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: columnId })
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
      if (!emp?.email) return; // chưa có email trong Danh sách nhân viên

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
      if (data?.error) console.warn("Không gửi được email giao việc:", data.error);
    } catch (err) {
      console.warn("Lỗi khi gửi email giao việc:", err);
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

    try {
      const { error } = await supabase
        .from("tasks")
        .insert([{
          title: newTitle,
          assignee: newAssignee,
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
        assignee: newAssignee,
        priority: newPriority,
        due_date: newDueDate,
        start_date: newStartDate,
        description: newDescription,
        link: newLink,
      });

      // Reset Form & Close Modal
      setNewTitle("");
      setNewAssignee("");
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

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.assignee.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

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

  const canManageTasks = !!(currentUser && (
    currentUser.isAdmin || 
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.role.toLowerCase().includes("trưởng phòng") || 
    currentUser.role.toLowerCase().includes("truong phong") ||
    currentUser.role.toLowerCase().includes("phó phòng") || 
    currentUser.role.toLowerCase().includes("pho phong") ||
    currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
    currentUser.role.toLowerCase().includes("pho truong phong") ||
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
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, col.id)}
                    className="flex flex-col gap-4 min-w-[220px] shrink-0 bg-slate-100/50 p-3 rounded-2xl border border-slate-200/50 min-h-[500px]"
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
                              className={`rounded-xl p-4 transition-all duration-300 hover:scale-[1.015] hover:-translate-y-0.5 border flex flex-col justify-between h-36 cursor-pointer active:cursor-grabbing relative group ${cardStyle.bg} ${cardStyle.shadow}`}
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
                                  {(canManageTasks || (currentUser && (task.assignee.toLowerCase().includes(currentUser.name.toLowerCase()) || currentUser.name.toLowerCase().includes(task.assignee.toLowerCase())))) && (
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
                                  <span className="font-extrabold text-slate-800">{task.progress}%</span>
                                </div>

                                {/* Footer Info */}
                                <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold">
                                  <span className="flex items-center gap-0.5">
                                    <Calendar size={10} className="opacity-75" /> {task.due_date ? new Date(task.due_date).toLocaleDateString("vi-VN", { day: '2-digit', month: '2-digit' }) : "Không hạn"}
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
                  <label className="text-slate-500">Người nhận <span className="text-rose-500">*</span></label>
                  <select
                    required
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-2 focus:ring-blue-500/20 bg-white font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="">Chọn...</option>
                    {employeesList.map((emp) => (
                      <option key={emp.id} value={emp.name}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
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
                    {employeesList.map((emp) => (
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

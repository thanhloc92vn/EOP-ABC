"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { fetchApprovalPermissions, NO_APPROVAL_PERMISSIONS, type ApprovalPermissions } from "@/lib/approvers";
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
  Loader2
} from "lucide-react";

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
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);
  const [userDeptEmployees, setUserDeptEmployees] = useState<string[]>([]);
  const [perms, setPerms] = useState<ApprovalPermissions>(NO_APPROVAL_PERMISSIONS);
  
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
  const [employeesList, setEmployeesList] = useState<{ id: string; name: string }[]>([]);

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
      setPerms(await fetchApprovalPermissions(email));

      const isUserDeputy = userInfo.role.toLowerCase().includes("phó phòng") || 
                           userInfo.role.toLowerCase().includes("pho phong") ||
                           userInfo.role.toLowerCase().includes("phó trưởng phòng") || 
                           userInfo.role.toLowerCase().includes("pho truong phong");

      if (isUserDeputy) {
        const { data: deptEmps } = await supabase
          .from("employees")
          .select("name")
          .eq("department", userInfo.department);
        if (deptEmps) {
          setUserDeptEmployees(deptEmps.map(e => e.name));
        }
      }
    } catch (err) {
      console.error("Error fetching user permissions in tasks:", err);
    }
  };

  const fetchEmployeesList = async () => {
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("id, name")
        .order("name", { ascending: true });
      if (data) {
        setEmployeesList(data);
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
      
      const res = await fetch("/api/suggest-task-desc", {
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
    fetchUserRoleAndDept();
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
      
      const res = await fetch("/api/suggest-task-desc", {
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

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t.assignee.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (!currentUser) return false;

    const userEmail = currentUser.email.toLowerCase().trim();
    const userName = currentUser.name;

    // 1. Trưởng phòng/Tổ trưởng/Giám đốc thấy toàn bộ theo vai trò (tự chuyển giao được).
    // Đặc cách cá nhân (Hoa Đào, Hoành Anh, Huỳnh Giáp Nhân, Nguyễn Duy Hưng...) giờ đọc
    // từ approval_permissions.can_view_all_tasks — khi bàn giao tài khoản, quyền tự động
    // chuyển sang người tiếp nhận thay vì bị khóa cứng vào tên người cũ.
    const isUserAdmin = currentUser.isAdmin ||
                        currentUser.role.toLowerCase() === "admin" ||
                        currentUser.role.toLowerCase().includes("trưởng phòng") ||
                        currentUser.role.toLowerCase().includes("truong phong") ||
                        currentUser.role.toLowerCase().includes("tổ trưởng") ||
                        currentUser.role.toLowerCase().includes("to truong") ||
                        currentUser.role.toLowerCase().includes("giám đốc") ||
                        currentUser.role.toLowerCase().includes("giam doc") ||
                        (currentUser.department && (
                          currentUser.department.toLowerCase().includes("giám đốc") ||
                          currentUser.department.toLowerCase().includes("giam doc")
                        )) ||
                        perms.canViewAllTasks;

    if (isUserAdmin) return true;

    // --- VPP TASK FILTER SYNC ---
    // If it is a VPP (Stationery) request task, apply custom visibility rules
    const isVppTask = t.title.toLowerCase().startsWith("vpp:") || t.title.toLowerCase().includes("vpp");
    if (isVppTask) {
      // 1. HR Department staff who handle VPP see all VPP tasks
      const userDept = currentUser.department ? currentUser.department.toLowerCase().trim() : "";
      const isUserInHr = userDept.includes("hành chính") || userDept.includes("nhân sự") ||
                         userEmail === "nhuquynh.nguyenbich@gmail.com" ||
                         userEmail === "thanhhangg25697@gmail.com" ||
                         userEmail === "quyen.0408@gmail.com";
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

    // 2. Quan hệ giám sát (approval_permissions.supervises_name): người này thấy task
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
        <Header title="Quản lý Công việc" subtitle="Bảng theo dõi và quản lý công việc phòng Hành chính Nhân sự" />

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
                      {colTasks.map((task) => {
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
                      })}
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

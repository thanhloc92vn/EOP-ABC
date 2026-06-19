/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import {
  Search,
  Plus,
  Filter,
  Mail,
  Phone,
  Building,
  UserCheck,
  Calendar,
  Briefcase,
  Trash2,
  Loader2,
  X,
  Upload,
  Check,
  Settings
} from "lucide-react";

const DEPARTMENTS = [
  "Phòng Hành Chính Nhân Sự",
  "Phòng Tài Chính Kế Toán",
  "Phòng Vật Tư Thiết Bị",
  "Phòng Thị Trường",
  "Phòng Kế Hoạch Đấu Thầu",
  "Phòng Kỹ Thuật",
  "Phòng An Toàn Lao Động",
  "Phòng Quản Lý Dự Án",
  "Phòng Thư Ký, Trợ Lý"
];

const BDH_OPTIONS = [
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

interface Employee {
  id: string;
  employee_code: string;
  name: string;
  department: string;
  position: string;
  gender: string;
  start: string;
  date_of_birth: string;
  phone: string;
  cccd: string;
  degree: string;
  status: string;
  email: string;
  avatar: string;
  notes: string;
}

export default function EmployeeManagementPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("all");
  const [filterBdh, setFilterBdh] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  
  // New Employee Form State
  const [newName, setNewName] = useState("");
  const [newDept, setNewDept] = useState("Phòng Hành Chính Nhân Sự");
  const [newPos, setNewPos] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newStatus, setNewStatus] = useState("Thử việc");
  const [newGender, setNewGender] = useState("");
  const [newDob, setNewDob] = useState("");
  const [newCccd, setNewCccd] = useState("");
  const [newDegree, setNewDegree] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newCode, setNewCode] = useState("");

  // File Upload & AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  interface ExtractedEmployee {
    employee_code: string;
    name: string;
    department: string;
    position: string;
    gender: string;
    start: string;
    date_of_birth: string;
    phone: string;
    email: string;
    cccd: string;
    degree: string;
    status: string;
    notes: string;
  }
  const [previewEmployees, setPreviewEmployees] = useState<ExtractedEmployee[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag & Drop State
  const [isDragging, setIsDragging] = useState(false);

  // Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState("");
  const [tempModel, setTempModel] = useState("gpt-4o-mini");

  // Batch Progress State
  const [totalFiles, setTotalFiles] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);

  // Fetch employees from Supabase
  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data) {
        const mapped = data.map((emp: any) => ({
          id: emp.id,
          employee_code: emp.employee_code || "",
          name: emp.name,
          department: emp.department || "Chưa xếp phòng",
          position: emp.role || emp.last_position || "Nhân viên",
          gender: emp.gender || "",
          start: emp.created_at ? new Date(emp.created_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
          date_of_birth: emp.date_of_birth || "",
          phone: emp.phone || "N/A",
          cccd: emp.cccd || "",
          degree: emp.degree || "",
          status: emp.status || "Chính thức",
          email: emp.email || "N/A",
          avatar: emp.avatar || emp.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2),
          notes: emp.notes || ""
        }));
        setEmployees(mapped);
      }
    } catch (err) {
      console.error("Error fetching employees:", err);
    } finally {
      setLoading(false);
    }
  };

  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);

  const fetchCurrentUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) return;

      const user = session.user;
      const email = user.email || "";

      // 1. Check allowed_users for Admin
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

      setCurrentUser({
        email,
        name: empData?.name || user.user_metadata?.full_name || user.user_metadata?.name || "Người dùng",
        role: empData?.role || (isAdmin ? "Admin" : "Nhân viên"),
        department: empData?.department || "Chưa xếp phòng",
        isAdmin
      });
    } catch (err) {
      console.error("Error fetching current user info:", err);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
    fetchEmployees();
  }, []);

  const processUploadedFiles = async (files: FileList | File[]) => {
    // Retrieve OpenAI key and model from localStorage
    const customKey = localStorage.getItem("openai_api_key") || "";
    const selectedModel = localStorage.getItem("openai_model_nhan_su") || "gpt-4o-mini";

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setTotalFiles(fileArray.length);
    setProcessedFiles(0);
    setIsAnalyzing(true);

    let combinedExtracted: ExtractedEmployee[] = [];
    let errorCount = 0;
    let successCount = 0;
    let completed = 0;

    try {
      const results = await Promise.all(
        fileArray.map(async (file) => {
          const formData = new FormData();
          formData.append("employee_file", file);
          formData.append("original_filename", file.name);

          try {
            const res = await fetch("/api/analyze-employee-file", {
              method: "POST",
              headers: {
                "Authorization": customKey ? `Bearer ${customKey}` : "",
                "x-openai-model": selectedModel
              },
              body: formData,
            });

            if (!res.ok) {
              const errData = await res.json();
              throw new Error(errData.error || "Lỗi phân tích.");
            }

            const data = await res.json();
            if (data.employees && Array.isArray(data.employees)) {
              successCount++;
              return data.employees;
            } else {
              errorCount++;
              return [];
            }
          } catch (err) {
            console.error(`Error analyzing file ${file.name}:`, err);
            errorCount++;
            return [];
          } finally {
            completed++;
            setProcessedFiles(completed);
          }
        })
      );
      // Flatten all employee lists
      combinedExtracted = results.flat();
    } catch (err) {
      console.error("Batch processing error:", err);
    } finally {
      setIsAnalyzing(false);
    }

    if (combinedExtracted.length > 0) {
      setPreviewEmployees(combinedExtracted);
      setShowPreviewModal(true);
      if (errorCount > 0) {
        alert(`Đã trích xuất thành công từ ${successCount} file. Có ${errorCount} file gặp lỗi không thể trích xuất.`);
      }
    } else {
      alert("Không tìm thấy danh sách nhân sự hợp lệ trong các file đã chọn.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processUploadedFiles(files);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Drag & Drop Handlers
  const dragCounter = useRef(0);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processUploadedFiles(files);
    }
  };

  // Settings handlers
  const openSettings = () => {
    setTempApiKey(localStorage.getItem("openai_api_key") || "");
    setTempModel(localStorage.getItem("openai_model_nhan_su") || "gpt-4o-mini");
    setShowSettingsModal(true);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("openai_api_key", tempApiKey.trim());
    localStorage.setItem("openai_model_nhan_su", tempModel);
    setShowSettingsModal(false);
    alert("Đã lưu cấu hình AI thành công!");
  };

  const handleSaveImportedEmployees = async () => {
    if (previewEmployees.length === 0) return;

    try {
      setLoading(true);
      // Format payload for employees table
      const insertPayload = previewEmployees.map(emp => {
        const avatarStr = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        const hasValidStart = emp.start && emp.start !== "" && !isNaN(Date.parse(emp.start));
        return {
          employee_code: emp.employee_code || "",
          name: emp.name,
          department: emp.department,
          role: emp.position,
          gender: emp.gender || "",
          date_of_birth: emp.date_of_birth || "",
          phone: emp.phone || "N/A",
          email: emp.email || "N/A",
          cccd: emp.cccd || "",
          degree: emp.degree || "",
          status: emp.status || "Chính thức",
          avatar: avatarStr,
          notes: emp.notes || "",
          created_at: hasValidStart ? new Date(emp.start).toISOString() : new Date().toISOString()
        };
      });

      const { error } = await supabase
        .from("employees")
        .insert(insertPayload);

      if (error) throw error;

      alert(`Đã lưu thành công ${previewEmployees.length} nhân sự vào hệ thống!`);
      setShowPreviewModal(false);
      setPreviewEmployees([]);
      fetchEmployees();
    } catch (err: any) {
      console.error("Error saving imported employees:", err);
      alert("Lỗi khi lưu danh sách nhân sự: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPos) return;

    try {
      const avatarStr = newName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
      const { error } = await supabase
        .from("employees")
        .insert([{
          employee_code: newCode || "",
          name: newName,
          department: newDept,
          role: newPos,
          gender: newGender || "",
          date_of_birth: newDob || "",
          phone: newPhone || "N/A",
          email: newEmail || "N/A",
          cccd: newCccd || "",
          degree: newDegree || "",
          status: newStatus,
          avatar: avatarStr,
          notes: newNotes || ""
        }]);

      if (error) throw error;

      setShowAddModal(false);
      // Reset Form
      setNewName("");
      setNewPos("");
      setNewPhone("");
      setNewEmail("");
      setNewStatus("Thử việc");
      setNewGender("");
      setNewDob("");
      setNewCccd("");
      setNewDegree("");
      setNewNotes("");
      setNewCode("");

      fetchEmployees();
    } catch (err) {
      console.error("Error adding employee:", err);
      alert("Lỗi khi thêm nhân sự!");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!currentUser) return;

    const isUserAdmin = currentUser.isAdmin || 
                        currentUser.role.toLowerCase() === "admin" ||
                        currentUser.name === "Lại Nguyễn Lan Phương" ||
                        currentUser.name === "Dương Nhật Hoành Anh" ||
                        currentUser.role === "CV Nhân sự" ||
                        currentUser.role === "Tổ trưởng Nhân sự" ||
                        (currentUser.role.toLowerCase().includes("nhân sự") && 
                         (currentUser.department.toLowerCase().includes("hành chính") || currentUser.department.toLowerCase().includes("hcns"))) ||
                        (currentUser.role.toLowerCase().includes("tổ trưởng") && 
                         (currentUser.department.toLowerCase().includes("hành chính") || currentUser.department.toLowerCase().includes("hcns")));
    const isUserManager = currentUser.role.toLowerCase().includes("trưởng phòng") || 
                          currentUser.role.toLowerCase().includes("truong phong");

    // Regular employee & deputy are not allowed to delete
    if (!isUserAdmin && !isUserManager) {
      alert("Bạn không có quyền thực hiện hành động xóa!");
      return;
    }

    // Find the target employee to check their role
    const targetEmp = employees.find(e => e.id === id);
    if (!targetEmp) return;

    const isTargetAdmin = targetEmp.position.toLowerCase() === "admin" ||
                          targetEmp.email.toLowerCase() === "tnechcm@gmail.com";

    // Trưởng phòng cannot delete Admin
    if (isUserManager && !isUserAdmin && isTargetAdmin) {
      alert("Trưởng phòng không thể xóa tài khoản của Admin!");
      return;
    }

    if (confirm(`Bạn có chắc chắn muốn xóa nhân viên ${name}?`)) {
      try {
        const { error } = await supabase
          .from("employees")
          .delete()
          .eq("id", id);
        
        if (error) throw error;
        fetchEmployees();
      } catch (err) {
        console.error("Error deleting employee:", err);
        alert("Lỗi khi xóa nhân viên!");
      }
    }
  };

  const filtered = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase()) || 
                        emp.id.toLowerCase().includes(search.toLowerCase()) ||
                        emp.email.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === "all" || emp.department === filterDept;
    const matchBdh = filterBdh === "all" || emp.department === filterBdh;
    
    if (!matchSearch || !matchDept || !matchBdh) return false;

    if (!currentUser) return false;

    const isUserAdmin = currentUser.isAdmin || 
                        currentUser.role.toLowerCase() === "admin" ||
                        currentUser.role.toLowerCase().includes("trưởng phòng") || 
                        currentUser.role.toLowerCase().includes("truong phong") ||
                        currentUser.name === "Lại Nguyễn Lan Phương" ||
                        currentUser.name === "Dương Nhật Hoành Anh" ||
                        currentUser.role === "CV Nhân sự" ||
                        currentUser.role === "Tổ trưởng Nhân sự" ||
                        (currentUser.role.toLowerCase().includes("nhân sự") && 
                         (currentUser.department.toLowerCase().includes("hành chính") || currentUser.department.toLowerCase().includes("hcns"))) ||
                        (currentUser.role.toLowerCase().includes("tổ trưởng") && 
                         (currentUser.department.toLowerCase().includes("hành chính") || currentUser.department.toLowerCase().includes("hcns")));

    const isUserDeputy = currentUser.role.toLowerCase().includes("phó phòng") || 
                         currentUser.role.toLowerCase().includes("pho phong") ||
                         currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
                         currentUser.role.toLowerCase().includes("pho truong phong");

    if (isUserAdmin) return true;
    if (isUserDeputy) return emp.department === currentUser.department;

    return emp.email.toLowerCase().includes(currentUser.email.toLowerCase());
  });

  const handleUpdateEmployeeField = async (id: string, field: string, value: string) => {
    try {
      // Optimistic update
      setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, [field]: value } : emp));

      // Map field name to database column name
      let dbField = field === "position" ? "role" : field;
      let dbValue: any = value;

      if (field === "start") {
        dbField = "created_at";
        dbValue = value ? new Date(value).toISOString() : null;
      }

      const { error } = await supabase
        .from("employees")
        .update({ [dbField]: dbValue })
        .eq("id", id);

      if (error) throw error;
    } catch (err) {
      console.error("Lỗi khi cập nhật thông tin nhân sự:", err);
      alert("Lỗi khi cập nhật thông tin nhân viên!");
      fetchEmployees();
    }
  };

  const canEdit = !!(currentUser && (
    currentUser.isAdmin || 
    currentUser.role.toLowerCase() === "admin" ||
    currentUser.role.toLowerCase().includes("trưởng phòng") || 
    currentUser.role.toLowerCase().includes("truong phong") ||
    currentUser.name === "Lại Nguyễn Lan Phương" ||
    currentUser.name === "Dương Nhật Hoành Anh" ||
    currentUser.role === "CV Nhân sự" ||
    currentUser.role === "Tổ trưởng Nhân sự" ||
    (currentUser.role.toLowerCase().includes("nhân sự") && 
     (currentUser.department.toLowerCase().includes("hành chính") || currentUser.department.toLowerCase().includes("hcns"))) ||
    (currentUser.role.toLowerCase().includes("tổ trưởng") && 
     (currentUser.department.toLowerCase().includes("hành chính") || currentUser.department.toLowerCase().includes("hcns")))
  ));

  return (
    <div 
      className="flex min-h-screen bg-[#F7F9FC] relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header title="Danh sách nhân viên" subtitle="Quản lý thông tin hồ sơ nhân sự, phòng ban và chức vụ" />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, mã NV, email..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-sm"
                />
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-sm">
                <Filter size={13} className="text-slate-400" />
                <select
                  value={filterDept}
                  onChange={(e) => {
                    setFilterDept(e.target.value);
                    if (e.target.value !== "all") {
                      setFilterBdh("all");
                    }
                  }}
                  className="text-xs text-slate-600 bg-transparent outline-none font-semibold cursor-pointer"
                >
                  <option value="all">Tất cả phòng ban</option>
                  <option value="Phòng Hành Chính Nhân Sự">Phòng Hành Chính Nhân Sự</option>
                  <option value="Phòng Tài Chính Kế Toán">Phòng Tài Chính Kế Toán</option>
                  <option value="Phòng Vật Tư Thiết Bị">Phòng Vật Tư Thiết Bị</option>
                  <option value="Phòng Thị Trường">Phòng Thị Trường</option>
                  <option value="Phòng Kế Hoạch Đấu Thầu">Phòng Kế Hoạch Đấu Thầu</option>
                  <option value="Phòng Kỹ Thuật">Phòng Kỹ Thuật</option>
                  <option value="Phòng An Toàn Lao Động">Phòng An Toàn Lao Động</option>
                  <option value="Phòng Quản Lý Dự Án">Phòng Quản Lý Dự Án</option>
                  <option value="Phòng Thư Ký, Trợ Lý">Phòng Thư Ký, Trợ Lý</option>
                </select>
              </div>

              {/* BDH Filter */}
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl shadow-sm">
                <Filter size={13} className="text-slate-400" />
                <select
                  value={filterBdh}
                  onChange={(e) => {
                    setFilterBdh(e.target.value);
                    if (e.target.value !== "all") {
                      setFilterDept("all");
                    }
                  }}
                  className="text-xs text-slate-600 bg-transparent outline-none font-semibold cursor-pointer"
                >
                  <option value="all">Tất cả Ban điều hành</option>
                  {BDH_OPTIONS.map((bdh) => (
                    <option key={bdh} value={bdh}>{bdh}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end sm:justify-start">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".xlsx,.xls,.docx,.doc,.pdf,.png,.jpg,.jpeg"
                multiple
                className="hidden"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
                title="Nhập danh sách nhân sự tự động bằng AI từ Excel, Word, PDF, Ảnh"
              >
                <Upload size={13} className="text-slate-500" />
                Danh sách nhân sự
              </button>
              <button
                onClick={openSettings}
                className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer inline-flex items-center justify-center"
                title="Cấu hình OpenAI API Key & Model AI"
              >
                <Settings size={14} />
              </button>
              {currentUser && (currentUser.isAdmin || 
                               currentUser.role.toLowerCase() === "admin" ||
                               currentUser.role.toLowerCase().includes("trưởng phòng") || 
                               currentUser.role.toLowerCase().includes("truong phong") ||
                               currentUser.role.toLowerCase().includes("phó phòng") || 
                               currentUser.role.toLowerCase().includes("pho phong") ||
                               currentUser.role.toLowerCase().includes("phó trưởng phòng") || 
                               currentUser.role.toLowerCase().includes("pho truong phong")) && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Plus size={14} /> Thêm nhân sự
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center h-[350px] text-slate-400 gap-2">
              <Loader2 className="animate-spin text-blue-600" size={26} />
              <p className="text-xs font-medium">Đang tải danh sách nhân viên từ Supabase...</p>
            </div>
          ) : (
            /* Employee Table */
            <div className="glass rounded-2xl overflow-hidden border border-slate-200/50 shadow-premium">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="bg-slate-100/70 border-b border-slate-200/60">
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider text-center w-12">STT</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Mã nhân viên</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Họ tên</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Phòng ban</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Chức danh</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Giới tính</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Ngày nhận việc</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Ngày sinh</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Số ĐT</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">CCCD</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Bằng cấp</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Email</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider">Ghi chú</th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((emp, index) => (
                      <tr key={emp.id} className="hover:bg-blue-50/20 bg-white/50 transition-all">
                        {/* STT */}
                        <td className="px-4 py-3 text-center text-xs text-slate-400 font-mono">{index + 1}</td>

                        {/* Mã nhân viên */}
                        <td className="px-4 py-3 text-xs text-slate-600 font-semibold">{emp.employee_code || <span className="text-slate-300 italic">—</span>}</td>

                        {/* Họ tên */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-[10px] shadow-sm shrink-0">
                              {emp.avatar}
                            </div>
                            <p className="font-heading font-bold text-slate-800 text-xs whitespace-nowrap">{emp.name}</p>
                          </div>
                        </td>

                        {/* Phòng ban */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium">
                          <EditableSelect
                            value={emp.department}
                            options={[...DEPARTMENTS, ...BDH_OPTIONS]}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "department", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Chức danh */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium">
                          <EditableCell
                            value={emp.position}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "position", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Giới tính */}
                        <td className="px-4 py-3 text-xs text-slate-500 font-medium">{emp.gender || <span className="text-slate-300">—</span>}</td>

                        {/* Ngày nhận việc */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium whitespace-nowrap">
                          <EditableDateCell
                            value={emp.start}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "start", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Ngày sinh */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium whitespace-nowrap">
                          <EditableDateCell
                            value={emp.date_of_birth}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "date_of_birth", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Số ĐT */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium whitespace-nowrap">
                          <EditableCell
                            value={emp.phone}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "phone", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* CCCD */}
                        <td className="px-4 py-3 text-xs text-slate-500 font-medium font-mono">{emp.cccd || <span className="text-slate-300">—</span>}</td>

                        {/* Bằng cấp */}
                        <td className="px-4 py-3 text-xs text-slate-500 font-medium">{emp.degree || <span className="text-slate-300">—</span>}</td>

                        {/* Email */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium whitespace-nowrap">
                          <EditableCell
                            value={emp.email}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "email", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Ghi chú */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium">
                          <EditableNoteSelect
                            value={emp.notes}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "notes", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Thao tác */}
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {currentUser && (currentUser.isAdmin || 
                                             currentUser.role.toLowerCase() === "admin" ||
                                             currentUser.role.toLowerCase().includes("trưởng phòng") || 
                                             currentUser.role.toLowerCase().includes("truong phong")) && (
                              <button onClick={() => handleDelete(emp.id, emp.name)} className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-500 transition-colors" title="Xóa nhân sự">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={14} className="text-center py-12 text-slate-400 text-xs italic">Không tìm thấy nhân viên nào phù hợp</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4 border border-white text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-heading font-extrabold text-slate-800 text-sm">Thêm mới nhân sự</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleAddEmployee} className="space-y-4 font-semibold text-slate-600">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Mã nhân viên</label>
                  <input
                    type="text" value={newCode} onChange={(e) => setNewCode(e.target.value)}
                    placeholder="VD: NV001"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Họ và tên *</label>
                  <input
                    type="text" required value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Phòng ban</label>
                  <select
                    value={newDept} onChange={(e) => setNewDept(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                  >
                    <option value="">-- Chọn Phòng ban / Dự án --</option>
                    <optgroup label="Khối Văn phòng">
                      {DEPARTMENTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Ban điều hành dự án">
                      {BDH_OPTIONS.map(b => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-500">Chức danh / Vị trí *</label>
                  <input
                    type="text" required value={newPos} onChange={(e) => setNewPos(e.target.value)}
                    placeholder="Ví dụ: Kỹ sư cầu đường"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Giới tính</label>
                  <select
                    value={newGender} onChange={(e) => setNewGender(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                  >
                    <option value="">-- Chọn --</option>
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Ngày sinh</label>
                  <input
                    type="date" value={newDob} onChange={(e) => setNewDob(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Trạng thái</label>
                  <select
                    value={newStatus} onChange={(e) => setNewStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                  >
                    <option value="Thử việc">Thử việc</option>
                    <option value="Chính thức">Chính thức</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Số điện thoại</label>
                  <input
                    type="text" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Ví dụ: 0912 345 678"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Email làm việc</label>
                  <input
                    type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Ví dụ: nv.a@trungnamec.com.vn"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Số CCCD</label>
                  <input
                    type="text" value={newCccd} onChange={(e) => setNewCccd(e.target.value)}
                    placeholder="Ví dụ: 079012345678"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Bằng cấp</label>
                  <input
                    type="text" value={newDegree} onChange={(e) => setNewDegree(e.target.value)}
                    placeholder="Ví dụ: Đại học, Cao đẳng..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Ghi chú</label>
                <textarea
                  value={newNotes} onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Ghi chú thêm..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow"
                >
                  Thêm nhân viên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-[#005BAC] rounded-xl">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-slate-800 text-sm">
                    Xem trước danh sách nhân sự trích xuất
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    AI đã tìm thấy {previewEmployees.length} nhân viên trong tài liệu. Kiểm tra thông tin trước khi đồng bộ.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all cursor-pointer bg-transparent border-none"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body: Table list */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
              <div className="border border-slate-200/60 bg-white rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3 w-10 text-center">STT</th>
                      <th className="py-3 px-3">Mã NV</th>
                      <th className="py-3 px-3">Họ và tên</th>
                      <th className="py-3 px-3">Phòng ban</th>
                      <th className="py-3 px-3">Chức danh</th>
                      <th className="py-3 px-3">Giới tính</th>
                      <th className="py-3 px-3">Ngày nhận việc</th>
                      <th className="py-3 px-3">Ngày sinh</th>
                      <th className="py-3 px-3">SĐT</th>
                      <th className="py-3 px-3">CCCD</th>
                      <th className="py-3 px-3">Bằng cấp</th>
                      <th className="py-3 px-3">Email</th>
                      <th className="py-3 px-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                    {previewEmployees.map((emp, index) => (
                      <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-3 text-center text-slate-400 font-mono">{index + 1}</td>
                        <td className="py-3 px-3 text-slate-500 font-medium">{emp.employee_code || "—"}</td>
                        <td className="py-3 px-3 text-slate-800 font-bold whitespace-nowrap">{emp.name}</td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200/55">
                            {emp.department}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-500 font-medium">{emp.position}</td>
                        <td className="py-3 px-3 text-slate-500">{emp.gender || "—"}</td>
                        <td className="py-3 px-3 font-mono text-[10px]">{formatDateDisplay(emp.start) || "—"}</td>
                        <td className="py-3 px-3 font-mono text-[10px]">{formatDateDisplay(emp.date_of_birth) || "—"}</td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{emp.phone || "—"}</td>
                        <td className="py-3 px-3 text-slate-500 font-mono text-[10px]">{emp.cccd || "—"}</td>
                        <td className="py-3 px-3 text-slate-500">{emp.degree || "—"}</td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{emp.email || "—"}</td>
                        <td className="py-3 px-3 text-slate-400 max-w-[100px] truncate" title={emp.notes}>{emp.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveImportedEmployees}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow-md"
              >
                <Check size={14} /> Lưu vào hệ thống
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex flex-col items-center justify-center gap-4">
          <div className="relative flex items-center justify-center">
            {/* Spinning ring */}
            <div className="w-16 h-16 rounded-full border-4 border-blue-100/30 border-t-[#005BAC] animate-spin"></div>
            {/* Icon inside */}
            <UserCheck size={20} className="absolute text-[#005BAC] animate-pulse" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="font-heading font-extrabold text-white text-sm">AI đang xử lý tài liệu</h3>
            <p className="text-xs text-blue-100/70 font-medium">
              Vui lòng chờ, đang phân tích tài liệu ({processedFiles}/{totalFiles})...
            </p>
          </div>
        </div>
      )}
      {/* AI Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="glass bg-white rounded-2xl w-full max-w-md overflow-hidden p-6 space-y-4 border border-white text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-[#005BAC]" />
                <h3 className="font-heading font-extrabold text-slate-800 text-sm">Cấu hình AI trích xuất</h3>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </div>
            
            <form onSubmit={handleSaveSettings} className="space-y-4 font-semibold text-slate-600">
              <div className="space-y-1">
                <label className="text-slate-500">OpenAI API Key (Dùng chung)</label>
                <input
                  type="password"
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                />
                <p className="text-[10px] text-slate-400 font-medium mt-1">Cung cấp API Key để sử dụng các tính năng trích xuất danh sách tự động.</p>
              </div>

              <div className="space-y-1">
                <label className="text-slate-500">Mô hình AI (Model)</label>
                <select
                  value={tempModel}
                  onChange={(e) => setTempModel(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Nhanh & Tiết kiệm chi phí)</option>
                  <option value="gpt-4o">gpt-4o (Thông minh & Đọc file chính xác hơn)</option>
                </select>
              </div>

              <div className="flex gap-2 justify-end pt-4 border-t border-slate-100">
                <button
                  type="button" onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-500 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 transition-all shadow"
                >
                  Lưu cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[999] flex flex-col items-center justify-center p-6 transition-all duration-300 pointer-events-none"
        >
          <div className="border-4 border-dashed border-[#005BAC] bg-white/95 rounded-3xl p-12 flex flex-col items-center justify-center gap-4 max-w-lg shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 bg-blue-50 text-[#005BAC] rounded-full animate-bounce">
              <Upload size={32} />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-heading font-black text-slate-800 text-base">Thả file vào đây</h3>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Hỗ trợ các file Excel, Word, PDF hoặc Hình ảnh chứa danh sách nhân viên để AI tự động phân tích
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const formatDateDisplay = (dateStr?: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("T")[0].split("-");
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
};

interface EditableDateCellProps {
  value: string;
  onSave: (value: string) => void;
  readOnly?: boolean;
}

function EditableDateCell({ value, onSave, readOnly = false }: EditableDateCellProps) {
  const [val, setVal] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const formattedVal = value ? value.split("T")[0] : "";
    setVal(formattedVal);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVal(e.target.value);
  };

  const handleBlur = () => {
    setIsEditing(false);
    const originalVal = value ? value.split("T")[0] : "";
    if (val !== originalVal) {
      onSave(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  if (readOnly) {
    return (
      <span className="text-xs text-slate-600 block w-full whitespace-nowrap overflow-hidden text-ellipsis px-2 py-1">
        {formatDateDisplay(value) || <span className="text-slate-300">—</span>}
      </span>
    );
  }

  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="w-full cursor-pointer px-2 py-1 border border-transparent hover:bg-slate-100/50 hover:border-slate-200 rounded-lg transition-all text-xs font-semibold text-slate-700 block whitespace-nowrap overflow-hidden text-ellipsis min-h-[24px]"
      >
        {formatDateDisplay(value) || <span className="text-slate-300">—</span>}
      </div>
    );
  }

  return (
    <input
      type="date"
      value={val || ""}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      autoFocus
      className="w-full bg-white px-1.5 py-1 outline-none border border-blue-500 rounded-lg text-xs font-semibold text-slate-700 shadow-sm"
    />
  );
}

interface EditableCellProps {
  value: string;
  onSave: (value: string) => void;
  readOnly?: boolean;
}

function EditableCell({ value, onSave, readOnly = false }: EditableCellProps) {
  const [val, setVal] = useState(value);

  useEffect(() => {
    setVal(value);
  }, [value]);

  const handleBlur = () => {
    if (!readOnly && val !== value) {
      onSave(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  };

  if (readOnly) {
    return <span className="text-xs text-slate-600 block w-full whitespace-nowrap overflow-hidden text-ellipsis px-2 py-1">{value || "—"}</span>;
  }

  return (
    <input
      type="text"
      value={val || ""}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className="w-full bg-transparent px-2 py-1 outline-none border border-transparent hover:bg-slate-100/50 focus:border-blue-500/30 focus:bg-white rounded-lg transition-all text-xs font-semibold text-slate-700"
    />
  );
}

interface EditableSelectProps {
  value: string;
  options: string[];
  onSave: (value: string) => void;
  readOnly?: boolean;
}

function EditableSelect({ value, options, onSave, readOnly = false }: EditableSelectProps) {
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

  if (readOnly) {
    return <span className="text-xs text-slate-600 block w-full whitespace-nowrap overflow-hidden text-ellipsis px-2 py-1">{value || "—"}</span>;
  }

  // Ensure current value is included in select options if it's not present in default options
  const allOptions = options.includes(value) ? options : [value, ...options];

  if (!isEditing) {
    return (
      <div 
        onClick={() => setIsEditing(true)}
        className="w-full cursor-pointer px-2 py-1 border border-transparent hover:bg-slate-100/50 hover:border-slate-200 rounded-lg transition-all text-xs font-semibold text-slate-700 block whitespace-nowrap overflow-hidden text-ellipsis min-h-[24px]"
      >
        {value || "—"}
      </div>
    );
  }

  return (
    <select
      value={val}
      onChange={handleChange}
      onBlur={() => setIsEditing(false)}
      autoFocus
      className="w-full bg-white px-1.5 py-1 outline-none border border-blue-500 rounded-lg text-xs font-semibold text-slate-700 shadow-sm"
    >
      {allOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

interface EditableNoteSelectProps {
  value: string;
  onSave: (value: string) => void;
  readOnly?: boolean;
}

function EditableNoteSelect({ value, onSave, readOnly = false }: EditableNoteSelectProps) {
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

  const getBadgeStyle = (text: string) => {
    if (!text) return "text-slate-450 font-medium px-2 py-1";
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

  if (readOnly) {
    return (
      <span className={`text-[10px] inline-block whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] ${getBadgeStyle(value)}`}>
        {value || "—"}
      </span>
    );
  }

  const standardOptions = ["", "NV mới", "NV Kiêm nhiệm", "NV Nghỉ việc"];
  const allOptions = standardOptions.includes(value) ? standardOptions : [value, ...standardOptions];

  if (!isEditing) {
    return (
      <div 
        onClick={() => setIsEditing(true)}
        className={`cursor-pointer inline-block text-[10px] whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px] ${getBadgeStyle(value)} hover:brightness-95 active:scale-95 transition-all`}
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
      className="bg-white px-1.5 py-1 outline-none border border-blue-500 rounded-lg text-[10px] font-semibold text-slate-755 shadow-sm"
    >
      {allOptions.map((opt) => (
        <option key={opt} value={opt}>
          {opt || "— Trống —"}
        </option>
      ))}
    </select>
  );
}

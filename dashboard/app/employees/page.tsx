/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect, useRef, Fragment } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { supabase } from "@/lib/supabase";
import { isManagerRole } from "@/lib/approvers";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useDepartments } from "@/lib/departments";
import { useTenantConfig, invalidateTenantConfig } from "@/lib/tenantConfig";
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
  Settings,
  UserX,
  ArrowRightLeft,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff
} from "lucide-react";

// Danh sách phòng ban / BĐH giờ đọc từ bảng `departments` (Supabase) qua
// useDepartments() trong component — thêm/bớt phòng ban chỉ cần sửa bảng,
// không sửa code. Fallback về danh sách cũ nếu DB lỗi (xem lib/departments.ts).

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
  cccd_date: string;
  cccd_place: string;
  permanent_address: string;
  temporary_address: string;
  degree: string;
  status: string;
  email: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
  avatar: string;
  notes: string;
}

export default function EmployeeManagementPage() {
  // Giữ nguyên tên DEPARTMENTS / BDH_OPTIONS để mọi chỗ dùng bên dưới không đổi
  const { phongBan: DEPARTMENTS, bdh: BDH_OPTIONS } = useDepartments();
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
  const [newCccdDate, setNewCccdDate] = useState("");
  const [newCccdPlace, setNewCccdPlace] = useState("");
  const [newPermanentAddress, setNewPermanentAddress] = useState("");
  const [newTemporaryAddress, setNewTemporaryAddress] = useState("");
  const [newDegree, setNewDegree] = useState("");
  const [newEmergencyName, setNewEmergencyName] = useState("");
  const [newEmergencyRelationship, setNewEmergencyRelationship] = useState("");
  const [newEmergencyPhone, setNewEmergencyPhone] = useState("");
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
    cccd_date: string;
    cccd_place: string;
    permanent_address: string;
    temporary_address: string;
    degree: string;
    emergency_contact_name: string;
    emergency_contact_relationship: string;
    emergency_contact_phone: string;
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

  // Handover Modal State (Admin Only)
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const [selectedEmployeeToHandover, setSelectedEmployeeToHandover] = useState<Employee | null>(null);
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>("");
  const [transferTasks, setTransferTasks] = useState(true);
  const [transferPermissions, setTransferPermissions] = useState(true);
  const [lockAccount, setLockAccount] = useState(true);
  const [isSubmittingHandover, setIsSubmittingHandover] = useState(false);

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
          cccd_date: emp.cccd_date || "",
          cccd_place: emp.cccd_place || "",
          permanent_address: emp.permanent_address || "",
          temporary_address: emp.temporary_address || "",
          degree: emp.degree || "",
          status: emp.status || "Chính thức",
          email: emp.email || "N/A",
          emergency_contact_name: emp.emergency_contact_name || "",
          emergency_contact_relationship: emp.emergency_contact_relationship || "",
          emergency_contact_phone: emp.emergency_contact_phone || "",
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

  // Danh tính người dùng — hook chung (thay khối allowed_users + employees +
  // fetchApprovalPermissions từng copy-paste ở mỗi trang).
  const user = useCurrentUser();
  const currentUser = user.authenticated ? user : null;
  const perms = user.perms;

  useEffect(() => {
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
            const res = await apiFetch("/api/analyze-employee-file", {
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

      // 1. Fetch all existing employees to compare
      const { data: existing, error: fetchError } = await supabase
        .from("employees")
        .select("id, employee_code, name, cccd");

      if (fetchError) throw fetchError;

      const existingList = existing || [];
      let insertCount = 0;
      let updateCount = 0;

      // 2. Process each employee
      for (const emp of previewEmployees) {
        const avatarStr = emp.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
        const hasValidStart = emp.start && emp.start !== "" && !isNaN(Date.parse(emp.start));
        
        const payload = {
          employee_code: emp.employee_code || "",
          name: emp.name,
          department: emp.department,
          role: emp.position,
          gender: emp.gender || "",
          date_of_birth: emp.date_of_birth || "",
          phone: emp.phone || "N/A",
          email: emp.email || "N/A",
          cccd: emp.cccd || "",
          cccd_date: emp.cccd_date || "",
          cccd_place: emp.cccd_place || "",
          permanent_address: emp.permanent_address || "",
          temporary_address: emp.temporary_address || "",
          degree: emp.degree || "",
          emergency_contact_name: emp.emergency_contact_name || "",
          emergency_contact_relationship: emp.emergency_contact_relationship || "",
          emergency_contact_phone: emp.emergency_contact_phone || "",
          status: emp.status || "Chính thức",
          avatar: avatarStr,
          notes: emp.notes || "",
          created_at: hasValidStart ? new Date(emp.start).toISOString() : new Date().toISOString()
        };

        // Match logic:
        // Match by employee_code first if not empty
        // Match by cccd next if not empty
        // Match by name last (exact name match, case-insensitive)
        let matched = existingList.find(e => 
          (emp.employee_code && e.employee_code && e.employee_code.trim().toLowerCase() === emp.employee_code.trim().toLowerCase()) ||
          (emp.cccd && e.cccd && e.cccd.trim() === emp.cccd.trim()) ||
          (emp.name && e.name && e.name.trim().toLowerCase() === emp.name.trim().toLowerCase())
        );

        if (matched) {
          // Update existing employee (exclude created_at to avoid overwriting start date if it exists)
          const { created_at, ...updatePayload } = payload;
          const { error: updateError } = await supabase
            .from("employees")
            .update(updatePayload)
            .eq("id", matched.id);

          if (updateError) throw updateError;
          updateCount++;
        } else {
          // Insert new employee
          const { error: insertError } = await supabase
            .from("employees")
            .insert([payload]);

          if (insertError) throw insertError;
          insertCount++;
        }
      }

      alert(`Lưu danh sách nhân sự thành công!\n- Thêm mới: ${insertCount} nhân viên\n- Cập nhật: ${updateCount} nhân viên`);
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
          cccd_date: newCccdDate || "",
          cccd_place: newCccdPlace || "",
          permanent_address: newPermanentAddress || "",
          temporary_address: newTemporaryAddress || "",
          degree: newDegree || "",
          emergency_contact_name: newEmergencyName || "",
          emergency_contact_relationship: newEmergencyRelationship || "",
          emergency_contact_phone: newEmergencyPhone || "",
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
      setNewCccdDate("");
      setNewCccdPlace("");
      setNewPermanentAddress("");
      setNewTemporaryAddress("");
      setNewDegree("");
      setNewEmergencyName("");
      setNewEmergencyRelationship("");
      setNewEmergencyPhone("");
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

    if (!canDelete) {
      alert("Bạn không có quyền thực hiện hành động xóa!");
      return;
    }

    // Find the target employee to check their role
    const targetEmp = employees.find(e => e.id === id);
    if (!targetEmp) return;

    const isTargetAdmin = targetEmp.position.toLowerCase() === "admin" ||
                          targetEmp.email.toLowerCase() === "tnechcm@gmail.com";

    // Cờ can_manage_employees (bảng approval_permissions) là nguồn duy nhất ngoài
    // Admin — check tên cứng đã bỏ, cấp/thu quyền qua Cài đặt > User Permissions
    const isUserAdmin = currentUser.isAdmin ||
                        currentUser.role.toLowerCase() === "admin" ||
                        perms.canManageEmployees;

    // Trưởng phòng cannot delete Admin
    if (!isUserAdmin && isTargetAdmin) {
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

  const handleDeleteAll = async () => {
    if (!currentUser) return;

    if (!canDelete) {
      alert("Bạn không có quyền thực hiện hành động xóa tất cả!");
      return;
    }

    if (confirm("CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ danh sách nhân viên hiện có trên hệ thống? Hành động này không thể hoàn tác!")) {
      try {
        setLoading(true);
        const { error } = await supabase
          .from("employees")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        if (error) throw error;
        alert("Đã xóa toàn bộ danh sách nhân viên thành công!");
        fetchEmployees();
      } catch (err: any) {
        console.error("Error deleting all employees:", err);
        alert("Lỗi khi xóa toàn bộ nhân viên: " + (err.message || err));
      } finally {
        setLoading(false);
      }
    }
  };

  // Nhận diện nhân viên đã nghỉ việc: theo trạng thái HOẶC ghi chú
  // (nhiều hồ sơ chỉ đánh dấu "NV Nghỉ việc" ở cột Ghi chú)
  const isResignedEmployee = (e: { status?: string; notes?: string }) =>
    (e.status || "").toLowerCase().includes("nghỉ việc") ||
    (e.notes || "").toLowerCase().includes("nghỉ việc");

  // ─── Nhân sự đã nghỉ việc: thu gọn trong bảng + ẩn khỏi ô chọn người ───
  // Hai thứ TÁCH BIỆT, đừng nhầm:
  //  1. showResigned  — chỉ gấp/mở khối dòng nghỉ việc trong chính bảng này.
  //  2. hide_resigned_in_pickers — công tắc TOÀN HỆ THỐNG (lưu ở tenant_config),
  //     khiến các ô chọn người ở module khác thôi liệt kê họ. Bảng này thì LUÔN
  //     hiện đủ, vì đây là nơi HCNS tra cứu hồ sơ.
  const [showResigned, setShowResigned] = useState(false);
  const tenantConfig = useTenantConfig();
  const [hideResignedInPickers, setHideResignedInPickers] = useState(false);
  const [savingHideFlag, setSavingHideFlag] = useState(false);

  useEffect(() => {
    setHideResignedInPickers(!!tenantConfig.hide_resigned_in_pickers);
  }, [tenantConfig.hide_resigned_in_pickers]);

  const handleToggleHideResigned = async () => {
    // RLS tenant_config chỉ cho Admin ghi (migration 001) — chặn sớm ở UI để
    // người dùng thường không bấm rồi nhận lỗi khó hiểu.
    if (!currentUser?.isAdmin) {
      alert("Chỉ tài khoản Admin mới đổi được thiết lập này.");
      return;
    }
    const next = !hideResignedInPickers;
    setSavingHideFlag(true);
    setHideResignedInPickers(next);
    try {
      const { error } = await supabase
        .from("tenant_config")
        .upsert(
          { key: "hide_resigned_in_pickers", value: next, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
      // Cache tenantConfig nằm ở tầng module -> không xoá thì sang trang khác
      // vẫn đọc giá trị cũ cho tới khi tải lại cả ứng dụng.
      invalidateTenantConfig();
    } catch (err: any) {
      setHideResignedInPickers(!next); // trả lại trạng thái cũ
      alert("Không lưu được thiết lập: " + (err?.message || err));
    } finally {
      setSavingHideFlag(false);
    }
  };

  // Ghim 3 cột đầu (STT / Mã nhân viên / Họ tên) khi kéo ngang bảng.
  // Bảng dùng `table-auto` nên độ rộng cột do NỘI DUNG quyết định — không thể tính
  // toạ độ `left` từ số cứng như bảng Tuyển dụng, phải đo bằng offsetWidth thật.
  // ResizeObserver bắt mọi thứ làm cột đổi bề rộng: đổi dữ liệu, lọc, font tải xong,
  // thu phóng cửa sổ.
  const empTableRef = useRef<HTMLTableElement>(null);
  const [frozenLefts, setFrozenLefts] = useState<number[]>([0, 0, 0]);

  useEffect(() => {
    const el = empTableRef.current;
    if (!el) return;
    const measure = () => {
      const ths = el.querySelectorAll("thead th");
      if (ths.length < 3) return;
      const w0 = (ths[0] as HTMLElement).offsetWidth;
      const w1 = (ths[1] as HTMLElement).offsetWidth;
      // Chỉ setState khi số thực sự đổi, tránh vòng lặp vô tận với ResizeObserver
      setFrozenLefts(prev => (prev[1] === w0 && prev[2] === w0 + w1 ? prev : [0, w0, w0 + w1]));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  const filtered = employees.filter(emp => {
    const matchSearch = emp.name.toLowerCase().includes(search.toLowerCase()) ||
                        emp.id.toLowerCase().includes(search.toLowerCase()) ||
                        emp.email.toLowerCase().includes(search.toLowerCase());
    const matchDept = filterDept === "all" || emp.department === filterDept;
    const matchBdh = filterBdh === "all" || emp.department === filterBdh;
    
    if (!matchSearch || !matchDept || !matchBdh) return false;

    if (!currentUser) return false;

    // Xem FULL danh sách: CHỈ Admin + người có cờ (can_view_employees hoặc
    // can_manage_employees trong bảng approval_permissions). Các check theo
    // role/tên hardcode cũ (trưởng phòng, giám đốc, phó phòng thấy phòng mình,
    // 5 tên cứng...) đã bỏ — cấp/thu quyền chỉ cần tick cờ trong Table Editor.
    const canSeeAll = currentUser.isAdmin ||
                      currentUser.role.toLowerCase() === "admin" ||
                      perms.canViewEmployees ||
                      perms.canManageEmployees;

    if (canSeeAll) return true;

    // Không có cờ -> chỉ thấy hồ sơ của chính mình
    return emp.email.toLowerCase().includes(currentUser.email.toLowerCase());
  }).sort((a, b) => {
    // Nhân viên đã nghỉ việc luôn nằm cuối danh sách (kể cả khi lọc phòng ban)
    return (isResignedEmployee(a) ? 1 : 0) - (isResignedEmployee(b) ? 1 : 0);
  });

  // Mốc để chèn thanh gấp/mở. -1 = danh sách hiện tại không có ai đã nghỉ ->
  // không hiện thanh nào cả.
  const firstResignedIndex = filtered.findIndex(isResignedEmployee);
  const resignedCount = filtered.length - (firstResignedIndex === -1 ? filtered.length : firstResignedIndex);

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

  // Sửa/xoá hồ sơ nhân sự: CHỈ Admin hoặc cờ can_manage_employees (bảng
  // approval_permissions, cấp qua Cài đặt > User Permissions). Các nhánh tự cấp
  // theo chức danh cũ (trưởng phòng, CV Nhân sự, tổ trưởng HCNS...) đã bỏ hẳn —
  // tắt cờ là mất quyền thật, khi bàn giao & khóa tài khoản quyền tự chuyển theo cờ.
  const canEdit = !!(currentUser && (
    currentUser.isAdmin ||
    currentUser.role.toLowerCase() === "admin" ||
    perms.canManageEmployees
  ));

  const canDelete = canEdit;

  const canDeleteAll = canDelete;

  const isOnlyAdmin = !!(currentUser && (
    currentUser.isAdmin ||
    currentUser.role.toLowerCase() === "admin" ||
    perms.canManageEmployees
  ));

  // Nút "Danh sách nhân sự" (nhập/upload hồ sơ hàng loạt) dùng chung cờ quản lý hồ
  // sơ nhân sự: Admin + người có cờ perms.canManageEmployees (hiện là C&B Lại Nguyễn
  // Lan Phương và TP. HCNS Lê Thị Hoa Đào). Cấp/thu quyền cho ai khác chỉ cần bật/tắt
  // cột can_manage_employees trong bảng approval_permissions — không sửa code.
  const canUploadEmployeeList = isOnlyAdmin;

  const handleRestoreAccess = async (emp: Employee) => {
    if (!confirm(`Mở lại quyền truy cập hệ thống cho "${emp.name}"?\n\nTrạng thái sẽ được đổi từ "NV Nghỉ việc" về "Chính thức", tài khoản Google của họ sẽ đăng nhập được ngay lập tức.`)) return;
    await handleUpdateEmployeeField(emp.id, "status", "Chính thức");
  };

  const handleOpenHandoverModal = (emp: Employee) => {
    setSelectedEmployeeToHandover(emp);
    const availableTargets = employees.filter(
      e => e.id !== emp.id && !e.status.toLowerCase().includes("nghỉ việc")
    );
    const sameDept = availableTargets.find(e => e.department === emp.department);
    setTargetEmployeeId(sameDept ? sameDept.id : (availableTargets[0]?.id || ""));
    setTransferTasks(true);
    setTransferPermissions(true);
    setLockAccount(true);
    setShowHandoverModal(true);
  };

  const handleExecuteHandover = async () => {
    if (!selectedEmployeeToHandover) return;

    if (transferTasks || transferPermissions) {
      if (!targetEmployeeId) {
        alert("Vui lòng chọn nhân sự tiếp nhận bàn giao!");
        return;
      }
    }

    const targetEmp = employees.find(e => e.id === targetEmployeeId);

    const oldName = selectedEmployeeToHandover.name.trim();
    const oldEmail = (selectedEmployeeToHandover.email || "").trim().toLowerCase();
    const newName = targetEmp ? targetEmp.name.trim() : "";
    const newEmail = targetEmp ? (targetEmp.email || "").trim().toLowerCase() : "";

    const confirmMsg = `XÁC NHẬN BÀN GIAO & KHÓA TÀI KHOẢN:\n\n` +
      `• Nhân sự nghỉ việc: ${oldName} (${oldEmail || "Không có email"})\n` +
      `• Nhân sự tiếp nhận: ${newName ? `${newName} (${newEmail})` : "Không chọn"}\n\n` +
      `Các hành động sẽ được xử lý tự động:\n` +
      `${transferPermissions ? "1. Chuyển toàn bộ quyền duyệt (xe, phòng họp, nghỉ phép, công tác) sang email mới.\n" : ""}` +
      `${transferTasks ? "2. Chuyển tất cả Task công việc dở dang sang nhân sự mới.\n" : ""}` +
      `${lockAccount ? "3. Cập nhật trạng thái 'NV Nghỉ việc' & khóa tài khoản đăng nhập Google ngay lập tức." : ""}\n\n` +
      `Bạn có chắc chắn muốn thực hiện?`;

    if (!confirm(confirmMsg)) return;

    try {
      setIsSubmittingHandover(true);

      // 1. Transfer approval_permissions
      if (transferPermissions && oldEmail && oldEmail !== "n/a" && newEmail && newEmail !== "n/a") {
        const { data: permData } = await supabase
          .from("approval_permissions")
          .select("*")
          .ilike("email", oldEmail)
          .maybeSingle();

        if (permData) {
          const { id, created_at, email, name, ...permsToCopy } = permData;

          const { data: targetPerm } = await supabase
            .from("approval_permissions")
            .select("*")
            .ilike("email", newEmail)
            .maybeSingle();

          if (targetPerm) {
            // Cộng dồn (OR) từng cờ quyền thay vì ghi đè toàn bộ dòng — nếu người
            // tiếp nhận đã có sẵn quyền riêng không trùng với người bàn giao, ghi
            // đè thẳng sẽ xoá mất quyền đó. Giữ nguyên tên của người tiếp nhận,
            // không ghi đè bằng tên người bàn giao.
            const merged: Record<string, any> = {};
            for (const [key, value] of Object.entries(permsToCopy)) {
              merged[key] = typeof value === "boolean" ? (value || !!(targetPerm as any)[key]) : value;
            }
            await supabase
              .from("approval_permissions")
              .update(merged)
              .eq("id", targetPerm.id);
          } else {
            await supabase
              .from("approval_permissions")
              .insert([{ email: newEmail, name: newName || name, ...permsToCopy }]);
          }

          await supabase
            .from("approval_permissions")
            .delete()
            .ilike("email", oldEmail);
        }
      }

      // 2. Transfer tasks
      if (transferTasks && newName) {
        await supabase
          .from("tasks")
          .update({
            assignee_name: newName,
            assigned_to: targetEmp?.id
          })
          .or(`assignee_name.ilike.%${oldName}%,assigned_to.eq.${selectedEmployeeToHandover.id}`);
      }

      // 3. Lock account & set NV Nghỉ việc
      if (lockAccount) {
        const noteTag = `[Đã bàn giao cho ${newName || "N/A"} ngày ${new Date().toLocaleDateString('vi-VN')}]`;
        const updatedNotes = selectedEmployeeToHandover.notes
          ? `${selectedEmployeeToHandover.notes} ${noteTag}`
          : noteTag;

        const { error: empErr } = await supabase
          .from("employees")
          .update({
            status: "NV Nghỉ việc",
            notes: updatedNotes
          })
          .eq("id", selectedEmployeeToHandover.id);

        if (empErr) throw empErr;
      }

      alert(`Đã hoàn tất bàn giao & khóa tài khoản của nhân sự ${oldName}!`);
      setShowHandoverModal(false);
      setSelectedEmployeeToHandover(null);
      fetchEmployees();
    } catch (err: any) {
      console.error("Error executing handover:", err);
      alert("Lỗi khi bàn giao: " + (err.message || err));
    } finally {
      setIsSubmittingHandover(false);
    }
  };

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
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
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

              {/* Công tắc: ẩn nhân sự đã nghỉ khỏi các ô chọn người ở module khác.
                  KHÔNG ảnh hưởng chính bảng này — nói rõ trong tooltip để khỏi hiểu nhầm. */}
              <button
                onClick={handleToggleHideResigned}
                disabled={savingHideFlag}
                title={
                  currentUser?.isAdmin
                    ? "Bật: ô chọn người khi Giao việc, Nhân viên tham dự họp, Lịch công việc và Chia sẻ tin tức sẽ không liệt kê nhân sự đã nghỉ.\nDanh sách nhân viên và C&B vẫn hiện đủ."
                    : "Chỉ Admin đổi được thiết lập này."
                }
                className={`flex items-center gap-2 px-3 py-2 border rounded-xl shadow-sm text-xs font-semibold transition-all disabled:opacity-50 ${
                  hideResignedInPickers
                    ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                    : "bg-white border-slate-200 text-slate-500"
                } ${currentUser?.isAdmin ? "cursor-pointer" : "cursor-not-allowed"}`}
              >
                {hideResignedInPickers ? <EyeOff size={13} /> : <Eye size={13} />}
                <span className="whitespace-nowrap">
                  {hideResignedInPickers ? "Đang ẩn NV nghỉ ở ô chọn người" : "Ẩn NV nghỉ ở ô chọn người"}
                </span>
                <span
                  className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${
                    hideResignedInPickers ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                      hideResignedInPickers ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
              </button>
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
              {isOnlyAdmin && (
                <button 
                  onClick={() => {
                    const activeEmps = employees.filter(e => !e.status.toLowerCase().includes("nghỉ việc"));
                    if (activeEmps.length > 0) {
                      handleOpenHandoverModal(activeEmps[0]);
                    } else {
                      alert("Không tìm thấy nhân sự khả thi để bàn giao.");
                    }
                  }}
                  className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                  title="Bàn giao công việc & Khóa tài khoản nhân sự nghỉ việc (Chỉ Admin)"
                >
                  <UserX size={14} />
                  Bàn giao & Khóa tài khoản
                </button>
              )}
              {canUploadEmployeeList && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
                  title="Nhập danh sách nhân sự tự động bằng AI từ Excel, Word, PDF, Ảnh"
                >
                  <Upload size={13} className="text-slate-500" />
                  Danh sách nhân sự
                </button>
              )}
              <button
                onClick={openSettings}
                className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 transition-all shadow-sm cursor-pointer inline-flex items-center justify-center"
                title="Cấu hình OpenAI API Key & Model AI"
              >
                <Settings size={14} />
              </button>
              {currentUser && (currentUser.isAdmin ||
                               currentUser.role.toLowerCase() === "admin" ||
                               isManagerRole(currentUser.role)) && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-blue-500/10 hover:shadow-blue-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                >
                  <Plus size={14} /> Thêm nhân sự
                </button>
              )}
              {canDeleteAll && employees.length > 0 && (
                <button
                  onClick={handleDeleteAll}
                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-md shadow-rose-500/10 hover:shadow-rose-500/20 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                  title="Xóa toàn bộ danh sách nhân sự hiện tại trên hệ thống"
                >
                  <Trash2 size={14} /> Xóa tất cả
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
              {/* Khung bảng tự cuộn cả 2 chiều. BẮT BUỘC có max-h + overflow-y ở đây:
                  `sticky top-0` của thead chỉ dính so với KHUNG CUỘN gần nhất, mà
                  `overflow-x: auto` đã biến div này thành khung cuộn rồi (CSS: một trục
                  không phải visible thì trục kia tự thành auto). Không giới hạn chiều cao
                  thì div không bao giờ cuộn dọc -> sticky vô hiệu, trang cuộn còn tiêu đề
                  vẫn trôi mất. */}
              <div className="overflow-x-auto overflow-y-auto max-h-[70vh] custom-scrollbar-table pb-3">
                <table ref={empTableRef} className="min-w-max w-full text-sm text-left table-auto">
                  {/* z-20 để nằm trên các ô ghim của thân bảng (z-10) */}
                  <thead className="sticky top-0 z-20">
                    {/* Nền phải ĐỤC (bỏ /70): dòng dữ liệu chui xuống dưới khi cuộn */}
                    <tr className="bg-slate-100 border-b border-slate-200/60">
                      <th style={{ left: frozenLefts[0] }} className="sticky z-10 bg-slate-100 px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider text-center"><div className="w-10">STT</div></th>
                      <th style={{ left: frozenLefts[1] }} className="sticky z-10 bg-slate-100 px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[110px]">Mã nhân viên</div></th>
                      <th style={{ left: frozenLefts[2] }} className="sticky z-10 bg-slate-100 px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider shadow-[3px_0_6px_-2px_rgba(15,23,42,0.25)]"><div className="w-[180px]">Họ tên</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[200px]">Phòng ban</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[140px]">Chức danh</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[80px]">Giới tính</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[120px]">Ngày nhận việc</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[120px]">Ngày sinh</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[120px]">Số ĐT</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[130px]">CCCD</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[120px]">Ngày cấp</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[180px]">Nơi cấp</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[220px]">Địa chỉ thường trú</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[220px]">Địa chỉ tạm trú</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[160px]">Bằng cấp</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[180px]">Email</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[150px]">Họ tên người thân</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[110px]">Mối quan hệ</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[135px]">Số ĐT người thân</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider"><div className="w-[150px]">Ghi chú</div></th>
                      <th className="px-4 py-4 text-slate-400 font-bold text-[10px] uppercase tracking-wider text-center"><div className="w-16">Thao tác</div></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((emp, index) => {
                      // `filtered` đã được sắp cho nhân sự nghỉ việc xuống cuối, nên chỉ
                      // cần chèn thanh gấp/mở ngay trước dòng nghỉ việc ĐẦU TIÊN. Vẫn
                      // duyệt nguyên mảng (thay vì tách 2 danh sách) để số STT chạy liền.
                      const resigned = isResignedEmployee(emp);
                      const isFirstResigned = resigned && index === firstResignedIndex;
                      // Nền thanh gấp/mở chỉ dùng các mức mờ ĐÃ có luật dark trong
                      // globals.css (orange-50 mới có /40 và /80). Đặt mức lạ như /60
                      // thì dark mode không remap, ra dải kem xám trên nền tối.
                      return (
                      <Fragment key={emp.id}>
                      {isFirstResigned && (
                        <tr className="bg-orange-50/40">
                          <td colSpan={21} className="p-0">
                            {/* Bọc trong div sticky để thanh này vẫn thấy được khi
                                bảng đang bị kéo sang phải */}
                            <div className="sticky left-0 w-max">
                              <button
                                onClick={() => setShowResigned(v => !v)}
                                className="flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-orange-700 hover:text-orange-900 transition-colors"
                              >
                                {showResigned ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span>Nhân sự đã nghỉ việc</span>
                                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 text-[10px]">
                                  {resignedCount}
                                </span>
                                <span className="font-medium text-orange-600">
                                  {showResigned ? "— bấm để thu gọn" : "— bấm để xem"}
                                </span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                      {(!resigned || showResigned) && (
                      <tr className={`transition-all ${
                        resigned
                          ? "bg-orange-50/80 hover:bg-orange-100/60"
                          : "hover:bg-blue-50/20 bg-white/50"
                      }`}>
                        {/* STT — ghim */}
                        <td style={{ left: frozenLefts[0] }} className={`sticky z-10 px-4 py-3 text-center text-xs text-slate-400 font-mono ${isResignedEmployee(emp) ? "cell-frozen-resigned" : "cell-frozen"}`}>{index + 1}</td>

                        {/* Mã nhân viên — ghim */}
                        <td style={{ left: frozenLefts[1] }} className={`sticky z-10 px-4 py-3 text-xs text-slate-600 font-semibold ${isResignedEmployee(emp) ? "cell-frozen-resigned" : "cell-frozen"}`}>{emp.employee_code || <span className="text-slate-300 italic">—</span>}</td>

                        {/* Họ tên — ghim (cột cuối vùng ghim, có đổ bóng phân tách) */}
                        <td style={{ left: frozenLefts[2] }} className={`sticky z-10 px-4 py-3 shadow-[3px_0_6px_-2px_rgba(15,23,42,0.18)] ${isResignedEmployee(emp) ? "cell-frozen-resigned" : "cell-frozen"}`}>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white text-[10px] shadow-sm shrink-0">
                              {emp.avatar}
                            </div>
                            <p className="font-heading font-bold text-slate-800 text-xs whitespace-nowrap">{emp.name}</p>
                            {isResignedEmployee(emp) && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 uppercase tracking-wider shrink-0">
                                Nghỉ việc
                              </span>
                            )}
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

                        {/* Giới tính — chỉnh tay như các cột khác (Nam / Nữ, để trống được) */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium">
                          <EditableSelect
                            value={emp.gender}
                            options={["", "Nam", "Nữ"]}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "gender", val)}
                            readOnly={!canEdit}
                          />
                        </td>

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
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium font-mono whitespace-nowrap">
                          <EditableCell
                            value={emp.cccd}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "cccd", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Ngày cấp */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium whitespace-nowrap">
                          <EditableDateCell
                            value={emp.cccd_date}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "cccd_date", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Nơi cấp */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium min-w-[120px]">
                          <EditableCell
                            value={emp.cccd_place}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "cccd_place", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Địa chỉ thường trú */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium min-w-[160px]">
                          <EditableCell
                            value={emp.permanent_address}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "permanent_address", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Địa chỉ tạm trú */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium min-w-[160px]">
                          <EditableCell
                            value={emp.temporary_address}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "temporary_address", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Bằng cấp */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium min-w-[100px]">
                          <EditableCell
                            value={emp.degree}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "degree", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Email */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium whitespace-nowrap">
                          <EditableCell
                            value={emp.email}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "email", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Người thân */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium min-w-[100px]">
                          <EditableCell
                            value={emp.emergency_contact_name}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "emergency_contact_name", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Mối quan hệ */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium min-w-[80px]">
                          <EditableCell
                            value={emp.emergency_contact_relationship}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "emergency_contact_relationship", val)}
                            readOnly={!canEdit}
                          />
                        </td>

                        {/* Số ĐT người thân */}
                        <td className="px-4 py-1 text-xs text-slate-500 font-medium whitespace-nowrap">
                          <EditableCell
                            value={emp.emergency_contact_phone}
                            onSave={(val) => handleUpdateEmployeeField(emp.id, "emergency_contact_phone", val)}
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
                          <div className="flex items-center justify-center gap-1.5">
                            {isOnlyAdmin && emp.status.toLowerCase().includes("nghỉ việc") && (
                              <button
                                onClick={() => handleRestoreAccess(emp)}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 rounded-lg text-emerald-600 transition-all shadow-sm active:scale-95"
                                title="Mở lại quyền truy cập (Chỉ Admin)"
                              >
                                <UserCheck size={13} />
                              </button>
                            )}
                            {isOnlyAdmin && !emp.status.toLowerCase().includes("nghỉ việc") && (
                              <button
                                onClick={() => handleOpenHandoverModal(emp)}
                                className="p-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-lg text-amber-600 transition-all shadow-sm active:scale-95"
                                title="Bàn giao công việc & Khóa tài khoản (Chỉ Admin)"
                              >
                                <UserX size={13} />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={() => handleDelete(emp.id, emp.name)} className="p-1.5 hover:bg-rose-100 rounded-lg text-rose-500 transition-colors" title="Xóa nhân sự">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      )}
                      </Fragment>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={21} className="text-center py-12 text-slate-400 text-xs italic">Không tìm thấy nhân viên nào phù hợp</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Handover & Lock Account Modal (Admin Only) */}
      {showHandoverModal && selectedEmployeeToHandover && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200/80 animate-in fade-in zoom-in-95 duration-200 text-xs">
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/30 rounded-xl">
                  <UserX size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="font-heading font-extrabold text-sm tracking-tight">Bàn giao & Khóa tài khoản</h3>
                  <p className="text-[11px] text-amber-100 font-medium">Chỉ Quản trị viên (Admin) được cấp quyền thao tác</p>
                </div>
              </div>
              <button 
                onClick={() => setShowHandoverModal(false)} 
                className="text-amber-100 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-5 text-slate-700 font-medium">
              {/* Employee to handover Selection */}
              <SearchableEmployeeSelect
                employees={employees}
                selectedId={selectedEmployeeToHandover.id}
                onSelect={(emp) => handleOpenHandoverModal(emp)}
                label="1. Nhân sự nghỉ việc (Cần khóa tài khoản & bàn giao)"
                placeholder="Gõ tên, email để tìm nhân sự nghỉ việc..."
                themeColor="amber"
              />

              {/* Target Selection */}
              <SearchableEmployeeSelect
                employees={employees}
                selectedId={targetEmployeeId}
                onSelect={(emp) => setTargetEmployeeId(emp.id)}
                excludeId={selectedEmployeeToHandover.id}
                label="2. Nhân sự tiếp nhận mới (Nhận bàn giao Task & Quyền)"
                placeholder="-- Gõ tên, email để tìm nhân sự tiếp nhận --"
                themeColor="slate"
              />

              {/* Options Checkboxes */}
              <div className="space-y-2.5 border-t border-slate-100 pt-3">
                <div className="text-xs font-bold text-slate-800">Tùy chọn xử lý tự động:</div>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={transferPermissions}
                    onChange={(e) => setTransferPermissions(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800">Chuyển quyền duyệt đơn (Tự động)</span>
                    <p className="text-[11px] text-slate-500">Chuyển toàn bộ cờ duyệt xe, phòng họp, nghỉ phép, công tác trong bảng `approval_permissions` sang email mới.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={transferTasks}
                    onChange={(e) => setTransferTasks(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800">Bàn giao tất cả Task dở dang</span>
                    <p className="text-[11px] text-slate-500">Cập nhật người phụ trách (assignee) của các công việc đang thực hiện sang tên nhân sự mới.</p>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={lockAccount}
                    onChange={(e) => setLockAccount(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800">Khóa tài khoản & Đổi trạng thái NV Nghỉ việc</span>
                    <p className="text-[11px] text-slate-500">Đổi trạng thái thành "NV Nghỉ việc". Cổng đăng nhập Google sẽ ngắt quyền truy cập ngay lập tức.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowHandoverModal(false)}
                disabled={isSubmittingHandover}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteHandover}
                disabled={isSubmittingHandover}
                className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-amber-600/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSubmittingHandover ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Đang xử lý bàn giao...
                  </>
                ) : (
                  <>
                    <ArrowRightLeft size={14} />
                    Xác nhận bàn giao & Khóa
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Số CCCD</label>
                  <input
                    type="text" value={newCccd} onChange={(e) => setNewCccd(e.target.value)}
                    placeholder="Ví dụ: 079012345678"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Ngày cấp</label>
                  <input
                    type="date" value={newCccdDate} onChange={(e) => setNewCccdDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs bg-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Nơi cấp</label>
                  <input
                    type="text" value={newCccdPlace} onChange={(e) => setNewCccdPlace(e.target.value)}
                    placeholder="Ví dụ: Cục Cảnh sát QLHC..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Địa chỉ thường trú</label>
                  <input
                    type="text" value={newPermanentAddress} onChange={(e) => setNewPermanentAddress(e.target.value)}
                    placeholder="Ví dụ: 123 Đường A, Quận B, TP C"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Địa chỉ tạm trú</label>
                  <input
                    type="text" value={newTemporaryAddress} onChange={(e) => setNewTemporaryAddress(e.target.value)}
                    placeholder="Ví dụ: 456 Đường X, Quận Y, TP Z"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Bằng cấp</label>
                  <input
                    type="text" value={newDegree} onChange={(e) => setNewDegree(e.target.value)}
                    placeholder="Ví dụ: Đại học, Cao đẳng..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-slate-500">Họ tên người thân</label>
                  <input
                    type="text" value={newEmergencyName} onChange={(e) => setNewEmergencyName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn B"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Mối quan hệ</label>
                  <input
                    type="text" value={newEmergencyRelationship} onChange={(e) => setNewEmergencyRelationship(e.target.value)}
                    placeholder="Ví dụ: Bố, Mẹ, Vợ..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-500">Số ĐT người thân</label>
                  <input
                    type="text" value={newEmergencyPhone} onChange={(e) => setNewEmergencyPhone(e.target.value)}
                    placeholder="Ví dụ: 0987 654 321"
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
              <div className="border border-slate-200/60 bg-white rounded-xl overflow-x-auto shadow-sm">
                <table className="min-w-max w-full text-xs text-left border-collapse table-auto">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-3 px-3 text-center"><div className="w-10">STT</div></th>
                      <th className="py-3 px-3"><div className="w-[80px]">Mã NV</div></th>
                      <th className="py-3 px-3"><div className="w-[150px]">Họ và tên</div></th>
                      <th className="py-3 px-3"><div className="w-[180px]">Phòng ban</div></th>
                      <th className="py-3 px-3"><div className="w-[120px]">Chức danh</div></th>
                      <th className="py-3 px-3"><div className="w-[70px]">Giới tính</div></th>
                      <th className="py-3 px-3"><div className="w-[100px]">Ngày nhận việc</div></th>
                      <th className="py-3 px-3"><div className="w-[100px]">Ngày sinh</div></th>
                      <th className="py-3 px-3"><div className="w-[100px]">SĐT</div></th>
                      <th className="py-3 px-3"><div className="w-[110px]">CCCD</div></th>
                      <th className="py-3 px-3"><div className="w-[100px]">Ngày cấp</div></th>
                      <th className="py-3 px-3"><div className="w-[150px]">Nơi cấp</div></th>
                      <th className="py-3 px-3"><div className="w-[180px]">ĐC thường trú</div></th>
                      <th className="py-3 px-3"><div className="w-[180px]">ĐC tạm trú</div></th>
                      <th className="py-3 px-3"><div className="w-[130px]">Bằng cấp</div></th>
                      <th className="py-3 px-3"><div className="w-[150px]">Email</div></th>
                      <th className="py-3 px-3"><div className="w-[120px]">Họ tên người thân</div></th>
                      <th className="py-3 px-3"><div className="w-[90px]">Mối quan hệ</div></th>
                      <th className="py-3 px-3"><div className="w-[115px]">SĐT người thân</div></th>
                      <th className="py-3 px-3"><div className="w-[130px]">Ghi chú</div></th>
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
                        <td className="py-3 px-3 text-slate-500 font-mono text-[10px]">{formatDateDisplay(emp.cccd_date) || "—"}</td>
                        <td className="py-3 px-3 text-slate-500">{emp.cccd_place || "—"}</td>
                        <td className="py-3 px-3 text-slate-500 max-w-[120px] truncate" title={emp.permanent_address}>{emp.permanent_address || "—"}</td>
                        <td className="py-3 px-3 text-slate-500 max-w-[120px] truncate" title={emp.temporary_address}>{emp.temporary_address || "—"}</td>
                        <td className="py-3 px-3 text-slate-500">{emp.degree || "—"}</td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{emp.email || "—"}</td>
                        <td className="py-3 px-3 text-slate-500">{emp.emergency_contact_name || "—"}</td>
                        <td className="py-3 px-3 text-slate-500">{emp.emergency_contact_relationship || "—"}</td>
                        <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{emp.emergency_contact_phone || "—"}</td>
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
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setVal(value);
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    if (val !== value) {
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
      <span className="text-xs text-slate-650 block w-full px-2 py-1 break-words">
        {value || "—"}
      </span>
    );
  }

  if (!isEditing) {
    return (
      <div
        onClick={() => setIsEditing(true)}
        className="w-full cursor-pointer px-2 py-1 border border-transparent hover:bg-slate-100/50 hover:border-slate-200 rounded-lg transition-all text-xs font-semibold text-slate-700 min-h-[24px] break-words"
      >
        {value || <span className="text-slate-300">—</span>}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={val || ""}
      onChange={(e) => setVal(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      autoFocus
      className="w-full bg-white px-2 py-1 outline-none border border-blue-500 rounded-lg text-xs font-semibold text-slate-700 shadow-sm"
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
        className="w-full cursor-pointer px-2 py-1 border border-transparent hover:bg-slate-100/50 hover:border-slate-200 rounded-lg transition-all text-xs font-semibold text-slate-700 block min-h-[24px] break-words"
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
          {/* Ô rỗng (vd: chưa có giới tính) hiện gạch ngang cho dễ chọn */}
          {opt || "—"}
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

function SearchableEmployeeSelect({
  employees,
  selectedId,
  onSelect,
  placeholder,
  label,
  excludeId,
  themeColor = "slate"
}: {
  employees: Employee[];
  selectedId: string;
  onSelect: (emp: Employee) => void;
  placeholder: string;
  label: string;
  excludeId?: string;
  themeColor?: "amber" | "slate";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeEmployees = employees.filter(
    e => e.id !== excludeId && !e.status.toLowerCase().includes("nghỉ việc")
  );

  const filtered = activeEmployees.filter(e => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      e.name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q) ||
      e.department.toLowerCase().includes(q) ||
      e.position.toLowerCase().includes(q) ||
      e.employee_code.toLowerCase().includes(q)
    );
  });

  const selectedEmp = employees.find(e => e.id === selectedId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-1.5 relative" ref={dropdownRef}>
      <label className="block text-xs font-bold text-slate-800">
        {label} <span className="text-rose-500">*</span>
      </label>

      {/* Selected Box Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3.5 py-2.5 border rounded-xl flex items-center justify-between cursor-pointer transition-all shadow-sm ${
          themeColor === "amber"
            ? "border-amber-200 bg-amber-50/70 hover:bg-amber-100/60 text-slate-900 font-bold"
            : "border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold"
        }`}
      >
        {selectedEmp ? (
          <div className="flex flex-col min-w-0 pr-2">
            <span className="font-bold text-slate-900 truncate">
              {selectedEmp.name} <span className="text-slate-500 font-normal">({selectedEmp.position})</span>
            </span>
            <span className="text-[11px] text-slate-500 truncate font-mono">
              {selectedEmp.department} {selectedEmp.email !== "N/A" ? `• ${selectedEmp.email}` : ""}
            </span>
          </div>
        ) : (
          <span className="text-slate-400 italic text-xs">{placeholder}</span>
        )}
        <ChevronDown size={15} className={`text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-[60] overflow-hidden flex flex-col max-h-64 animate-in fade-in zoom-in-95 duration-150">
          {/* Search Input inside Dropdown */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <Search size={14} className="text-slate-400 ml-1 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Gõ tên, email, phòng ban để tìm..."
              autoFocus
              className="w-full bg-transparent text-xs outline-none font-semibold text-slate-800 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600 p-0.5">
                <X size={12} />
              </button>
            )}
          </div>

          {/* Employee List */}
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
            {filtered.length > 0 ? (
              filtered.map((emp) => {
                const isSelected = emp.id === selectedId;
                return (
                  <div
                    key={emp.id}
                    onClick={() => {
                      onSelect(emp);
                      setIsOpen(false);
                      setSearchQuery("");
                    }}
                    className={`p-2.5 hover:bg-amber-50/80 cursor-pointer transition-colors flex items-center justify-between gap-2 text-xs ${
                      isSelected ? "bg-amber-100/60 font-bold" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{emp.name}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">{emp.position}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                        {emp.department} {emp.email !== "N/A" ? `• ${emp.email}` : ""}
                      </div>
                    </div>
                    {isSelected && <Check size={14} className="text-amber-600 shrink-0" />}
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-slate-400 text-xs italic">
                Không tìm thấy nhân sự phù hợp với từ khóa "{searchQuery}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

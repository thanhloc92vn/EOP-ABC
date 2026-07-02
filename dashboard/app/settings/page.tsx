"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Settings, Database, Info, Key, CheckCircle, ShieldAlert, Check, X, Calendar, Briefcase, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSearchParams } from "next/navigation";

function SettingsContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "system";
  const isApprovalsTab = activeTab === "approvals";

  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [saved, setSaved] = useState(false);

  // Approvals States
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeApprovalTab, setActiveApprovalTab] = useState<"trip" | "leave" | "explanation">("trip");

  // Justifications States
  const [explanations, setExplanations] = useState<any[]>([]);
  const [loadingExplanations, setLoadingExplanations] = useState(false);

  // Load configuration from local storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key") || "");
      setWebhookUrl(localStorage.getItem("apps_script_url") || "");
      setModel(localStorage.getItem("openai_model") || "gpt-4o-mini");
      
      fetchUserRoleAndDept();
      fetchTasks();
      fetchExplanations();
    }
  }, []);

  // Handle URL subtab parameter
  const subtabParam = searchParams.get("subtab");
  useEffect(() => {
    if (subtabParam === "explanation" || subtabParam === "trip" || subtabParam === "leave") {
      setActiveApprovalTab(subtabParam as any);
    }
  }, [subtabParam]);

  const fetchUserRoleAndDept = async () => {
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
      console.error("Error fetching current user info in settings:", err);
    }
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      if (data) {
        setTasks(data);
      }
    } catch (err) {
      console.error("Error fetching tasks in settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchExplanations = async () => {
    try {
      setLoadingExplanations(true);
      const { data, error } = await supabase
        .from("attendance_justifications")
        .select("*")
        .in("status", ["Chờ duyệt", "Chưa duyệt"])
        .order("date", { ascending: false });
      
      if (error) throw error;
      if (data) {
        setExplanations(data);
      }
    } catch (err) {
      console.error("Error fetching justifications in settings:", err);
    } finally {
      setLoadingExplanations(false);
    }
  };

  const handleApprove = async (taskId: string, isTrip: boolean) => {
    try {
      if (isTrip) {
        // Fetch task details to copy to business_trips
        const { data: taskData } = await supabase
          .from("tasks")
          .select("*")
          .eq("id", taskId)
          .maybeSingle();

        if (taskData) {
          let cleanDest = "Chưa xác định";
          let cleanMission = "Đi công tác";
          if (taskData.notes) {
            const destMatch = taskData.notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
            if (destMatch) cleanDest = destMatch[1].trim();

            const missionMatch = taskData.notes.match(/-\s+\*\*Nhiệm vụ cụ thể\*\*:\s*(.*)/i);
            if (missionMatch) cleanMission = missionMatch[1].trim();
          }

          let costVal = 0;
          if (taskData.notes) {
            const metaMatch = taskData.notes.match(/<!--METADATA:(.*?)-->/);
            if (metaMatch) {
              try {
                const meta = JSON.parse(metaMatch[1]);
                if (meta && typeof meta.totalAmount !== "undefined") {
                  costVal = Number(meta.totalAmount);
                }
              } catch (e) {
                console.error("Error parsing task metadata in settings:", e);
              }
            }
            
            if (!costVal) {
              const totalMatch = taskData.notes.match(/\*\*TỔNG ĐỀ NGHỊ THANH TOÁN\*\*:\s*([0-9.,\s]+)/i);
              if (totalMatch) {
                const cleanNum = totalMatch[1].replace(/[.,\s]/g, "");
                costVal = Number(cleanNum);
              }
            }
          }

          if (!costVal) {
            const days = taskData.start_date && taskData.due_date 
              ? Math.max(1, Math.round((new Date(taskData.due_date).getTime() - new Date(taskData.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
              : 1;
            const nights = days >= 2 ? days - 1 : 0;
            const hotelRate = 350000;
            costVal = days * 120000 + nights * hotelRate;
          }

          const newTrip = {
            name: taskData.assignee || "Nhân viên",
            dest: cleanDest,
            from_date: taskData.start_date || new Date().toISOString().split("T")[0],
            to_date: taskData.due_date || new Date().toISOString().split("T")[0],
            purpose: cleanMission,
            cost: costVal,
            status: "Đã duyệt",
            task_id: taskId
          };

          // Insert into business_trips
          const { error: insertError } = await supabase
            .from("business_trips")
            .insert([newTrip]);

          if (insertError) {
            console.error("Error inserting business trip:", insertError.message);
          }
        }
      }

      const { error } = await supabase
        .from("tasks")
        .update({
          status: isTrip ? "in_progress" : "completed",
          progress: isTrip ? 50 : 100
        })
        .eq("id", taskId);
      
      if (error) throw error;
      alert(`Đã phê duyệt thành công yêu cầu ${isTrip ? "đi công tác" : "nghỉ phép"}!`);
      fetchTasks();
    } catch (err) {
      console.error("Error approving task:", err);
      alert("Lỗi khi phê duyệt yêu cầu!");
    }
  };

  const handleReject = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "need_revision" })
        .eq("id", taskId);
      
      if (error) throw error;
      alert("Đã từ chối yêu cầu.");
      fetchTasks();
    } catch (err) {
      console.error("Error rejecting task:", err);
      alert("Lỗi khi từ chối yêu cầu!");
    }
  };

  const handleApproveJustification = async (id: string) => {
    try {
      const { error } = await supabase
        .from("attendance_justifications")
        .update({ status: "Đã duyệt" })
        .eq("id", id);
      
      if (error) throw error;
      alert("Đã phê duyệt giải trình công thành công!");
      fetchExplanations();
    } catch (err) {
      console.error("Error approving justification:", err);
      alert("Lỗi khi phê duyệt giải trình công!");
    }
  };

  const handleRejectJustification = async (id: string) => {
    try {
      const { error } = await supabase
        .from("attendance_justifications")
        .update({ status: "Chưa duyệt" })
        .eq("id", id);
      
      if (error) throw error;
      alert("Đã từ chối giải trình công!");
      fetchExplanations();
    } catch (err) {
      console.error("Error rejecting justification:", err);
      alert("Lỗi khi từ chối giải trình!");
    }
  };

  const isApprover = useMemo(() => {
    if (!currentUser) return false;
    if (currentUser.isAdmin) return true;
    const roleLower = currentUser.role.toLowerCase();
    return (
      roleLower.includes("trưởng phòng") ||
      roleLower.includes("truong phong") ||
      roleLower.includes("phó phòng") ||
      roleLower.includes("pho phong") ||
      roleLower.includes("phó trưởng phòng") || 
      roleLower.includes("pho truong phong") ||
      roleLower.includes("giám đốc") ||
      roleLower.includes("giam doc") ||
      roleLower.includes("leader")
    );
  }, [currentUser]);

  // Business trip approvals list (Trưởng phòng & Admin only)
  const pendingTrips = useMemo(() => {
    if (!currentUser || !isApprover) return [];
    
    const isUserAdmin = currentUser.isAdmin || (currentUser.role || "").toLowerCase() === "admin";
    const isUserManager = (currentUser.role || "").toLowerCase().includes("trưởng phòng") || 
                          (currentUser.role || "").toLowerCase().includes("truong phong") ||
                          (currentUser.role || "").toLowerCase().includes("giám đốc") ||
                          (currentUser.role || "").toLowerCase().includes("giam doc") ||
                          (currentUser.role || "").toLowerCase().includes("quản lý") ||
                          (currentUser.role || "").toLowerCase().includes("quan ly") ||
                          (currentUser.role || "").toLowerCase().includes("quyền trưởng phòng") ||
                          (currentUser.role || "").toLowerCase().includes("quyen truong phong");

    // Only Admin and Trưởng phòng can see/approve trips
    if (!isUserAdmin && !isUserManager) return [];

    return tasks.filter(t => 
      t.status === "pending_approval" && 
      (t.title.toLowerCase().startsWith("công tác") || t.title.toLowerCase().includes("cong tac"))
    );
  }, [tasks, currentUser, isApprover]);

  // Leave approvals list (custom rules)
  const pendingLeaves = useMemo(() => {
    if (!currentUser || !isApprover) return [];

    const isUserAdmin = currentUser.isAdmin || (currentUser.role || "").toLowerCase() === "admin";
    const isUserManager = (currentUser.role || "").toLowerCase().includes("trưởng phòng") || 
                          (currentUser.role || "").toLowerCase().includes("truong phong") ||
                          (currentUser.role || "").toLowerCase().includes("giám đốc") ||
                          (currentUser.role || "").toLowerCase().includes("giam doc") ||
                          (currentUser.role || "").toLowerCase().includes("quản lý") ||
                          (currentUser.role || "").toLowerCase().includes("quan ly") ||
                          (currentUser.role || "").toLowerCase().includes("quyền trưởng phòng") ||
                          (currentUser.role || "").toLowerCase().includes("quyen truong phong");

    return tasks.filter(t => {
      if (t.status !== "pending_approval") return false;
      const titleLower = t.title.toLowerCase();
      if (!titleLower.startsWith("nghỉ phép") && !titleLower.includes("nghi phep")) return false;

      // 1. Explicitly designated approver
      if (t.notes && t.notes.includes(`Người duyệt: ${currentUser.name}`)) return true;

      const assigneeLower = t.assignee.toLowerCase();
      const currentUserNameLower = currentUser.name.toLowerCase();

      // 2. Quỳnh approves Hằng's 1-day leave
      const isQuynh = currentUserNameLower.includes("quỳnh") || currentUserNameLower.includes("quynh");
      const isHang = assigneeLower.includes("hằng") || assigneeLower.includes("hang");
      const isOneDay = titleLower.includes("1 ngày") || titleLower.includes("1 ngay");
      if (isQuynh && isHang && isOneDay) return true;

      // 3. Hoành Anh approves Quyên's 1-day leave
      const isHoanhAnh = currentUserNameLower.includes("hoành anh") || currentUserNameLower.includes("hoanh anh");
      const isQuyen = assigneeLower.includes("quyên") || assigneeLower.includes("quuyên") || assigneeLower.includes("quyen");
      if (isHoanhAnh && isQuyen && isOneDay) return true;

      // 4. Managers/Admins can see and approve all leaves
      if (isUserAdmin || isUserManager) return true;

      return false;
    });
  }, [tasks, currentUser, isApprover]);

  // Justifications approvals list (Admin, HR, Director, or department manager/deputy)
  const pendingExplanations = useMemo(() => {
    if (!currentUser || !isApprover) return [];
    
    const isUserAdmin = currentUser.isAdmin || (currentUser.role || "").toLowerCase() === "admin";
    const isUserHR = currentUser.name === "Lại Nguyễn Lan Phương" || 
                     currentUser.name === "Dương Nhật Hoành Anh" ||
                     currentUser.name === "Lê Thị Hoa Đào" ||
                     (currentUser.email || "").toLowerCase().trim() === "lehoadao2706@gmail.com" ||
                     (currentUser.role || "").toLowerCase().includes("nhân sự") ||
                     (currentUser.role || "").toLowerCase().includes("nhan su");
    const isDirector = (currentUser.role || "").toLowerCase().includes("giám đốc") ||
                       (currentUser.role || "").toLowerCase().includes("giam doc");

    const isUserManager = (currentUser.role || "").toLowerCase().includes("trưởng phòng") || 
                          (currentUser.role || "").toLowerCase().includes("truong phong") ||
                          (currentUser.role || "").toLowerCase().includes("quản lý") ||
                          (currentUser.role || "").toLowerCase().includes("quan ly") ||
                          (currentUser.role || "").toLowerCase().includes("quyền trưởng phòng") ||
                          (currentUser.role || "").toLowerCase().includes("quyen truong phong") ||
                          (currentUser.role || "").toLowerCase().startsWith("tp.") ||
                          (currentUser.role || "").toLowerCase().startsWith("tp ");

    const isUserDeputy = (currentUser.role || "").toLowerCase().includes("phó phòng") || 
                         (currentUser.role || "").toLowerCase().includes("pho phong") ||
                         (currentUser.role || "").toLowerCase().includes("phó trưởng phòng") || 
                         (currentUser.role || "").toLowerCase().includes("pho truong phong") ||
                         (currentUser.role || "").toLowerCase().includes("leader");

    return explanations.filter(e => {
      if (isUserAdmin || isUserHR || isDirector) return true;
      if (e.approver === currentUser.name) return true;
      
      // Department manager or deputy manager of the same department
      const isManagerOfSameDept = (isUserManager || isUserDeputy) && currentUser.department === e.department;
      if (isManagerOfSameDept) return true;

      return false;
    });
  }, [explanations, currentUser, isApprover]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof window !== "undefined") {
      localStorage.setItem("openai_api_key", apiKey.trim());
      localStorage.setItem("apps_script_url", webhookUrl.trim());
      localStorage.setItem("openai_model", model);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  if (currentUser && isApprovalsTab && !isApprover) {
    return (
      <div className="flex min-h-screen bg-[#F7F9FC]">
        <Sidebar />
        <div className="ml-60 flex-1 flex flex-col min-w-0">
          <Header title="Duyệt yêu cầu" subtitle="Phê duyệt các yêu cầu đi công tác, nghỉ phép" />
          <main className="flex-1 p-8 flex flex-col items-center justify-center max-w-4xl">
            <div className="glass bg-white rounded-2xl p-8 border border-slate-200/50 shadow-premium text-center space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
                <ShieldAlert size={32} />
              </div>
              <h2 className="font-heading font-extrabold text-slate-800 text-lg">Truy cập bị từ chối</h2>
              <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                Tài khoản của bạn ({currentUser.email}) không có quyền truy cập chức năng phê duyệt yêu cầu. Vui lòng liên hệ với Ban giám đốc hoặc Quản trị viên hệ thống để biết thêm chi tiết.
              </p>
              <div className="pt-2">
                <a
                  href="/"
                  className="inline-block px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow active:scale-95"
                >
                  Quay lại Dashboard
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F7F9FC]">
      <Sidebar />
      <div className="ml-60 flex-1 flex flex-col min-w-0">
        <Header 
          title={isApprovalsTab ? "Phê duyệt yêu cầu" : "Cài đặt hệ thống"} 
          subtitle={isApprovalsTab ? "Xem và phê duyệt các yêu cầu đi công tác, nghỉ phép của nhân sự" : "Cấu hình hệ thống, khoá bảo mật và kết nối Google Sheets"} 
        />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto max-w-4xl">
          {/* Toast Alert */}
          {saved && (
            <div className="fixed bottom-6 right-6 z-50 animate-bounce">
              <div className="bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 font-semibold text-sm">
                <CheckCircle className="w-5 h-5 text-emerald-200" />
                Cập nhật cấu hình thành công!
              </div>
            </div>
          )}

          {!isApprovalsTab && (
            <>
              {/* Setup Configuration Form */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
            <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-5">
              <Key size={18} className="text-blue-600" /> Cấu hình bảo mật & Kết nối
            </h2>

            <form onSubmit={handleSave} className="space-y-5 text-xs text-slate-600 font-semibold">
              {/* API Key */}
              <div className="space-y-1">
                <label className="text-slate-500">OpenAI API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-proj-..."
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                />
                <p className="text-[10px] text-slate-400 font-normal mt-1">Khoá bảo mật API dùng để thực hiện chấm điểm và trích xuất dữ liệu CV bằng AI.</p>
              </div>

              {/* Webhook Url */}
              <div className="space-y-1">
                <label className="text-slate-500">Google Apps Script Webhook URL</label>
                <input
                  type="text"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40"
                />
                <p className="text-[10px] text-slate-400 font-normal mt-1">Đường dẫn Webhook được sinh ra sau khi Deploy Apps Script để ghi dữ liệu thời gian thực.</p>
              </div>

              {/* ChatGPT Model */}
              <div className="space-y-1">
                <label className="text-slate-500">ChatGPT Model</label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 cursor-pointer"
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Nhanh & Tối ưu chi phí)</option>
                  <option value="gpt-4o">gpt-4o (Độ chính xác cao hơn)</option>
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white font-bold rounded-xl active:scale-95 transition-all shadow"
                >
                  Lưu cấu hình hệ thống
                </button>
              </div>
            </form>
          </div>
        </>
      )}

          {/* Nhóm Duyệt Yêu Cầu */}
          {isApprovalsTab && isApprover && (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                  <CheckCircle size={18} className="text-emerald-600" /> Nhóm Duyệt Yêu Cầu
                </h2>
                
                {/* Modern Capsule Segmented Style */}
                <div className="bg-slate-100 p-0.5 rounded-xl flex gap-1 border border-slate-200 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveApprovalTab("trip")}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                      activeApprovalTab === "trip"
                        ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    1. Duyệt công tác ({pendingTrips.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveApprovalTab("leave")}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                      activeApprovalTab === "leave"
                        ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    2. Duyệt Nghỉ Phép ({pendingLeaves.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveApprovalTab("explanation")}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                      activeApprovalTab === "explanation"
                        ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    3. Duyệt Giải Trình ({pendingExplanations.length})
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-semibold gap-2">
                  <span className="w-4 h-4 border-2 border-slate-305 border-t-blue-600 rounded-full animate-spin" />
                  Đang tải danh sách yêu cầu chờ duyệt...
                </div>
              ) : activeApprovalTab === "trip" ? (
                <div className="space-y-4">
                  {pendingTrips.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs italic py-8">Không có yêu cầu đi công tác nào chờ bạn phê duyệt.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Nhân sự</th>
                            <th className="py-3 px-4">Thời gian</th>
                            <th className="py-3 px-4">Điểm đến</th>
                            <th className="py-3 px-4">Nhiệm vụ</th>
                            <th className="py-3 px-4 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                          {pendingTrips.map((req) => {
                            // Extract destination or mission from notes
                            let cleanDest = "Chưa xác định";
                            let cleanMission = "Đi công tác";
                            if (req.notes) {
                              const destMatch = req.notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
                              if (destMatch) cleanDest = destMatch[1].trim();
                              
                              const missionMatch = req.notes.match(/-\s+\*\*Nhiệm vụ cụ thể\*\*:\s*(.*)/i);
                              if (missionMatch) cleanMission = missionMatch[1].trim();
                            }

                            return (
                              <tr key={req.id} className="hover:bg-slate-50/50 transition-all duration-150">
                                <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-indigo-500 text-white text-[9px] font-bold flex items-center justify-center">
                                    {req.assignee ? req.assignee.split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : "NV"}
                                  </div>
                                  <span>{req.assignee}</span>
                                </td>
                                <td className="py-3.5 px-4 text-slate-500 font-mono text-[10px]">
                                  {req.start_date ? new Date(req.start_date).toLocaleDateString("vi-VN") : ""} ➔ {req.due_date ? new Date(req.due_date).toLocaleDateString("vi-VN") : ""}
                                </td>
                                <td className="py-3.5 px-4 text-slate-700 font-bold">{cleanDest}</td>
                                <td className="py-3.5 px-4 text-slate-450 font-normal max-w-[200px] truncate" title={cleanMission}>{cleanMission}</td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleApprove(req.id, true)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                    >
                                      Duyệt
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleReject(req.id)}
                                      className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                    >
                                      Từ chối
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : activeApprovalTab === "leave" ? (
                <div className="space-y-4">
                  {pendingLeaves.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs italic py-8">Không có yêu cầu nghỉ phép nào chờ bạn phê duyệt.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Nhân sự</th>
                            <th className="py-3 px-4">Thời gian</th>
                            <th className="py-3 px-4">Lý do nghỉ</th>
                            <th className="py-3 px-4 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                          {pendingLeaves.map((req) => {
                            let cleanReason = "Xin nghỉ phép";
                            if (req.notes) {
                              const reasonMatch = req.notes.match(/Lý do:\s*(.*)/i);
                              if (reasonMatch) cleanReason = reasonMatch[1].trim();
                            }

                            return (
                              <tr key={req.id} className="hover:bg-slate-50/50 transition-all duration-150">
                                <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center">
                                    {req.assignee ? req.assignee.split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : "NV"}
                                  </div>
                                  <span>{req.assignee}</span>
                                </td>
                                <td className="py-3.5 px-4 text-slate-500 font-mono text-[10px]">
                                  {req.start_date ? new Date(req.start_date).toLocaleDateString("vi-VN") : ""} ➔ {req.due_date ? new Date(req.due_date).toLocaleDateString("vi-VN") : ""}
                                </td>
                                <td className="py-3.5 px-4 text-slate-450 font-normal max-w-[250px] truncate" title={cleanReason}>{cleanReason}</td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleApprove(req.id, false)}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                    >
                                      Duyệt
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleReject(req.id)}
                                      className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                    >
                                      Từ chối
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {loadingExplanations ? (
                    <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-semibold gap-2">
                      <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                      Đang tải danh sách giải trình chờ duyệt...
                    </div>
                  ) : pendingExplanations.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs italic py-8">Không có yêu cầu giải trình công nào chờ bạn phê duyệt.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50/75 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                            <th className="py-3 px-4">Nhân sự</th>
                            <th className="py-3 px-4">Bộ phận</th>
                            <th className="py-3 px-4">Ngày giải trình</th>
                            <th className="py-3 px-4">Lý do</th>
                            <th className="py-3 px-4">Khung giờ đề xuất</th>
                            <th className="py-3 px-4 text-center">Thao tác</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                          {pendingExplanations.map((exp) => (
                            <tr key={exp.id} className="hover:bg-slate-50/50 transition-all duration-150">
                              <td className="py-3.5 px-4 font-bold text-slate-800 flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                                  {exp.name ? exp.name.split(" ").filter(Boolean).map((n: string) => n[0]).join("").slice(0, 2).toUpperCase() : "NV"}
                                </div>
                                <span>{exp.name}</span>
                              </td>
                              <td className="py-3.5 px-4 text-slate-500">{exp.department}</td>
                              <td className="py-3.5 px-4 text-slate-500">{new Date(exp.date).toLocaleDateString("vi-VN")}</td>
                              <td className="py-3.5 px-4 text-slate-450 font-normal max-w-[200px] truncate" title={exp.reason}>{exp.reason}</td>
                              <td className="py-3.5 px-4 font-mono text-[#005BAC]">{exp.propose}</td>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveJustification(exp.id)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                  >
                                    Duyệt
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectJustification(exp.id)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                  >
                                    Từ chối
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {!isApprovalsTab && (
            <>
              {/* System Info */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-4">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Info size={18} className="text-blue-600" /> Thông tin nền tảng
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-semibold text-slate-600">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Phiên bản</p>
                    <p className="text-[#005BAC] font-bold">HRA Platform v2.5</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Phòng ban kết nối</p>
                    <p className="text-emerald-600 font-bold">Hành Chính Nhân Sự</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Cơ sở dữ liệu</p>
                    <p className="text-blue-600 font-bold">Google Sheets API</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Môi trường</p>
                    <p className="text-emerald-600 font-bold">Online Production</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-[#F7F9FC] items-center justify-center">
        <span className="w-8 h-8 border-4 border-slate-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}

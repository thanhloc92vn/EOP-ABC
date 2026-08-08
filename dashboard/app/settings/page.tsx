"use client";

import { apiFetch } from "@/lib/apiClient";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { Settings, Database, Info, Key, CheckCircle, ShieldAlert, ShieldCheck, Check, X, Calendar, Briefcase, User, CarFront, DoorOpen, Mail, Package, Users, CalendarClock, ChevronRight, AlertCircle } from "lucide-react";
import UserPermissionsModal, { type UserPermissionsTab } from "@/components/UserPermissionsModal";
import AvatarUploadCard from "@/components/AvatarUploadCard";
import { supabase } from "@/lib/supabase";
import { usePlan } from "@/lib/plan";
import { PLAN_LABELS, type Plan } from "@/lib/planShared";
import { useDepartments } from "@/lib/departments";
import { useTenantConfig } from "@/lib/tenantConfig";
import {
  hasAnyApprovalPermission,
  isMarketingTeamMember,
  isMarketingTeamLeader,
  isManagerRole,
  getRequestStage,
  isLeaveTripCap1Approver,
  isLeaveTripCap2Approver,
  normalizeName,
} from "@/lib/approvers";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { isHrDept, isDirectorRole } from "@/lib/access";
import { useSearchParams } from "next/navigation";

/**
 * Đơn có "chạm" vào tháng đang lọc hay không (month dạng "YYYY-MM").
 * Tính theo KHOẢNG chứ không theo một mốc: đơn nghỉ 30/09 đến 02/10 phải hiện ở
 * cả tháng 9 lẫn tháng 10, chọn tháng nào cũng thấy.
 * month rỗng = xem tất cả các tháng.
 */
const taskOverlapsMonth = (t: any, month: string): boolean => {
  if (!month) return true;
  const start = t.start_date || t.due_date;
  const end = t.due_date || t.start_date;
  // Đơn không có ngày nào thì không thuộc tháng nào — lọc theo tháng bỏ qua nó.
  if (!start || !end) return false;
  return start.slice(0, 7) <= month && end.slice(0, 7) >= month;
};

function SettingsContent() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "system";
  const isApprovalsTab = activeTab === "approvals";
  const { plan: activePlan } = usePlan();
  const [changingPlan, setChangingPlan] = useState(false);

  // Đổi gói dịch vụ (chỉ Admin — RLS tenant_config cũng chặn tầng DB).
  // Ghi vào tenant_config.plan rồi tải lại trang để mọi nơi đọc gói mới.
  const handleChangePlan = async (newPlan: Plan) => {
    if (newPlan === activePlan) return;
    if (!confirm(`Chuyển hệ thống sang gói ${PLAN_LABELS[newPlan]}?\nMenu và tính năng sẽ thay đổi theo gói ngay sau khi tải lại.`)) return;
    try {
      setChangingPlan(true);
      const { error } = await supabase
        .from("tenant_config")
        .update({ value: newPlan })
        .eq("key", "plan");
      if (error) throw error;
      window.location.reload();
    } catch (err: any) {
      alert("Không đổi được gói dịch vụ: " + (err.message || err) + "\n(Chỉ tài khoản Admin mới có quyền này.)");
      setChangingPlan(false);
    }
  };

  // ─── PHÂN GÓI THEO PHÒNG BAN (quyền nội bộ) ───
  // Ghi vào tenant_config.department_plans (jsonb). null/rỗng = chưa bật, mọi
  // người dùng chung `plan`. Có giá trị -> gói mỗi user = min(plan, gói phòng).
  const deptLists = useDepartments();
  const tenantCfg = useTenantConfig();
  const [deptPlansDraft, setDeptPlansDraft] = useState<Record<string, Plan>>({});
  const [deptPlansEnabled, setDeptPlansEnabled] = useState(false);
  const [savingDeptPlans, setSavingDeptPlans] = useState(false);

  useEffect(() => {
    const dp = tenantCfg.department_plans;
    if (dp && Object.keys(dp).length > 0) {
      setDeptPlansEnabled(true);
      setDeptPlansDraft({ ...(dp as Record<string, Plan>) });
    } else {
      setDeptPlansEnabled(false);
      setDeptPlansDraft({});
    }
  }, [tenantCfg.department_plans]);

  const setDeptPlan = (key: string, plan: Plan) => {
    setDeptPlansDraft(prev => ({ ...prev, [key]: plan }));
  };

  const saveDeptPlans = async (payload: Record<string, Plan> | null) => {
    try {
      setSavingDeptPlans(true);
      const { error } = await supabase
        .from("tenant_config")
        .upsert({ key: "department_plans", value: payload }, { onConflict: "key" });
      if (error) throw error;
      window.location.reload();
    } catch (err: any) {
      alert("Không lưu được phân gói theo phòng: " + (err.message || err) + "\n(Chỉ Admin mới có quyền này.)");
      setSavingDeptPlans(false);
    }
  };

  // Mặc định khi bật lần đầu: Ban Lãnh Đạo -> enterprise, HCNS -> professional,
  // còn lại (_default) -> basic. Admin chỉnh tiếp trước khi lưu.
  const handleEnableDeptPlans = () => {
    const seed: Record<string, Plan> = { _default: "basic" };
    for (const d of deptLists.all) {
      const dl = d.toLowerCase();
      if (dl.includes("lãnh đạo") || dl.includes("giám đốc")) seed[d] = "enterprise";
      else if (dl.includes("hành chính") || dl.includes("nhân sự")) seed[d] = "professional";
    }
    setDeptPlansDraft(seed);
    setDeptPlansEnabled(true);
  };

  // 1 dòng phòng ban: tên + bộ chọn gói dạng segmented (Basic/Pro/Enter).
  const renderDeptPlanRow = (key: string, label: string, muted = false) => {
    const cur: Plan = deptPlansDraft[key] || (key === "_default" ? "basic" : deptPlansDraft["_default"] || "basic");
    return (
      <div key={key} className="flex items-center justify-between gap-2 bg-white border border-slate-200/70 rounded-xl pl-3.5 pr-1.5 py-2 hover:border-slate-300 transition-all shadow-sm">
        <span className={`text-[11px] font-bold truncate ${muted ? "text-slate-400 italic" : "text-slate-700"}`} title={label}>{label}</span>
        <div className="flex gap-0.5 shrink-0 bg-slate-100 p-0.5 rounded-lg">
          {(["basic", "professional", "enterprise"] as Plan[]).map(pl => {
            const active = cur === pl;
            const activeCls = pl === "basic" ? "bg-slate-600 text-white" : pl === "professional" ? "bg-[#005BAC] text-white" : "bg-indigo-600 text-white";
            return (
              <button
                key={pl}
                onClick={() => setDeptPlan(key, pl)}
                className={`text-[9px] font-extrabold px-2 py-1 rounded-md uppercase tracking-wide transition-all cursor-pointer ${active ? `${activeCls} shadow-sm` : "text-slate-400 hover:text-slate-600"}`}
              >
                {pl === "basic" ? "Basic" : pl === "professional" ? "Pro" : "Enter"}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [saved, setSaved] = useState(false);

  // Approvals States
  // Danh tính người dùng — hook chung (thay khối allowed_users + employees +
  // fetchApprovalPermissions từng copy-paste ở mỗi trang).
  const user = useCurrentUser();
  const currentUser = user.authenticated ? user : null;
  const approvalPerms = user.perms;
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeApprovalTab, setActiveApprovalTab] = useState<"trip" | "leave" | "explanation" | "booking">("trip");
  // Nhóm "Danh sách đã duyệt" — bảng 3 tab dời từ cột phải trang Lịch công việc sang
  const [activeDoneTab, setActiveDoneTab] = useState<"nodate" | "leave" | "trip">("nodate");
  // Lọc theo tháng. Mặc định tháng hiện tại; chuỗi rỗng = xem tất cả các tháng.
  const [doneMonth, setDoneMonth] = useState(() => new Date().toLocaleDateString("en-CA").slice(0, 7));

  // Justifications States
  const [explanations, setExplanations] = useState<any[]>([]);
  const [loadingExplanations, setLoadingExplanations] = useState(false);

  // Resource bookings (đăng ký xe / phòng họp) States
  const [resourceBookings, setResourceBookings] = useState<any[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(false);

  // Danh bạ email/phòng ban tra theo tên — bảng tasks không có cột email, cần tra khi gửi mail
  const [employeeDirectory, setEmployeeDirectory] = useState<{ name: string; email: string; department: string; role: string }[]>([]);

  // SMTP gửi email — dùng chung bộ lưu trữ với trang C&B (localStorage tnec_cb_smtp_*)
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

  // Modal phân quyền & luồng duyệt (approval_permissions / approval_groups /
  // leave_exceptions) — chỉ Admin. Tab mở tuỳ nút bấm ở card Phân quyền.
  const [showUserPermissionsModal, setShowUserPermissionsModal] = useState(false);
  const [userPermissionsTab, setUserPermissionsTab] = useState<UserPermissionsTab>("flags");

  useEffect(() => {
    if (showEmailConfigModal) {
      setModalProvider(smtpConfig.provider || "gmail");
    }
  }, [showEmailConfigModal, smtpConfig.provider]);

  // Load configuration from local storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setApiKey(localStorage.getItem("openai_api_key") || "");
      setWebhookUrl(localStorage.getItem("apps_script_url") || "");
      setModel(localStorage.getItem("openai_model") || "gpt-4o-mini");

      // Nạp cấu hình SMTP dùng chung với trang C&B
      setSmtpConfig({
        user: localStorage.getItem("tnec_cb_smtp_user") || "",
        pass: localStorage.getItem("tnec_cb_smtp_pass") || "",
        provider: localStorage.getItem("tnec_cb_smtp_provider") || "gmail",
        host: localStorage.getItem("tnec_cb_smtp_host") || "smtp.gmail.com",
        port: Number(localStorage.getItem("tnec_cb_smtp_port")) || 465,
        secure: localStorage.getItem("tnec_cb_smtp_secure") !== "false",
      });

      fetchTasks();
      fetchExplanations();
      fetchResourceBookings();
      fetchEmployeeDirectory();
    }
  }, []);

  // Handle URL subtab parameter
  const subtabParam = searchParams.get("subtab");
  useEffect(() => {
    if (subtabParam === "explanation" || subtabParam === "trip" || subtabParam === "leave" || subtabParam === "booking") {
      setActiveApprovalTab(subtabParam as any);
    }
  }, [subtabParam]);


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

  const fetchEmployeeDirectory = async () => {
    try {
      const { data, error } = await supabase
        .from("employees_directory")
        .select("name, email, department, role");
      if (error) throw error;
      if (data) {
        setEmployeeDirectory(data.map((e: any) => ({
          name: e.name,
          email: e.email || "",
          department: e.department || "",
          role: e.role || ""
        })));
      }
    } catch (err) {
      console.error("Error fetching employee directory in settings:", err);
    }
  };

  const fetchResourceBookings = async () => {
    try {
      setLoadingBookings(true);
      const { data, error } = await supabase
        .from("resource_bookings")
        .select("*")
        .in("status", ["pending_manager", "pending_hcns"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setResourceBookings(data);
    } catch (err) {
      console.error("Error fetching resource bookings in settings:", err);
    } finally {
      setLoadingBookings(false);
    }
  };

  // Đọc SMTP dùng chung (Cài đặt hệ thống / C&B) từ localStorage
  const readSmtpConfig = () => ({
    user: localStorage.getItem("tnec_cb_smtp_user") || "",
    pass: localStorage.getItem("tnec_cb_smtp_pass") || "",
    host: localStorage.getItem("tnec_cb_smtp_host") || "smtp.gmail.com",
    port: Number(localStorage.getItem("tnec_cb_smtp_port")) || 465,
    secure: localStorage.getItem("tnec_cb_smtp_secure") !== "false",
  });

  // Cấp 1: Trưởng phòng xác nhận -> chuyển sang HCNS duyệt cuối + email báo người duyệt cuối
  // Gửi email KHÔNG chặn giao diện — bắt tay SMTP với Gmail mất vài giây, nếu
  // `await` thì nút duyệt/từ chối đứng im khiến người dùng tưởng bấm hụt.
  // Ghi DB xong là phản hồi ngay; chỉ báo thêm khi email LỖI.
  const sendBookingEmailInBackground = (payload: any, failPrefix: string, onSent?: () => void) => {
    void (async () => {
      try {
        const res = await apiFetch("/api/send-booking-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (res.ok) {
          onSent?.();
        } else {
          alert(`⚠️ ${failPrefix}: ${result.error}`);
        }
      } catch (mailErr: any) {
        alert(`⚠️ ${failPrefix}: ${mailErr.message || "lỗi kết nối"}`);
      }
    })();
  };

  // Bản cho luồng Nghỉ phép / Công tác (/api/send-request-email)
  const sendRequestEmailInBackground = (payload: any, failPrefix: string, onSent?: () => void) => {
    void (async () => {
      try {
        const res = await apiFetch("/api/send-request-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (res.ok) {
          onSent?.();
        } else {
          alert(`⚠️ ${failPrefix}: ${result.error}`);
        }
      } catch (mailErr: any) {
        alert(`⚠️ ${failPrefix}: ${mailErr.message || "lỗi kết nối"}`);
      }
    })();
  };

  const handleManagerConfirmBooking = async (booking: any) => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from("resource_bookings")
        .update({
          status: "pending_hcns",
          manager_approved_by: currentUser.name,
          manager_approved_at: new Date().toISOString(),
        })
        .eq("id", booking.id);

      if (error) throw error;

      alert("Đã xác nhận! Yêu cầu được chuyển sang Phòng HCNS (điều phối xe & phòng họp) để duyệt cuối.\n📧 Email báo người duyệt cuối đang được gửi.");
      fetchResourceBookings();

      // Tra cứu người duyệt cuối (HCNS - can_approve_booking) + gửi mail: chạy nền
      void (async () => {
        try {
          const { data: perms } = await supabase
            .from("approval_permissions")
            .select("email, can_approve_booking");
          const approverEmails = (perms || [])
            .filter((p: any) => p.can_approve_booking && p.email)
            .map((p: any) => p.email)
            .join(", ");
          if (!approverEmails) return;
          sendBookingEmailInBackground(
            {
              mode: "notify_approver",
              stage: "final",
              smtpConfig: readSmtpConfig(),
              booking: { ...booking, manager_approved_by: currentUser.name },
              approverEmails,
              siteUrl: window.location.origin,
            },
            "Chưa gửi được email báo người duyệt cuối"
          );
        } catch (mailErr: any) {
          alert(`⚠️ Chưa gửi được email báo người duyệt cuối: ${mailErr.message || "lỗi kết nối"}`);
        }
      })();
    } catch (err) {
      console.error("Error confirming booking (manager step):", err);
      alert("Lỗi khi xác nhận đăng ký!");
    }
  };

  // Cấp 2 (HCNS): duyệt / từ chối -> tự động gửi email kết quả cho người đăng ký
  const handleFinalBookingDecision = async (booking: any, approve: boolean) => {
    if (!currentUser) return;
    let rejectReason = "";
    if (!approve) {
      rejectReason = window.prompt("Nhập lý do từ chối (sẽ được gửi trong email cho người đăng ký):") || "";
      if (!rejectReason.trim()) {
        alert("Vui lòng nhập lý do từ chối để người đăng ký nắm thông tin.");
        return;
      }
    }

    try {
      const decision = approve ? "approved" : "rejected";
      const { error } = await supabase
        .from("resource_bookings")
        .update({
          status: decision,
          final_decision_by: currentUser.name,
          final_decision_at: new Date().toISOString(),
          reject_reason: approve ? null : rejectReason.trim(),
        })
        .eq("id", booking.id);

      if (error) throw error;

      alert(`${approve ? "Đã DUYỆT" : "Đã TỪ CHỐI"} đăng ký ${booking.booking_type === "xe" ? "xe" : "phòng họp"} của ${booking.requester_name}.\n📧 Email kết quả đang được gửi cho người đăng ký.`);
      fetchResourceBookings();

      // Gửi email kết quả chạy nền — SMTP dùng chung cấu hình đã lưu ở trang C&B
      // (localStorage), server sẽ fallback sang biến môi trường nếu chưa cấu hình.
      sendBookingEmailInBackground(
        {
          smtpConfig: readSmtpConfig(),
          booking: { ...booking, manager_approved_by: booking.manager_approved_by },
          decision,
          rejectReason: rejectReason.trim(),
          approverName: currentUser.name,
        },
        "Chưa gửi được email kết quả",
        // Chỉ đánh dấu email_sent khi mail thật sự gửi được
        () => { void supabase.from("resource_bookings").update({ email_sent: true }).eq("id", booking.id); }
      );
    } catch (err) {
      console.error("Error making final booking decision:", err);
      alert("Lỗi khi xử lý duyệt đăng ký!");
    }
  };

  // Cấp 1: Trưởng phòng/Tổ trưởng xác nhận -> chuyển HCNS duyệt cuối + báo email cấp 2
  const handleCap1Confirm = async (task: any, isTrip: boolean) => {
    if (!currentUser) return;
    try {
      const { error } = await supabase
        .from("tasks")
        .update({
          approval_stage: "pending_hcns",
          manager_approved_by: currentUser.name,
          manager_approved_at: new Date().toISOString(),
        })
        .eq("id", task.id);

      if (error) throw error;

      alert("Đã xác nhận! Yêu cầu được chuyển sang HCNS để duyệt cuối.\n📧 Email báo HCNS đang được gửi.");
      fetchTasks();

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
      console.error("Error confirming request (manager step):", err);
      alert("Lỗi khi xác nhận yêu cầu!");
    }
  };

  // Cấp 2 (HCNS) hoặc từ chối ở cấp 1 — duyệt cuối / từ chối + gửi email kết quả cho người gửi đơn
  const handleFinalDecision = async (task: any, isTrip: boolean, approve: boolean) => {
    if (!currentUser) return;
    let rejectReason = "";
    if (!approve) {
      rejectReason = window.prompt("Nhập lý do từ chối (sẽ được gửi email cho người gửi đơn):") || "";
      if (!rejectReason.trim()) {
        alert("Vui lòng nhập lý do từ chối!");
        return;
      }
    }

    try {
      if (approve && isTrip) {
        let cleanDest = "Chưa xác định";
        let cleanMission = "Đi công tác";
        if (task.notes) {
          const destMatch = task.notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
          if (destMatch) cleanDest = destMatch[1].trim();

          const missionMatch = task.notes.match(/-\s+\*\*Nhiệm vụ cụ thể\*\*:\s*(.*)/i);
          if (missionMatch) cleanMission = missionMatch[1].trim();
        }

        let costVal = 0;
        if (task.notes) {
          const metaMatch = task.notes.match(/<!--METADATA:(.*?)-->/);
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
            const totalMatch = task.notes.match(/\*\*TỔNG ĐỀ NGHỊ THANH TOÁN\*\*:\s*([0-9.,\s]+)/i);
            if (totalMatch) {
              const cleanNum = totalMatch[1].replace(/[.,\s]/g, "");
              costVal = Number(cleanNum);
            }
          }
        }

        if (!costVal) {
          const days = task.start_date && task.due_date
            ? Math.max(1, Math.round((new Date(task.due_date).getTime() - new Date(task.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1)
            : 1;
          const nights = days >= 2 ? days - 1 : 0;
          const hotelRate = 350000;
          costVal = days * 120000 + nights * hotelRate;
        }

        const newTrip = {
          name: task.assignee || "Nhân viên",
          dest: cleanDest,
          from_date: task.start_date || new Date().toISOString().split("T")[0],
          to_date: task.due_date || new Date().toISOString().split("T")[0],
          purpose: cleanMission,
          cost: costVal,
          status: "Đã duyệt",
          task_id: task.id
        };

        const { error: insertError } = await supabase
          .from("business_trips")
          .insert([newTrip]);

        if (insertError) {
          console.error("Error inserting business trip:", insertError.message);
        }
      }

      const { error } = await supabase
        .from("tasks")
        .update(
          approve
            ? { status: isTrip ? "in_progress" : "completed", progress: isTrip ? 50 : 100, final_decision_by: currentUser.name, final_decision_at: new Date().toISOString() }
            : { status: "need_revision", reject_reason: rejectReason.trim(), final_decision_by: currentUser.name, final_decision_at: new Date().toISOString() }
        )
        .eq("id", task.id);

      if (error) throw error;

      const requesterEmail = employeeDirectory.find(e => e.name === task.assignee)?.email || "";

      alert(
        `${approve ? "Đã phê duyệt" : "Đã từ chối"} yêu cầu ${isTrip ? "đi công tác" : "nghỉ phép"}.` +
        (requesterEmail ? "\n📧 Email kết quả đang được gửi cho người làm đơn." : "")
      );
      fetchTasks();

      if (requesterEmail) {
        sendRequestEmailInBackground(
          {
            requestType: isTrip ? "trip" : "leave",
            smtpConfig: readSmtpConfig(),
            task,
            requesterEmail,
            decision: approve ? "approved" : "rejected",
            rejectReason: rejectReason.trim(),
            deciderName: currentUser.name,
          },
          "Chưa gửi được email kết quả"
        );
      }
    } catch (err) {
      console.error("Error finalizing request decision:", err);
      alert("Lỗi khi xử lý yêu cầu!");
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
    if (hasAnyApprovalPermission(approvalPerms)) return true;
    // Tổ trưởng Marketing duyệt cấp 1 cho thành viên tổ Marketing
    if (isMarketingTeamLeader(currentUser.name)) return true;
    const roleLower = currentUser.role.toLowerCase();
    return (
      roleLower.includes("tổ trưởng") ||
      roleLower.includes("to truong") ||
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
  }, [currentUser, approvalPerms]);

  // Phòng ban / Ban điều hành của một người, tra theo TÊN trong danh bạ nhân sự.
  // Bảng `tasks` chỉ lưu tên người làm đơn nên phải tra ngược thế này.
  //
  // PHẢI KHAI Ở ĐÂY, TRƯỚC pendingTrips/pendingLeaves. Hai useMemo đó gọi hàm này
  // ngay trong lúc render; đặt khai báo `const` xuống dưới chúng thì lúc chạy sẽ
  // ném "Cannot access before initialization" và sập nguyên trang. TypeScript
  // KHÔNG bắt được lỗi này.
  const departmentOfPerson = useCallback(
    (personName?: string | null) => {
      const key = normalizeName(personName);
      if (!key) return "";
      return employeeDirectory.find(e => normalizeName(e.name) === key)?.department || "";
    },
    [employeeDirectory]
  );

  // Business trip approvals list (Trưởng phòng & Admin only)
  // Đơn công tác chờ duyệt — 2 cấp: Trưởng phòng/Tổ trưởng xác nhận (manager) -> HCNS duyệt cuối (hcns).
  // Mỗi task được gắn thêm `stage` để UI hiển thị đúng badge + nút thao tác tương ứng.
  const pendingTrips = useMemo(() => {
    if (!currentUser || !isApprover) return [];
    const isUserAdmin = currentUser.isAdmin || (currentUser.role || "").toLowerCase() === "admin";

    return tasks
      .filter(t => t.status === "pending_approval" && (t.title.toLowerCase().startsWith("công tác") || t.title.toLowerCase().includes("cong tac")))
      .map(t => ({ ...t, stage: getRequestStage(t) }))
      .filter(t => {
        if (t.stage === "manager") {
          return isLeaveTripCap1Approver({
            currentUserName: currentUser.name,
            currentUserRole: currentUser.role,
            currentUserIsAdmin: isUserAdmin,
            currentUserIsDirector: currentUser.isDirector || isDirectorRole(currentUser.role),
            currentUserDepartment: currentUser.department,
            assigneeName: t.assignee,
            assigneeDepartment: departmentOfPerson(t.assignee),
            taskNotes: t.notes,
            taskTitleLower: t.title.toLowerCase(),
          });
        }
        return isLeaveTripCap2Approver({ currentUserIsAdmin: isUserAdmin, approvalPerms, isTrip: true });
      });
  }, [tasks, currentUser, isApprover, approvalPerms]);

  // Đơn nghỉ phép chờ duyệt — cùng luồng 2 cấp, giữ nguyên các quy tắc đặc cách hiện có
  // (người duyệt được chỉ định tường minh, Quỳnh/Hằng, Hoành Anh/Quyên) ở cấp 1.
  const pendingLeaves = useMemo(() => {
    if (!currentUser || !isApprover) return [];
    const isUserAdmin = currentUser.isAdmin || (currentUser.role || "").toLowerCase() === "admin";

    return tasks
      .filter(t => {
        if (t.status !== "pending_approval") return false;
        const titleLower = t.title.toLowerCase();
        return titleLower.startsWith("nghỉ phép") || titleLower.includes("nghi phep");
      })
      .map(t => ({ ...t, stage: getRequestStage(t) }))
      .filter(t => {
        if (t.stage === "manager") {
          return isLeaveTripCap1Approver({
            currentUserName: currentUser.name,
            currentUserRole: currentUser.role,
            currentUserIsAdmin: isUserAdmin,
            currentUserIsDirector: currentUser.isDirector || isDirectorRole(currentUser.role),
            currentUserDepartment: currentUser.department,
            assigneeName: t.assignee,
            assigneeDepartment: departmentOfPerson(t.assignee),
            taskNotes: t.notes,
            taskTitleLower: t.title.toLowerCase(),
          });
        }
        return isLeaveTripCap2Approver({ currentUserIsAdmin: isUserAdmin, approvalPerms, isTrip: false });
      });
  }, [tasks, currentUser, isApprover, approvalPerms]);

  // ─── Nhóm "Danh sách đã duyệt" ───
  // Ba danh sách dời nguyên từ cột phải trang Lịch công việc. Bên đó lọc trên
  // `filteredTasks` (theo ô tìm kiếm / nhân sự / độ ưu tiên của trang Lịch);
  // trang này không có mấy bộ lọc đó nên đọc thẳng `tasks`.
  const doneTasksWithoutDate = useMemo(() => {
    return tasks.filter(t => !t.due_date && !t.start_date);
  }, [tasks]);

  const doneLeaveTasks = useMemo(() => {
    return tasks.filter(t =>
      (t.title.toLowerCase().startsWith("nghỉ phép") || t.title.toLowerCase().includes("nghi phep"))
      && taskOverlapsMonth(t, doneMonth)
    );
  }, [tasks, doneMonth]);

  const doneTripTasks = useMemo(() => {
    return tasks.filter(t =>
      (t.title.toLowerCase().startsWith("công tác") || t.title.toLowerCase().includes("cong tac"))
      && taskOverlapsMonth(t, doneMonth)
    );
  }, [tasks, doneMonth]);

  // Hai helper đọc metadata trong notes — bê nguyên từ trang Lịch công việc
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

  // Justifications approvals list (Admin, HR, Director, or department manager/deputy)
  const pendingExplanations = useMemo(() => {
    if (!currentUser || !isApprover) return [];
    
    // Nhận diện qua helper trung tâm (thay các danh sách so chuỗi vai trò rời rạc).
    const isUserAdmin = currentUser.isAdmin || (currentUser.role || "").toLowerCase() === "admin";
    const isUserHR = isHrDept(currentUser.role);        // HR theo vai trò (Nhân sự/HCNS)
    const isDirector = isDirectorRole(currentUser.role); // Giám đốc

    return explanations.filter(e => {
      if (isUserAdmin || isUserHR || isDirector || approvalPerms.canApproveJustification) return true;
      if (e.approver === currentUser.name) return true;
      // Trưởng/Phó phòng (quản lý) cùng phòng ban với người giải trình
      if (isManagerRole(currentUser.role) && currentUser.department === e.department) return true;
      return false;
    });
  }, [explanations, currentUser, isApprover, approvalPerms]);

  // Đăng ký xe / phòng họp chờ duyệt:
  // - Cấp 1 (pending_manager): Trưởng/Phó phòng cùng phòng ban với người đăng ký, hoặc Admin.
  // - Cấp 2 (pending_hcns): người được cấp quyền can_approve_booking (HCNS điều phối) hoặc Admin.
  const pendingBookings = useMemo(() => {
    if (!currentUser || !isApprover) return [];

    const roleLower = (currentUser.role || "").toLowerCase();
    const isUserAdmin = currentUser.isAdmin || roleLower === "admin";
    const isUserManager =
      roleLower.includes("trưởng phòng") || roleLower.includes("truong phong") ||
      roleLower.includes("phó phòng") || roleLower.includes("pho phong") ||
      roleLower.includes("phó trưởng phòng") || roleLower.includes("pho truong phong") ||
      roleLower.includes("giám đốc") || roleLower.includes("giam doc") ||
      roleLower.includes("quản lý") || roleLower.includes("quan ly") ||
      roleLower.startsWith("tp.") || roleLower.startsWith("tp ") ||
      roleLower.includes("leader");

    return resourceBookings.filter((b) => {
      if (b.status === "pending_manager") {
        if (isUserAdmin) return true;
        // Tổ Marketing (thuộc HCNS): cấp 1 do Tổ trưởng Marketing duyệt, không qua Trưởng phòng HCNS
        if (isMarketingTeamMember(b.requester_name)) {
          return isMarketingTeamLeader(currentUser.name);
        }
        return isUserManager && currentUser.department === b.department;
      }
      if (b.status === "pending_hcns") {
        return isUserAdmin || approvalPerms.canApproveBooking;
      }
      return false;
    });
  }, [resourceBookings, currentUser, isApprover, approvalPerms]);

  // Lưu SMTP vào cùng bộ khoá với trang C&B — cấu hình một nơi, cả hệ thống dùng chung
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
    alert("Đã lưu cấu hình gửi email SMTP! Các nút Duyệt & gửi mail sẽ dùng tài khoản này.");
  };

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
          subtitle={isApprovalsTab ? "Xem và phê duyệt các yêu cầu đi công tác, nghỉ phép của nhân sự" : undefined} 
        />

        <main className="flex-1 p-8 space-y-6 overflow-y-auto w-full">
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
            <div className="flex flex-col 2xl:flex-row gap-6 items-start">
            <div className="flex-1 min-w-0 w-full">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              {/* ═══ CỘT TRÁI: Gói dịch vụ + Bảo mật & Kết nối ═══ */}
              <div className="space-y-6">
              {/* ─── GÓI DỊCH VỤ (chỉ Admin thấy và đổi được) ─── */}
              {currentUser?.isAdmin && (
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
                  <Package size={18} className="text-blue-600" /> Gói dịch vụ
                </h2>
                <p className="text-[11px] text-slate-400 font-medium mb-5">
                  Gói quyết định các module khả dụng trên toàn hệ thống. Chỉ Admin đổi được gói.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {([
                    { key: "basic" as Plan, desc: "Dashboard, Công việc, Lịch, Đăng ký xe/phòng họp, Hành chính & Tài sản, Biên bản họp, Vị trí dự án, Lương & Phúc lợi (C&B), Phòng ban, Cài đặt", accent: "border-slate-300", badge: "bg-slate-100 text-slate-600" },
                    { key: "professional" as Plan, desc: "+ Danh sách nhân viên, Góp ý & Kiến nghị, Tuyển dụng, Văn thư, Tổng hợp", accent: "border-blue-300", badge: "bg-blue-50 text-blue-600" },
                    { key: "enterprise" as Plan, desc: "+ Tìm kiếm AI thông minh", accent: "border-indigo-300", badge: "bg-indigo-50 text-indigo-600" },
                  ]).map(p => {
                    const isActive = activePlan === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => handleChangePlan(p.key)}
                        disabled={changingPlan || isActive}
                        className={`text-left p-4 rounded-2xl border-2 transition-all ${
                          isActive
                            ? `${p.accent} bg-slate-50/50 shadow-inner cursor-default`
                            : "border-slate-100 hover:border-slate-200 hover:bg-slate-50/50 cursor-pointer"
                        } disabled:opacity-90`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${p.badge}`}>
                            {PLAN_LABELS[p.key]}
                          </span>
                          {isActive && (
                            <span className="text-[9px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Đang dùng
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 font-medium leading-relaxed">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>

                <p className="mt-4 text-[10px] text-slate-400 font-medium leading-relaxed bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
                  🔒 Gói mở <b className="text-slate-500">module</b>, không mở <b className="text-slate-500">dữ liệu nhạy cảm</b>.
                  Trong C&amp;B, bảng lương &amp; BHXH và hợp đồng lao động chỉ hiện với Admin hoặc tài khoản
                  được bật cờ &quot;Xem lương &amp; HĐLĐ&quot; ở phần Phân quyền người dùng.
                </p>
              </div>
              )}

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

              </div>

              {/* ═══ CỘT PHẢI: Phân quyền & Luồng duyệt + SMTP + Thông tin nền tảng ═══ */}
              <div className="space-y-6">

              {/* ─── PHÂN QUYỀN & LUỒNG DUYỆT (chỉ Admin — 3 cụm, mỗi cụm một màu) ─── */}
              {currentUser?.isAdmin && (
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
                  <ShieldCheck size={18} className="text-indigo-600" /> Phân quyền &amp; Luồng duyệt
                </h2>
                <p className="text-[11px] text-slate-400 font-medium mb-4 leading-relaxed">
                  Toàn bộ quyền và luồng duyệt cấu hình bằng dữ liệu — cấp / thu hồi ngay tại đây,
                  không cần sửa code hay vào Supabase Table Editor.
                </p>
                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={() => { setUserPermissionsTab("flags"); setShowUserPermissionsModal(true); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-200 transition-all active:scale-[0.99] cursor-pointer text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-[#005BAC] text-white flex items-center justify-center shadow-sm shrink-0">
                      <ShieldCheck size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">Cờ quyền người dùng (User Permissions)</p>
                      <p className="text-[10px] text-slate-400 font-medium">Duyệt công tác / nghỉ phép, xem lương, hồ sơ thanh toán, văn thư... cho từng nhân sự</p>
                    </div>
                    <ChevronRight size={15} className="text-blue-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => { setUserPermissionsTab("groups"); setShowUserPermissionsModal(true); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-amber-100 bg-amber-50/50 hover:bg-amber-50 hover:border-amber-200 transition-all active:scale-[0.99] cursor-pointer text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-400 text-white flex items-center justify-center shadow-sm shrink-0">
                      <Users size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">Nhóm duyệt riêng (tổ)</p>
                      <p className="text-[10px] text-slate-400 font-medium">Tổ trưởng duyệt cấp 1 mọi loại đơn thay Trưởng phòng ban — VD Tổ Marketing</p>
                    </div>
                    <ChevronRight size={15} className="text-amber-400 shrink-0" />
                  </button>

                  <button
                    type="button"
                    onClick={() => { setUserPermissionsTab("exceptions"); setShowUserPermissionsModal(true); }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-rose-100 bg-rose-50/50 hover:bg-rose-50 hover:border-rose-200 transition-all active:scale-[0.99] cursor-pointer text-left"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-400 text-white flex items-center justify-center shadow-sm shrink-0">
                      <CalendarClock size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800">Đặc cách nghỉ 1 ngày</p>
                      <p className="text-[10px] text-slate-400 font-medium">Cặp người duyệt thay cho đơn nghỉ đúng 1 ngày — VD Quỳnh duyệt Hằng</p>
                    </div>
                    <ChevronRight size={15} className="text-rose-400 shrink-0" />
                  </button>
                </div>
              </div>
              )}

          {/* Cấu hình Email gửi thông báo (SMTP) — dùng chung với C&B và Duyệt Đăng ký */}
          <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
            <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-4">
              <Mail size={18} className="text-emerald-600" /> Cấu hình gửi Email hệ thống (SMTP)
            </h2>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs font-semibold text-slate-600 space-y-1">
                {smtpConfig.user ? (
                  <p className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    Đang dùng tài khoản gửi: <span className="text-[#005BAC] font-bold">{smtpConfig.user}</span>
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-amber-600">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    Chưa cấu hình — các nút &quot;Duyệt &amp; gửi mail&quot; sẽ không gửi được email kết quả.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowEmailConfigModal(true)}
                className="shrink-0 px-5 py-2.5 bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold rounded-xl active:scale-95 transition-all shadow-md shadow-blue-500/10 flex items-center gap-2 cursor-pointer"
              >
                <Settings size={14} /> {smtpConfig.user ? "Thay đổi cấu hình email" : "Cấu hình gửi email"}
              </button>
            </div>
          </div>

              {/* Thông tin nền tảng */}
              <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-sm space-y-4">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Info size={18} className="text-slate-500" /> Thông tin nền tảng
                </h2>
                <div className="text-xs font-semibold text-slate-600">
                  <div className="bg-slate-50 rounded-xl p-4 space-y-0.5">
                    <p className="text-slate-400 text-[10px]">Phiên bản</p>
                    <p className="text-[#005BAC] font-bold">HRM Version 1.0</p>
                  </div>
                </div>
              </div>

              {/* Ảnh đại diện — mọi tài khoản đều dùng được, không gate quyền */}
              {currentUser?.email && (
                <AvatarUploadCard email={currentUser.email} name={currentUser.name} />
              )}
              </div>
            </div>
            </div>

            {/* ═══ PHÂN GÓI THEO PHÒNG BAN (cột phải, chỉ Admin) ═══ */}
            {currentUser?.isAdmin && (
            <div className="w-full 2xl:w-[640px] 2xl:shrink-0">
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                <div>
                  <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2 mb-1">
                    <Users size={18} className="text-blue-600" /> Phân gói theo phòng ban
                  </h2>
                  <p className="text-[11px] text-slate-400 font-medium max-w-3xl leading-relaxed">
                    Gán gói riêng cho từng phòng (quyền nội bộ). Gói hiệu lực của mỗi người = thấp hơn
                    giữa gói hệ thống và gói phòng của họ. Ngoại lệ cho một cá nhân (VD Trưởng phòng QLDA
                    xem Văn thư) cấp qua nút <strong>User Permissions</strong>.
                  </p>
                </div>
                {deptPlansEnabled && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => { if (confirm("Tắt phân gói theo phòng? Mọi người sẽ dùng chung gói hệ thống.")) saveDeptPlans(null); }}
                      disabled={savingDeptPlans}
                      className="text-[11px] font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-50 px-3 py-2 rounded-xl transition-all cursor-pointer"
                    >
                      Tắt
                    </button>
                    <button
                      onClick={() => saveDeptPlans(deptPlansDraft)}
                      disabled={savingDeptPlans}
                      className="text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1.5"
                    >
                      {savingDeptPlans ? "Đang lưu…" : "Lưu & áp dụng"}
                    </button>
                  </div>
                )}
              </div>

              {!deptPlansEnabled ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500">
                    <Users size={22} />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium max-w-md leading-relaxed">
                    Chưa bật — hiện mọi phòng dùng chung gói hệ thống (<strong>{PLAN_LABELS[activePlan]}</strong>).
                    Bật để gán gói riêng cho từng phòng.
                  </p>
                  <button
                    onClick={handleEnableDeptPlans}
                    className="text-[11px] font-bold text-white bg-[#005BAC] hover:bg-blue-700 px-5 py-2.5 rounded-xl transition-all cursor-pointer shadow-md shadow-blue-500/10"
                  >
                    Bật phân gói theo phòng
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Mặc định — phòng chưa gán */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                    {renderDeptPlanRow("_default", "Phòng chưa gán (mặc định)", true)}
                  </div>

                  {/* Phòng ban chức năng */}
                  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 space-y-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-black text-indigo-500 uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Phòng ban chức năng
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2 gap-2.5">
                      {deptLists.phongBan.map(d => renderDeptPlanRow(d, d))}
                    </div>
                  </div>

                  {/* Ban điều hành dự án */}
                  {deptLists.bdh.length > 0 && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4 space-y-3">
                      <p className="flex items-center gap-1.5 text-[10px] font-black text-amber-600 uppercase tracking-wider">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Ban điều hành dự án
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2 gap-2.5">
                        {deptLists.bdh.map(d => renderDeptPlanRow(d, d))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
            )}
            </div>
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
                  <button
                    type="button"
                    onClick={() => setActiveApprovalTab("booking")}
                    className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                      activeApprovalTab === "booking"
                        ? "bg-white text-blue-600 shadow-sm border border-slate-200/20"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    4. Duyệt Đăng ký ({pendingBookings.length})
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
                            <th className="py-3 px-4">Cấp duyệt</th>
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
                            const isManagerStage = req.stage === "manager";

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
                                  <span className={`inline-block px-2.5 py-1 rounded-full border text-[9px] font-extrabold uppercase ${
                                    isManagerStage ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  }`}>
                                    {isManagerStage ? "Cấp 1: Trưởng phòng" : "Cấp 2: HCNS"}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center justify-center gap-2">
                                    {isManagerStage ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleCap1Confirm(req, true)}
                                          className="bg-[#005BAC] hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                        >
                                          Xác nhận & chuyển HCNS
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFinalDecision(req, true, false)}
                                          className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                        >
                                          Từ chối
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleFinalDecision(req, true, true)}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                        >
                                          Duyệt & gửi mail
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFinalDecision(req, true, false)}
                                          className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                        >
                                          Từ chối
                                        </button>
                                      </>
                                    )}
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
                            <th className="py-3 px-4">Cấp duyệt</th>
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
                            const isManagerStage = req.stage === "manager";

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
                                  <span className={`inline-block px-2.5 py-1 rounded-full border text-[9px] font-extrabold uppercase ${
                                    isManagerStage ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                                  }`}>
                                    {isManagerStage ? "Cấp 1: Trưởng phòng" : "Cấp 2: HCNS"}
                                  </span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center justify-center gap-2">
                                    {isManagerStage ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleCap1Confirm(req, false)}
                                          className="bg-[#005BAC] hover:bg-blue-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                        >
                                          Xác nhận & chuyển HCNS
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFinalDecision(req, false, false)}
                                          className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                        >
                                          Từ chối
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() => handleFinalDecision(req, false, true)}
                                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                        >
                                          Duyệt & gửi mail
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFinalDecision(req, false, false)}
                                          className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                        >
                                          Từ chối
                                        </button>
                                      </>
                                    )}
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
              ) : activeApprovalTab === "explanation" ? (
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
              ) : (
                <div className="space-y-4">
                  {loadingBookings ? (
                    <div className="flex items-center justify-center py-8 text-slate-400 text-xs font-semibold gap-2">
                      <span className="w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin" />
                      Đang tải danh sách đăng ký xe / phòng họp chờ duyệt...
                    </div>
                  ) : pendingBookings.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs italic py-8">Không có đăng ký xe / phòng họp nào chờ bạn xử lý.</p>
                  ) : (
                    <div className="space-y-4">
                      {pendingBookings.map((b) => {
                        const isVehicleBooking = b.booking_type === "xe";
                        const isManagerStep = b.status === "pending_manager";
                        const attendeeList: string[] = Array.isArray(b.attendees) ? b.attendees : [];
                        return (
                          <div key={b.id} className="rounded-xl border border-slate-200/60 bg-white p-5 space-y-3 hover:bg-slate-50/30 transition-all">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm ${isVehicleBooking ? "bg-gradient-to-br from-amber-500 to-orange-400" : "bg-gradient-to-br from-blue-600 to-cyan-500"}`}>
                                  {isVehicleBooking ? <CarFront size={16} /> : <DoorOpen size={16} />}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800 text-xs">
                                    {isVehicleBooking ? "Đăng ký xe" : "Đăng ký phòng họp"}: <span className="text-[#005BAC]">{b.resource_name}</span>
                                  </p>
                                  <p className="text-[10px] text-slate-400 font-semibold">
                                    {b.requester_name} • {b.department} • gửi lúc {b.created_at ? new Date(b.created_at).toLocaleString("vi-VN") : ""}
                                  </p>
                                </div>
                              </div>
                              <span className={`px-2.5 py-1 rounded-full border text-[9px] font-extrabold uppercase ${
                                isManagerStep ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"
                              }`}>
                                {isManagerStep ? "Cấp 1: Chờ Trưởng phòng xác nhận" : "Cấp 2: Chờ HCNS duyệt cuối"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] font-semibold text-slate-600 bg-slate-50/60 rounded-xl p-3">
                              <div>
                                <p className="text-[9px] text-slate-400 uppercase font-bold">Người chủ trì</p>
                                <p className="text-slate-800">{b.host_name}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-400 uppercase font-bold">Thời gian</p>
                                <p className="font-mono text-[10px]">
                                  {new Date(b.start_time).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })} ➔ {new Date(b.end_time).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                                </p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-400 uppercase font-bold">Số người</p>
                                <p>{b.attendee_count}{b.participant_type === "khach_hang" ? " (có khách ngoài)" : " (nội bộ)"}</p>
                              </div>
                              <div>
                                <p className="text-[9px] text-slate-400 uppercase font-bold">{isVehicleBooking ? "Mục đích" : "Nội dung họp"}</p>
                                <p className="font-normal truncate" title={b.content}>{b.content}</p>
                              </div>
                            </div>

                            {(attendeeList.length > 0 || b.customer_info || b.notes || b.manager_approved_by) && (
                              <div className="text-[10px] text-slate-500 font-normal space-y-1">
                                {attendeeList.length > 0 && <p><strong className="text-slate-600">Tham dự:</strong> {attendeeList.join(", ")}</p>}
                                {b.customer_info && <p><strong className="text-slate-600">Khách hàng:</strong> {b.customer_info}</p>}
                                {b.notes && <p><strong className="text-slate-600">Ghi chú hậu cần:</strong> {b.notes}</p>}
                                {b.manager_approved_by && <p><strong className="text-slate-600">Trưởng phòng đã xác nhận:</strong> {b.manager_approved_by}</p>}
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                              {isManagerStep ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleManagerConfirmBooking(b)}
                                    className="bg-[#005BAC] hover:bg-blue-700 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                  >
                                    Xác nhận & chuyển HCNS
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleFinalBookingDecision(b, false)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                  >
                                    Từ chối & gửi mail
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleFinalBookingDecision(b, true)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                  >
                                    Duyệt & gửi mail
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleFinalBookingDecision(b, false)}
                                    className="bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold px-4 py-2 rounded-lg transition-all active:scale-95 shadow-sm cursor-pointer"
                                  >
                                    Từ chối & gửi mail
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── NHÓM DANH SÁCH ĐÃ DUYỆT ───
              Bảng 3 tab dời nguyên từ cột phải trang Lịch công việc sang đây. */}
          {isApprovalsTab && isApprover && (
            <div className="glass bg-white rounded-2xl p-6 border border-slate-200/50 shadow-premium space-y-4 mt-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <h2 className="font-heading font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Calendar size={18} className="text-[#005BAC]" /> Nhóm danh sách đã duyệt
                </h2>

                {/* Lọc theo tháng — áp cho tab Nghỉ phép và Công tác */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
                    <Calendar size={12} className="text-slate-400" />
                    <input
                      type="month"
                      value={doneMonth}
                      onChange={(e) => setDoneMonth(e.target.value)}
                      className="bg-transparent border-none outline-none font-bold text-slate-700 text-xs cursor-pointer"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setDoneMonth("")}
                    className={`text-[10px] font-bold px-3 py-2 rounded-xl border transition-all active:scale-95 ${
                      doneMonth === ""
                        ? "bg-blue-50 border-blue-200 text-[#005BAC]"
                        : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    }`}
                  >
                    Tất cả các tháng
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-3 bg-slate-100 p-0.5 rounded-xl text-center text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveDoneTab("nodate")}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    activeDoneTab === "nodate"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Chưa hạn ({doneTasksWithoutDate.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDoneTab("leave")}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    activeDoneTab === "leave"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Nghỉ phép ({doneLeaveTasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDoneTab("trip")}
                  className={`py-2 rounded-lg cursor-pointer transition-all ${
                    activeDoneTab === "trip"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  Công tác ({doneTripTasks.length})
                </button>
              </div>

              {/* Tab Content */}
              <div className="space-y-3 max-h-[500px] overflow-y-auto scrollbar-thin">
                {activeDoneTab === "nodate" && (
                  <div className="space-y-3">
                    {/* Nói rõ vì sao đổi tháng mà danh sách này không đổi */}
                    <p className="text-[10px] font-semibold text-slate-400 italic">
                      Mục này không lọc theo tháng — đây là các việc chưa đặt ngày nên không thuộc tháng nào.
                    </p>
                    <div className="bg-rose-50 border border-rose-100 p-3 rounded-xl flex gap-2">
                      <AlertCircle className="text-rose-500 shrink-0" size={16} />
                      <div className="text-[10px] leading-relaxed">
                        <span className="font-bold text-rose-800 block">🚨 CHƯA CÓ NGÀY HẠN</span>
                        <span className="text-rose-600 font-medium">
                          Danh sách công việc chưa được thiết lập deadline. Hãy nhấp để mở rộng và cấu hình hạn hoàn thành.
                        </span>
                      </div>
                    </div>
                    {doneTasksWithoutDate.map(t => (
                      <div
                        key={t.id}
                        className="p-3 bg-white border border-slate-200/80 rounded-xl shadow-sm space-y-1.5 text-left"
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
                    {doneTasksWithoutDate.length === 0 && (
                      <p className="text-center text-slate-400 text-xs italic py-10">Tất cả việc đều đã có hạn</p>
                    )}
                  </div>
                )}

                {activeDoneTab === "leave" && (
                  <div className="space-y-3">
                    {doneLeaveTasks.map(t => (
                      <div
                        key={t.id}
                        className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl space-y-1.5 text-left"
                      >
                        <p className="font-heading font-bold text-xs text-emerald-800">🌴 {t.title.replace(/^Nghỉ phép:\s*/i, "")}</p>
                        <div className="flex items-center justify-between text-[9px] text-emerald-600 font-semibold">
                          <span>Phòng ban/Lý do: {getCleanDept(t.notes || "")}</span>
                          <span>Hạn: {t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN") : "N/A"}</span>
                        </div>
                      </div>
                    ))}
                    {doneLeaveTasks.length === 0 && (
                      <p className="text-center text-slate-400 text-xs italic py-10">Không có lịch nghỉ phép nào</p>
                    )}
                  </div>
                )}

                {activeDoneTab === "trip" && (
                  <div className="space-y-3">
                    {doneTripTasks.map(t => (
                      <div
                        key={t.id}
                        className="p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl space-y-1.5 text-left"
                      >
                        <p className="font-heading font-bold text-xs text-indigo-800">💼 {t.title.replace(/^Công tác:\s*/i, "")}</p>
                        <div className="flex items-center justify-between text-[9px] text-indigo-600 font-semibold">
                          <span>Địa điểm: {getCleanLocation(t.notes || "")}</span>
                          <span>Hạn: {t.due_date ? new Date(t.due_date).toLocaleDateString("vi-VN") : "N/A"}</span>
                        </div>
                      </div>
                    ))}
                    {doneTripTasks.length === 0 && (
                      <p className="text-center text-slate-400 text-xs italic py-10">Không có lịch đi công tác nào</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── MODAL PHÂN QUYỀN & LUỒNG DUYỆT (chỉ Admin — RLS chặn ghi tầng DB) ─── */}
          {currentUser?.isAdmin && (
            <UserPermissionsModal
              open={showUserPermissionsModal}
              onClose={() => setShowUserPermissionsModal(false)}
              employeeDirectory={employeeDirectory}
              initialTab={userPermissionsTab}
            />
          )}

          {/* ─── MODAL CẤU HÌNH SMTP GỬI THƯ (y hệt trang C&B, dùng chung localStorage) ─── */}
          {showEmailConfigModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
              <div className="bg-white w-full max-w-md rounded-2xl shadow-premium border border-slate-100 overflow-hidden transform transition-all animate-in zoom-in-95 duration-150">
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
                      placeholder={modalProvider === "gmail" ? "vidu@gmail.com" : "quynhnbn@trungnamgroup.com.vn"}
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
                    <p className="pt-1 text-slate-400 border-t border-blue-100/50 mt-1">Thông tin SMTP được lưu cục bộ trên trình duyệt của bạn (localStorage), dùng chung cho trang C&amp;B và nút Duyệt Đăng ký.</p>
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

"use client";

import { apiFetch } from "@/lib/apiClient";
import { useEffect, useState } from "react";
import { Bell, Search, Globe, ChevronDown, Menu, X, Sparkles, Loader2, Send, Copy, Trash2, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  fetchApprovalPermissions,
  hasAnyApprovalPermission,
  isMarketingTeamMember,
  isMarketingTeamLeader,
  isManagerRole,
  getRequestStage,
  isLeaveTripCap1Approver,
  isLeaveTripCap2Approver,
  normalizeName,
} from "@/lib/approvers";
import { isDirectorRole } from "@/lib/access";
import { useSidebar } from "./SidebarContext";
import { useTenantConfig } from "@/lib/tenantConfig";
import { usePlan } from "@/lib/plan";
import {
  AVATAR_UPDATED_EVENT,
  fetchAvatar,
  type AvatarUpdatedDetail,
} from "@/lib/avatar";

interface Props {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: Props) {
  const tenant = useTenantConfig();
  const { isFeatureAllowed } = usePlan();
  const aiSearchAllowed = isFeatureAllowed("ai_search");
  const [profile, setProfile] = useState<{ name: string; role: string; avatar: string }>({
    name: "Đang tải...",
    role: "...",
    avatar: "HR"
  });
  
  // Ảnh đại diện (bảng `user_avatars`). null = chưa đặt -> vẽ hai chữ viết tắt.
  const [avatarImage, setAvatarImage] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // AI Search states
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiHistory, setAiHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (aiSearchAllowed) setShowSearchModal(true); // Tìm kiếm AI: gói Enterprise
      }
      if (e.key === "Escape") {
        setShowSearchModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [aiSearchAllowed]);

  const handleAiSearch = async (overrideQuery?: string) => {
    const queryToSend = (overrideQuery || searchQuery).trim();
    if (!queryToSend) return;

    const newUserMessage = { role: "user" as const, content: queryToSend };
    // Clear search input if submitted from input box
    if (!overrideQuery) {
      setSearchQuery("");
    }
    
    // Optimistically update the UI history
    const updatedHistory = [...aiHistory, newUserMessage];
    setAiHistory(updatedHistory);
    setIsAiLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseToken = session?.access_token || "";

      const localKey = typeof window !== "undefined" ? (localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key")) : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (localKey) {
        headers["Authorization"] = `Bearer ${localKey}`;
      }
      if (supabaseToken) {
        headers["x-supabase-auth"] = supabaseToken;
      }

      const response = await apiFetch("/api/ai-search", {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: queryToSend,
          history: aiHistory, // Send existing history
          currentUser
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || "Lỗi khi gọi API tìm kiếm AI");
      }

      setAiHistory(prev => [...prev, { role: "assistant" as const, content: resData.answer }]);
    } catch (err: any) {
      console.error("AI Search error:", err);
      setAiHistory(prev => [...prev, { 
        role: "assistant" as const, 
        content: `❌ **Lỗi:** ${err.message || "Không thể kết nối đến máy chủ AI. Vui lòng kiểm tra lại cấu hình API Key trong mục Cài đặt hệ thống."}` 
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const renderMarkdownAnswer = (text: string) => {
    if (!text) return null;

    const lines = text.split("\n");
    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    const renderedElements: React.ReactNode[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Handle Table markup
      if (line.startsWith("|")) {
        const cells = line.split("|").map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        
        if (line.replace(/[\s|-|:|]/g, "") === "") {
          continue;
        }

        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
        continue;
      } else if (inTable) {
        inTable = false;
        const headers = tableHeaders;
        const rows = tableRows;
        tableHeaders = [];
        tableRows = [];

        renderedElements.push(
          <div key={`table-${i}`} className="overflow-x-auto my-3 border border-slate-200/80 rounded-xl shadow-sm bg-white">
            <table className="min-w-full text-[11px] text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                  {headers.map((h, hIdx) => (
                    <th key={hIdx} className="px-3 py-2 border-r last:border-r-0 border-slate-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-slate-50/50 bg-white transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 border-r last:border-r-0 border-slate-200">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      // Handle Headers
      if (line.startsWith("### ")) {
        renderedElements.push(<h6 key={i} className="font-heading font-black text-slate-800 text-[11px] uppercase tracking-wider mt-3 mb-1">{line.slice(4)}</h6>);
      } else if (line.startsWith("## ")) {
        renderedElements.push(<h5 key={i} className="font-heading font-black text-slate-850 text-xs uppercase tracking-wider mt-4 mb-1.5">{line.slice(3)}</h5>);
      } else if (line.startsWith("# ")) {
        renderedElements.push(<h4 key={i} className="font-heading font-black text-slate-900 text-sm uppercase tracking-tight mt-4 mb-2">{line.slice(2)}</h4>);
      }
      // Handle Bullet points
      else if (line.startsWith("- ") || line.startsWith("* ")) {
        renderedElements.push(
          <div key={i} className="flex gap-2 items-start pl-2 my-1">
            <span className="text-[#005BAC] mt-1 shrink-0">•</span>
            <span className="text-slate-750 font-medium leading-relaxed">{line.slice(2)}</span>
          </div>
        );
      }
      // Empty line
      else if (line === "") {
        renderedElements.push(<div key={i} className="h-1.5"></div>);
      }
      // Standard line with bold tags
      else {
        const parts = line.split("**");
        const renderedLine = parts.map((part, pIdx) => {
          if (pIdx % 2 === 1) {
            return <strong key={pIdx} className="font-bold text-slate-900">{part}</strong>;
          }
          return part;
        });
        renderedElements.push(<p key={i} className="text-slate-750 leading-relaxed font-semibold my-1">{renderedLine}</p>);
      }
    }

    if (inTable && tableHeaders.length > 0) {
      const headers = tableHeaders;
      const rows = tableRows;
      renderedElements.push(
        <div key={`table-trail`} className="overflow-x-auto my-3 border border-slate-200/80 rounded-xl shadow-sm bg-white">
          <table className="min-w-full text-[11px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 border-r last:border-r-0 border-slate-200">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-600">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/50 bg-white transition-colors">
                  {row.map((cell, cIdx) => (
                    <td key={cIdx} className="px-3 py-2 border-r last:border-r-0 border-slate-200">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    return <div className="space-y-1">{renderedElements}</div>;
  };

  const fetchUserProfile = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) {
        setProfile({ name: "Chưa đăng nhập", role: "...", avatar: "HR" });
        setAvatarImage(null);
        return;
      }

      const user = session.user;
      const email = user.email || "";

      // 1. Try searching in employees first (regular employee profiles)
      const { data: empData } = await supabase
        .from("employees_directory")
        .select("name, role, department")
        .like("email", `%${email}%`)
        .maybeSingle();

      // 2. Check allowed_users for Admin
      const { data: allowedData } = await supabase
        .from("allowed_users")
        .select("role")
        .ilike("email", email)
        .maybeSingle();

      const isAdmin = allowedData?.role === "Admin";
      const displayName = empData?.name || user.user_metadata?.full_name || user.user_metadata?.name || "Người dùng";
      const userRole = empData?.role || (isAdmin ? "Admin" : "Nhân viên");

      const initials = displayName
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);

      setProfile({
        name: displayName,
        role: userRole,
        avatar: initials
      });

      fetchAvatar(email).then(setAvatarImage);

      setCurrentUser({
        email,
        name: displayName,
        role: userRole,
        department: empData?.department || "Chưa xếp phòng",
        isAdmin
      });
    } catch (err) {
      console.error("Error fetching user header profile:", err);
    }
  };

  const fetchNotifications = async (userObj: any) => {
    if (!userObj) return;
    try {
      // 1. Fetch tasks pending approval (leaves & business trips)
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select("*")
        .eq("status", "pending_approval")
        .order("created_at", { ascending: false });

      if (tasksError) throw tasksError;

      // 2. Fetch justifications pending approval (Chờ duyệt or Chưa duyệt)
      let justificationsData: any[] = [];
      try {
        const { data, error } = await supabase
          .from("attendance_justifications")
          .select("*")
          .in("status", ["Chờ duyệt", "Chưa duyệt"]);
        if (!error && data) {
          justificationsData = data;
        }
      } catch (err) {
        console.warn("Could not fetch justifications for header:", err);
      }

      // 3. Fetch resource bookings (đăng ký xe / phòng họp) pending approval
      let bookingsData: any[] = [];
      try {
        const { data, error } = await supabase
          .from("resource_bookings")
          .select("*")
          .in("status", ["pending_manager", "pending_hcns"]);
        if (!error && data) {
          bookingsData = data;
        }
      } catch (err) {
        console.warn("Could not fetch resource bookings for header:", err);
      }

      // 4. Fetch phiếu chi phúc lợi (hiếu hỷ & biến cố) đang chờ duyệt
      let benefitClaimsData: any[] = [];
      try {
        const { data, error } = await supabase
          .from("benefit_claims")
          .select("*")
          .eq("status", "Chờ phê duyệt");
        if (!error && data) {
          benefitClaimsData = data;
        }
      } catch (err) {
        console.warn("Could not fetch benefit claims for header:", err);
      }

      // 5. Phiếu yêu cầu cấp phát VPP đang chờ — task tiêu đề "Cấp phát VPP cho ..."
      // do trang Hành chính tạo. Khác các loại trên ở chỗ trạng thái là tiếng Việt
      // "Chờ duyệt" chứ không phải "pending_approval".
      let vppTasksData: any[] = [];
      try {
        const { data, error } = await supabase
          .from("tasks")
          .select("*")
          .eq("status", "Chờ duyệt")
          .like("title", "Cấp phát VPP%");
        if (!error && data) {
          vppTasksData = data;
        }
      } catch (err) {
        console.warn("Could not fetch VPP requests for header:", err);
      }

      // 6. GHI CHÚ LỊCH ĐẾN NGÀY — nhắc chính chủ, đúng ngày đã ghi trên lịch.
      // KHÁC HẲN 5 mục trên: đây không phải việc chờ duyệt, nên phải tính TRƯỚC
      // hàng rào hasApprovalPrivileges bên dưới và đi kèm ở cả hai nhánh — nếu
      // để lẫn vào sau, nhân viên thường sẽ bị `return` sớm và không bao giờ
      // thấy ghi chú của chính mình.
      // Ngày lấy theo giờ Việt Nam ("en-CA" cho ra sẵn dạng YYYY-MM-DD): máy
      // người dùng đặt lệch múi giờ thì nhắc sai ngày.
      let mappedNotes: any[] = [];
      try {
        const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
        // RLS của calendar_notes vốn đã chỉ trả dòng của chính mình; lọc thêm
        // owner_email chỉ để truy vấn nhẹ đi, không phải để chặn.
        const { data, error } = await supabase
          .from("calendar_notes")
          .select("id, note_date, content")
          .eq("owner_email", (userObj.email || "").toLowerCase())
          .eq("note_date", todayKey);
        if (!error && data) {
          mappedNotes = data.map((n: any) => ({
            id: `note-${n.id}`,
            type: "note",
            typeText: "Ghi chú hôm nay",
            message: n.content,
            time: new Date(n.note_date).toLocaleDateString("vi-VN"),
            // Mốc 00:00 của chính ngày đó: ghi chú hôm nay luôn nổi lên trên
            // những phiếu chờ duyệt tồn từ hôm trước.
            timestamp: new Date(`${n.note_date}T00:00:00`).getTime(),
          }));
        }
      } catch (err) {
        console.warn("Could not fetch calendar notes for header:", err);
      }

      // Danh bạ tên -> phòng ban. Cần để biết đơn nghỉ phép/công tác này thuộc
      // phòng nào: `tasks` chỉ lưu TÊN người làm đơn. Từ 07/08/2026 cấp quản lý
      // chỉ duyệt được đơn CÙNG ĐƠN VỊ, nên thiếu bảng tra này thì chuông báo sẽ
      // hiện cả đơn của phòng khác mà bấm vào lại không duyệt được.
      const deptOfName = new Map<string, string>();
      try {
        const { data } = await supabase
          .from("employees_directory")
          .select("name, department");
        (data || []).forEach((e: any) => {
          if (e?.name) deptOfName.set(normalizeName(e.name), e.department || "");
        });
      } catch (err) {
        console.warn("Could not fetch employee departments for header:", err);
      }

      const isUserAdmin = userObj.isAdmin || (userObj.role || "").toLowerCase() === "admin";
      // Dùng chung isManagerRole() của lib/approvers.ts — trước đây Header giữ
      // một bản chép riêng và nó thiếu "Kế toán trưởng"/"Chỉ huy trưởng", nên
      // Kế toán trưởng không nhận được thông báo đăng ký xe của phòng mình
      // trong khi trang /dang-ky (dùng hàm chuẩn) lại hiểu đúng.
      // isManagerRole đã bao gồm cả cấp phó (phó phòng / chỉ huy phó / leader).
      const isUserManager = isManagerRole(userObj.role);

      // HR by role only — per-person grants now live in the approval_permissions table
      const isUserHR = (userObj.role || "").toLowerCase().includes("nhân sự") ||
                       (userObj.role || "").toLowerCase().includes("nhan su");

      // Per-user approval grants from approval_permissions table
      const perms = await fetchApprovalPermissions(userObj.email);

      // canApproveBenefit và canManageVpp tính riêng: hai cờ này KHÔNG nằm trong
      // hasAnyApprovalPermission() (chúng không mở menu "Duyệt yêu cầu" ở Cài đặt vì
      // duyệt phúc lợi nằm ở trang C&B, còn cấp phát VPP nằm ở trang Hành chính),
      // nhưng người chỉ có mỗi một trong hai cờ đó vẫn phải nhận được thông báo.
      const hasApprovalPrivileges = isUserAdmin || isUserManager || isUserHR || hasAnyApprovalPermission(perms) || perms.canApproveBenefit || perms.canManageVpp || isMarketingTeamLeader(userObj.name);
      if (!hasApprovalPrivileges) {
        // Không có quyền duyệt gì cả thì chuông vẫn phải kêu cho ghi chú của
        // chính họ — đó là toàn bộ nội dung chuông của một nhân viên thường.
        setNotifications(mappedNotes);
        return;
      }

      // Filter tasks notifications — Nghỉ phép/Công tác giờ theo luồng 2 cấp (Trưởng phòng/Tổ
      // trưởng xác nhận -> HCNS duyệt cuối), dùng chung logic với settings/page.tsx và
      // calendar/page.tsx (lib/approvers.ts) để tránh 3 nơi có quy tắc lệch nhau.
      const filteredTasks = (tasksData || []).filter(t => {
        const titleLower = t.title.toLowerCase();
        const isLeave = titleLower.startsWith("nghỉ phép") || titleLower.includes("nghi phep");
        const isTrip = titleLower.startsWith("công tác") || titleLower.includes("cong tac");
        if (!isLeave && !isTrip) return false;

        const stage = getRequestStage(t);
        if (stage === "manager") {
          return isLeaveTripCap1Approver({
            currentUserName: userObj.name,
            currentUserRole: userObj.role,
            currentUserIsAdmin: isUserAdmin,
            currentUserIsDirector: isDirectorRole(userObj.role),
            currentUserDepartment: userObj.department,
            assigneeName: t.assignee,
            assigneeDepartment: deptOfName.get(normalizeName(t.assignee || "")) || "",
            taskNotes: t.notes,
            taskTitleLower: titleLower,
          });
        }
        // isUserHR giữ đúng hành vi cũ (HR luôn thấy đơn công tác/nghỉ phép chờ HCNS duyệt cuối)
        return isUserHR || isLeaveTripCap2Approver({ currentUserIsAdmin: isUserAdmin, approvalPerms: perms, isTrip });
      });

      // Filter justifications notifications (Admin, HR, Director, or the specifically designated approver, or department managers/deputies)
      const isDirector = (userObj.role || "").toLowerCase().includes("giám đốc") ||
                         (userObj.role || "").toLowerCase().includes("giam doc");

      const filteredJustifications = justificationsData.filter(e => {
        if (isUserAdmin || isUserHR || isDirector || perms.canApproveJustification) return true;
        if (userObj && e.approver === userObj.name) return true;
        
        // Department manager or deputy manager of the same department
        const isManagerOfSameDept = isUserManager && userObj && userObj.department === e.department;
        if (isManagerOfSameDept) return true;

        return false;
      });

      // Map tasks to notification format
      const mappedTasks = filteredTasks.map(t => {
        const titleLower = t.title.toLowerCase();
        const isLeave = titleLower.startsWith("nghỉ phép") || titleLower.includes("nghi phep");
        let typeText = isLeave ? "Đơn nghỉ phép" : "Yêu cầu công tác";
        let messageText = "";

        if (isLeave) {
          let reason = "Xin nghỉ phép";
          if (t.notes) {
            const reasonMatch = t.notes.match(/Lý do:\s*(.*)/i);
            if (reasonMatch) reason = reasonMatch[1].trim();
          }
          messageText = `${t.assignee} xin nghỉ phép (${t.title.replace(/^Nghỉ phép:\s*/i, "")}). Lý do: ${reason}`;
        } else {
          let dest = "Chưa xác định";
          if (t.notes) {
            const destMatch = t.notes.match(/-\s+\*\*Điểm công tác chính\*\*:\s*(.*)/i);
            if (destMatch) dest = destMatch[1].trim();
          }
          messageText = `${t.assignee} xin đi công tác tại ${dest}`;
        }

        if (getRequestStage(t) === "hcns") {
          messageText += " (đã qua Trưởng phòng/Tổ trưởng, chờ HCNS duyệt cuối)";
        }

        return {
          id: t.id,
          type: isLeave ? "leave" : "trip",
          typeText,
          message: messageText,
          time: t.created_at ? new Date(t.created_at).toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit' }) + " " + new Date(t.created_at).toLocaleDateString("vi-VN") : "",
          timestamp: t.created_at ? new Date(t.created_at).getTime() : 0
        };
      });

      // Map justifications to notification format
      const mappedJustifications = filteredJustifications.map(e => {
        return {
          id: e.id,
          type: "justification",
          typeText: "Giải trình công",
          message: `${e.name} xin giải trình công ngày ${new Date(e.date).toLocaleDateString("vi-VN")}: ${e.reason} (${e.propose})`,
          time: e.created_at ? new Date(e.created_at).toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit' }) + " " + new Date(e.created_at).toLocaleDateString("vi-VN") : "",
          timestamp: e.created_at ? new Date(e.created_at).getTime() : 0
        };
      });

      // Filter booking notifications:
      // - pending_manager: Trưởng/Phó phòng cùng phòng ban người đăng ký (hoặc Admin)
      // - pending_hcns: người có quyền can_approve_booking (HCNS điều phối) hoặc Admin
      const filteredBookings = bookingsData.filter(b => {
        if (b.status === "pending_manager") {
          if (isUserAdmin) return true;
          // Tổ Marketing (thuộc HCNS): thông báo cấp 1 chỉ đến Tổ trưởng Marketing
          if (isMarketingTeamMember(b.requester_name)) {
            return isMarketingTeamLeader(userObj.name);
          }
          return isUserManager && userObj.department === b.department;
        }
        if (b.status === "pending_hcns") {
          return isUserAdmin || perms.canApproveBooking;
        }
        return false;
      });

      // Map bookings to notification format
      const mappedBookings = filteredBookings.map(b => {
        const isVehicleBooking = b.booking_type === "xe";
        const timeStr = b.start_time
          ? new Date(b.start_time).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
          : "";
        return {
          id: b.id,
          type: "booking",
          bookingType: isVehicleBooking ? "xe" : "phong_hop",
          typeText: isVehicleBooking ? "Đăng ký xe" : "Đăng ký phòng họp",
          message: `${b.requester_name} đăng ký ${isVehicleBooking ? "xe" : ""} ${b.resource_name} lúc ${timeStr}${b.status === "pending_hcns" ? " (đã qua Trưởng phòng, chờ HCNS duyệt cuối)" : ""}`,
          time: b.created_at ? new Date(b.created_at).toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit' }) + " " + new Date(b.created_at).toLocaleDateString("vi-VN") : "",
          timestamp: b.created_at ? new Date(b.created_at).getTime() : 0
        };
      });

      // Phiếu chi phúc lợi chờ duyệt: chỉ báo cho người có cờ can_approve_benefit
      // (hoặc Admin) — đúng đối tượng bấm được nút Duyệt bên trang C&B.
      const mappedBenefitClaims = (isUserAdmin || perms.canApproveBenefit)
        ? benefitClaimsData.map(c => {
            const amountStr = c.amount != null && !isNaN(Number(c.amount))
              ? `${Number(c.amount).toLocaleString("vi-VN")}đ`
              : (c.amount || "");
            return {
              id: c.id,
              type: "benefit",
              typeText: "Chi phúc lợi",
              message: `${c.name} đề nghị trợ cấp ${c.category}${amountStr ? ` — ${amountStr}` : ""}`,
              time: c.created_at ? new Date(c.created_at).toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit' }) + " " + new Date(c.created_at).toLocaleDateString("vi-VN") : "",
              timestamp: c.created_at ? new Date(c.created_at).getTime() : 0
            };
          })
        : [];

      // Phiếu VPP chờ cấp phát: chỉ báo cho người PHỤ TRÁCH VPP (cờ can_manage_vpp)
      // hoặc Admin — đúng người bấm được nút Duyệt & Cấp phát bên trang Hành chính.
      const mappedVppRequests = (isUserAdmin || perms.canManageVpp)
        ? vppTasksData
            .map((t) => {
              let targetName = t.assignee || "";
              let target = "phongban";
              // Phiếu kiểu cũ không có mảng items thì coi như một món
              let pending = 1;
              try {
                const notesObj = JSON.parse(t.notes || "{}");
                if (notesObj.targetName) targetName = notesObj.targetName;
                if (notesObj.target) target = notesObj.target;
                if (Array.isArray(notesObj.items)) {
                  pending = notesObj.items.filter(
                    (it: any) => (it.status || "Chờ duyệt") !== "Đã cấp phát"
                  ).length;
                }
              } catch (err) {
                // Ghi chú hỏng thì vẫn báo, còn hơn nuốt mất phiếu
              }
              return { t, targetName, target, pending };
            })
            // Phiếu đã cấp hết món nhưng trạng thái chưa kịp đổi thì thôi, khỏi báo
            .filter((x) => x.pending > 0)
            .map(({ t, targetName, target, pending }) => ({
              id: t.id,
              type: "vpp",
              vppTarget: target,
              typeText: "Yêu cầu VPP",
              message: `${targetName} đề nghị cấp ${pending} loại văn phòng phẩm`,
              time: t.created_at ? new Date(t.created_at).toLocaleTimeString("vi-VN", { hour: '2-digit', minute: '2-digit' }) + " " + new Date(t.created_at).toLocaleDateString("vi-VN") : "",
              timestamp: t.created_at ? new Date(t.created_at).getTime() : 0
            }))
        : [];

      // Combine and sort by timestamp descending
      const allNotifications = [...mappedTasks, ...mappedJustifications, ...mappedBookings, ...mappedBenefitClaims, ...mappedVppRequests, ...mappedNotes].sort((a, b) => b.timestamp - a.timestamp);
      setNotifications(allNotifications);
    } catch (err) {
      console.error("Error fetching notifications for header:", err);
    }
  };

  const handleLogout = async () => {
    setShowProfileDropdown(false);
    await supabase.auth.signOut();
  };

  useEffect(() => {
    fetchUserProfile();

    // Listen for auth changes to update header
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchUserProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Trang Cài đặt phát sự kiện này sau khi lưu/gỡ ảnh — cập nhật ngay, không
  // phải tải lại trang (Header và trang Cài đặt là hai component tách rời).
  useEffect(() => {
    const onAvatarUpdated = (e: Event) => {
      const detail = (e as CustomEvent<AvatarUpdatedDetail>).detail;
      if (!detail) return;
      setAvatarImage(detail.imageData);
    };
    window.addEventListener(AVATAR_UPDATED_EVENT, onAvatarUpdated);
    return () => window.removeEventListener(AVATAR_UPDATED_EVENT, onAvatarUpdated);
  }, []);

  useEffect(() => {
    if (currentUser) {
      fetchNotifications(currentUser);

      const channel = supabase
        .channel("realtime_header_notifications")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "tasks" },
          () => {
            fetchNotifications(currentUser);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "attendance_justifications" },
          () => {
            fetchNotifications(currentUser);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "resource_bookings" },
          () => {
            fetchNotifications(currentUser);
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "benefit_claims" },
          () => {
            fetchNotifications(currentUser);
          }
        )
        // Ghi chú lịch: để vừa lưu ghi chú cho hôm nay là chuông kêu ngay,
        // không phải tải lại trang.
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "calendar_notes" },
          () => {
            fetchNotifications(currentUser);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [currentUser]);

  return (
    <header className="glass sticky top-0 z-30 flex items-center justify-between px-4 sm:px-8 py-4 gap-4">
      {/* Mobile Toggle Button & Page Title */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={toggleSidebar}
          className="p-2 -ml-2 hover:bg-slate-100 rounded-xl text-slate-500 lg:hidden transition-all shrink-0 active:scale-95"
          title="Mở menu"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="font-heading font-extrabold text-slate-800 text-base sm:text-lg tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-slate-400 text-[10px] sm:text-xs mt-0.5 truncate hidden sm:block">{subtitle}</p>}
        </div>
      </div>

      {/* Search Bar & Actions */}
      <div className="flex items-center gap-3 sm:gap-6 shrink-0">
        {/* Notion-like Search Bar — Tìm kiếm AI thuộc gói Enterprise */}
        {aiSearchAllowed && (
        <div
          onClick={() => setShowSearchModal(true)}
          className="relative w-48 lg:w-64 hidden md:block cursor-pointer"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            readOnly
            placeholder="Tìm kiếm mọi thứ (Ctrl+K)..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-100/50 hover:bg-slate-100 focus:bg-white text-xs text-slate-700 placeholder:text-slate-400 border border-slate-200/60 rounded-xl outline-none transition-all shadow-inner cursor-pointer"
          />
        </div>
        )}

        {/* Global Notifications & Tools */}
        <div className="flex items-center gap-1 sm:gap-2 relative">
          {/* Company Site Link */}
          <button className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all" title="Cổng thông tin Công ty">
            <Globe size={16} />
          </button>

          {/* Notifications Bell */}
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="relative p-2 hover:bg-slate-100 rounded-xl text-slate-400 hover:text-slate-600 transition-all cursor-pointer" 
            title="Thông báo"
          >
            <Bell size={16} />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 bg-rose-500 text-white font-extrabold text-[8px] min-w-[14px] h-[14px] px-1 rounded-full flex items-center justify-center animate-pulse border border-white">
                {notifications.length}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {showDropdown && (
            <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl border border-slate-200/60 shadow-premium z-50 overflow-hidden text-xs text-slate-700 animate-in fade-in-50 slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-150/60">
                <span className="font-heading font-extrabold text-slate-800">Thông báo mới ({notifications.length})</span>
                <button 
                  onClick={() => setShowDropdown(false)}
                  className="text-slate-450 hover:text-slate-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 italic">
                    Không có thông báo phê duyệt mới.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <a
                      key={notif.id}
                      href={
                        notif.type === "note"
                          // Ghi chú cá nhân: mở thẳng trang Lịch công việc
                          ? "/calendar"
                          : notif.type === "justification"
                          ? "/settings?tab=approvals&subtab=explanation"
                          : notif.type === "vpp"
                          // Mở thẳng tab VPP, đúng mục phòng ban hay dự án của phiếu
                          ? `/administration?tab=vpp&subtab=${notif.vppTarget === "duan" ? "duan" : "phongban"}`
                          : notif.type === "booking"
                          // Mở thẳng lịch đăng ký xe/phòng họp + bật popup chi tiết của đúng đăng ký này
                          ? `/dang-ky?tab=${notif.bookingType || "phong_hop"}&bookingId=${notif.id}`
                          : notif.type === "benefit"
                          // Mở thẳng tab Phúc lợi > Hiếu hỷ & Trợ cấp bên trang C&B
                          ? "/cb?subtab=funeral_wedding"
                          : notif.type === "leave"
                          ? "/settings?tab=approvals&subtab=leave"
                          : notif.type === "trip"
                          ? "/settings?tab=approvals&subtab=trip"
                          : "/settings?tab=approvals"
                      }
                      onClick={() => setShowDropdown(false)}
                      className="block p-4 hover:bg-slate-50/80 transition-colors space-y-1 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          notif.type === "leave"
                            ? "bg-emerald-50 text-emerald-700"
                            : notif.type === "trip"
                            ? "bg-indigo-50 text-indigo-700"
                            : notif.type === "booking"
                            ? "bg-sky-50 text-sky-700"
                            : notif.type === "benefit"
                            ? "bg-rose-50 text-rose-700"
                            : notif.type === "vpp"
                            ? "bg-violet-50 text-violet-700"
                            : notif.type === "note"
                            // Vàng hổ phách, trùng màu thẻ ghi chú trên lịch
                            ? "bg-amber-100 text-amber-800"
                            : "bg-amber-50 text-amber-700"
                        }`}>
                          {notif.typeText}
                        </span>
                        <span className="text-[9px] text-slate-450 font-normal">{notif.time}</span>
                      </div>
                      <p className="font-semibold text-slate-700 leading-snug">{notif.message}</p>
                    </a>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Info (Material 3 Profile Button) */}
        <div className="relative">
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-1.5 sm:gap-2.5 pl-2 sm:pl-4 border-l border-slate-200/80 cursor-pointer hover:bg-slate-100/60 rounded-xl py-1 pr-1.5 transition-all"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold text-white text-xs shadow-sm uppercase shrink-0 overflow-hidden">
              {avatarImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarImage} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                profile.avatar
              )}
            </div>
            <div className="hidden md:flex flex-col text-left max-w-[150px]">
              <span className="text-xs font-bold text-slate-800 leading-none truncate" title={profile.name}>
                {profile.name}
              </span>
              <span className="text-[10px] text-slate-400 font-semibold mt-0.5 truncate" title={profile.role}>
                {profile.role}
              </span>
            </div>
            <ChevronDown size={12} className={`text-slate-400 shrink-0 transition-transform ${showProfileDropdown ? "rotate-180" : ""}`} />
          </button>

          {/* Profile Dropdown */}
          {showProfileDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowProfileDropdown(false)} />
              <div className="absolute right-0 top-12 w-56 bg-white rounded-2xl border border-slate-200/60 shadow-premium z-50 overflow-hidden text-xs text-slate-700 animate-in fade-in-50 slide-in-from-top-1 duration-150">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-150/60">
                  <p className="font-heading font-extrabold text-slate-800 truncate" title={profile.name}>{profile.name}</p>
                  <p className="text-[10px] text-slate-400 font-semibold truncate" title={currentUser?.email}>{currentUser?.email}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-3 text-rose-600 hover:bg-rose-50 font-bold transition-colors cursor-pointer bg-transparent border-none text-left"
                >
                  <LogOut size={14} />
                  Đăng xuất
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* AI Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[75vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-150 text-left">
            {/* Modal Header / Title Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-150/60 bg-slate-50/70">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
                <Sparkles size={15} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-heading font-extrabold text-slate-800 text-xs leading-tight truncate">Trợ lý Tìm kiếm AI</h4>
                <p className="text-[10px] text-slate-400 font-semibold truncate">Tra cứu thông minh dữ liệu nội bộ {tenant.company_name}</p>
              </div>
              <div className="text-[10px] text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-lg shadow-sm font-mono select-none hidden sm:block">
                ESC
              </div>
              <button
                onClick={() => {
                  setShowSearchModal(false);
                  setAiHistory([]);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all cursor-pointer bg-transparent border-none"
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar-table bg-slate-50/20 max-h-[50vh]">
              {aiHistory.length === 0 ? (
                // Welcome / Suggestions view
                <div className="space-y-4 py-3">
                  <div className="flex items-center gap-2 text-[#005BAC]">
                    <Sparkles size={16} className="animate-pulse" />
                    <h5 className="font-heading font-extrabold text-xs uppercase tracking-wider text-slate-700">Gợi ý câu hỏi thông minh</h5>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      { text: "Có bao nhiêu nhân sự ở phòng Hành chính nhân sự?", desc: "Liệt kê chi tiết thông tin các nhân sự thuộc phòng HCNS" },
                      { text: "Liệt kê các ứng viên đang phỏng vấn và trạng thái tuyển dụng?", desc: "Quét danh sách ứng viên tuyển dụng trên hệ thống" },
                      { text: "Tổng chi phí hành chính khối văn phòng tháng này là bao nhiêu?", desc: "Tổng hợp số liệu chi phí hành chính theo tháng" },
                      { text: "Có ai nộp giải trình chấm công trong tháng này không?", desc: "Quét dữ liệu giải trình công chờ duyệt trên hệ thống" }
                    ].map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAiSearch(prompt.text)}
                        className="flex flex-col text-left p-3.5 bg-white border border-slate-200 rounded-xl hover:border-[#005BAC] hover:shadow-md transition-all shadow-sm hover:scale-[1.01] cursor-pointer"
                      >
                        <span className="text-xs font-bold text-slate-800 leading-tight mb-1">{prompt.text}</span>
                        <span className="text-[10px] text-slate-400 font-medium">{prompt.desc}</span>
                      </button>
                    ))}
                  </div>
                  <div className="pt-2 space-y-1.5">
                    <div className="text-[10px] text-slate-400 font-semibold italic flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div>
                      Dữ liệu được truy vấn real-time theo đúng quyền hạn tài khoản, chỉ lưu hành nội bộ {tenant.company_name}.
                    </div>
                    <div className="text-[10px] text-rose-500/90 font-bold flex items-center gap-1.5">
                      🔒 Lương CBNV &amp; Hợp đồng lao động được bảo mật tuyệt đối — AI không truy xuất các thông tin này.
                    </div>
                  </div>
                </div>
              ) : (
                // Chat history view
                <div className="space-y-4">
                  {aiHistory.map((msg, index) => (
                    <div 
                      key={index}
                      className={`flex gap-3 items-start ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white text-[10px] shadow-sm uppercase shrink-0 mt-0.5">
                          AI
                        </div>
                      )}
                      <div className={`rounded-2xl p-4 text-xs max-w-[85%] shadow-sm border ${
                        msg.role === "user" 
                          ? "bg-blue-600 border-blue-600 text-white font-semibold rounded-tr-none text-left" 
                          : "bg-white border-slate-200/80 text-slate-700 font-medium rounded-tl-none whitespace-pre-wrap leading-relaxed text-left"
                      }`}>
                        {msg.role === "user" ? (
                          msg.content
                        ) : (
                          <div className="space-y-2">
                            {/* Format Markdown Tables & Bullet Points */}
                            <div className="prose prose-xs max-w-none text-slate-705">
                              {renderMarkdownAnswer(msg.content)}
                            </div>
                            <div className="flex justify-end pt-2 border-t border-slate-100 mt-2">
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content);
                                  alert("Đã sao chép câu trả lời vào clipboard!");
                                }}
                                className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 cursor-pointer bg-transparent border-none"
                              >
                                <Copy size={11} /> Sao chép
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="w-7 h-7 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-[10px] shadow-sm uppercase shrink-0 mt-0.5">
                          ME
                        </div>
                      )}
                    </div>
                  ))}

                  {isAiLoading && (
                    <div className="flex gap-3 items-start justify-start">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white text-[10px] shadow-sm uppercase shrink-0 mt-0.5 animate-pulse">
                        AI
                      </div>
                      <div className="bg-white border border-slate-200/80 rounded-2xl rounded-tl-none p-4 text-xs text-slate-400 shadow-sm flex items-center gap-2 font-medium">
                        <Loader2 className="animate-spin text-blue-600" size={13} />
                        Trợ lý AI đang truy vấn cơ sở dữ liệu và soạn thảo câu trả lời...
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer / Input Bar (ChatGPT-style, đặt dưới cùng) */}
            <div className="border-t border-slate-150/60 bg-slate-50/70 px-4 pt-3 pb-2.5 space-y-2">
              {/* Input row */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm focus-within:border-blue-500 transition-colors">
                <Search size={16} className="text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Hỏi AI về nhân sự, tuyển dụng, công việc, chi phí, văn thư..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAiSearch();
                    }
                  }}
                  autoFocus
                  disabled={isAiLoading}
                  className="flex-1 bg-transparent border-none outline-none text-xs text-slate-800 placeholder:text-slate-400 font-semibold disabled:opacity-50"
                />
                <button
                  onClick={() => handleAiSearch()}
                  disabled={isAiLoading || !searchQuery.trim()}
                  className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600 transition-all shrink-0 cursor-pointer"
                  title="Gửi câu hỏi"
                >
                  {isAiLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                </button>
              </div>

              {/* Meta row */}
              <div className="flex items-center justify-between px-0.5">
                {aiHistory.length > 0 ? (
                  <button
                    onClick={() => setAiHistory([])}
                    className="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] text-rose-500 hover:bg-rose-50 font-bold rounded-lg border border-transparent hover:border-rose-100 transition-all cursor-pointer bg-transparent"
                  >
                    <Trash2 size={12} /> Làm sạch lịch sử chat
                  </button>
                ) : (
                  <span className="text-[9px] text-slate-400 font-semibold">Nhấn Enter để gửi câu hỏi</span>
                )}
                <div className="text-[9px] text-slate-400 font-bold flex items-center gap-1">
                  <Sparkles size={10} className="text-blue-500" /> Mô hình <span className="text-slate-600">gpt-4o</span> · bảo mật cao
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

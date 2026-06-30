"use client";

import { useEffect, useState } from "react";
import { Bell, Search, Globe, ChevronDown, Menu, X, Sparkles, Loader2, Send, Copy, FileText, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSidebar } from "./SidebarContext";

interface Props {
  title: string;
  subtitle?: string;
}

export default function Header({ title, subtitle }: Props) {
  const [profile, setProfile] = useState<{ name: string; role: string; avatar: string }>({
    name: "Đang tải...",
    role: "...",
    avatar: "HR"
  });
  
  const [currentUser, setCurrentUser] = useState<{
    email: string;
    name: string;
    role: string;
    department: string;
    isAdmin: boolean;
  } | null>(null);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

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
        setShowSearchModal(true);
      }
      if (e.key === "Escape") {
        setShowSearchModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
      const localKey = typeof window !== "undefined" ? (localStorage.getItem("openai_api_key_hanh_chinh") || localStorage.getItem("openai_api_key")) : null;
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (localKey) {
        headers["Authorization"] = `Bearer ${localKey}`;
      }

      const response = await fetch("/api/ai-search", {
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
        return;
      }

      const user = session.user;
      const email = user.email || "";

      // 1. Try searching in employees first (regular employee profiles)
      const { data: empData } = await supabase
        .from("employees")
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

      const isUserAdmin = userObj.isAdmin || (userObj.role || "").toLowerCase() === "admin";
      const isUserManager = (userObj.role || "").toLowerCase().includes("trưởng phòng") || 
                            (userObj.role || "").toLowerCase().includes("truong phong") ||
                            (userObj.role || "").toLowerCase().includes("giám đốc") ||
                            (userObj.role || "").toLowerCase().includes("giam doc") ||
                            (userObj.role || "").toLowerCase().includes("quản lý") ||
                            (userObj.role || "").toLowerCase().includes("quan ly") ||
                            (userObj.role || "").toLowerCase().includes("quyền trưởng phòng") ||
                            (userObj.role || "").toLowerCase().includes("quyen truong phong") ||
                            (userObj.role || "").toLowerCase().startsWith("tp.") ||
                            (userObj.role || "").toLowerCase().startsWith("tp ");

      const isUserDeputy = (userObj.role || "").toLowerCase().includes("phó phòng") || 
                           (userObj.role || "").toLowerCase().includes("pho phong") ||
                           (userObj.role || "").toLowerCase().includes("phó trưởng phòng") || 
                           (userObj.role || "").toLowerCase().includes("pho truong phong") ||
                           (userObj.role || "").toLowerCase().includes("leader");

      const isUserHR = userObj.name === "Lại Nguyễn Lan Phương" || 
                       userObj.name === "Dương Nhật Hoành Anh" ||
                       (userObj.role || "").toLowerCase().includes("nhân sự") ||
                       (userObj.role || "").toLowerCase().includes("nhan su");

      const hasApprovalPrivileges = isUserAdmin || isUserManager || isUserDeputy || isUserHR;
      if (!hasApprovalPrivileges) {
        setNotifications([]);
        return;
      }

      // Filter tasks notifications
      const filteredTasks = (tasksData || []).filter(t => {
        const titleLower = t.title.toLowerCase();
        const isLeave = titleLower.startsWith("nghỉ phép") || titleLower.includes("nghi phep");
        const isTrip = titleLower.startsWith("công tác") || titleLower.includes("cong tac");

        if (isLeave) {
          if (t.notes && t.notes.includes(`Người duyệt: ${userObj.name}`)) return true;

          const assigneeLower = t.assignee.toLowerCase();
          const currentUserNameLower = userObj.name.toLowerCase();

          const isQuynh = currentUserNameLower.includes("quỳnh") || currentUserNameLower.includes("quynh");
          const isHang = assigneeLower.includes("hằng") || assigneeLower.includes("hang");
          const isOneDay = titleLower.includes("1 ngày") || titleLower.includes("1 ngay");
          if (isQuynh && isHang && isOneDay) return true;

          const isHoanhAnh = currentUserNameLower.includes("hoành anh") || currentUserNameLower.includes("hoanh anh");
          const isQuyen = assigneeLower.includes("quyên") || assigneeLower.includes("quuyên") || assigneeLower.includes("quyen");
          if (isHoanhAnh && isQuyen && isOneDay) return true;

          if (isUserAdmin || isUserManager || isUserHR) return true;
        }

        if (isTrip) {
          if (isUserAdmin || isUserManager || isUserHR) return true;
        }

        return false;
      });

      // Filter justifications notifications (Admin, HR, Director, or the specifically designated approver, or department managers/deputies)
      const isDirector = (userObj.role || "").toLowerCase().includes("giám đốc") ||
                         (userObj.role || "").toLowerCase().includes("giam doc");

      const filteredJustifications = justificationsData.filter(e => {
        if (isUserAdmin || isUserHR || isDirector) return true;
        if (userObj && e.approver === userObj.name) return true;
        
        // Department manager or deputy manager of the same department
        const isManagerOfSameDept = (isUserManager || isUserDeputy) && userObj && userObj.department === e.department;
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

      // Combine and sort by timestamp descending
      const allNotifications = [...mappedTasks, ...mappedJustifications].sort((a, b) => b.timestamp - a.timestamp);
      setNotifications(allNotifications);
    } catch (err) {
      console.error("Error fetching notifications for header:", err);
    }
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
        {/* Notion-like Search Bar */}
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
                      href={notif.type === "justification" ? "/settings?tab=approvals&subtab=explanation" : "/settings?tab=approvals"}
                      onClick={() => setShowDropdown(false)}
                      className="block p-4 hover:bg-slate-50/80 transition-colors space-y-1 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                          notif.type === "leave" 
                            ? "bg-emerald-50 text-emerald-700" 
                            : notif.type === "trip"
                            ? "bg-indigo-50 text-indigo-700"
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
        <div className="flex items-center gap-1.5 sm:gap-2.5 pl-2 sm:pl-4 border-l border-slate-200/80">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center font-bold text-white text-xs shadow-sm uppercase shrink-0">
            {profile.avatar}
          </div>
          <div className="hidden md:flex flex-col text-left max-w-[150px]">
            <span className="text-xs font-bold text-slate-800 leading-none truncate" title={profile.name}>
              {profile.name}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold mt-0.5 truncate" title={profile.role}>
              {profile.role}
            </span>
          </div>
          <ChevronDown size={12} className="text-slate-400 shrink-0" />
        </div>
      </div>

      {/* AI Search Modal */}
      {showSearchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center pt-[10vh] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[75vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-150 text-left">
            {/* Modal Header / Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-150/60 bg-slate-50/70">
              <Search size={18} className="text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Hỏi AI mọi thứ về nhân sự, hợp đồng, giải trình, chi phí..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleAiSearch();
                  }
                }}
                autoFocus
                className="flex-1 bg-transparent border-none outline-none text-xs text-slate-800 placeholder:text-slate-400 font-semibold"
              />
              <button 
                onClick={() => handleAiSearch()}
                disabled={isAiLoading || !searchQuery.trim()}
                className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600 transition-all shrink-0 cursor-pointer"
                title="Gửi câu hỏi"
              >
                <Send size={12} />
              </button>
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
                      { text: "Hợp đồng của nhân sự nào sắp hết hạn?", desc: "Tìm các hợp đồng lao động sắp đến ngày hết hạn" },
                      { text: "Tìm thông tin CCCD và địa chỉ của Huỳnh Giáp Nhân?", desc: "Yêu cầu quyền Admin/Trưởng phòng để truy xuất dữ liệu bảo mật" },
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
                  <div className="pt-2 text-[10px] text-slate-400 font-semibold italic flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></div>
                    Dữ liệu được truy vấn real-time, bảo mật tuyệt đối và chỉ lưu hành trong nội bộ Trung Nam E&C.
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

            {/* Modal Footer */}
            {aiHistory.length > 0 && (
              <div className="px-5 py-3 border-t border-slate-150/60 bg-slate-50/70 flex items-center justify-between">
                <button
                  onClick={() => setAiHistory([])}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] text-rose-500 hover:bg-rose-50 font-bold rounded-lg border border-transparent hover:border-rose-100 transition-all cursor-pointer bg-transparent"
                >
                  <Trash2 size={12} /> Làm sạch lịch sử chat
                </button>
                <div className="text-[9px] text-slate-400 font-bold">
                  Đang dùng mô hình **gpt-4o** bảo mật cao
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

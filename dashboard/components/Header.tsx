"use client";

import { useEffect, useState } from "react";
import { Bell, Search, Globe, ChevronDown, Menu, X } from "lucide-react";
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

  const { toggleSidebar } = useSidebar();

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
        <div className="relative w-48 lg:w-64 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
          <input
            type="text"
            placeholder="Tìm kiếm mọi thứ..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-100/50 hover:bg-slate-100 focus:bg-white text-xs text-slate-700 placeholder:text-slate-400 border border-slate-200/60 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all shadow-inner"
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
    </header>
  );
}

"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Calculator,
  Building2,
  FileText,
  Settings,
  Briefcase,
  Users,
  CalendarRange,
  X,
  CheckSquare,
  MessageSquare
} from "lucide-react";
import { useSidebar } from "./SidebarContext";
import ThemeToggle from "./ThemeToggle";
import { supabase } from "@/lib/supabase";

function SidebarLinks({ isApprover, pathname, setSidebarOpen }: { isApprover: boolean; pathname: string; setSidebarOpen: (o: boolean) => void }) {
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard },
    { label: "Quản lý Công việc", href: "/tasks", icon: ClipboardList },
    { label: "Lịch công việc", href: "/calendar", icon: CalendarRange },
    { label: "Tuyển dụng", href: "/recruitment", icon: Briefcase },
    { label: "Danh sách nhân viên", href: "/employees", icon: Users },
    { label: "Lương & Phúc lợi (C&B)", href: "/cb", icon: Calculator },
    { label: "Hành chính & Tài sản", href: "/administration", icon: Building2 },
    { label: "Văn Thư", href: "/document-control", icon: FileText },
    { label: "Góp ý & Kiến nghị", href: "/suggestions", icon: MessageSquare },
    { label: "Cài đặt hệ thống", href: "/settings?tab=system", icon: Settings },
  ];

  if (isApprover) {
    navItems.push({ label: "Duyệt yêu cầu", href: "/settings?tab=approvals", icon: CheckSquare });
  }

  return (
    <>
      {navItems.map((item) => {
        const Icon = item.icon;
        let isActive = false;

        if (item.href.includes("?")) {
          const [path, query] = item.href.split("?");
          const urlParams = new URLSearchParams(query);
          const tabParam = urlParams.get("tab");
          const activeTab = currentTab || "system";
          isActive = pathname === path && activeTab === tabParam;
        } else {
          isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href) && !pathname.startsWith("/settings"));
        }

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-5 py-2.5 rounded-full text-xs font-bold transition-all duration-200 active:scale-[0.97] hover:translate-x-1 border ${
              isActive
                ? "bg-gradient-to-r from-[#005BAC] to-[#00AEEF] border-transparent text-white shadow-md shadow-blue-500/15"
                : "bg-slate-50/50 border-slate-100 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Icon size={15} className={isActive ? "text-white" : "text-slate-500"} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useSidebar();
  const [isApprover, setIsApprover] = useState(false);

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !session.user) return;
        const email = session.user.email || "";

        // Check Admin
        const { data: allowedData } = await supabase
          .from("allowed_users")
          .select("role")
          .ilike("email", email)
          .maybeSingle();
        const isAdmin = allowedData?.role === "Admin";

        // Check Employees
        const { data: empData } = await supabase
          .from("employees")
          .select("role")
          .like("email", `%${email}%`)
          .maybeSingle();

        const role = empData?.role || (isAdmin ? "Admin" : "Nhân viên");
        const roleLower = role.toLowerCase();
        const hasApprovalPrivileges = 
          isAdmin ||
          roleLower.includes("trưởng phòng") ||
          roleLower.includes("truong phong") ||
          roleLower.includes("phó phòng") ||
          roleLower.includes("pho phong") ||
          roleLower.includes("phó trưởng phòng") || 
          roleLower.includes("pho truong phong") ||
          roleLower.includes("giám đốc") ||
          roleLower.includes("giam doc") ||
          roleLower.includes("leader");

        setIsApprover(hasApprovalPrivileges);
      } catch (err) {
        console.error("Error checking user approval privileges in sidebar:", err);
      }
    };
    fetchUserRole();
  }, []);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden transition-all duration-300"
        />
      )}

      <aside className={`w-60 h-screen flex flex-col fixed left-0 top-0 z-40 bg-white border-r border-slate-200/60 shadow-sm transition-transform duration-300 ease-in-out lg:translate-x-0 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}>
        {/* Brand Logo & Header */}
        <div className="px-6 py-6 border-b border-slate-200/60 relative">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center font-heading font-extrabold text-white text-xs shadow-md shadow-blue-500/25">
              TN
            </div>
            <div className="min-w-0">
              <h1 className="text-[#1D1D1F] font-heading font-bold text-sm tracking-tight leading-tight truncate">PM - HCNS - TNEC</h1>
              <p className="text-slate-450 text-[10px] uppercase font-bold tracking-wider mt-0.5">Hệ thống HCNS</p>
            </div>
            <div className="ml-auto mr-6 lg:mr-0">
              <ThemeToggle />
            </div>
          </div>
          {/* Mobile Close Button */}
          <button 
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden absolute right-4 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
            title="Đóng menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-4 py-6 space-y-2.5 overflow-y-auto">
          <div className="px-3 mb-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
            Chức năng chính
          </div>
          <Suspense fallback={<div className="animate-pulse h-10 bg-slate-100 rounded-full" />}>
            <SidebarLinks isApprover={isApprover} pathname={pathname} setSidebarOpen={setSidebarOpen} />
          </Suspense>
        </nav>
      </aside>
    </>
  );
}

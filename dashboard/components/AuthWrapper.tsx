"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, ShieldAlert, Lock } from "lucide-react";
import { SidebarProvider } from "./SidebarContext";
import { usePathname } from "next/navigation";
import { useTenantConfig } from "@/lib/tenantConfig";
import { normalizePlan, isPathAllowed, getMinPlanForPath, PLAN_LABELS } from "@/lib/planShared";

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const tenant = useTenantConfig();
  const isPublicRoute = pathname === "/gop-y" || pathname.startsWith("/gop-y/");

  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const lastCheckedEmail = useRef<string | null>(null);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUserEmail(session?.user?.email || null);
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUserEmail(session?.user?.email || null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !userEmail) {
      setIsAdmin(false);
      setAuthError(null);
      lastCheckedEmail.current = null;
      return;
    }

    // Nếu email này đã được kiểm tra thành công và đã được xác nhận quyền Admin,
    // không cần gọi database kiểm tra lại mỗi lần session thay đổi tham chiếu (do tab focus/token refresh).
    if (userEmail === lastCheckedEmail.current && isAdmin) {
      return;
    }

    const checkAdminStatus = async () => {
      setCheckingAdmin(true);
      try {
        // 1. Check allowed_users (Admins / Special Whitelist)
        const { data: allowedData, error: allowedError } = await supabase
          .from("allowed_users")
          .select("role")
          .ilike("email", userEmail.trim())
          .maybeSingle();

        if (allowedError) {
          console.warn("Error checking allowed_users:", allowedError);
          setAuthError(allowedError.message || JSON.stringify(allowedError));
          setIsAdmin(false);
          return;
        }

        if (allowedData && allowedData.role === "Admin") {
          setIsAdmin(true);
          setAuthError(null);
          lastCheckedEmail.current = userEmail;
          return;
        }

        // 2. Check employees table (If not in allowed_users or not Admin)
        const { data: empData, error: empError } = await supabase
          .from("employees")
          .select("role, status")
          .like("email", `%${userEmail.trim()}%`)
          .maybeSingle();

        if (empError) {
          console.warn("Error checking employees table:", empError);
          setAuthError(empError.message || JSON.stringify(empError));
          setIsAdmin(false);
          return;
        }

        if (empData) {
          const statusLower = (empData.status || "").toLowerCase().trim();
          if (statusLower.includes("nghỉ việc") || statusLower.includes("nghi viec")) {
            setAuthError("Tài khoản của bạn đã ở trạng thái Nghỉ việc và bị khóa quyền truy cập hệ thống. Vui lòng liên hệ Phòng HCNS.");
            setIsAdmin(false);
            return;
          }

          // Active employee -> allow login
          setIsAdmin(true);
          setAuthError(null);
          lastCheckedEmail.current = userEmail;
        } else {
          setAuthError("Email này chưa được đăng ký trong danh sách nhân sự (Bảng employees) hoặc Whitelist.");
          setIsAdmin(false);
        }
      } catch (err: any) {
        console.error("Error checking admin status:", err);
        setAuthError(err?.message || String(err));
        setIsAdmin(false);
      } finally {
        setCheckingAdmin(false);
      }
    };

    checkAdminStatus();
  }, [session, userEmail, isAdmin]);

  const handleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: typeof window !== "undefined" ? window.location.origin : "",
        },
      });
      if (error) throw error;
    } catch (err) {
      console.error("Login error:", err);
      alert("Lỗi khi đăng nhập bằng Google!");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F7F9FC] text-slate-500 gap-3">
        <Loader2 className="animate-spin text-[#005BAC]" size={36} />
        <p className="text-xs font-semibold">Đang kiểm tra trạng thái đăng nhập...</p>
      </div>
    );
  }

  // 1. Not Logged In -> Show Login Page
  if (!session) {
    return (
      <div className="relative flex items-center justify-center min-h-screen bg-[#090D1A] overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-md w-full mx-4 p-10 bg-slate-900/80 border border-slate-800/80 rounded-[2rem] shadow-2xl flex flex-col items-center text-center space-y-7 backdrop-blur-xl">
          {/* Logo công ty (đọc từ tenant_config, fallback TNEC) */}
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#005BAC] to-[#00AEEF] flex items-center justify-center font-heading font-extrabold text-white text-2xl shadow-lg ring-4 ring-blue-500/10">
            {tenant.logo_text}
          </div>

          <div className="space-y-2.5">
            <h1 className="font-heading font-extrabold text-2xl tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              {tenant.system_title}
            </h1>
            <p className="text-[#00AEEF] text-xs font-bold uppercase tracking-widest">
              Hệ thống Quản lý Hành chính Nhân sự
            </p>
          </div>


          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-900 text-xs font-bold py-3.5 rounded-2xl shadow-xl hover:shadow-blue-500/10 transition-all cursor-pointer border border-slate-200"
          >
            {/* Google Icon */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.48 14.97 1 12 1 7.37 1 3.42 3.66 1.5 7.57l3.92 3.04c.92-2.76 3.51-4.57 6.58-4.57z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.44h6.44c-.28 1.48-1.12 2.73-2.38 3.58l3.7 2.87c2.16-1.99 3.43-4.91 3.43-8.55z"
              />
              <path
                fill="#FBBC05"
                d="M5.42 15.35A7.14 7.14 0 0 1 5 12c0-1.18.2-2.31.57-3.37L1.65 5.59A11.96 11.96 0 0 0 0 12c0 2.45.62 4.76 1.7 6.81l3.72-3.46z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.7-2.87c-1.03.69-2.34 1.1-4.26 1.1-3.07 0-5.66-1.81-6.58-4.57L1.5 16.79C3.42 20.34 7.37 23 12 23z"
              />
            </svg>
            Đăng nhập bằng tài khoản Google
          </button>
        </div>
      </div>
    );
  }

  // 2. Logged In, but checking allowed list
  if (checkingAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F7F9FC] text-slate-500 gap-3">
        <Loader2 className="animate-spin text-[#005BAC]" size={36} />
        <p className="text-xs font-semibold">Đang kiểm tra quyền truy cập hệ thống...</p>
      </div>
    );
  }

  // 3. Logged in but NOT Admin (not in allowed list)
  if (!isAdmin) {
    return (
      <div className="relative flex items-center justify-center min-h-screen bg-[#090D1A] overflow-hidden">
        {/* Glow Spheres */}
        <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-rose-600/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative max-w-md w-full mx-4 p-10 bg-slate-900/80 border border-slate-800 rounded-[2rem] shadow-2xl flex flex-col items-center text-center space-y-6 backdrop-blur-xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 shadow-md ring-4 ring-rose-500/5">
            <ShieldAlert size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="text-white font-heading font-extrabold text-base">Từ chối truy cập</h2>
            <p className="text-rose-400 font-mono text-xs font-semibold bg-rose-950/30 px-3 py-1 rounded-xl border border-rose-900/20 truncate max-w-[280px]" title={userEmail || undefined}>
              {userEmail}
            </p>
          </div>

          <p className="text-slate-350 text-xs leading-relaxed px-2 font-medium">
            Tài khoản Google của bạn hiện **chưa có quyền** truy cập hệ thống quản trị này. Vui lòng liên hệ với ban nhân sự hoặc Quản trị viên để được phê duyệt email của bạn.
          </p>

          {authError && (
            <div className="text-[11px] text-rose-300 font-mono max-w-full break-all bg-rose-950/20 p-3 rounded-xl border border-rose-900/30 text-left mt-2">
              <span className="font-bold text-rose-400 block mb-0.5">Chi tiết lỗi (Debug):</span>
              {authError}
            </div>
          )}

          <div className="flex flex-col w-full pt-4">
            <button
              onClick={handleLogout}
              className="w-full bg-slate-800 hover:bg-slate-750 text-white text-xs font-bold py-3.5 rounded-2xl transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
            >
              Đăng xuất & Thử tài khoản khác
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Kiểm tra GÓI DỊCH VỤ: module ngoài gói -> màn hình nâng cấp
  // (chặn cả truy cập thẳng URL, không chỉ ẩn menu). Tính theo tenant_config.plan;
  // fallback enterprise nên không bao giờ khoá nhầm khi config lỗi.
  const activePlan = normalizePlan(tenant.plan);
  if (!isPathAllowed(activePlan, pathname)) {
    const minPlan = getMinPlanForPath(pathname);
    return (
      <SidebarProvider>
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#F7F9FC] px-4">
          <div className="max-w-md w-full bg-white border border-slate-200/60 rounded-[2rem] shadow-premium p-10 flex flex-col items-center text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 ring-4 ring-amber-100/50">
              <Lock size={30} />
            </div>
            <div className="space-y-2">
              <h2 className="font-heading font-extrabold text-slate-800 text-base">
                Tính năng thuộc gói {PLAN_LABELS[minPlan]}
              </h2>
              <p className="text-slate-500 text-xs leading-relaxed font-medium">
                Hệ thống của bạn đang dùng gói <strong>{PLAN_LABELS[activePlan]}</strong>.
                Module này chỉ khả dụng từ gói <strong>{PLAN_LABELS[minPlan]}</strong> trở lên —
                vui lòng liên hệ Quản trị viên để nâng cấp gói dịch vụ.
              </p>
            </div>
            <a
              href="/"
              className="w-full bg-[#005BAC] hover:bg-blue-700 text-white text-xs font-bold py-3.5 rounded-2xl transition-all"
            >
              Về trang Dashboard
            </a>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  // 5. Logged in & Is Admin & đúng gói -> Render dashboard
  return <SidebarProvider>{children}</SidebarProvider>;
}

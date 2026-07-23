"use client";

// ============================================================
// useCurrentUser — MỘT hook thay khối "nhận diện người dùng" từng bị
// copy-paste ~14 trang (settings, employees, document-control, recruitment,
// tasks, cb, page.tsx, calendar, dang-ky, administration, meeting-team…).
//
// Trả về đầy đủ danh tính + quyền đã tính sẵn, để các trang chỉ việc gọi
// user.can("documents") / user.canPath(pathname) thay vì tự so chuỗi phòng ban.
//
// An toàn: render lần đầu trả trạng thái loading với quyền RỖNG (không lộ gì),
// tự cập nhật khi DB trả về. Lỗi mạng -> giữ rỗng (fail-safe cho UI).
// ============================================================

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import {
  fetchApprovalPermissions,
  type ApprovalPermissions,
  NO_APPROVAL_PERMISSIONS,
} from "./approvers";
import { fetchTenantConfig } from "./tenantConfig";
import { normalizePlan, type Plan } from "./planShared";
import {
  canAccess,
  canAccessPath,
  resolveEffectivePlan,
  isHrDept,
  isDirectorRole,
  type ModuleKey,
  type AccessUser,
} from "./access";

export type CurrentUser = {
  loading: boolean;
  authenticated: boolean;
  email: string;         // email đăng nhập (auth)
  contactEmail: string;  // email trong danh bạ nhân sự (employees_directory.email); fallback = email đăng nhập
  name: string;
  role: string;
  department: string;
  status: string;
  isAdmin: boolean;      // allowed_users.role === "Admin" (admin thực sự)
  isHr: boolean;         // thuộc phòng HCNS
  isDirector: boolean;   // vai trò Giám đốc / Ban lãnh đạo
  perms: ApprovalPermissions;
  tenantPlan: Plan;
  effectivePlan: Plan;   // = min(tenantPlan, gói-của-phòng)
  can: (moduleKey: ModuleKey) => boolean;
  canPath: (pathname: string) => boolean;
};

const LOADING_USER: CurrentUser = {
  loading: true,
  authenticated: false,
  email: "",
  contactEmail: "",
  name: "",
  role: "",
  department: "",
  status: "",
  isAdmin: false,
  isHr: false,
  isDirector: false,
  perms: NO_APPROVAL_PERMISSIONS,
  tenantPlan: "basic",
  effectivePlan: "basic",
  can: () => false,
  canPath: () => false,
};

export function useCurrentUser(): CurrentUser {
  const [user, setUser] = useState<CurrentUser>(LOADING_USER);

  useEffect(() => {
    let mounted = true;

    const resolve = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          if (mounted) setUser({ ...LOADING_USER, loading: false });
          return;
        }
        const email = session.user.email || "";

        // 1. allowed_users (Admin thực sự) + 2. employees_directory (phòng, vai trò)
        //    + 3. cờ cấp phép + 4. cấu hình gói tenant — chạy song song.
        const [allowedRes, empRes, perms, tenant] = await Promise.all([
          supabase.from("allowed_users").select("role").ilike("email", email).maybeSingle(),
          supabase
            .from("employees_directory")
            .select("name, role, department, status, email")
            .like("email", `%${email}%`)
            .maybeSingle(),
          fetchApprovalPermissions(email),
          fetchTenantConfig(),
        ]);

        const isAdmin = allowedRes.data?.role === "Admin";
        const emp = empRes.data;
        const name =
          emp?.name ||
          session.user.user_metadata?.full_name ||
          session.user.user_metadata?.name ||
          "Người dùng";
        const role = emp?.role || (isAdmin ? "Admin" : "Nhân viên");
        const department = emp?.department || "Chưa xếp phòng";
        const status = emp?.status || "";

        const tenantPlan = normalizePlan(tenant.plan);
        const effectivePlan = resolveEffectivePlan(tenantPlan, department, tenant.department_plans);

        const access: AccessUser = { isAdmin, tenantPlan, effectivePlan, perms };

        if (!mounted) return;
        setUser({
          loading: false,
          authenticated: true,
          email,
          contactEmail: emp?.email || email,
          name,
          role,
          department,
          status,
          isAdmin,
          isHr: isHrDept(department),
          isDirector: isDirectorRole(role),
          perms,
          tenantPlan,
          effectivePlan,
          can: (moduleKey: ModuleKey) => canAccess(access, moduleKey),
          canPath: (pathname: string) => canAccessPath(access, pathname),
        });
      } catch {
        if (mounted) setUser({ ...LOADING_USER, loading: false });
      }
    };

    resolve();

    // Đăng nhập/đăng xuất giữa chừng -> tính lại.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => resolve());
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return user;
}

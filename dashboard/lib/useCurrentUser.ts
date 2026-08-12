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
          // `.ilike` chứ KHÔNG phải `.like`: trong PostgreSQL `LIKE` phân biệt
          // hoa/thường, nên email lưu trong Danh sách nhân viên chỉ cần MỘT chữ
          // hoa là tra không ra hồ sơ — trong khi dòng allowed_users ngay trên
          // vẫn khớp vì nó dùng ilike. Hậu quả: có quyền nhưng mất hồ sơ nhân sự.
          //
          // `.limit(2)` thay cho `.maybeSingle()`: maybeSingle BÁO LỖI khi khớp
          // từ 2 dòng trở lên (hồ sơ trùng email) và trả về rỗng — người dùng
          // rơi vào "Chưa xếp phòng" y như chưa từng có hồ sơ. Lấy 2 dòng để
          // vừa chọn được dòng đầu, vừa biết có trùng mà cảnh báo.
          supabase
            .from("employees_directory")
            .select("name, role, department, status, email")
            .ilike("email", `%${email}%`)
            .limit(2),
          fetchApprovalPermissions(email),
          fetchTenantConfig(),
        ]);

        const isAdmin = allowedRes.data?.role === "Admin";

        // KHÔNG nuốt lỗi như trước. Tra hụt hồ sơ là người dùng rơi thẳng vào
        // "Chưa xếp phòng", kéo theo ô "Người nhận" ở trang Công việc còn 0
        // người và họ không tạo nổi task nào — mà trước đây tuyệt nhiên không
        // có dấu hiệu gì để lần ra.
        const empRows = (empRes.data || []) as {
          name: string; role: string; department: string; status: string; email: string;
        }[];
        if (empRes.error) {
          console.error("[useCurrentUser] Không tra được hồ sơ nhân sự:", empRes.error.message);
        }
        if (empRows.length > 1) {
          console.warn(
            `[useCurrentUser] Có ${empRows.length} hồ sơ cùng khớp email "${email}" trong Danh sách nhân viên. ` +
            `Đang dùng dòng đầu ("${empRows[0]?.name}") — nên gộp lại để tránh nhận nhầm người.`
          );
        }
        const emp = empRows[0] || null;
        if (!emp) {
          console.warn(
            `[useCurrentUser] Không tìm thấy hồ sơ nào có email chứa "${email}" trong Danh sách nhân viên. ` +
            `Tài khoản sẽ bị coi là "Chưa xếp phòng" và KHÔNG giao việc được cho ai.`
          );
        }
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

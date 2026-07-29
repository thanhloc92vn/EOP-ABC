// ============================================================
// access.ts — NGUỒN SỰ THẬT DUY NHẤT cho quyền truy cập module.
//
// Trước đây mỗi trang tự tính "canView/canManage" bằng cách so chuỗi phòng
// ban + vai trò inline (document-control, recruitment, tasks, cb, page.tsx…),
// mỗi nơi liệt kê chuỗi hơi khác nhau -> một trang cho xem, trang khác chặn.
// File này gom toàn bộ về một chỗ:
//   - isHrDept / isDirectorRole: chuẩn hoá nhận diện phòng HCNS & lãnh đạo.
//   - MODULE_REGISTRY: module -> { route, gói tối thiểu, cờ cấp phép riêng }.
//   - canAccess / canAccessPath: quyết định một người có thấy module không.
//   - resolveEffectivePlan: gói hiệu lực của user = min(gói tenant, gói-của-phòng).
//
// Logic thuần (không "use client") -> dùng được cả client lẫn server (RLS-helper,
// API route). Client bọc qua hook useCurrentUser.
// ============================================================

import {
  type Plan,
  PLAN_RANK,
  isPlanAtLeast,
  getMinPlanForPath,
  normalizePlan,
} from "./planShared";
import { type ApprovalPermissions, normalizeName } from "./approvers";

// ─── Nhận diện phòng HCNS (gom ~6 bản inline lệch nhau về 1 danh sách) ───
// Khớp kiểu "chứa, bỏ dấu": "Phòng Hành Chính Nhân Sự", "HCNS", "Nhân sự"…
export function isHrDept(department?: string | null): boolean {
  const d = normalizeName(department || "");
  if (!d) return false;
  return d.includes("hanh chinh") || d.includes("nhan su") || d.includes("hcns");
}

// ─── Nhận diện vai trò lãnh đạo cấp cao (Giám đốc / Ban lãnh đạo) ───
// Hẹp hơn isManagerRole (approvers.ts) — chỉ cấp giám đốc trở lên, dùng cho
// quyền XEM full (VD Giám đốc thấy toàn bộ Văn thư/Tuyển dụng).
export function isDirectorRole(role?: string | null): boolean {
  const r = normalizeName(role || "");
  if (!r) return false;
  return (
    r.includes("giam doc") ||          // Giám đốc / Phó Giám đốc / Tổng Giám đốc
    r.includes("ban lanh dao") ||
    r.includes("chu tich") ||          // Chủ tịch
    r.includes("chairman")
  );
}

// ─── SỔ ĐĂNG KÝ MODULE ───
// Thêm module mới = thêm 1 dòng ở đây (một nguồn sự thật cho cả gate UI lẫn RLS).
//   minPlan   : gói tối thiểu để phòng được thấy module theo mặc định.
//   grantFlag : cờ trong approval_permissions cho phép CẤP RIÊNG một người
//               (ngoại lệ vượt gói của phòng — VD trưởng phòng QLDA xem Văn thư).
//   route     : prefix đường dẫn (khớp AuthWrapper). Bỏ trống nếu là tính năng
//               không gắn route riêng (ai_search).
export type ModuleKey =
  | "dashboard"
  | "project_locations"
  | "tasks"
  | "calendar"
  | "booking"
  | "administration"
  | "meeting"
  | "employees"
  | "cb"
  | "suggestions"
  | "recruitment"
  | "documents"
  | "tong_hop"
  | "ai_search";

export type ModuleDef = {
  minPlan: Plan;
  grantFlag?: keyof ApprovalPermissions;
  route?: string;
};

export const MODULE_REGISTRY: Record<ModuleKey, ModuleDef> = {
  // ── Basic ──
  dashboard:      { minPlan: "basic", route: "/" },
  tasks:          { minPlan: "basic", route: "/tasks", grantFlag: "canViewAllTasks" },
  calendar:       { minPlan: "basic", route: "/calendar" },
  booking:        { minPlan: "basic", route: "/dang-ky", grantFlag: "canApproveBooking" },
  administration: { minPlan: "basic", route: "/administration", grantFlag: "canViewInvoices" },
  meeting:        { minPlan: "basic", route: "/meeting-team" },
  project_locations: { minPlan: "basic", route: "/vi-tri-du-an" },
  // Module C&B mở từ Basic, NHƯNG lương/BHXH/HĐLĐ bên trong vẫn khoá theo cờ
  // can_view_salary (app/cb/page.tsx > hasFullAccess) — gói không mở khoá lương.
  cb:             { minPlan: "basic", route: "/cb", grantFlag: "canViewSalary" },
  // ── Professional ──
  employees:      { minPlan: "professional", route: "/employees", grantFlag: "canViewEmployees" },
  suggestions:    { minPlan: "professional", route: "/suggestions", grantFlag: "canViewSuggestions" },
  recruitment:    { minPlan: "professional", route: "/recruitment", grantFlag: "canViewCandidates" },
  documents:      { minPlan: "professional", route: "/document-control", grantFlag: "canViewDocuments" },
  tong_hop:       { minPlan: "professional", route: "/tong-hop" },
  // ── Enterprise ──
  ai_search:      { minPlan: "enterprise" }, // tính năng, không có route riêng
};

// Nhân dạng tối thiểu để quyết định quyền — mọi trang truyền đúng shape này.
export type AccessUser = {
  isAdmin: boolean;
  tenantPlan: Plan;     // trần công ty đã mua (chặn cấp phép riêng vượt license)
  effectivePlan: Plan;  // = min(tenantPlan, gói-của-phòng)
  perms: ApprovalPermissions;
};

// ─── Quyết định: user có được thấy module này không ───
export function canAccess(user: AccessUser, moduleKey: ModuleKey): boolean {
  if (user.isAdmin) return true;
  const m = MODULE_REGISTRY[moduleKey];
  // 1. Gói của phòng đã phủ module
  if (isPlanAtLeast(user.effectivePlan, m.minPlan)) return true;
  // 2. Cấp phép riêng (ngoại lệ) — nhưng không vượt quá trần license của tenant
  if (m.grantFlag && user.perms[m.grantFlag] === true && isPlanAtLeast(user.tenantPlan, m.minPlan)) {
    return true;
  }
  return false;
}

// Tìm module ứng với một đường dẫn (prefix khớp dài nhất).
export function moduleForPath(pathname: string): ModuleKey | null {
  let best: { key: ModuleKey; len: number } | null = null;
  for (const key of Object.keys(MODULE_REGISTRY) as ModuleKey[]) {
    const route = MODULE_REGISTRY[key].route;
    if (!route) continue;
    const hit =
      pathname === route ||
      (route !== "/" && (pathname.startsWith(route + "/") || pathname.startsWith(route + "?"))) ||
      (route === "/" && pathname === "/");
    if (hit && (!best || route.length > best.len)) best = { key, len: route.length };
  }
  return best ? best.key : null;
}

// ─── Gate theo đường dẫn (dùng ở AuthWrapper) — gộp gói + cấp phép riêng ───
export function canAccessPath(user: AccessUser, pathname: string): boolean {
  if (user.isAdmin) return true;
  const minPlan = getMinPlanForPath(pathname);
  if (isPlanAtLeast(user.effectivePlan, minPlan)) return true;
  const key = moduleForPath(pathname);
  if (key) {
    const m = MODULE_REGISTRY[key];
    if (m.grantFlag && user.perms[m.grantFlag] === true && isPlanAtLeast(user.tenantPlan, minPlan)) {
      return true;
    }
  }
  return false;
}

// ─── Gói hiệu lực của user theo phòng ban ───
// deptPlans = bản đồ { "_default": Plan, "<Tên phòng>": Plan } lấy từ tenant_config.
// - deptPlans null/rỗng  -> TÍNH NĂNG CHƯA BẬT: trả nguyên gói tenant (hành vi cũ,
//   không khoá nhầm ai khi Admin chưa cấu hình phân gói theo phòng).
// - Phòng có trong map    -> dùng gói đó.
// - Phòng chưa gán         -> "_default" (Admin đặt, mặc định basic).
// Luôn chặn trần: kết quả không vượt quá gói tenant đã mua.
export function resolveEffectivePlan(
  tenantPlan: Plan,
  department: string | null | undefined,
  deptPlans: Record<string, string> | null | undefined
): Plan {
  if (!deptPlans || Object.keys(deptPlans).length === 0) return tenantPlan;

  const key = matchDeptKey(department, deptPlans);
  const raw = key ? deptPlans[key] : deptPlans["_default"];
  const deptPlan = normalizePlan(raw ?? "basic");

  // min(tenantPlan, deptPlan)
  return PLAN_RANK[deptPlan] <= PLAN_RANK[tenantPlan] ? deptPlan : tenantPlan;
}

// Khớp tên phòng của nhân viên với một key trong deptPlans (bỏ dấu, thường hoá).
// Bỏ qua key kỹ thuật "_default".
function matchDeptKey(
  department: string | null | undefined,
  deptPlans: Record<string, string>
): string | null {
  const d = normalizeName(department || "");
  if (!d) return null;
  for (const key of Object.keys(deptPlans)) {
    if (key === "_default") continue;
    const k = normalizeName(key);
    if (k && (d === k || d.includes(k) || k.includes(d))) return key;
  }
  return null;
}

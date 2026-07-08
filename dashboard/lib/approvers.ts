import { supabase } from "./supabase";

export type ApprovalPermissions = {
  canApproveTrip: boolean;
  canApproveLeave: boolean;
  canApproveJustification: boolean;
  canApproveBooking: boolean;
  // Xem/quản lý Góp ý & Kiến nghị — không phải quyền "duyệt", tách riêng khỏi
  // hasAnyApprovalPermission() để không ảnh hưởng hiển thị menu "Duyệt yêu cầu".
  canViewSuggestions: boolean;
  // Các cờ dưới đây thay thế các check cứng theo tên/email từng nằm rải rác trong
  // code (employees/page.tsx, cb/page.tsx, api/ai-search/route.ts) — mục đích để
  // khi bàn giao & khóa tài khoản (employees/page.tsx handleExecuteHandover), quyền
  // tự động chuyển sang người mới vì đây là dòng dữ liệu, không phải tên hardcode.
  canManageEmployees: boolean; // Sửa/xoá/khoá hồ sơ nhân sự (Danh sách nhân viên)
  canViewSalary: boolean; // Xem lương/HĐLĐ qua AI search + bảng contracts
  canViewAttendanceImports: boolean; // Xem thư mục lưu trữ bảng công máy chấm công (trang C&B)
};

export const NO_APPROVAL_PERMISSIONS: ApprovalPermissions = {
  canApproveTrip: false,
  canApproveLeave: false,
  canApproveJustification: false,
  canApproveBooking: false,
  canViewSuggestions: false,
  canManageEmployees: false,
  canViewSalary: false,
  canViewAttendanceImports: false,
};

export function hasAnyApprovalPermission(perms: ApprovalPermissions): boolean {
  return perms.canApproveTrip || perms.canApproveLeave || perms.canApproveJustification || perms.canApproveBooking;
}

// ━━━ Tổ Marketing (trực thuộc phòng HCNS nhưng có luồng duyệt cấp 1 riêng) ━━━
// Khi thành viên tổ Marketing đăng ký xe / phòng họp, cấp 1 do Tổ trưởng Marketing
// duyệt (không phải Trưởng phòng HCNS), sau đó vẫn chuyển HCNS (chị Quỳnh) duyệt cuối.
export const MARKETING_TEAM_LEADER = "Phạm Thành Lộc";
export const MARKETING_TEAM_MEMBERS = ["Võ Thị Thanh Nhàn", "Trịnh An Thuận"];

// Dùng chung cho mọi loại đăng ký/đơn từ (booking, nghỉ phép, công tác) — không chỉ booking,
// đặt tên chung để không gây hiểu lầm khi tái sử dụng ở module khác.
export function isMarketingTeamMember(personName?: string | null): boolean {
  const n = (personName || "").trim().toLowerCase();
  if (!n) return false;
  return MARKETING_TEAM_MEMBERS.some(m => m.toLowerCase() === n);
}

export function isMarketingTeamLeader(userName?: string | null): boolean {
  const n = (userName || "").trim().toLowerCase();
  if (!n) return false;
  return n === MARKETING_TEAM_LEADER.toLowerCase();
}

// ━━━ Chuẩn hoá nhận diện vai trò Trưởng/Phó phòng (dùng cho cấp 1 của Nghỉ phép/Công tác) ━━━
// Trước đây logic này bị lặp lại (và hơi lệch nhau) ở Header.tsx, settings/page.tsx và
// calendar/page.tsx — gom về một chỗ để tránh một nơi coi là quản lý còn nơi khác thì không.
export function isManagerRole(role?: string | null): boolean {
  const r = (role || "").toLowerCase();
  return (
    r.includes("trưởng phòng") || r.includes("truong phong") ||
    r.includes("phó phòng") || r.includes("pho phong") ||
    r.includes("phó trưởng phòng") || r.includes("pho truong phong") ||
    r.includes("giám đốc") || r.includes("giam doc") ||
    r.includes("quản lý") || r.includes("quan ly") ||
    r.includes("quyền trưởng phòng") || r.includes("quyen truong phong") ||
    r.startsWith("tp.") || r.startsWith("tp ") ||
    r.includes("tổ trưởng") || r.includes("to truong") ||
    r.includes("leader")
  );
}

// ━━━ Nghỉ phép / Công tác — luồng duyệt 2 cấp (Trưởng phòng/Tổ trưởng -> HCNS) ━━━
// Áp dụng cho bảng `tasks` (dùng chung với Kanban công việc) qua cột phụ `approval_stage`,
// KHÔNG đổi cột `status` để tránh ảnh hưởng bảng Kanban công việc thông thường.
export type RequestStage = "manager" | "hcns";

export function getRequestStage(task: { approval_stage?: string | null }): RequestStage {
  return task.approval_stage === "pending_hcns" ? "hcns" : "manager";
}

export function isLeaveTripCap1Approver(params: {
  currentUserName: string;
  currentUserRole: string;
  currentUserIsAdmin: boolean;
  assigneeName: string;
  taskNotes?: string | null;
  taskTitleLower: string;
}): boolean {
  const { currentUserName, currentUserRole, currentUserIsAdmin, assigneeName, taskNotes, taskTitleLower } = params;
  if (currentUserIsAdmin) return true;

  // Tổ Marketing (Nhàn, Thuận): cấp 1 do Tổ trưởng Marketing duyệt, không phải Trưởng phòng HCNS
  if (isMarketingTeamMember(assigneeName)) {
    return isMarketingTeamLeader(currentUserName);
  }

  const nameLower = currentUserName.toLowerCase();
  const assigneeLower = assigneeName.toLowerCase();
  const isOneDay = taskTitleLower.includes("1 ngày") || taskTitleLower.includes("1 ngay");

  // Quỳnh xác nhận đơn nghỉ 1 ngày của Hằng (đặc cách theo quy định nội bộ)
  const isQuynh = nameLower.includes("quỳnh") || nameLower.includes("quynh");
  const isHang = assigneeLower.includes("hằng") || assigneeLower.includes("hang");
  if (isQuynh && isHang && isOneDay) return true;

  // Hoành Anh xác nhận đơn nghỉ 1 ngày của Quyên (đặc cách theo quy định nội bộ)
  const isHoanhAnh = nameLower.includes("hoành anh") || nameLower.includes("hoanh anh");
  const isQuyen = assigneeLower.includes("quyên") || assigneeLower.includes("quyen");
  if (isHoanhAnh && isQuyen && isOneDay) return true;

  // Người được nhân viên chỉ định tường minh khi gửi đơn ("Người duyệt: X")
  if (taskNotes && taskNotes.includes(`Người duyệt: ${currentUserName}`)) return true;

  // Trưởng/Phó phòng bất kỳ (giữ đúng hành vi hiện có: không giới hạn cùng phòng ban)
  if (isManagerRole(currentUserRole)) return true;

  return false;
}

export function isLeaveTripCap2Approver(params: {
  currentUserIsAdmin: boolean;
  approvalPerms: ApprovalPermissions;
  isTrip: boolean;
}): boolean {
  const { currentUserIsAdmin, approvalPerms, isTrip } = params;
  if (currentUserIsAdmin) return true;
  return isTrip ? approvalPerms.canApproveTrip : approvalPerms.canApproveLeave;
}

// Per-user approval grants live in the approval_permissions table and are
// managed directly in the Supabase Table Editor — no code change needed to
// grant or revoke. Email matching mirrors the employees lookup: the stored
// email only needs to contain the login email.
export async function fetchApprovalPermissions(email?: string | null): Promise<ApprovalPermissions> {
  if (!email) return NO_APPROVAL_PERMISSIONS;
  try {
    // select("*") để không lỗi khi cột mới (vd can_approve_booking) chưa được migrate
    const { data, error } = await supabase
      .from("approval_permissions")
      .select("*");
    if (error || !data) return NO_APPROVAL_PERMISSIONS;

    const target = email.trim().toLowerCase();
    const row = data.find(r => (r.email || "").toLowerCase().includes(target));
    if (!row) return NO_APPROVAL_PERMISSIONS;

    return {
      canApproveTrip: !!row.can_approve_trip,
      canApproveLeave: !!row.can_approve_leave,
      canApproveJustification: !!row.can_approve_justification,
      canApproveBooking: !!row.can_approve_booking,
      canViewSuggestions: !!row.can_view_suggestions,
      canManageEmployees: !!row.can_manage_employees,
      canViewSalary: !!row.can_view_salary,
      canViewAttendanceImports: !!row.can_view_attendance_imports,
    };
  } catch {
    return NO_APPROVAL_PERMISSIONS;
  }
}

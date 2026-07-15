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
  canViewInvoices: boolean; // Xem toàn bộ hoá đơn/HS thanh toán (trang Hành chính). Người
                            // không có cờ này chỉ thấy phiếu do CHÍNH họ tạo (RLS invoices).
  canViewSalary: boolean; // Xem lương/HĐLĐ qua AI search + bảng contracts
  canViewAttendanceImports: boolean; // Xem thư mục lưu trữ bảng công máy chấm công (trang C&B)
  canViewAllTasks: boolean; // Thấy toàn bộ Kanban công việc (trang Quản lý công việc)
  // Quan hệ giám sát: tên hiển thị (khớp cột `assignee` dạng text) của người mà chủ
  // dòng này được thấy task, ngoài task của chính họ. VD: Như Quỳnh -> "Thanh Hằng".
  supervisesName: string | null;
};

export const NO_APPROVAL_PERMISSIONS: ApprovalPermissions = {
  canApproveTrip: false,
  canApproveLeave: false,
  canApproveJustification: false,
  canApproveBooking: false,
  canViewSuggestions: false,
  canManageEmployees: false,
  canViewInvoices: false,
  canViewSalary: false,
  canViewAttendanceImports: false,
  canViewAllTasks: false,
  supervisesName: null,
};

export function hasAnyApprovalPermission(perms: ApprovalPermissions): boolean {
  return perms.canApproveTrip || perms.canApproveLeave || perms.canApproveJustification || perms.canApproveBooking;
}

// ━━━ NHÓM DUYỆT RIÊNG (bảng approval_groups) ━━━
// Nhóm = tổ có luồng duyệt cấp 1 riêng: thành viên gửi đơn/đăng ký -> TỔ TRƯỞNG
// nhóm duyệt (không phải Trưởng phòng ban), sau đó vẫn chuyển HCNS duyệt cuối.
// VD hiện tại: Tổ Marketing (trực thuộc HCNS). Danh sách đọc từ bảng
// approval_groups — thêm/bớt thành viên, đổi tổ trưởng chỉ cần sửa bảng.
//
// Các hàm is/get bên dưới là ĐỒNG BỘ (được gọi trong filter/render), nên nhóm
// được nạp 1 lần vào cache module; chưa nạp xong thì dùng FALLBACK_GROUPS
// (đúng hiện trạng cũ) — hành vi không đổi khi DB lỗi.

export type ApprovalGroup = {
  name: string;
  leader_name: string;
  member_names: string[];
};

const FALLBACK_GROUPS: ApprovalGroup[] = [
  { name: "Tổ Marketing", leader_name: "Phạm Thành Lộc", member_names: ["Võ Thị Thanh Nhàn", "Trịnh An Thuận"] },
];

let groupsCache: ApprovalGroup[] | null = null;
let groupsInflight: Promise<void> | null = null;

export async function fetchApprovalGroups(): Promise<void> {
  if (groupsCache) return;
  if (groupsInflight) return groupsInflight;
  groupsInflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("approval_groups")
        .select("name, leader_name, member_names")
        .eq("active", true);
      if (!error && data && data.length > 0) {
        groupsCache = data.map(g => ({
          name: g.name,
          leader_name: g.leader_name || "",
          member_names: Array.isArray(g.member_names) ? g.member_names : [],
        }));
      }
    } catch {
      // giữ fallback
    } finally {
      groupsInflight = null;
    }
  })();
  return groupsInflight;
}

function activeGroups(): ApprovalGroup[] {
  if (!groupsCache) {
    // Kích hoạt nạp nền cho lần đánh giá sau; lần này trả fallback (hành vi cũ)
    void fetchApprovalGroups();
    return FALLBACK_GROUPS;
  }
  return groupsCache;
}

// Nhóm duyệt mà người này là THÀNH VIÊN (null nếu không thuộc nhóm nào)
export function getApprovalGroupOfMember(personName?: string | null): ApprovalGroup | null {
  const n = (personName || "").trim().toLowerCase();
  if (!n) return null;
  return activeGroups().find(g => g.member_names.some(m => m.trim().toLowerCase() === n)) || null;
}

// Tên tổ trưởng phụ trách duyệt cấp 1 cho thành viên này (null nếu không thuộc nhóm)
export function getGroupLeaderNameForMember(personName?: string | null): string | null {
  return getApprovalGroupOfMember(personName)?.leader_name || null;
}

// Giữ nguyên tên 2 hàm cũ để các chỗ gọi hiện có không phải đổi.
// "MarketingTeam" giờ hiểu là "thuộc bất kỳ nhóm duyệt riêng nào trong bảng".
export function isMarketingTeamMember(personName?: string | null): boolean {
  return !!getApprovalGroupOfMember(personName);
}

export function isMarketingTeamLeader(userName?: string | null): boolean {
  const n = (userName || "").trim().toLowerCase();
  if (!n) return false;
  return activeGroups().some(g => g.leader_name.trim().toLowerCase() === n);
}

// ━━━ NGOẠI LỆ DUYỆT NGHỈ 1 NGÀY (bảng leave_exceptions) ━━━
// Mỗi dòng = "approver được duyệt cấp 1 đơn nghỉ 1 NGÀY của assignee" (đặc cách
// theo quy định nội bộ). Khớp tên kiểu "chứa, không phân biệt hoa thường & dấu"
// — lưu "Quỳnh" khớp cả "Nguyễn Bích Như Quỳnh" lẫn biến thể không dấu.
// Cùng cơ chế cache + fallback như approval_groups ở trên.

export type LeaveException = {
  approver_name: string;
  assignee_name: string;
};

const FALLBACK_LEAVE_EXCEPTIONS: LeaveException[] = [
  { approver_name: "Quỳnh", assignee_name: "Hằng" },
  { approver_name: "Hoành Anh", assignee_name: "Quyên" },
];

let leaveExceptionsCache: LeaveException[] | null = null;
let leaveExceptionsInflight: Promise<void> | null = null;

export async function fetchLeaveExceptions(): Promise<void> {
  if (leaveExceptionsCache) return;
  if (leaveExceptionsInflight) return leaveExceptionsInflight;
  leaveExceptionsInflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("leave_exceptions")
        .select("approver_name, assignee_name")
        .eq("active", true);
      if (!error && data) {
        // Bảng tồn tại nhưng rỗng = chủ động tắt hết ngoại lệ -> tôn trọng
        leaveExceptionsCache = data.map(r => ({
          approver_name: r.approver_name || "",
          assignee_name: r.assignee_name || "",
        }));
      }
    } catch {
      // giữ fallback
    } finally {
      leaveExceptionsInflight = null;
    }
  })();
  return leaveExceptionsInflight;
}

function activeLeaveExceptions(): LeaveException[] {
  if (!leaveExceptionsCache) {
    void fetchLeaveExceptions();
    return FALLBACK_LEAVE_EXCEPTIONS;
  }
  return leaveExceptionsCache;
}

// Bỏ dấu + thường hoá để so khớp tên kiểu "chứa" (giữ đúng hành vi cũ vốn
// check cả "quỳnh"/"quynh"). Export cho các trang cần so tên cùng kiểu (cb).
export function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0111\u0110]/g, "d").trim();
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

  // Thành viên nhóm duyệt riêng (VD tổ Marketing): cấp 1 do TỔ TRƯỞNG CỦA CHÍNH
  // NHÓM ĐÓ duyệt, không phải Trưởng phòng ban
  const assigneeGroup = getApprovalGroupOfMember(assigneeName);
  if (assigneeGroup) {
    return assigneeGroup.leader_name.trim().toLowerCase() === currentUserName.trim().toLowerCase();
  }

  const isOneDay = taskTitleLower.includes("1 ngày") || taskTitleLower.includes("1 ngay");

  // Ngoại lệ duyệt nghỉ 1 ngày (bảng leave_exceptions, VD Quỳnh->Hằng,
  // Hoành Anh->Quyên): đặc cách theo quy định nội bộ
  if (isOneDay) {
    const userNorm = normalizeName(currentUserName);
    const assigneeNorm = normalizeName(assigneeName);
    const matched = activeLeaveExceptions().some(ex => {
      const approverNorm = normalizeName(ex.approver_name);
      const exAssigneeNorm = normalizeName(ex.assignee_name);
      return !!approverNorm && !!exAssigneeNorm &&
        userNorm.includes(approverNorm) && assigneeNorm.includes(exAssigneeNorm);
    });
    if (matched) return true;
  }

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
  // Nhân tiện nạp sớm cache nhóm duyệt (Header/Sidebar gọi hàm này ở mọi trang)
  void fetchApprovalGroups();
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
      canViewInvoices: !!row.can_view_invoices,
      canViewSalary: !!row.can_view_salary,
      canViewAttendanceImports: !!row.can_view_attendance_imports,
      canViewAllTasks: !!row.can_view_all_tasks,
      supervisesName: row.supervises_name || null,
    };
  } catch {
    return NO_APPROVAL_PERMISSIONS;
  }
}

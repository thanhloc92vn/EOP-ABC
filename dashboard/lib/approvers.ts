import { supabase } from "./supabase";

export type ApprovalPermissions = {
  canApproveTrip: boolean;
  canApproveLeave: boolean;
  canApproveJustification: boolean;
  canApproveBooking: boolean;
  // Duyệt chi phúc lợi: hiếu hỷ/biến cố và thưởng lễ (trang C&B > Phúc lợi).
  canApproveBenefit: boolean;
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
  canViewDocuments: boolean; // XEM Văn Thư (trang /document-control + RLS clerical_documents).
                             // Chỉ xem — không kèm quyền sửa/xoá (xem canManageDocuments).
  canManageDocuments: boolean; // Sửa/xoá công văn + thêm công văn mới (trang Văn thư).
                               // Tách khỏi canViewDocuments vì trước đây ai được đặc cách
                               // XEM cũng thấy luôn cột "Thao tác" -> sửa/xoá được công văn.
  canViewCandidates: boolean; // Xem/xử lý Tuyển dụng (trang /recruitment + RLS candidates, recruitment_needs)
  canViewEmployees: boolean; // Xem FULL danh sách nhân viên (trang /employees). Không có cờ
                             // -> chỉ thấy hồ sơ chính mình. (Gate UI, bảng employees không RLS
                             // vì toàn hệ thống phụ thuộc để tra cứu.)
  canViewSalary: boolean; // Xem lương/HĐLĐ qua AI search + bảng contracts
  canViewAttendanceImports: boolean; // Xem thư mục lưu trữ bảng công máy chấm công (trang C&B)
  canViewAllTasks: boolean; // Thấy toàn bộ Kanban công việc (trang Quản lý công việc)
  canManageVpp: boolean; // Phụ trách VPP: thấy MỌI task "VPP:" dù ở phòng ban nào.
                         // Thay 3 email viết cứng từng nằm trong tasks/page.tsx —
                         // để khi bàn giao, quyền theo người tiếp nhận chứ không
                         // khoá chết vào địa chỉ gmail của người cũ.
  canManageProjectLocations: boolean; // Quản lý vị trí dự án trên bản đồ (/vi-tri-du-an):
                                      // thấy nút "Quản lý vị trí" + ghi được project_locations
                                      // (RLS migration 017). Không có cờ -> chỉ xem bản đồ.
  canManageNews: boolean; // Đăng/sửa/xoá tin nội bộ (/tin-tuc) + ghi bucket news-media
                          // (RLS migration 023). XEM tin thì ai đăng nhập cũng được,
                          // cờ này chỉ mở quyền ĐĂNG BÀI.
  canViewReports: boolean; // Xem module Báo cáo (/bao-cao — Kế hoạch thu chi, Sản lượng,
                           // Doanh thu). Module thuộc gói Enterprise; cờ này cấp riêng cho
                           // một người mà không phải nâng gói cả phòng (migration 042).
                           // Không vượt được trần license: tenant phải ở gói Enterprise.
  // ─── Phiếu trình ký hồ sơ/văn bản (migration 050) ───
  // Luồng 4 cấp: PGĐ QLDA -> PGĐ KHĐT -> Giám đốc -> Kế toán. Mỗi cấp một cờ để
  // đổi người phụ trách chỉ cần tick lại, không phải sửa SQL hay code.
  canCreateSigning: boolean;    // Lập phiếu trình ký. Tách khỏi canViewReports vì
                                // kế toán/giám đốc cần duyệt nhưng không phải người lập.
  canApproveSigningQlda: boolean;
  canApproveSigningKhdt: boolean;
  canApproveSigningDirector: boolean;
  canApproveSigningAccounting: boolean;
  // Quan hệ giám sát: tên hiển thị (khớp cột `assignee` dạng text) của người mà chủ
  // dòng này được thấy task, ngoài task của chính họ. VD: Như Quỳnh -> "Thanh Hằng".
  supervisesName: string | null;
};

export const NO_APPROVAL_PERMISSIONS: ApprovalPermissions = {
  canApproveTrip: false,
  canApproveLeave: false,
  canApproveJustification: false,
  canApproveBooking: false,
  canApproveBenefit: false,
  canViewSuggestions: false,
  canManageEmployees: false,
  canViewInvoices: false,
  canViewDocuments: false,
  canManageDocuments: false,
  canViewCandidates: false,
  canViewEmployees: false,
  canViewSalary: false,
  canViewAttendanceImports: false,
  canViewAllTasks: false,
  canManageVpp: false,
  canManageProjectLocations: false,
  canManageNews: false,
  canViewReports: false,
  canCreateSigning: false,
  canApproveSigningQlda: false,
  canApproveSigningKhdt: false,
  canApproveSigningDirector: false,
  canApproveSigningAccounting: false,
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

// CHÚ Ý: hàm này chỉ trả lời "người này có phụ trách MỘT tổ nào đó không" —
// dùng để mở menu/chuông "Duyệt yêu cầu", KHÔNG dùng để lọc từng đơn. Muốn biết
// người này có được duyệt đơn của MỘT người cụ thể hay không thì dùng
// isGroupLeaderOfRequester() bên dưới: ghép nhầm hai câu hỏi này chính là lý do
// mọi tổ trưởng từng thấy đơn đăng ký của thành viên mọi tổ khác.
export function isMarketingTeamLeader(userName?: string | null): boolean {
  const n = (userName || "").trim().toLowerCase();
  if (!n) return false;
  return activeGroups().some(g => g.leader_name.trim().toLowerCase() === n);
}

// Người này có phải tổ trưởng của ĐÚNG cái tổ mà người gửi đơn thuộc về không?
// false khi người gửi không thuộc tổ nào — nơi gọi tự quyết định nhánh sau đó.
export function isGroupLeaderOfRequester(
  userName?: string | null,
  requesterName?: string | null
): boolean {
  const group = getApprovalGroupOfMember(requesterName);
  if (!group) return false;
  return normalizeName(group.leader_name) === normalizeName(userName);
}

// Cấp trưởng ĐƠN VỊ (phòng/ban/BĐH) — hẹp hơn isManagerRole() vì KHÔNG tính
// "tổ trưởng"/"leader": tổ trưởng chỉ phụ trách thành viên tổ mình, người cùng
// phòng nhưng chưa xếp tổ thuộc về Trưởng/Phó phòng (chốt 17/08/2026).
export function isDepartmentManagerRole(role?: string | null): boolean {
  const r = normalizeName(role);
  if (!r) return false;
  return (
    r.includes("truong phong") || r.includes("pho phong") ||
    r.includes("quyen truong phong") ||
    r.includes("giam doc") ||
    r.includes("quan ly") ||
    r.includes("ke toan truong") ||
    r.includes("truong bo phan") ||
    r.includes("chi huy truong") || r.includes("chi huy pho") ||
    r.startsWith("tp.") || r.startsWith("tp ") || r === "tp"
  );
}

// ━━━ Đăng ký xe / phòng họp — ai được duyệt CẤP 1 một đơn cụ thể ━━━
// Gom về một chỗ vì luật này từng được chép tay ở 3 nơi (chuông Header, trang
// /dang-ky, Cài đặt > Duyệt yêu cầu) và 3 bản đã trôi lệch nhau: hai nơi tính
// tổ trưởng là quản lý, nơi còn lại thì không — cùng một đơn mà chuông kêu,
// /dang-ky duyệt được, còn danh sách trong Cài đặt lại không liệt kê.
export function isBookingCap1Approver(params: {
  currentUserName: string;
  currentUserRole: string;
  currentUserIsAdmin: boolean;
  currentUserDepartment?: string | null;
  requesterName: string;
  requesterDepartment?: string | null;
}): boolean {
  const {
    currentUserName, currentUserRole, currentUserIsAdmin,
    currentUserDepartment, requesterName, requesterDepartment,
  } = params;
  if (currentUserIsAdmin) return true;

  // 1. Người gửi thuộc một tổ có luồng riêng -> CHỈ tổ trưởng của chính tổ đó.
  //    Tổ trưởng tổ khác dừng ở đây, không rơi xuống nhánh phòng ban bên dưới.
  if (getApprovalGroupOfMember(requesterName)) {
    return isGroupLeaderOfRequester(currentUserName, requesterName);
  }

  // 2. Người gửi chưa xếp tổ -> Trưởng/Phó phòng cùng đơn vị. Tổ trưởng KHÔNG
  //    thấy: họ chỉ phụ trách thành viên tổ mình.
  if (!isDepartmentManagerRole(currentUserRole)) return false;

  const mine = normalizeName(currentUserDepartment);
  const theirs = normalizeName(requesterDepartment);
  // Thiếu phòng ban ở một trong hai bên thì không suy đoán (Admin đã thoát ở trên)
  if (!mine || !theirs) return false;
  return mine === theirs;
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

// Xoá cache nhóm duyệt + đặc cách — gọi sau khi Admin sửa 2 bảng này trong modal
// User Permissions để lần đánh giá kế tiếp đọc dữ liệu mới, không phải F5.
export function invalidateApproverCaches(): void {
  groupsCache = null;
  leaveExceptionsCache = null;
}

// Tên các người duyệt đặc cách cho đơn nghỉ 1 NGÀY của assignee này (đọc từ
// bảng leave_exceptions qua cache). Rỗng = không có đặc cách, dùng luồng thường.
export function getLeaveExceptionApproversForAssignee(assigneeName?: string | null): string[] {
  const n = normalizeName(assigneeName || "");
  if (!n) return [];
  return activeLeaveExceptions()
    .filter(ex => {
      const a = normalizeName(ex.assignee_name);
      return !!a && n.includes(a);
    })
    .map(ex => ex.approver_name);
}

// Bỏ dấu + thường hoá để so khớp tên kiểu "chứa" (giữ đúng hành vi cũ vốn
// check cả "quỳnh"/"quynh"). Export cho các trang cần so tên cùng kiểu (cb).
// CHỊU ĐƯỢC null/undefined: hàm này được gọi ở hàng chục chỗ trên dữ liệu lấy
// thẳng từ DB (`tasks.assignee`, `employees.name`, `employees.department`…) — mọi
// cột đó đều cho phép rỗng. Trước đây khai `s: string` rồi gọi thẳng
// `s.toLowerCase()`, nên chỉ cần MỘT dòng dữ liệu thiếu tên là ném TypeError giữa
// lúc render và sập nguyên trang bằng "Application error: a client-side exception".
// TypeScript không bắt được vì kiểu khai trong code không phản ánh được cột DB nullable.
export function normalizeName(s?: string | null): string {
  if (!s) return "";
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
    r.startsWith("tp.") || r.startsWith("tp ") || r === "tp" ||
    r.includes("tổ trưởng") || r.includes("to truong") ||
    // Trưởng đơn vị KHÔNG mang chữ "trưởng phòng" — thiếu các dòng này thì
    // Kế toán trưởng (Phòng TCKT) và Chỉ huy trưởng (các BĐH dự án) không
    // nhận được thông báo duyệt cấp 1 cho nhân viên phòng/ban mình.
    r.includes("kế toán trưởng") || r.includes("ke toan truong") ||
    r.includes("trưởng bộ phận") || r.includes("truong bo phan") ||
    r.includes("chỉ huy trưởng") || r.includes("chi huy truong") ||
    r.includes("chỉ huy phó") || r.includes("chi huy pho") ||
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
  /** Giám đốc / Ban lãnh đạo — đứng trên mọi phòng nên không bị giới hạn đơn vị. */
  currentUserIsDirector?: boolean;
  /** Phòng ban / Ban điều hành của người đang đăng nhập. */
  currentUserDepartment?: string | null;
  assigneeName: string;
  /** Phòng ban / Ban điều hành của người làm đơn (tra từ danh bạ nhân sự). */
  assigneeDepartment?: string | null;
  taskNotes?: string | null;
  taskTitleLower: string;
}): boolean {
  const {
    currentUserName, currentUserRole, currentUserIsAdmin, currentUserIsDirector,
    currentUserDepartment, assigneeName, assigneeDepartment, taskNotes, taskTitleLower,
  } = params;
  if (currentUserIsAdmin) return true;

  // Thành viên nhóm duyệt riêng (VD tổ Marketing): cấp 1 do TỔ TRƯỞNG CỦA CHÍNH
  // NHÓM ĐÓ duyệt, không phải Trưởng phòng ban
  const assigneeGroup = getApprovalGroupOfMember(assigneeName);
  if (assigneeGroup) {
    return assigneeGroup.leader_name.trim().toLowerCase() === currentUserName.trim().toLowerCase();
  }

  // Đơn NGẮN = đúng 1 ngày hoặc nửa ngày. Nửa ngày trước đây tự động duyệt nên
  // không bao giờ chạy tới đây; nay đã bỏ tự duyệt, đơn nửa ngày phải dùng chung
  // nhánh đặc cách với đơn 1 ngày, khớp resolveCap1Approver(..., duration <= 1)
  // trong calendar/page.tsx — lệch là người nhận mail không phải người duyệt được.
  const isShortLeave = taskTitleLower.includes("1 ngày") || taskTitleLower.includes("1 ngay")
                    || taskTitleLower.includes("nửa ngày") || taskTitleLower.includes("nua ngay");

  // Ngoại lệ duyệt nghỉ ngắn ngày (bảng leave_exceptions, VD Quỳnh->Hằng,
  // Hoành Anh->Quyên): đặc cách theo quy định nội bộ
  if (isShortLeave) {
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

  // Cấp quản lý đơn vị: CHỈ duyệt cho nhân sự CÙNG ĐƠN VỊ với mình.
  // (Siết 07/08/2026 — trước đây bất kỳ ai có chức danh quản lý cũng duyệt được
  // đơn của mọi phòng, nên Tổ trưởng Marketing duyệt được đơn phòng Kỹ thuật.)
  if (isManagerRole(currentUserRole)) {
    // Giám đốc / Phó GĐ / Ban lãnh đạo đứng trên mọi phòng — không giới hạn.
    if (currentUserIsDirector) return true;

    const mine = normalizeName(currentUserDepartment || "");
    const theirs = normalizeName(assigneeDepartment || "");
    // Thiếu dữ liệu phòng ban ở một trong hai bên thì KHÔNG suy đoán, trả về
    // false. Không sợ đơn kẹt: Admin và Giám đốc đã thoát ở trên, và người được
    // chỉ định tường minh trong notes cũng đã thoát ở nhánh trước.
    if (!mine || !theirs) return false;
    return mine === theirs;
  }

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
      canApproveBenefit: !!row.can_approve_benefit,
      canViewSuggestions: !!row.can_view_suggestions,
      canManageEmployees: !!row.can_manage_employees,
      canViewInvoices: !!row.can_view_invoices,
      canViewDocuments: !!row.can_view_documents,
      canManageDocuments: !!row.can_manage_documents,
      canViewCandidates: !!row.can_view_candidates,
      canViewEmployees: !!row.can_view_employees,
      canViewSalary: !!row.can_view_salary,
      canViewAttendanceImports: !!row.can_view_attendance_imports,
      canViewAllTasks: !!row.can_view_all_tasks,
      canManageVpp: !!row.can_manage_vpp,
      canManageProjectLocations: !!row.can_manage_project_locations,
      canManageNews: !!row.can_manage_news,
      canViewReports: !!row.can_view_reports,
      canCreateSigning: !!row.can_create_signing,
      canApproveSigningQlda: !!row.can_approve_signing_qlda,
      canApproveSigningKhdt: !!row.can_approve_signing_khdt,
      canApproveSigningDirector: !!row.can_approve_signing_director,
      canApproveSigningAccounting: !!row.can_approve_signing_accounting,
      supervisesName: row.supervises_name || null,
    };
  } catch {
    return NO_APPROVAL_PERMISSIONS;
  }
}

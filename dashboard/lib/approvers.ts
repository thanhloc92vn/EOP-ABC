import { supabase } from "./supabase";

export type ApprovalPermissions = {
  canApproveTrip: boolean;
  canApproveLeave: boolean;
  canApproveJustification: boolean;
  canApproveBooking: boolean;
};

export const NO_APPROVAL_PERMISSIONS: ApprovalPermissions = {
  canApproveTrip: false,
  canApproveLeave: false,
  canApproveJustification: false,
  canApproveBooking: false,
};

export function hasAnyApprovalPermission(perms: ApprovalPermissions): boolean {
  return perms.canApproveTrip || perms.canApproveLeave || perms.canApproveJustification || perms.canApproveBooking;
}

// ━━━ Tổ Marketing (trực thuộc phòng HCNS nhưng có luồng duyệt cấp 1 riêng) ━━━
// Khi thành viên tổ Marketing đăng ký xe / phòng họp, cấp 1 do Tổ trưởng Marketing
// duyệt (không phải Trưởng phòng HCNS), sau đó vẫn chuyển HCNS (chị Quỳnh) duyệt cuối.
export const MARKETING_TEAM_LEADER = "Phạm Thành Lộc";
export const MARKETING_TEAM_MEMBERS = ["Võ Thị Thanh Nhàn", "Trịnh An Thuận"];

export function isMarketingTeamBooking(requesterName?: string | null): boolean {
  const n = (requesterName || "").trim().toLowerCase();
  if (!n) return false;
  return MARKETING_TEAM_MEMBERS.some(m => m.toLowerCase() === n);
}

export function isMarketingTeamLeader(userName?: string | null): boolean {
  const n = (userName || "").trim().toLowerCase();
  if (!n) return false;
  return n === MARKETING_TEAM_LEADER.toLowerCase();
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
    };
  } catch {
    return NO_APPROVAL_PERMISSIONS;
  }
}

import { supabase } from "./supabase";

export type ApprovalPermissions = {
  canApproveTrip: boolean;
  canApproveLeave: boolean;
  canApproveJustification: boolean;
};

export const NO_APPROVAL_PERMISSIONS: ApprovalPermissions = {
  canApproveTrip: false,
  canApproveLeave: false,
  canApproveJustification: false,
};

export function hasAnyApprovalPermission(perms: ApprovalPermissions): boolean {
  return perms.canApproveTrip || perms.canApproveLeave || perms.canApproveJustification;
}

// Per-user approval grants live in the approval_permissions table and are
// managed directly in the Supabase Table Editor — no code change needed to
// grant or revoke. Email matching mirrors the employees lookup: the stored
// email only needs to contain the login email.
export async function fetchApprovalPermissions(email?: string | null): Promise<ApprovalPermissions> {
  if (!email) return NO_APPROVAL_PERMISSIONS;
  try {
    const { data, error } = await supabase
      .from("approval_permissions")
      .select("email, can_approve_trip, can_approve_leave, can_approve_justification");
    if (error || !data) return NO_APPROVAL_PERMISSIONS;

    const target = email.trim().toLowerCase();
    const row = data.find(r => (r.email || "").toLowerCase().includes(target));
    if (!row) return NO_APPROVAL_PERMISSIONS;

    return {
      canApproveTrip: !!row.can_approve_trip,
      canApproveLeave: !!row.can_approve_leave,
      canApproveJustification: !!row.can_approve_justification,
    };
  } catch {
    return NO_APPROVAL_PERMISSIONS;
  }
}

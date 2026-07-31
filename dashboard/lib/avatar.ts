// ============================================================
// avatar — ảnh đại diện người dùng (bảng `user_avatars`, migration 021).
//
// Ảnh lưu thẳng trong CSDL dạng data URL base64, đã ép về tối đa 300×300 và
// nén JPEG ở phía trình duyệt trước khi gửi (~25-40 KB/ảnh).
//
// Header và trang Cài đặt là hai component tách rời nhau, nên sau khi lưu ảnh
// mới, trang Cài đặt phát một CustomEvent để Header cập nhật ngay — không phải
// tải lại trang.
// ============================================================

import { supabase } from "./supabase";

/** Cạnh ảnh sau khi cắt. Ảnh gốc to bao nhiêu cũng bị ép về đúng kích thước này. */
export const AVATAR_SIZE = 300;

/** Giới hạn dung lượng FILE GỐC người dùng chọn (ảnh sau khi nén nhỏ hơn nhiều). */
export const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Sự kiện phát trên `window` sau khi lưu/xoá ảnh, để Header vẽ lại tức thì. */
export const AVATAR_UPDATED_EVENT = "tnec:avatar-updated";

export type AvatarUpdatedDetail = {
  email: string;
  /** null = người dùng vừa gỡ ảnh, quay về hai chữ viết tắt. */
  imageData: string | null;
};

export function emitAvatarUpdated(detail: AvatarUpdatedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AvatarUpdatedDetail>(AVATAR_UPDATED_EVENT, { detail }));
}

/** Hai chữ viết tắt dùng khi chưa có ảnh — giữ đúng cách Header vẫn tính. */
export function initialsFrom(name: string): string {
  return (name || "")
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Tách ô email của hồ sơ nhân sự thành danh sách địa chỉ chữ thường.
 *
 * `employees.email` thường chứa NHIỀU địa chỉ trong một ô, vd
 * "tnec.mkt@trungnamgroup.com.vn, phamthanhloc92vn@gmail.com" — trong khi
 * `user_avatars` khoá theo ĐÚNG email đăng nhập. Không tách ra thì người dùng
 * đăng nhập bằng gmail sẽ không khớp được ảnh của chính mình.
 */
export function splitEmails(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Lấy ảnh cho một danh sách người (mỗi phần tử là ô email của một hồ sơ).
 * Trả Map<email chữ thường, ảnh>.
 *
 * Chỉ hỏi đúng những email đang hiển thị, và chia lô 80 địa chỉ mỗi lượt để
 * chuỗi truy vấn không vượt giới hạn độ dài URL khi danh sách nhân sự dài.
 */
export async function fetchAvatarMap(emailFields: (string | null | undefined)[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const emails = Array.from(new Set(emailFields.flatMap(splitEmails)));
  if (emails.length === 0) return result;

  const CHUNK = 80;
  const chunks: string[][] = [];
  for (let i = 0; i < emails.length; i += CHUNK) chunks.push(emails.slice(i, i + CHUNK));

  try {
    const responses = await Promise.all(
      chunks.map(chunk =>
        supabase.from("user_avatars").select("email, image_data").in("email", chunk)
      )
    );
    for (const { data, error } of responses) {
      if (error) throw error;
      for (const row of data || []) {
        if (row.email && row.image_data) result.set(row.email, row.image_data);
      }
    }
  } catch (err) {
    // Thiếu ảnh chỉ là quay về chữ viết tắt — không đáng làm vỡ trang.
    console.error("Error fetching avatar map:", err);
  }
  return result;
}

/** Ảnh của một hồ sơ: thử lần lượt mọi địa chỉ trong ô email của họ. */
export function pickAvatar(map: Map<string, string>, emailField?: string | null): string | null {
  for (const e of splitEmails(emailField)) {
    const found = map.get(e);
    if (found) return found;
  }
  return null;
}

/**
 * Lấy ảnh đại diện của một email. Trả null khi chưa đặt ảnh.
 * Không ném lỗi — thiếu ảnh chỉ là quay về chữ viết tắt, không đáng làm vỡ trang.
 */
export async function fetchAvatar(email: string): Promise<string | null> {
  if (!email) return null;
  try {
    const { data, error } = await supabase
      .from("user_avatars")
      .select("image_data")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (error) throw error;
    return data?.image_data || null;
  } catch (err) {
    console.error("Error fetching avatar:", err);
    return null;
  }
}

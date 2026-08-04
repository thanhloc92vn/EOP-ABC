// ============================================================
// clericalFiles — tệp công văn của module Văn thư (bucket riêng tư
// `clerical-private`, migration 024).
//
// BỐI CẢNH: cột `clerical_documents.scan_file_url` / `original_file_url` là
// một ô text đa dụng — người dùng có thể dán link Google Drive / OneDrive vào
// đó, hoặc để hệ thống tự điền link tệp đã tải lên. Nên ở đây phải phân biệt
// được BA loại giá trị nằm chung một cột:
//
//   1. "private:<đường dẫn>"  -> tệp trong kho riêng tư, phải ký link mới xem được
//   2. ".../object/public/clerical-documents/..." -> tệp CŨ còn ở kho công khai
//      (chưa chạy script chuyển kho) — vẫn mở được để không gãy dữ liệu đang có
//   3. Mọi thứ còn lại -> link ngoài do người dùng dán, trả nguyên văn
//
// Tiền tố "private:" được chọn vì nó KHÔNG phải URL hợp lệ — dán nhầm vào
// trình duyệt sẽ không mở ra gì, không có nguy cơ lộ như một URL thật.
// ============================================================

import { supabase } from "./supabase";

export const CLERICAL_PRIVATE_BUCKET = "clerical-private";

/** Hạn link ký (giây) — 7 ngày, đồng bộ với module Tin tức. */
export const CLERICAL_SIGNED_TTL = 7 * 24 * 60 * 60;

const PRIVATE_PREFIX = "private:";

/** Giá trị này có phải tệp trong kho riêng tư không? */
export function isPrivateRef(value?: string | null): boolean {
  return !!value && value.startsWith(PRIVATE_PREFIX);
}

/** Giá trị này có phải link công khai kiểu cũ không (dùng để thống kê/cảnh báo). */
export function isLegacyPublicUrl(value?: string | null): boolean {
  return !!value && value.includes("/object/public/clerical-documents/");
}

/** "private:cong-van/abc.pdf" -> "cong-van/abc.pdf" */
export function pathFromRef(value: string): string {
  return value.slice(PRIVATE_PREFIX.length);
}

/**
 * Tên tệp gọn để hiện cho người dùng.
 * Đường dẫn lưu kèm dấu thời gian chống trùng ("1785483231069_bao-cao.pdf"),
 * phần đó là chi tiết kỹ thuật — cắt đi cho dễ đọc.
 */
export function displayNameFromRef(value?: string | null): string {
  if (!value) return "";
  const raw = isPrivateRef(value) ? pathFromRef(value) : value;
  const base = raw.split("/").pop() || raw;
  return base.replace(/^\d{10,}_/, "");
}

/**
 * Đổi giá trị lưu trong CSDL thành URL mở được ngay bây giờ.
 * Trả null khi không ký được link (hết quyền, tệp đã bị xoá).
 */
export async function resolveClericalUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;

  if (isPrivateRef(value)) {
    const { data, error } = await supabase.storage
      .from(CLERICAL_PRIVATE_BUCKET)
      .createSignedUrl(pathFromRef(value), CLERICAL_SIGNED_TTL);
    if (error || !data) return null;
    return data.signedUrl;
  }

  // Link cũ ở kho công khai, hoặc link Drive/OneDrive người dùng dán — giữ nguyên
  return value;
}

/** Tên tệp an toàn cho Storage, giữ đúng cách đặt tên cũ của module Văn thư. */
function safeName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${Date.now()}_${clean}`;
}

/**
 * Tải công văn lên kho RIÊNG TƯ.
 * Trả về chuỗi "private:<đường dẫn>" để ghi thẳng vào cột *_file_url.
 */
export async function uploadClericalFile(file: File): Promise<string> {
  const path = safeName(file.name);

  const { error } = await supabase.storage
    .from(CLERICAL_PRIVATE_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: true, contentType: file.type });

  if (error) {
    const hint = /bucket not found/i.test(error.message)
      ? ` — chưa có kho "${CLERICAL_PRIVATE_BUCKET}". Chạy migrations/024_clerical_private_bucket.sql trong Supabase > SQL Editor.`
      : /row-level security|policy/i.test(error.message)
      ? " — tài khoản của bạn chưa có quyền Văn thư — Sửa / Xoá (cờ can_manage_documents)."
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }

  return `${PRIVATE_PREFIX}${path}`;
}

/** Xoá tệp công văn khỏi kho riêng tư. Lỗi không chặn luồng chính. */
export async function removeClericalFile(value?: string | null): Promise<void> {
  if (!isPrivateRef(value)) return; // link ngoài hoặc tệp cũ: không đụng tới
  try {
    await supabase.storage.from(CLERICAL_PRIVATE_BUCKET).remove([pathFromRef(value!)]);
  } catch {
    // tệp mồ côi trong kho không ảnh hưởng người dùng
  }
}

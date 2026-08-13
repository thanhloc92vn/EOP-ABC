// ============================================================
// taskFiles — tệp đính kèm của công việc (bucket riêng tư `task-files`,
// migration 043).
//
// Khác với module Văn thư: ở đây cột trong CSDL (`tasks.attachment_files`) chỉ
// chứa tệp của kho riêng tư, KHÔNG lẫn link ngoài — ô "Link sản phẩm đính kèm"
// vẫn là một ô riêng bên trên, ai muốn dán link Drive thì dán ở đó. Nhờ vậy
// không cần tiền tố "private:" để phân biệt như clericalFiles.
// ============================================================

import { supabase } from "./supabase";

export const TASK_FILES_BUCKET = "task-files";

/** Hạn link ký (giây) — 7 ngày, đồng bộ với Văn thư và Tin tức. */
export const TASK_FILE_SIGNED_TTL = 7 * 24 * 60 * 60;

/** 2MB — trùng đúng file_size_limit đặt cho bucket ở migration 043. */
export const TASK_FILE_MAX_BYTES = 2 * 1024 * 1024;

export type TaskFile = {
  /** Đường dẫn trong bucket, ví dụ "1785483231069_ban-ve.pdf". */
  path: string;
  /** Tên gốc người dùng thấy — đường dẫn có gắn dấu thời gian, đọc rất khó. */
  name: string;
};

/**
 * Đọc cột `attachment_files` ra mảng.
 * Chịu được cả jsonb (Supabase trả về mảng thật) lẫn chuỗi JSON, và trả mảng
 * rỗng với mọi giá trị hỏng — một dòng dữ liệu lỗi không được phép làm trắng
 * cả bảng công việc.
 */
export function parseTaskFiles(value: unknown): TaskFile[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is TaskFile =>
      !!f && typeof f === "object" &&
      typeof (f as TaskFile).path === "string" && !!(f as TaskFile).path)
    .map(f => ({ path: f.path, name: f.name || f.path.replace(/^\d{10,}_/, "") }));
}

/** Ảnh và PDF — khớp allowed_mime_types của bucket. */
export function isAllowedTaskFile(file: File): boolean {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeName(name: string): string {
  const clean = name.replace(/[^a-zA-Z0-9.-]/g, "_");
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${clean}`;
}

/**
 * Tải một tệp lên kho riêng tư. Ném lỗi kèm gợi ý xử lý — người dùng cuối đọc
 * "Bucket not found" thì không biết phải làm gì.
 */
export async function uploadTaskFile(file: File): Promise<TaskFile> {
  if (!isAllowedTaskFile(file)) {
    throw new Error(`"${file.name}" không phải ảnh hoặc PDF — chỉ nhận hai loại này.`);
  }
  if (file.size > TASK_FILE_MAX_BYTES) {
    throw new Error(`"${file.name}" nặng ${humanSize(file.size)}, vượt mức 2MB cho phép.`);
  }

  const path = safeName(file.name);
  const { error } = await supabase.storage
    .from(TASK_FILES_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (error) {
    const hint = /bucket not found/i.test(error.message)
      ? ` — chưa có kho "${TASK_FILES_BUCKET}". Chạy migrations/043_task_attachments.sql trong Supabase > SQL Editor.`
      : /row-level security|policy/i.test(error.message)
      ? " — tài khoản chưa có quyền tải tệp lên kho công việc."
      : /exceeded the maximum allowed size|payload too large/i.test(error.message)
      ? " — tệp vượt mức 2MB."
      : "";
    throw new Error(`Không tải lên được "${file.name}": ${error.message}${hint}`);
  }

  return { path, name: file.name };
}

/** Ký link xem/tải. Trả null khi không ký được (hết quyền, tệp đã bị xoá). */
export async function resolveTaskFileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(TASK_FILES_BUCKET)
    .createSignedUrl(path, TASK_FILE_SIGNED_TTL);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Xoá tệp khỏi kho. KHÔNG gọi khi xoá công việc: giao một việc cho nhiều người
 * là nhiều dòng task cùng trỏ vào MỘT tệp, xoá theo một dòng sẽ làm hỏng các
 * dòng còn lại. Tệp mồ côi trong kho không ảnh hưởng ai.
 */
export async function removeTaskFile(path: string): Promise<void> {
  try {
    await supabase.storage.from(TASK_FILES_BUCKET).remove([path]);
  } catch {
    // không chặn luồng chính
  }
}

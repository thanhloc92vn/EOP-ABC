"use client";

// ============================================================
// jdTemplates — thư viện JD tuyển dụng (migration 062).
//
// Một dòng = một vị trí tuyển dụng + bản mô tả công việc chuẩn của nó. Màn hình
// "Chấm điểm CV (AI Scorer)" đọc bảng này để nạp thẳng JD vào ô mô tả, thay vì
// bắt người dùng mở file ngoài rồi copy từng lần.
//
// SO KHỚP BỎ DẤU: "ATLĐ" = "atlđ" = "AT LD". Khoá `norm_position` do CLIENT tính
// bằng `foldVi` rồi ghi xuống — Postgres bản thường không bỏ dấu tiếng Việt được
// nếu chưa bật extension `unaccent`, xem phần đầu migration 062.
//
// Cache ở tầng module giống `tripDistances`: modal cấu hình mở/đóng liên tục,
// không việc gì gọi lại mạng mỗi lần bật.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { foldVi } from "./financePartners";

export interface JdTemplate {
  id: string;
  position: string;
  norm_position: string;
  department: string | null;
  content: string;
  note: string | null;
  created_by: string | null;
  created_at?: string;
  updated_at?: string;
}

const COLS =
  "id, position, norm_position, department, content, note, created_by, created_at, updated_at";

/**
 * Khoá so khớp tên vị trí: bỏ dấu, chữ thường, bỏ dấu câu và khoảng trắng.
 *
 * Bỏ luôn khoảng trắng chứ không chỉ gộp lại: cùng một vị trí mà người này gõ
 * "AT LĐ", người kia "ATLĐ", người nữa "AT-LĐ" — không gộp thì danh mục có ba
 * dòng cho một vị trí, và unique index chống trùng thành vô dụng.
 */
export function jdKey(s: string): string {
  return foldVi(s || "")
    .replace(/[.,;:'’"()\-_/\\]+/g, " ")
    .replace(/\s+/g, "")
    .trim();
}

/** Tra bản JD trùng khít tên vị trí — dùng để chống trùng khi thêm/sửa. */
export function findJdByPosition(
  rows: JdTemplate[],
  position: string
): JdTemplate | null {
  const k = jdKey(position);
  if (!k) return null;
  // ⚠ Tính LẠI khoá từ `position`, KHÔNG đọc cột `norm_position` dưới CSDL. Cột
  // đó chỉ để unique index; dòng lưu trước khi luật normalize đổi vẫn giữ khoá
  // cũ, tin vào nó là tra trượt dòng có sẵn rồi tạo dòng trùng.
  return rows.find((r) => jdKey(r.position) === k) || null;
}

/** Lọc danh sách theo ô tìm kiếm (khớp cả tên vị trí, phòng ban và nội dung). */
export function filterJdTemplates(rows: JdTemplate[], search: string): JdTemplate[] {
  const q = foldVi(search || "").trim();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.position, r.department || "", r.note || "", r.content]
      .some((f) => foldVi(f).includes(q))
  );
}

let cached: JdTemplate[] | null = null;
let inflight: Promise<JdTemplate[]> | null = null;

async function fetchJdTemplates(): Promise<JdTemplate[]> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("jd_templates")
        .select(COLS)
        .order("position", { ascending: true });
      if (error) throw error;
      const rows = (data || []) as unknown as JdTemplate[];
      // Lỗi thì KHÔNG cache — để lần mở sau còn thử lại.
      cached = rows;
      return rows;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Gọi sau mỗi lần ghi, để lần đọc kế tiếp lấy dữ liệu mới mà không cần F5. */
export function invalidateJdTemplates(): void {
  cached = null;
}

/**
 * @param enabled Chỉ gọi mạng khi đang ở tab Chấm điểm CV. Trang /recruitment có
 *   4 tab, người vào xem dashboard hay bảng danh sách không cần tải thư viện JD.
 */
export function useJdTemplates(enabled: boolean = true): {
  rows: JdTemplate[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
} {
  const [rows, setRows] = useState<JdTemplate[]>(cached || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      setRows(await fetchJdTemplates());
    } catch (e) {
      // Bảng chưa tạo (migration 062 chưa chạy) cũng rơi vào đây: giữ danh sách
      // rỗng để màn hình chấm điểm vẫn dùng được, chỉ mất phần nạp JD sẵn.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const reload = useCallback(async () => {
    invalidateJdTemplates();
    await load();
  }, [load]);

  return { rows, loading, error, reload };
}

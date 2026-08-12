"use client";

import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ============================================================
// DANH MỤC DỰ ÁN + NHÓM/NGUỒN CÔNG VIỆC (migration 037)
//
// Dùng ở 2 nơi: form tạo/sửa task (đọc để đổ dropdown) và tab "Danh mục công
// việc" trong Cài đặt (Admin thêm/sửa/xoá).
//
// Cùng khuôn với lib/departments.ts: cache ở tầng module nên mọi component
// trong một phiên chỉ truy vấn 1 lần. KHÁC một điểm có chủ đích: departments có
// DEFAULTS hardcode để DB lỗi vẫn chạy như cũ, còn ở đây mặc định là RỖNG —
// mã dự án là dữ liệu thật của công ty, bịa một danh sách mẫu rồi để người dùng
// lỡ chọn nhầm còn tệ hơn là hiện danh sách trống.
// ============================================================

export type Project = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  sort_order: number;
};

export type CatalogKind = "work_group" | "work_source";

export type CatalogItem = {
  id: string;
  kind: CatalogKind;
  name: string;
  active: boolean;
  sort_order: number;
};

export type ProjectCatalog = {
  projects: Project[];
  workGroups: CatalogItem[];
  workSources: CatalogItem[];
  loading: boolean;
};

const EMPTY: ProjectCatalog = { projects: [], workGroups: [], workSources: [], loading: true };

let cached: ProjectCatalog | null = null;
let inflight: Promise<ProjectCatalog> | null = null;

export async function fetchProjectCatalog(): Promise<ProjectCatalog> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      // Hai truy vấn chạy song song — danh mục nhỏ, đừng bắt form chờ nối tiếp.
      const [projRes, catRes] = await Promise.all([
        supabase
          .from("projects")
          .select("id, code, name, active, sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true })
          .order("code", { ascending: true }),
        supabase
          .from("task_catalog")
          .select("id, kind, name, active, sort_order")
          .eq("active", true)
          .order("sort_order", { ascending: true }),
      ]);

      const projects = (projRes.error ? [] : projRes.data || []) as Project[];
      const items = (catRes.error ? [] : catRes.data || []) as CatalogItem[];

      const result: ProjectCatalog = {
        projects,
        workGroups: items.filter(i => i.kind === "work_group"),
        workSources: items.filter(i => i.kind === "work_source"),
        loading: false,
      };
      cached = result;
      return result;
    } catch {
      // Bảng chưa tạo (chưa chạy migration 037) cũng rơi vào đây — form vẫn
      // mở bình thường, chỉ là 3 dropdown trống. Không được ném lỗi làm sập
      // cả trang Quản lý công việc chỉ vì thiếu một danh mục.
      return { ...EMPTY, loading: false };
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// Gọi sau khi Admin sửa danh mục trong Cài đặt, để lần đọc kế tiếp lấy dữ liệu
// mới mà không bắt người dùng F5.
export function invalidateProjectCatalog(): void {
  cached = null;
}

// Hook cho component: trả cache ngay nếu có, tự cập nhật khi DB phản hồi.
export function useProjectCatalog(): ProjectCatalog {
  const [data, setData] = useState<ProjectCatalog>(cached || EMPTY);

  useEffect(() => {
    let mounted = true;
    fetchProjectCatalog().then(d => { if (mounted) setData(d); });
    return () => { mounted = false; };
  }, []);

  return data;
}

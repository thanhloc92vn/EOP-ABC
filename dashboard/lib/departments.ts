"use client";

import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ============================================================
// DANH SÁCH PHÒNG BAN / BĐH (bảng departments) — nguồn duy nhất
// thay cho 7 bản copy DEPARTMENTS từng hardcode rải rác.
//
// Nguyên tắc an toàn (giống tenantConfig):
// - DEFAULTS = đúng danh sách đang hardcode. DB lỗi/trống -> dùng
//   default, hành vi y như trước khi dọn.
// - Cache module-level: mỗi phiên query 1 lần cho mọi component.
// ============================================================

export type Department = {
  id: string;
  name: string;
  type: "phong_ban" | "bdh" | "ban_giam_doc";
  sort_order: number;
  active: boolean;
};

// Fallback = danh sách hardcode nguyên bản (trước khi chuyển sang bảng)
const DEFAULT_PHONG_BAN = [
  "Phòng Hành Chính Nhân Sự",
  "Phòng Tài Chính Kế Toán",
  "Phòng Vật Tư Thiết Bị",
  "Phòng Thị Trường",
  "Phòng Kế Hoạch Đấu Thầu",
  "Phòng Kỹ Thuật",
  "Phòng An Toàn Lao Động",
  "Phòng Quản Lý Dự Án",
  "Phòng Thư Ký, Trợ Lý",
];

const DEFAULT_BDH = [
  "BĐH Vàm Lẽo",
  "BĐH Rạch Xuyên Tâm",
  "BĐH Thường Phước",
  "BĐH XLNT Tây Ninh",
  "BĐH KCN Cà Ná",
  "BĐH Chống Hạn Ninh Thuận",
  "BĐH Tỉnh Lộ 8",
  "BĐH Cầu Mã Đà",
  "BĐH ĐMT Trà Vinh 2",
  "BĐH Hương Lộ 11",
];

const DEFAULT_BAN_GIAM_DOC = ["Giám đốc", "Phó Giám đốc"];

export type DepartmentLists = {
  phongBan: string[];      // 9 phòng ban chức năng
  bdh: string[];           // Ban điều hành dự án
  banGiamDoc: string[];    // Mục Giám đốc/Phó GĐ (quản lý chi phí)
  all: string[];           // phongBan + bdh (dùng cho dropdown chọn phòng ban nhân sự)
};

export const DEPARTMENT_DEFAULTS: DepartmentLists = {
  phongBan: DEFAULT_PHONG_BAN,
  bdh: DEFAULT_BDH,
  banGiamDoc: DEFAULT_BAN_GIAM_DOC,
  all: [...DEFAULT_PHONG_BAN, ...DEFAULT_BDH],
};

let cached: DepartmentLists | null = null;
let inflight: Promise<DepartmentLists> | null = null;

export async function fetchDepartments(): Promise<DepartmentLists> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase
        .from("departments")
        .select("name, type, sort_order, active")
        .eq("active", true)
        .order("sort_order", { ascending: true });

      if (error || !data || data.length === 0) return DEPARTMENT_DEFAULTS;

      const phongBan = data.filter(d => d.type === "phong_ban").map(d => d.name);
      const bdh = data.filter(d => d.type === "bdh").map(d => d.name);
      const banGiamDoc = data.filter(d => d.type === "ban_giam_doc").map(d => d.name);

      // Thiếu bất thường (VD RLS chặn 1 phần) -> giữ default cho nhóm trống
      const lists: DepartmentLists = {
        phongBan: phongBan.length > 0 ? phongBan : DEFAULT_PHONG_BAN,
        bdh: bdh.length > 0 ? bdh : DEFAULT_BDH,
        banGiamDoc: banGiamDoc.length > 0 ? banGiamDoc : DEFAULT_BAN_GIAM_DOC,
        all: [],
      };
      lists.all = [...lists.phongBan, ...lists.bdh];

      cached = lists;
      return lists;
    } catch {
      return DEPARTMENT_DEFAULTS;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// Hook cho component: render ngay với DEFAULTS, tự cập nhật khi DB trả về.
export function useDepartments(): DepartmentLists {
  const [lists, setLists] = useState<DepartmentLists>(cached || DEPARTMENT_DEFAULTS);

  useEffect(() => {
    let mounted = true;
    fetchDepartments().then(l => { if (mounted) setLists(l); });
    return () => { mounted = false; };
  }, []);

  return lists;
}

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
  "Ban Lãnh Đạo",
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

// ============================================================
// deptShortCode — "Phòng Kế Hoạch Đấu Thầu" -> "P. KHĐT"
//
// Dùng để tự điền ô "Phòng ban" trong các form nhập liệu theo đúng phòng của
// người đang đăng nhập (useCurrentUser().department), thay vì bắt gõ tay mỗi
// lần. Lấy chữ cái đầu mỗi từ, bỏ từ nối ("và", "&"), giữ nguyên dấu tiếng
// Việt (đấu -> Đ).
//
// Ngoại lệ BĐH dự án: "BĐH Tây Ninh" viết tắt thành "BTN" thì không ai đọc ra
// dự án nào — giữ nguyên tên.
// ============================================================
const DEPT_STOP_WORDS = new Set(["và", "&"]);

export function deptShortCode(name: string): string {
  const raw = (name || "").trim();
  if (!raw || /^chưa xếp/i.test(raw)) return "";
  if (/^(bđh|bql|ban điều hành)\s/i.test(raw)) return raw;

  const words = raw
    .replace(/[,.()\-–/]+/g, " ")
    .split(/\s+/)
    .filter(w => w && !DEPT_STOP_WORDS.has(w.toLowerCase()));
  if (words.length === 0) return "";

  // Bỏ dấu thanh trước khi lấy chữ cái đầu: "Dự Án" -> "DA" chứ không phải
  // "DÁ". Riêng Đ giữ nguyên vì đó là chữ cái khác chữ D (PATLĐ, BLĐ).
  const initials = words
    .map(w =>
      w.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")   // dấu thanh/mũ
        .replace(/[ơƠ]/g, "o")
        .replace(/[ưƯ]/g, "u")
        .charAt(0)
        .toUpperCase()
    )
    .filter(Boolean);
  if (initials.length === 0) return "";

  // Tách riêng chữ "Phòng" thành "P." rồi cách một khoảng cho dễ đọc:
  // "P. KHĐT" thay vì "PKHĐT" dính liền. Riêng "Ban Lãnh Đạo" vẫn viết liền
  // "BLĐ" — đúng cách gọi quen thuộc, không ai viết "B. LĐ".
  if (initials.length > 1 && /^phòng$/i.test(words[0])) {
    return `${initials[0]}. ${initials.slice(1).join("")}`;
  }
  return initials.join("");
}

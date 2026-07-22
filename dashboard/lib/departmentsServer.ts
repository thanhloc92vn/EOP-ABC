import { createClient } from "@supabase/supabase-js";

// ============================================================
// DANH SÁCH PHÒNG BAN cho SERVER-SIDE (API routes) — đọc bảng
// `departments` bằng anon key (policy anon_read_departments).
// Fallback về danh sách hardcode cũ nếu DB lỗi. Cache 5 phút để
// không query lặp mỗi request nhưng vẫn nhận thay đổi mới.
// ============================================================

export type ServerDepartmentLists = {
  phongBan: string[];
  bdh: string[];
  banGiamDoc: string[];
};

export const SERVER_DEPARTMENT_DEFAULTS: ServerDepartmentLists = {
  phongBan: [
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
  ],
  bdh: [
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
  ],
  banGiamDoc: ["Giám đốc", "Phó Giám đốc"],
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: ServerDepartmentLists | null = null;
let cachedAt = 0;

export async function getDepartmentListsServer(): Promise<ServerDepartmentLists> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !anonKey) return SERVER_DEPARTMENT_DEFAULTS;

    const supabase = createClient(url, anonKey);
    const { data, error } = await supabase
      .from("departments")
      .select("name, type, sort_order")
      .eq("active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) return SERVER_DEPARTMENT_DEFAULTS;

    const phongBan = data.filter(d => d.type === "phong_ban").map(d => d.name);
    const bdh = data.filter(d => d.type === "bdh").map(d => d.name);
    const banGiamDoc = data.filter(d => d.type === "ban_giam_doc").map(d => d.name);

    const lists: ServerDepartmentLists = {
      phongBan: phongBan.length > 0 ? phongBan : SERVER_DEPARTMENT_DEFAULTS.phongBan,
      bdh: bdh.length > 0 ? bdh : SERVER_DEPARTMENT_DEFAULTS.bdh,
      banGiamDoc: banGiamDoc.length > 0 ? banGiamDoc : SERVER_DEPARTMENT_DEFAULTS.banGiamDoc,
    };
    cached = lists;
    cachedAt = Date.now();
    return lists;
  } catch {
    return SERVER_DEPARTMENT_DEFAULTS;
  }
}

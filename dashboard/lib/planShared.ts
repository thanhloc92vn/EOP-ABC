// ============================================================
// GÓI DỊCH VỤ (PLAN) — logic thuần, dùng được cả client lẫn server.
// Gói đang kích hoạt đọc từ tenant_config.plan (basic|professional|enterprise).
//
// Đây là BẢNG PHÂN GÓI trung tâm: module thuộc gói nào, sửa ở đây.
// ============================================================

export type Plan = "basic" | "professional" | "enterprise";

export const PLAN_RANK: Record<Plan, number> = {
  basic: 1,
  professional: 2,
  enterprise: 3,
};

export const PLAN_LABELS: Record<Plan, string> = {
  basic: "Basic",
  professional: "Professional",
  enterprise: "Enterprise",
};

export function normalizePlan(value: unknown): Plan {
  const v = String(value || "").toLowerCase().trim();
  if (v === "basic" || v === "professional" || v === "enterprise") return v;
  return "enterprise"; // fallback an toàn vận hành: config lỗi/thiếu -> không khoá ai
}

export function isPlanAtLeast(current: Plan, min: Plan): boolean {
  return PLAN_RANK[current] >= PLAN_RANK[min];
}

// ─── PHÂN GÓI THEO ROUTE ───
// Khớp theo prefix dài nhất; route không liệt kê = basic (luôn mở).
// Basic:        Dashboard, Công việc, Lịch, Đăng ký xe/phòng họp, Hành chính & VVP,
//                 Biên bản họp, Phòng ban, Cài đặt, Vị trí dự án, Lương & Phúc lợi (C&B),
//                 Tin tức
// Professional: + Danh sách nhân viên, Góp ý & Kiến nghị, Tuyển dụng,
//                 Văn thư, Tổng hợp
// Enterprise:   + Tìm kiếm AI thông minh, Báo cáo (Kế hoạch thu chi, Sản lượng, Doanh thu)
//
// LƯU Ý C&B: module mở từ gói Basic, nhưng dữ liệu nhạy cảm BÊN TRONG (bảng lương,
// BHXH, hợp đồng lao động) vẫn khoá riêng theo cờ can_view_salary — gói KHÔNG mở khoá
// lương. Xem app/cb/page.tsx (hasFullAccess) và RLS bảng contracts.
export const ROUTE_MIN_PLAN: { prefix: string; min: Plan }[] = [
  { prefix: "/vi-tri-du-an", min: "basic" },
  { prefix: "/tin-tuc", min: "basic" },
  { prefix: "/cb", min: "basic" },
  { prefix: "/employees", min: "professional" },
  { prefix: "/suggestions", min: "professional" },
  { prefix: "/recruitment", min: "professional" },
  { prefix: "/vong-1", min: "professional" },
  { prefix: "/vong-2", min: "professional" },
  { prefix: "/thu-viec", min: "professional" },
  { prefix: "/document-control", min: "professional" },
  { prefix: "/van-thu", min: "professional" },
  { prefix: "/tong-hop", min: "professional" },
  { prefix: "/bao-cao", min: "enterprise" },
];

// ─── PHÂN GÓI THEO TÍNH NĂNG (không gắn với route riêng) ───
export const FEATURE_MIN_PLAN = {
  ai_search: "enterprise" as Plan,       // Trợ lý tìm kiếm AI (Ctrl+K, Header) — chỉ Enterprise
  meeting_ai: "basic" as Plan,           // Transcribe + xử lý biên bản họp AI — theo module Biên bản họp (Basic)
};

export function getMinPlanForPath(pathname: string): Plan {
  let best: { prefix: string; min: Plan } | null = null;
  for (const rule of ROUTE_MIN_PLAN) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/") || pathname.startsWith(rule.prefix + "?")) {
      if (!best || rule.prefix.length > best.prefix.length) best = rule;
    }
  }
  return best ? best.min : "basic";
}

export function isPathAllowed(plan: Plan, pathname: string): boolean {
  return isPlanAtLeast(plan, getMinPlanForPath(pathname));
}

export function isFeatureAllowed(plan: Plan, feature: keyof typeof FEATURE_MIN_PLAN): boolean {
  return isPlanAtLeast(plan, FEATURE_MIN_PLAN[feature]);
}

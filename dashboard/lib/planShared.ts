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
// Basic:        Dashboard, Công việc, Lịch, Đăng ký xe/phòng họp, Hành chính & Tài sản,
//                 Biên bản họp, Phòng ban, Cài đặt, Vị trí dự án
// Professional: + Danh sách nhân viên, C&B/Hợp đồng, Góp ý & Kiến nghị, Tuyển dụng,
//                 Văn thư, Tổng hợp (= tất cả, trừ Tìm kiếm AI)
// Enterprise:   + Tìm kiếm AI thông minh
export const ROUTE_MIN_PLAN: { prefix: string; min: Plan }[] = [
  { prefix: "/vi-tri-du-an", min: "basic" },
  { prefix: "/employees", min: "professional" },
  { prefix: "/cb", min: "professional" },
  { prefix: "/suggestions", min: "professional" },
  { prefix: "/recruitment", min: "professional" },
  { prefix: "/vong-1", min: "professional" },
  { prefix: "/vong-2", min: "professional" },
  { prefix: "/thu-viec", min: "professional" },
  { prefix: "/document-control", min: "professional" },
  { prefix: "/van-thu", min: "professional" },
  { prefix: "/tong-hop", min: "professional" },
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

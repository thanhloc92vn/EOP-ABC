"use client";

import { useTenantConfig } from "./tenantConfig";
import {
  type Plan,
  normalizePlan,
  isPathAllowed,
  isFeatureAllowed,
  getMinPlanForPath,
  FEATURE_MIN_PLAN,
  PLAN_LABELS,
} from "./planShared";

export type { Plan };
export { PLAN_LABELS, getMinPlanForPath };

// Hook đọc gói đang kích hoạt (từ tenant_config.plan) + các phép kiểm tra.
// Render lần đầu dùng giá trị fallback (enterprise) rồi tự cập nhật khi
// config về — nghĩa là menu có thể "co lại" ngay sau khi tải với gói thấp,
// không bao giờ khoá nhầm trước khi biết chắc gói.
export function usePlan() {
  const tenant = useTenantConfig();
  const plan = normalizePlan(tenant.plan);

  return {
    plan,
    planLabel: PLAN_LABELS[plan],
    isPathAllowed: (pathname: string) => isPathAllowed(plan, pathname),
    isFeatureAllowed: (feature: keyof typeof FEATURE_MIN_PLAN) => isFeatureAllowed(plan, feature),
  };
}

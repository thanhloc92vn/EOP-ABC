import { createClient } from "@supabase/supabase-js";

// ============================================================
// CẤU HÌNH CÔNG TY cho SERVER-SIDE (API routes) — đọc bảng
// `tenant_config` bằng anon key (policy anon_read_brand_config,
// migration 004 mở thêm email_sender_name/chairman_name/site_url).
// Fallback về giá trị TNEC nếu DB lỗi. Cache 5 phút — cùng pattern
// với departmentsServer.ts.
// ============================================================

export type ServerTenantConfig = {
  company_name: string;
  company_short: string;
  system_title: string;
  system_subtitle: string;
  email_sender_name: string;
  chairman_name: string;
  site_url: string;
};

export const SERVER_TENANT_DEFAULTS: ServerTenantConfig = {
  company_name: "Trung Nam E&C",
  company_short: "TNEC",
  system_title: "EOP-ABC",
  system_subtitle: "Hệ thống HCNS",
  email_sender_name: "Phòng HCNS TNEC",
  chairman_name: "Huỳnh Giáp Nhân",
  site_url: "https://nhansutrungnamec.com",
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: ServerTenantConfig | null = null;
let cachedAt = 0;

export async function getTenantConfigServer(): Promise<ServerTenantConfig> {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !anonKey) return SERVER_TENANT_DEFAULTS;

    const supabase = createClient(url, anonKey);
    const { data, error } = await supabase.from("tenant_config").select("key, value");
    if (error || !data || data.length === 0) return SERVER_TENANT_DEFAULTS;

    const merged: any = { ...SERVER_TENANT_DEFAULTS };
    for (const row of data) {
      if (row.key in merged && typeof row.value === "string" && row.value) {
        merged[row.key] = row.value; // value là jsonb: chuỗi đã parse sẵn
      }
    }
    cached = merged as ServerTenantConfig;
    cachedAt = Date.now();
    return cached;
  } catch {
    return SERVER_TENANT_DEFAULTS;
  }
}

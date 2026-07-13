"use client";

import { useState, useEffect } from "react";
import { supabase } from "./supabase";

// ============================================================
// CẤU HÌNH CÔNG TY (tenant_config) — nguồn thay thế các hằng số
// brand/format từng hardcode rải rác trong code.
//
// Nguyên tắc an toàn:
// - DEFAULTS = đúng giá trị TNEC đang chạy. DB thiếu dòng nào,
//   hoặc chưa đăng nhập / lỗi mạng -> dùng default, hệ vẫn chạy y cũ.
// - Cache module-level: mỗi phiên chỉ query 1 lần cho mọi component.
// ============================================================

export type TenantConfig = {
  company_name: string;
  company_short: string;
  system_title: string;
  system_subtitle: string;
  logo_text: string;
  contract_no_suffix: string;
  email_sender_name: string;
  chairman_name: string;
  plan: "basic" | "professional" | "enterprise";
};

export const TENANT_DEFAULTS: TenantConfig = {
  company_name: "Trung Nam E&C",
  company_short: "TNEC",
  system_title: "PM - HCNS - TNEC",
  system_subtitle: "Hệ thống HCNS",
  logo_text: "TN",
  contract_no_suffix: "TNE&C",
  email_sender_name: "Phòng HCNS TNEC",
  chairman_name: "Huỳnh Giáp Nhân",
  plan: "enterprise",
};

let cached: TenantConfig | null = null;
let inflight: Promise<TenantConfig> | null = null;

export async function fetchTenantConfig(): Promise<TenantConfig> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { data, error } = await supabase.from("tenant_config").select("key, value");
      if (error || !data || data.length === 0) return TENANT_DEFAULTS;
      const merged: any = { ...TENANT_DEFAULTS };
      for (const row of data) {
        if (row.key in merged && row.value !== null && row.value !== undefined) {
          merged[row.key] = row.value; // value là jsonb: chuỗi đã parse sẵn
        }
      }
      // Chưa đăng nhập RLS chỉ trả các khóa brand -> dùng được nhưng KHÔNG cache,
      // để sau khi đăng nhập hook sẽ đọc lại đủ bộ khóa.
      const totalKeys = Object.keys(TENANT_DEFAULTS).length;
      if (data.length >= totalKeys) {
        cached = merged as TenantConfig;
      }
      return merged as TenantConfig;
    } catch {
      return TENANT_DEFAULTS;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

// Hook cho component: render ngay với DEFAULTS, tự cập nhật khi DB trả về.
export function useTenantConfig(): TenantConfig {
  const [config, setConfig] = useState<TenantConfig>(cached || TENANT_DEFAULTS);

  useEffect(() => {
    let mounted = true;
    fetchTenantConfig().then(c => { if (mounted) setConfig(c); });
    return () => { mounted = false; };
  }, []);

  return config;
}

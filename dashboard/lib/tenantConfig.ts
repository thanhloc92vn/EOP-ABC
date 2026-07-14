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

// Nhân sự hành chính (kanban VPP trang Hành chính). `name` phải khớp giá trị
// cột `assignee` của task trong bảng tasks (tên ngắn), `full_name` dùng cho
// form hồ sơ thanh toán.
export type AdminStaff = {
  name: string;
  full_name?: string;
  role: string;
  duties: string;
};

export type TenantConfig = {
  company_name: string;
  company_short: string;
  system_title: string;
  system_subtitle: string;
  logo_text: string;
  contract_no_suffix: string;
  email_sender_name: string;
  chairman_name: string;
  site_url: string;
  hcns_head_name: string;
  admin_staff: AdminStaff[];
  // Người được miễn làm thứ Bảy nhưng vẫn tính đủ công (bảng công C&B);
  // khớp tên kiểu "chứa, không phân biệt dấu"
  saturday_exempt_names: string[];
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
  site_url: "https://nhansutrungnamec.com",
  hcns_head_name: "Lê Thị Hoa Đào",
  admin_staff: [
    { name: "Như Quỳnh", full_name: "Nguyễn Bích Như Quỳnh", role: "Phó phòng Hành chính", duties: "Phụ trách hậu cần, kho VPP, phòng họp, tiếp khách & làm hồ sơ thanh toán, đối soát hóa đơn" },
    { name: "Thanh Hằng", role: "Văn thư", duties: "Phụ trách tiếp nhận, phân loại, lưu trữ và chuyển phát công văn" },
    { name: "Thanh Ngân", role: "Hành chính", duties: "Phụ trách hỗ trợ công tác hành chính, quản lý văn phòng phẩm & cấp phát vật tư" },
  ],
  saturday_exempt_names: ["Phạm Thành Lộc"],
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
      // để sau khi đăng nhập hook sẽ đọc lại đủ bộ khóa. Nhận biết phiên đã
      // đăng nhập qua khóa 'plan' (anon không đọc được khóa này) — không đếm
      // số dòng vì DB có thể chưa chạy đủ các migration seed khóa mới.
      if (data.some(row => row.key === "plan")) {
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

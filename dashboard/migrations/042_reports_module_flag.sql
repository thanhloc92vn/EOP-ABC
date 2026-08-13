-- ============================================================
-- 042 — Cờ `can_view_reports` (module Báo cáo)
--
-- Module Báo cáo (/bao-cao — Kế hoạch thu chi, Sản lượng, Doanh thu) thuộc gói
-- ENTERPRISE. Mặc định chỉ Admin và các phòng đã được xếp gói Enterprise thấy.
--
-- Cờ này để CẤP RIÊNG cho một tài khoản cụ thể (VD Trưởng phòng KHĐT, Kế toán
-- trưởng) mà không phải nâng gói cả phòng. Cấp/thu hồi tại Cài đặt > Cờ quyền.
--
-- LƯU Ý: cấp phép riêng KHÔNG vượt được trần license — tenant_config.plan phải
-- là 'enterprise' thì cờ mới có tác dụng (xem canAccess trong lib/access.ts).
--
-- Chưa có bảng dữ liệu báo cáo nào ở migration này, nên chưa cần RLS. Khi dựng
-- bảng số liệu (kế hoạch thu chi / sản lượng / doanh thu) thì phải siết RLS
-- theo đúng cờ này — dữ liệu doanh thu nhạy cảm ngang bảng lương.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

-- ─── 1. Thêm cột cờ ───
alter table public.approval_permissions
  add column if not exists can_view_reports boolean not null default false;

-- ─── 2. KIỂM TRA ───
select name, email, can_view_reports
from public.approval_permissions
where can_view_reports = true
order by name;

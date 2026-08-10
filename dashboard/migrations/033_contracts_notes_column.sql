-- ============================================================
-- 033 — THÊM CỘT `notes` VÀO BẢNG `contracts`
--
-- Tab "Hợp đồng nhân sự" (C&B) thêm cột "Ghi chú" đứng ngay trước cột "Thao
-- tác", dùng đúng bộ chọn của module Danh sách nhân viên:
--     — Trống — / NV mới / NV Kiêm nhiệm / NV Nghỉ việc
-- Dòng nào ghi chú "nghỉ việc" thì tô cam và bị đẩy xuống cuối bảng.
--
-- Ghi chú này gắn với DÒNG HỢP ĐỒNG, không phải với hồ sơ nhân sự
-- (`employees.notes`): một dòng hợp đồng có thể chưa khớp nhân viên nào trong
-- hệ thống (nhập tay chỉ có tên), lúc đó không có hồ sơ để ghi vào.
--
-- Không cần đụng RLS: bảng `contracts` đã siết ở migration 018 cho
-- Admin / can_view_salary, policy áp theo DÒNG nên cột mới tự được bảo vệ.
-- ============================================================

alter table public.contracts
  add column if not exists notes text;

comment on column public.contracts.notes is
  'Ghi chú trạng thái nhân sự trên dòng hợp đồng (NV mới / NV Kiêm nhiệm / NV Nghỉ việc). Cùng bộ giá trị với employees.notes.';

-- ─── Kiểm tra sau khi chạy ───────────────────────────────────────────────
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'contracts' and column_name = 'notes';

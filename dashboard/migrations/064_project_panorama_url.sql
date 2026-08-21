-- ============================================================
-- 064_project_panorama_url.sql — Thêm ô link ảnh 360° cho "Vị trí dự án"
--
-- Một cột text duy nhất: link ảnh/tour 360 độ của dự án (Google Street View,
-- Kuula, Matterport... — bất kỳ link nào mở được trên trình duyệt).
-- Cách chạy: dán file này vào Supabase SQL Editor và Run.
-- ============================================================

alter table public.project_locations
  add column if not exists panorama_url text;

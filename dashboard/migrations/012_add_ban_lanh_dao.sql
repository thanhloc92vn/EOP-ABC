-- ============================================================
-- 012 — THÊM "Ban Lãnh Đạo" VÀO DANH SÁCH PHÒNG BAN
-- Chạy trong Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- An toàn chạy lại nhiều lần (idempotent).
--
-- Bối cảnh: bảng `departments` (migration 001) là nguồn duy nhất cho
-- mọi dropdown phòng ban — Danh sách nhân viên, C&B/Hợp đồng nhân sự,
-- Hành chính, Góp ý và các API đọc file Excel.
--
-- sort_order = 5 -> đứng TRƯỚC Phòng Hành Chính Nhân Sự (đang là 10).
-- Muốn để cuối danh sách thì đổi 5 thành 95.
-- ============================================================

insert into departments (name, type, sort_order) values
  ('Ban Lãnh Đạo', 'phong_ban', 5)
on conflict (name) do nothing;

-- ─── KIỂM TRA KẾT QUẢ ───
select name, type, sort_order, active
from departments
where type = 'phong_ban'
order by sort_order;

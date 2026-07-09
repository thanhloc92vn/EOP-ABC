-- Cấp quyền cho anh Trần Ngọc Hoàng (IT - Phòng Hành Chính Nhân Sự, mã NV 4552)
-- tương đương chị Lê Thị Hoa Đào (Trưởng phòng HCNS): xem được TẤT CẢ các module
-- trong hệ thống (Công việc, Nhân viên, C&B/Lương, Tuyển dụng, Chấm công, Hóa đơn,
-- Góp ý & Kiến nghị...).
--
-- Cách hoạt động: quyền là DỮ LIỆU trong bảng approval_permissions (không hardcode
-- tên trong code) — các cờ can_view_*/can_manage_* được cả RLS ở database lẫn UI
-- đọc. Cờ duyệt (can_approve_*) được COPY đúng theo giá trị hiện tại của chị Hoa Đào
-- để "tương đương", còn các cờ XEM được bật tường minh = true.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán toàn bộ và Run.

-- 0. Đảm bảo đầy đủ cột (bỏ qua nếu đã có — an toàn chạy lại nhiều lần)
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_approve_trip BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_approve_leave BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_approve_justification BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_approve_booking BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_suggestions BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_employees BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_salary BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_attendance_imports BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_all_tasks BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_candidates BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_invoices BOOLEAN NOT NULL DEFAULT false;

-- 1. Tạo dòng phân quyền cho anh Hoàng nếu chưa có (lấy email đăng nhập từ employees)
INSERT INTO public.approval_permissions (email, name)
SELECT email, name
FROM public.employees
WHERE name = 'Trần Ngọc Hoàng'
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_permissions p WHERE p.name = 'Trần Ngọc Hoàng'
  );

-- 2. Bật toàn bộ quyền XEM các module = true
UPDATE public.approval_permissions
SET can_view_suggestions        = true,
    can_manage_employees        = true,
    can_view_salary             = true,
    can_view_attendance_imports = true,
    can_view_all_tasks          = true,
    can_view_candidates         = true,
    can_view_invoices           = true
WHERE name = 'Trần Ngọc Hoàng';

-- 3. Copy các quyền DUYỆT đúng theo giá trị hiện tại của chị Hoa Đào (tương đương)
UPDATE public.approval_permissions h
SET can_approve_trip          = d.can_approve_trip,
    can_approve_leave         = d.can_approve_leave,
    can_approve_justification = d.can_approve_justification,
    can_approve_booking       = d.can_approve_booking
FROM public.approval_permissions d
WHERE d.name = 'Lê Thị Hoa Đào'
  AND h.name = 'Trần Ngọc Hoàng';

-- 4. Kiểm tra kết quả: PHẢI thấy 1 dòng 'Trần Ngọc Hoàng' với email đăng nhập đúng
-- và các cờ can_view_* = true. Nếu KHÔNG có dòng nào, nghĩa là tên trong bảng
-- employees không khớp chính xác 'Trần Ngọc Hoàng' (khác dấu/khoảng trắng) —
-- sửa lại tên trong câu lệnh cho khớp rồi chạy lại toàn bộ file.
SELECT name, email,
       can_view_all_tasks, can_manage_employees, can_view_salary,
       can_view_attendance_imports, can_view_candidates, can_view_invoices,
       can_view_suggestions,
       can_approve_trip, can_approve_leave, can_approve_justification, can_approve_booking
FROM public.approval_permissions
WHERE name IN ('Trần Ngọc Hoàng', 'Lê Thị Hoa Đào')
ORDER BY name;

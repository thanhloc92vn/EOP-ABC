-- Cờ XEM FULL danh sách nhân viên (trang /employees): can_view_employees
--
-- Trước đây quyền "xem toàn bộ danh sách" rải rác theo role/tên hardcode trong code
-- (bất kỳ ai role "trưởng phòng"/"giám đốc" phòng nào cũng thấy hết, phó phòng thấy
-- phòng mình, 5 tên hardcode...). Nay chuyển về MỘT cờ duy nhất:
--   - Admin + người có can_view_employees (hoặc can_manage_employees) -> thấy FULL
--   - Mọi tài khoản khác -> chỉ thấy hồ sơ của CHÍNH MÌNH
--
-- LƯU Ý: khác các module Văn Thư/Tuyển dụng, bảng employees KHÔNG siết RLS vì toàn
-- hệ thống phụ thuộc vào nó (tra cứu người đăng nhập, người duyệt, danh sách phòng
-- ban, gửi email...). Đây là gate ở giao diện trang Danh sách nhân viên.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.
-- An toàn khi chạy lại nhiều lần (idempotent).

-- ─── 1. Thêm cột cờ ───
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_view_employees BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. Seed cho những người đang có quyền xem full hợp lệ ───
-- 2a. Ai đang có quyền QUẢN LÝ hồ sơ (can_manage_employees) đương nhiên xem full
UPDATE public.approval_permissions
SET can_view_employees = true
WHERE can_manage_employees = true;

-- 2b. Ban giám đốc + nhóm nhân sự đang được hardcode trong code cũ
INSERT INTO public.approval_permissions (email, name, can_view_employees)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Lại Nguyễn Lan Phương', 'Dương Nhật Hoành Anh', 'Lê Thị Hoa Đào', 'Huỳnh Giáp Nhân', 'Nguyễn Duy Hưng')
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name
  );

UPDATE public.approval_permissions
SET can_view_employees = true
WHERE name IN ('Lại Nguyễn Lan Phương', 'Dương Nhật Hoành Anh', 'Lê Thị Hoa Đào', 'Huỳnh Giáp Nhân', 'Nguyễn Duy Hưng');

-- ─── 3. Kiểm tra: ai đang xem được full danh sách nhân viên ───
SELECT email, name, can_view_employees, can_manage_employees
FROM public.approval_permissions
WHERE can_view_employees = true OR can_manage_employees = true;

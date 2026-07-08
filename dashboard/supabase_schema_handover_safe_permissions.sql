-- Chuyển các quyền đang được VIẾT CỨNG THEO TÊN/EMAIL trong code (employees/page.tsx,
-- cb/page.tsx, api/ai-search/route.ts) sang cờ động trong bảng approval_permissions —
-- để khi "Bàn giao & Khóa tài khoản" (employees/page.tsx), quyền tự động chuyển sang
-- người tiếp nhận vì đây là dữ liệu (dòng trong bảng), không phải chuỗi so khớp cứng
-- trong source code.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.

-- 1. can_manage_employees: Sửa/xoá/khoá hồ sơ nhân sự (trang Danh sách nhân viên)
--    Thay cho check cứng "Lại Nguyễn Lan Phương" / "Dương Nhật Hoành Anh" /
--    "Lê Thị Hoa Đào" trong employees/page.tsx (canEdit/canDelete/isOnlyAdmin).
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_manage_employees BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.approval_permissions (email, name, can_manage_employees)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Lại Nguyễn Lan Phương', 'Dương Nhật Hoành Anh', 'Lê Thị Hoa Đào')
  AND NOT EXISTS (SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name);

UPDATE public.approval_permissions
SET can_manage_employees = true
WHERE name IN ('Lại Nguyễn Lan Phương', 'Dương Nhật Hoành Anh', 'Lê Thị Hoa Đào');

-- 2. can_view_salary: Xem lương/HĐLĐ qua AI search (api/ai-search/route.ts hasSalaryAccess)
--    Thay cho check cứng "Huỳnh Giáp Nhân" / "Lê Thị Hoa Đào" / lehoadao2706@gmail.com.
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_view_salary BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.approval_permissions (email, name, can_view_salary)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Huỳnh Giáp Nhân', 'Lê Thị Hoa Đào')
  AND NOT EXISTS (SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name);

UPDATE public.approval_permissions
SET can_view_salary = true
WHERE name IN ('Huỳnh Giáp Nhân', 'Lê Thị Hoa Đào');

-- LƯU Ý: cột can_view_attendance_imports đã được tạo & cấp sẵn cho "Lê Thị Hoa Đào" và
-- "Lại Nguyễn Lan Phương" ở file supabase_schema_attendance_imports_access_control.sql —
-- không cần cấp lại, cb/page.tsx sẽ đọc thẳng cờ này qua fetchApprovalPermissions().

-- Kiểm tra kết quả
SELECT email, name, can_manage_employees, can_view_salary, can_view_attendance_imports
FROM public.approval_permissions
WHERE can_manage_employees = true OR can_view_salary = true OR can_view_attendance_imports = true;

-- Chuyển 2 loại quyền hiển thị Kanban công việc (tasks/page.tsx) đang viết cứng theo
-- tên/email sang cờ động trong approval_permissions — để khi bàn giao & khóa tài
-- khoản, quyền tự động chuyển sang người tiếp nhận.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.

-- 1. can_view_all_tasks: thấy TOÀN BỘ Kanban công việc, không chỉ của phòng/nhóm mình.
--    Thay cho check cứng "Huỳnh Giáp Nhân" / "Nguyễn Duy Hưng" / "Lê Thị Hoa Đào" /
--    "Dương Nhật Hoành Anh" trong tasks/page.tsx (isUserAdmin).
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_view_all_tasks BOOLEAN NOT NULL DEFAULT false;

INSERT INTO public.approval_permissions (email, name, can_view_all_tasks)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Huỳnh Giáp Nhân', 'Nguyễn Duy Hưng', 'Lê Thị Hoa Đào', 'Dương Nhật Hoành Anh')
  AND NOT EXISTS (SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name);

UPDATE public.approval_permissions
SET can_view_all_tasks = true
WHERE name IN ('Huỳnh Giáp Nhân', 'Nguyễn Duy Hưng', 'Lê Thị Hoa Đào', 'Dương Nhật Hoành Anh');

-- 2. supervises_name: quan hệ giám sát — người này thấy thêm task của người được ghi
--    ở đây (khớp theo tên hiển thị dùng trong cột assignee), cộng với task của chính
--    mình. Thay cho 2 khối check cứng "Như Quỳnh thấy Thanh Hằng" / "Hoành Anh thấy
--    Thùy Quyên" trong tasks/page.tsx.
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS supervises_name TEXT;

INSERT INTO public.approval_permissions (email, name, supervises_name)
SELECT email, name, 'Thanh Hằng'
FROM public.employees
WHERE name = 'Nguyễn Bích Như Quỳnh'
  AND NOT EXISTS (SELECT 1 FROM public.approval_permissions p WHERE p.name = 'Nguyễn Bích Như Quỳnh');

UPDATE public.approval_permissions
SET supervises_name = 'Thanh Hằng'
WHERE name = 'Nguyễn Bích Như Quỳnh';

INSERT INTO public.approval_permissions (email, name, supervises_name)
SELECT email, name, 'Thùy Quyên'
FROM public.employees
WHERE name = 'Dương Nhật Hoành Anh'
  AND NOT EXISTS (SELECT 1 FROM public.approval_permissions p WHERE p.name = 'Dương Nhật Hoành Anh');

UPDATE public.approval_permissions
SET supervises_name = 'Thùy Quyên'
WHERE name = 'Dương Nhật Hoành Anh';

-- Kiểm tra kết quả: PHẢI thấy 4 dòng can_view_all_tasks=true, và đúng 2 dòng có
-- supervises_name (Như Quỳnh -> Thanh Hằng, Hoành Anh -> Thùy Quyên). Thiếu dòng nào
-- nghĩa là tên không khớp CHÍNH XÁC với cột "name" trong bảng employees.
SELECT email, name, can_view_all_tasks, supervises_name
FROM public.approval_permissions
WHERE can_view_all_tasks = true OR supervises_name IS NOT NULL;

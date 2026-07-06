-- Siết quyền xem/xử lý Góp ý & Kiến nghị (bảng suggestions): CHỈ Admin và người
-- được cấp quyền riêng (hiện là Dương Nhật Hoành Anh - Tổ trưởng Nhân sự, và
-- Lê Thị Hoa Đào - Trưởng phòng Nhân sự) mới được SELECT/UPDATE/DELETE.
-- INSERT vẫn giữ public — bắt buộc để form góp ý ẩn danh tại /gop-y hoạt động.
--
-- Đây là lớp bảo vệ THẬT SỰ ở database (RLS), không chỉ chặn ở giao diện —
-- nếu chỉ chặn UI thì bất kỳ ai có JWT "authenticated" hợp lệ vẫn gọi thẳng
-- được Supabase API để đọc/sửa/xoá.
--
-- Copy toàn bộ, vào Supabase -> SQL Editor -> New Query, dán và chạy.

-- 1. Thêm cột quyền riêng cho Góp ý vào bảng approval_permissions (bảng cấp quyền
--    dùng chung toàn hệ thống — quản lý trực tiếp trong Supabase Table Editor,
--    không cần sửa code khi cấp/thu hồi quyền cho người khác sau này)
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_view_suggestions BOOLEAN NOT NULL DEFAULT false;

-- 2. Cấp quyền cho Hoành Anh và Hoa Đào (lấy email từ bảng employees)
INSERT INTO public.approval_permissions (email, name, can_view_suggestions)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Dương Nhật Hoành Anh', 'Lê Thị Hoa Đào')
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name
  );

-- Nếu 2 người trên đã có sẵn dòng phân quyền (vd đã được cấp quyền khác trước đó)
-- thì chỉ bật thêm cờ can_view_suggestions, không tạo trùng dòng
UPDATE public.approval_permissions
SET can_view_suggestions = true
WHERE name IN ('Dương Nhật Hoành Anh', 'Lê Thị Hoa Đào');

-- 3. Siết RLS trên bảng suggestions
DROP POLICY IF EXISTS "Allow public select for suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Allow authenticated select for suggestions" ON public.suggestions;
CREATE POLICY "Allow authorized viewers select for suggestions"
  ON public.suggestions FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_suggestions = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

DROP POLICY IF EXISTS "Allow authenticated update for suggestions" ON public.suggestions;
CREATE POLICY "Allow authorized viewers update for suggestions"
  ON public.suggestions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_suggestions = true AND ap.email ILIKE '%' || auth.email() || '%')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_suggestions = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

DROP POLICY IF EXISTS "Allow authenticated delete for suggestions" ON public.suggestions;
CREATE POLICY "Allow authorized viewers delete for suggestions"
  ON public.suggestions FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_suggestions = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

-- INSERT giữ nguyên public — KHÔNG đụng vào, bắt buộc để form góp ý ẩn danh hoạt động
-- (chính sách "Allow public insert for suggestions" đã có sẵn, không cần tạo lại)

-- Kiểm tra kết quả
SELECT email, name, can_view_suggestions FROM public.approval_permissions WHERE can_view_suggestions = true;

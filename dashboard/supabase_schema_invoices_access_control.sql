-- Siết quyền XEM danh sách hoá đơn / hồ sơ thanh toán (bảng invoices): CHỈ Admin
-- và 4 người được cấp quyền riêng của phòng Hành chính Nhân sự mới được xem/sửa/xoá:
--   - Lê Thị Hoa Đào       (Trưởng phòng HCNS)
--   - Nguyễn Bích Như Quỳnh (Phó phòng Hành chính)
--   - Nguyễn Ngọc Thanh Hằng (Văn thư)
--   - Phạm Thị Thanh Ngân (Hành chính)
--
-- Nhân viên phòng ban khác VẪN nộp được hoá đơn qua công cụ "Trích xuất hàng loạt
-- bằng AI" (INSERT giữ nguyên mở cho mọi tài khoản đã đăng nhập) — nhưng KHÔNG xem
-- được danh sách/bảng đối soát (SELECT), và không tự sửa/xoá lại hồ sơ mình vừa tạo
-- (UPDATE/DELETE) — giống hệt pattern đã áp dụng cho bảng suggestions.
--
-- Đây là lớp bảo vệ THẬT SỰ ở database (RLS), không chỉ chặn ở giao diện.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.

-- 1. Thêm cột quyền riêng cho hoá đơn vào bảng approval_permissions (bảng cấp quyền
--    dùng chung toàn hệ thống — quản lý trực tiếp trong Supabase Table Editor,
--    không cần sửa code khi cấp/thu hồi quyền cho người khác sau này)
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_view_invoices BOOLEAN NOT NULL DEFAULT false;

-- 2. Cấp quyền cho 4 người (lấy email từ bảng employees)
INSERT INTO public.approval_permissions (email, name, can_view_invoices)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Lê Thị Hoa Đào', 'Nguyễn Bích Như Quỳnh', 'Nguyễn Ngọc Thanh Hằng', 'Phạm Thị Thanh Ngân')
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name
  );

-- Nếu người nào trong 4 người trên đã có sẵn dòng phân quyền (vd đã được cấp quyền
-- khác trước đó) thì chỉ bật thêm cờ can_view_invoices, không tạo trùng dòng
UPDATE public.approval_permissions
SET can_view_invoices = true
WHERE name IN ('Lê Thị Hoa Đào', 'Nguyễn Bích Như Quỳnh', 'Nguyễn Ngọc Thanh Hằng', 'Phạm Thị Thanh Ngân');

-- 3. Siết RLS trên bảng invoices
DROP POLICY IF EXISTS "Allow authenticated select for invoices" ON public.invoices;
CREATE POLICY "Allow authorized viewers select for invoices"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_invoices = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

DROP POLICY IF EXISTS "Allow authenticated update for invoices" ON public.invoices;
CREATE POLICY "Allow authorized viewers update for invoices"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_invoices = true AND ap.email ILIKE '%' || auth.email() || '%')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_invoices = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

DROP POLICY IF EXISTS "Allow authenticated delete for invoices" ON public.invoices;
CREATE POLICY "Allow authorized viewers delete for invoices"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_invoices = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

-- INSERT giữ nguyên "Allow authenticated insert for invoices" (mọi tài khoản đã đăng
-- nhập) — KHÔNG đụng vào, bắt buộc để công cụ AI trích xuất hoá đơn vẫn hoạt động
-- cho nhân viên phòng ban khác.

-- Kiểm tra kết quả
SELECT email, name, can_view_invoices FROM public.approval_permissions WHERE can_view_invoices = true;

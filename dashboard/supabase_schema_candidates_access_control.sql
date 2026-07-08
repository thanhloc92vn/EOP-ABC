-- Siết quyền XEM/sửa/xoá/thêm danh sách ứng viên (bảng candidates): CHỈ Admin và
-- 3 người được cấp quyền riêng của bộ phận Tuyển dụng mới được thao tác:
--   - Lê Thị Hoa Đào          (Trưởng phòng HCNS)
--   - Nguyễn Trương Thùy Quyên (Tuyển dụng)
--   - Nguyễn Khánh Linh        (Tuyển dụng)
--
-- Khác với bảng invoices, module Tuyển dụng không có form công khai/dùng chung cho
-- toàn công ty (không có route public nào insert vào candidates) nên khoá TOÀN BỘ
-- thao tác SELECT/INSERT/UPDATE/DELETE lại cho nhóm được cấp quyền, không giữ mở
-- INSERT cho người khác như trường hợp invoices.
--
-- Đây là lớp bảo vệ THẬT SỰ ở database (RLS), không chỉ chặn ở giao diện.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.

-- 1. Thêm cột quyền riêng cho tuyển dụng vào bảng approval_permissions
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_view_candidates BOOLEAN NOT NULL DEFAULT false;

-- 2. Cấp quyền cho 3 người (lấy email từ bảng employees)
INSERT INTO public.approval_permissions (email, name, can_view_candidates)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Lê Thị Hoa Đào', 'Nguyễn Trương Thùy Quyên', 'Nguyễn Khánh Linh')
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name
  );

-- Nếu người nào trong 3 người trên đã có sẵn dòng phân quyền (vd đã được cấp quyền
-- khác trước đó) thì chỉ bật thêm cờ can_view_candidates, không tạo trùng dòng
UPDATE public.approval_permissions
SET can_view_candidates = true
WHERE name IN ('Lê Thị Hoa Đào', 'Nguyễn Trương Thùy Quyên', 'Nguyễn Khánh Linh');

-- 3. Siết RLS trên bảng candidates (khoá cả 4 thao tác)
-- QUAN TRỌNG: xoá TOÀN BỘ policy đang có trên bảng candidates trước, bất kể tên gì.
-- Postgres nối nhiều policy PERMISSIVE cùng loại (VD nhiều policy SELECT) bằng OR —
-- nên nếu còn sót lại 1 policy cũ tên khác (VD được tạo tay ngoài các file trong repo,
-- không xoá được bằng DROP POLICY IF EXISTS "tên cũ" vì không khớp tên) thì policy mới
-- chặt hơn bên dưới sẽ VÔ NGHĨA — ai cũng vẫn xem được nếu còn 1 policy "true" nào đó.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'candidates'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.candidates', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Allow authorized viewers select for candidates"
  ON public.candidates FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "Allow authorized viewers insert for candidates"
  ON public.candidates FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "Allow authorized viewers update for candidates"
  ON public.candidates FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "Allow authorized viewers delete for candidates"
  ON public.candidates FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

-- Kiểm tra kết quả: PHẢI thấy đủ 3 dòng bên dưới (khớp đúng 3 người). Nếu thiếu
-- người nào, nghĩa là tên trong câu lệnh trên không khớp CHÍNH XÁC với cột "name"
-- trong bảng employees (khác dấu/khoảng trắng) — cần sửa lại tên cho đúng rồi chạy
-- lại toàn bộ file.
SELECT email, name, can_view_candidates FROM public.approval_permissions WHERE can_view_candidates = true;

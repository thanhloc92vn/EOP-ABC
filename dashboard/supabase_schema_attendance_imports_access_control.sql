-- Siết quyền XEM/sửa/xoá thư mục lưu trữ bảng công máy chấm công (bảng
-- attendance_imports): CHỈ Admin và 2 người được cấp quyền riêng mới được xem/sửa/xoá:
--   - Lê Thị Hoa Đào       (Trưởng phòng HCNS)
--   - Lại Nguyễn Lan Phương (HCNS)
--
-- Nhân sự HCNS khác vẫn TẢI LÊN được file Excel máy chấm công để xử lý/gửi email
-- báo cáo (INSERT giữ nguyên mở cho mọi tài khoản đã đăng nhập) — nhưng KHÔNG xem
-- được danh sách file đã lưu trữ (SELECT), và không tự sửa/xoá lại — giống hệt
-- pattern đã áp dụng cho bảng invoices.
--
-- Đây là lớp bảo vệ THẬT SỰ ở database (RLS), không chỉ chặn ở giao diện.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.

-- 1. Thêm cột quyền riêng vào bảng approval_permissions
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_view_attendance_imports BOOLEAN NOT NULL DEFAULT false;

-- 2. Cấp quyền cho 2 người (lấy email từ bảng employees)
INSERT INTO public.approval_permissions (email, name, can_view_attendance_imports)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Lê Thị Hoa Đào', 'Lại Nguyễn Lan Phương')
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name
  );

-- Nếu người nào trong 2 người trên đã có sẵn dòng phân quyền (vd đã được cấp quyền
-- khác trước đó) thì chỉ bật thêm cờ can_view_attendance_imports, không tạo trùng dòng
UPDATE public.approval_permissions
SET can_view_attendance_imports = true
WHERE name IN ('Lê Thị Hoa Đào', 'Lại Nguyễn Lan Phương');

-- 3. Siết RLS trên bảng attendance_imports
-- QUAN TRỌNG: xoá TOÀN BỘ policy đang có trên bảng, bất kể tên gì (Postgres nối
-- nhiều policy PERMISSIVE cùng loại bằng OR — sót 1 policy "true" cũ là vô nghĩa
-- policy mới). Xem thêm bài học này trong file supabase_schema_candidates_access_control.sql.
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'attendance_imports'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.attendance_imports', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Allow authorized viewers select for attendance_imports"
  ON public.attendance_imports FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_attendance_imports = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "Allow authenticated insert for attendance_imports"
  ON public.attendance_imports FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authorized viewers update for attendance_imports"
  ON public.attendance_imports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_attendance_imports = true AND ap.email ILIKE '%' || auth.email() || '%')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_attendance_imports = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "Allow authorized viewers delete for attendance_imports"
  ON public.attendance_imports FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_attendance_imports = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

-- Kiểm tra kết quả: PHẢI thấy đủ 2 dòng bên dưới (khớp đúng Hoa Đào & Lan Phương).
-- Nếu thiếu người nào, nghĩa là tên không khớp CHÍNH XÁC với cột "name" trong bảng
-- employees (khác dấu/khoảng trắng) — cần sửa lại tên cho đúng rồi chạy lại toàn bộ file.
SELECT email, name, can_view_attendance_imports FROM public.approval_permissions WHERE can_view_attendance_imports = true;

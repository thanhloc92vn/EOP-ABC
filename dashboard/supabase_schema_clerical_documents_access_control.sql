-- Siết quyền xem/xử lý Văn Thư (bảng clerical_documents): CHỈ Admin và người được
-- cấp quyền riêng (cờ can_view_documents trong approval_permissions) mới được
-- SELECT/INSERT/UPDATE/DELETE. Nhân viên phòng ban khác mở trang Văn Thư sẽ thấy
-- màn "Truy cập bị từ chối" (giống Góp ý & Kiến nghị).
--
-- Đây là lớp bảo vệ THẬT SỰ ở database (RLS), không chỉ chặn ở giao diện —
-- nếu chỉ chặn UI thì bất kỳ ai có JWT "authenticated" hợp lệ vẫn gọi thẳng
-- được Supabase API để đọc/sửa/xoá. AI search (/api/ai-search) dùng token của
-- từng user nên tự động bị chặn theo đúng cờ này, không cần sửa gì thêm.
--
-- Copy toàn bộ, vào Supabase -> SQL Editor -> New Query, dán và chạy.
-- An toàn khi chạy lại nhiều lần (idempotent).

-- ─── 1. Thêm cột quyền riêng cho Văn Thư vào bảng approval_permissions ───
-- (quản lý trực tiếp trong Supabase Table Editor — cấp/thu quyền không cần sửa code)
ALTER TABLE public.approval_permissions
  ADD COLUMN IF NOT EXISTS can_view_documents BOOLEAN NOT NULL DEFAULT false;

-- ─── 2. Cấp quyền cho cán bộ Hành chính phụ trách văn thư ───
-- (cùng nhóm 4 người đang giữ quyền hoá đơn can_view_invoices — chỉnh danh sách
--  tuỳ thực tế: thêm/bớt trực tiếp trong Table Editor sau này)
INSERT INTO public.approval_permissions (email, name, can_view_documents)
SELECT email, name, true
FROM public.employees
WHERE name IN ('Lê Thị Hoa Đào', 'Nguyễn Bích Như Quỳnh', 'Nguyễn Ngọc Thanh Hằng', 'Phạm Thị Thanh Ngân')
  AND NOT EXISTS (
    SELECT 1 FROM public.approval_permissions p WHERE p.name = public.employees.name
  );

-- Người đã có sẵn dòng phân quyền thì chỉ bật thêm cờ, không tạo trùng dòng
UPDATE public.approval_permissions
SET can_view_documents = true
WHERE name IN ('Lê Thị Hoa Đào', 'Nguyễn Bích Như Quỳnh', 'Nguyễn Ngọc Thanh Hằng', 'Phạm Thị Thanh Ngân');

-- ─── 3. Bật RLS + xoá TOÀN BỘ policy cũ trên clerical_documents ───
-- (quét động pg_policies, không đoán tên policy cũ để tránh sót)
ALTER TABLE public.clerical_documents ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clerical_documents'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.clerical_documents;', pol.policyname);
  END LOOP;
END $$;

-- ─── 4. Dựng lại policy: CHỈ Admin + cờ can_view_documents ───
CREATE POLICY "clerical_documents_select_authorized"
  ON public.clerical_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_documents = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "clerical_documents_insert_authorized"
  ON public.clerical_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_documents = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "clerical_documents_update_authorized"
  ON public.clerical_documents FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_documents = true AND ap.email ILIKE '%' || auth.email() || '%')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_documents = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "clerical_documents_delete_authorized"
  ON public.clerical_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_documents = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

-- ─── 5. Kiểm tra kết quả ───
-- 5a. Policy trên bảng (phải đúng 4 dòng authorized như trên)
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'clerical_documents'
ORDER BY cmd;

-- 5b. Ai đang có quyền Văn Thư
SELECT email, name, can_view_documents FROM public.approval_permissions WHERE can_view_documents = true;

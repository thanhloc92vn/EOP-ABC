-- Siết quyền bảng NHU CẦU TUYỂN DỤNG (recruitment_needs) theo CÙNG cờ
-- can_view_candidates đã dùng cho bảng candidates (file
-- supabase_schema_candidates_access_control.sql — đã chạy trước đó).
--
-- Lý do: bảng candidates đã khoá nhưng recruitment_needs vẫn mở cho mọi tài khoản
-- đăng nhập — nhân viên phòng ban khác vẫn xem/sửa được số lượng cần tuyển từng
-- bộ phận (lộ kế hoạch nhân sự). Trang /recruitment giờ cũng chặn UI theo cờ này.
--
-- Ai đang có cờ can_view_candidates (Hoa Đào, Thùy Quyên, Khánh Linh + Admin) sẽ
-- dùng được cả 2 bảng — KHÔNG cần cấp lại quyền.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.
-- An toàn khi chạy lại nhiều lần (idempotent).

-- ─── 1. Bật RLS + xoá TOÀN BỘ policy cũ (quét động, không đoán tên) ───
ALTER TABLE public.recruitment_needs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recruitment_needs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.recruitment_needs;', pol.policyname);
  END LOOP;
END $$;

-- ─── 2. Dựng lại policy: CHỈ Admin + cờ can_view_candidates ───
CREATE POLICY "recruitment_needs_select_authorized"
  ON public.recruitment_needs FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "recruitment_needs_insert_authorized"
  ON public.recruitment_needs FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "recruitment_needs_update_authorized"
  ON public.recruitment_needs FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

CREATE POLICY "recruitment_needs_delete_authorized"
  ON public.recruitment_needs FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_candidates = true AND ap.email ILIKE '%' || auth.email() || '%')
  );

-- ─── 3. Kiểm tra kết quả ───
-- 3a. Policy trên bảng (phải đúng 4 dòng authorized như trên)
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'recruitment_needs'
ORDER BY cmd;

-- 3b. Ai đang có quyền Tuyển dụng
SELECT email, name, can_view_candidates FROM public.approval_permissions WHERE can_view_candidates = true;

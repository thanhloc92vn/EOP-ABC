-- ============================================================
-- MỞ QUYỀN "CHỦ SỞ HỮU" CHO BẢNG invoices
--
-- Bối cảnh: nhân viên phòng ban khác (không thuộc HCNS) được phép DÙNG công cụ
-- "Hồ sơ thanh toán định kỳ / thanh toán nhanh" trong trang Hành chính để TẠO
-- phiếu thanh toán (INSERT vốn đã mở cho mọi tài khoản đăng nhập). Yêu cầu mới:
-- sau khi tạo, họ phải XEM / SỬA / XOÁ được ĐÚNG những phiếu DO CHÍNH HỌ tạo —
-- và tuyệt đối không thấy phiếu của người khác hay của toàn phòng HCNS.
--
-- Cách làm: gắn cột created_by (email người tạo) vào invoices, rồi mở rộng các
-- policy SELECT/UPDATE/DELETE để CHỦ SỞ HỮU (created_by = auth.email()) được thao
-- tác trên dòng của mình, BÊN CẠNH Admin + người có cờ can_view_invoices (HCNS).
--
-- Đây là lớp bảo vệ THẬT SỰ ở database (RLS), không chỉ ẩn ở giao diện.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.
-- An toàn khi chạy lại nhiều lần (idempotent).
-- ============================================================

-- ─── 1. Thêm cột người tạo (idempotent) ───
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Index giúp lọc nhanh phiếu theo người tạo
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by);

-- ─── 2. Bật RLS (idempotent) ───
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- ─── 3. Xoá TOÀN BỘ policy cũ trên invoices trước khi dựng lại whitelist ───
-- (không đoán tên policy cũ — quét động pg_policies để tránh sót "Allow public …",
--  "Allow authenticated …", "Allow authorized viewers …" từ các lần cấu hình trước)
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'invoices'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.invoices;', pol.policyname);
  END LOOP;
END $$;

-- ─── 4. Dựng lại policy sạch ───

-- 4a. INSERT: giữ MỞ cho mọi tài khoản đã đăng nhập — bắt buộc để công cụ tạo phiếu
--     / trích xuất hoá đơn bằng AI vẫn hoạt động cho nhân viên phòng ban khác.
CREATE POLICY "invoices_insert_authenticated"
  ON public.invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4b. SELECT: Admin + HCNS (can_view_invoices) thấy tất cả; ngoài ra CHỦ SỞ HỮU
--     thấy đúng phiếu của mình.
CREATE POLICY "invoices_select_owner_or_hcns"
  ON public.invoices FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_invoices = true AND ap.email ILIKE '%' || auth.email() || '%')
    OR (created_by IS NOT NULL AND created_by ILIKE auth.email())
  );

-- 4c. UPDATE: Admin + HCNS toàn quyền; chủ sở hữu sửa được phiếu của mình
--     (WITH CHECK chặn việc "chuyển" phiếu sang created_by của người khác).
CREATE POLICY "invoices_update_owner_or_hcns"
  ON public.invoices FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_invoices = true AND ap.email ILIKE '%' || auth.email() || '%')
    OR (created_by IS NOT NULL AND created_by ILIKE auth.email())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_invoices = true AND ap.email ILIKE '%' || auth.email() || '%')
    OR (created_by IS NOT NULL AND created_by ILIKE auth.email())
  );

-- 4d. DELETE: Admin + HCNS toàn quyền; chủ sở hữu xoá được phiếu của mình
CREATE POLICY "invoices_delete_owner_or_hcns"
  ON public.invoices FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.allowed_users au WHERE au.role = 'Admin' AND au.email ILIKE auth.email())
    OR EXISTS (SELECT 1 FROM public.approval_permissions ap WHERE ap.can_view_invoices = true AND ap.email ILIKE '%' || auth.email() || '%')
    OR (created_by IS NOT NULL AND created_by ILIKE auth.email())
  );

-- ─── 5. Kiểm tra kết quả ───
-- 5a. Danh sách policy hiện tại trên invoices (phải đúng 4 dòng như trên)
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'invoices'
ORDER BY cmd;

-- 5b. Các phiếu HD-DK cũ chưa có created_by (thuộc HCNS, HCNS vẫn thấy hết) — chỉ để tham khảo
-- SELECT count(*) AS phieu_chua_gan_nguoi_tao FROM public.invoices WHERE created_by IS NULL;

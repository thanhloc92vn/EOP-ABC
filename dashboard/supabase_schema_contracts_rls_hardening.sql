-- ============================================================================
-- VÁ BẢO MẬT RLS CHO BẢNG contracts (Hợp đồng lao động + Lương)
-- ----------------------------------------------------------------------------
-- VẤN ĐỀ: Policy hiện tại là USING (true) cho cả anon → BẤT KỲ AI có anon key
-- (nằm công khai trong mã nguồn frontend) đều đọc được toàn bộ lương CBNV
-- qua Supabase REST API, không cần đăng nhập.
--
-- CÁCH CHẠY: Supabase Dashboard → SQL Editor → New Query → dán và Run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PHƯƠNG ÁN A (ÁP DỤNG NGAY — an toàn với app hiện tại):
-- Chỉ người dùng ĐÃ ĐĂNG NHẬP (authenticated) mới đọc/ghi được contracts.
-- Chặn hoàn toàn truy cập ẩn danh từ internet. Trang C&B và Tìm kiếm AI
-- vẫn hoạt động bình thường vì đều gửi token đăng nhập.
-- ---------------------------------------------------------------------------
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select for contracts" ON public.contracts;
CREATE POLICY "Allow authenticated select for contracts" ON public.contracts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow public insert for contracts" ON public.contracts;
CREATE POLICY "Allow authenticated insert for contracts" ON public.contracts
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for contracts" ON public.contracts;
CREATE POLICY "Allow authenticated update for contracts" ON public.contracts
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow public delete for contracts" ON public.contracts;
CREATE POLICY "Allow authenticated delete for contracts" ON public.contracts
  FOR DELETE TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- PHƯƠNG ÁN B (CHẶT CHẼ HƠN — cân nhắc áp dụng sau):
-- Chỉ danh sách email được cấp quyền C&B mới đọc được contracts ở tầng DB.
-- LƯU Ý: cần liệt kê ĐỦ email của những người dùng trang C&B (Admin, TP.HCNS,
-- CV Nhân sự, Ban Giám đốc...) — thiếu ai thì người đó mất dữ liệu trang C&B.
-- Bỏ comment và điền email thật trước khi chạy.
-- ---------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "Allow authenticated select for contracts" ON public.contracts;
-- CREATE POLICY "Allow salary team select for contracts" ON public.contracts
--   FOR SELECT TO authenticated
--   USING (
--     lower(auth.jwt() ->> 'email') IN (
--       'lehoadao2706@gmail.com'
--       -- , 'email-admin@congty.com'
--       -- , 'email-huynh-giap-nhan@congty.com'
--       -- , ...
--     )
--     OR EXISTS (
--       SELECT 1 FROM public.allowed_users au
--       WHERE lower(au.email) = lower(auth.jwt() ->> 'email') AND au.role = 'Admin'
--     )
--   );

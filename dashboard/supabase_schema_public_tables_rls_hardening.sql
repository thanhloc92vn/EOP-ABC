-- ============================================================================
-- VÁ BẢO MẬT: "Table publicly accessible" (rls_disabled_in_public) — Supabase Advisor
-- ----------------------------------------------------------------------------
-- VẤN ĐỀ: 9 bảng dưới đây đang có RLS TẮT (DISABLE ROW LEVEL SECURITY) kèm
-- policy USING (true). Khi RLS tắt, Postgres BỎ QUA policy hoàn toàn — nghĩa là
-- BẤT KỲ AI có project URL + anon key (nằm công khai trong bundle JS frontend)
-- đều đọc/sửa/xoá được toàn bộ dữ liệu qua Supabase REST API, không cần đăng
-- nhập, không cần qua giao diện web. Ảnh hưởng nặng nhất: invoices (số TK ngân
-- hàng thụ hưởng), suppliers (số TK ngân hàng NCC).
--
-- CÁCH VÁ: Bật lại RLS + giới hạn policy chỉ cho role "authenticated" (giống
-- pattern đã áp dụng cho bảng contracts ở supabase_schema_contracts_rls_hardening.sql).
-- Toàn bộ trang trong app (trừ /gop-y) đều nằm sau AuthWrapper (bắt đăng nhập
-- Google), và API ai-search cũng forward token đăng nhập của người dùng —
-- nên đổi sang "authenticated" KHÔNG làm hỏng chức năng hiện tại.
--
-- RIÊNG bảng "suggestions": trang /gop-y là route công khai (không đăng nhập)
-- cho phép nhân viên góp ý ẩn danh, chỉ thực hiện INSERT. Vì vậy suggestions
-- vẫn cho phép "anon" INSERT, còn SELECT/UPDATE/DELETE (trang quản trị góp ý)
-- thì giới hạn "authenticated".
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor -> New Query -> dán và Run.
-- ============================================================================

-- 1. invoices (có bank_account, beneficiary_name)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow public insert for invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow public update for invoices" ON public.invoices;
DROP POLICY IF EXISTS "Allow public delete for invoices" ON public.invoices;
CREATE POLICY "Allow authenticated select for invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert for invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for invoices" ON public.invoices FOR DELETE TO authenticated USING (true);

-- 2. suppliers (có account, bank)
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow public insert for suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow public update for suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Allow public delete for suppliers" ON public.suppliers;
CREATE POLICY "Allow authenticated select for suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert for suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for suppliers" ON public.suppliers FOR DELETE TO authenticated USING (true);

-- 3. admin_monthly_reports
ALTER TABLE public.admin_monthly_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for admin_monthly_reports" ON public.admin_monthly_reports;
DROP POLICY IF EXISTS "Allow public insert for admin_monthly_reports" ON public.admin_monthly_reports;
DROP POLICY IF EXISTS "Allow public update for admin_monthly_reports" ON public.admin_monthly_reports;
DROP POLICY IF EXISTS "Allow public delete for admin_monthly_reports" ON public.admin_monthly_reports;
CREATE POLICY "Allow authenticated select for admin_monthly_reports" ON public.admin_monthly_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert for admin_monthly_reports" ON public.admin_monthly_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for admin_monthly_reports" ON public.admin_monthly_reports FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for admin_monthly_reports" ON public.admin_monthly_reports FOR DELETE TO authenticated USING (true);

-- 4. meetings
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for meetings" ON public.meetings;
DROP POLICY IF EXISTS "Allow public insert for meetings" ON public.meetings;
DROP POLICY IF EXISTS "Allow public update for meetings" ON public.meetings;
DROP POLICY IF EXISTS "Allow public delete for meetings" ON public.meetings;
CREATE POLICY "Allow authenticated select for meetings" ON public.meetings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert for meetings" ON public.meetings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for meetings" ON public.meetings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for meetings" ON public.meetings FOR DELETE TO authenticated USING (true);

-- 5. business_trips
ALTER TABLE public.business_trips ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for business_trips" ON public.business_trips;
DROP POLICY IF EXISTS "Allow public insert for business_trips" ON public.business_trips;
DROP POLICY IF EXISTS "Allow public update for business_trips" ON public.business_trips;
DROP POLICY IF EXISTS "Allow public delete for business_trips" ON public.business_trips;
CREATE POLICY "Allow authenticated select for business_trips" ON public.business_trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert for business_trips" ON public.business_trips FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for business_trips" ON public.business_trips FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for business_trips" ON public.business_trips FOR DELETE TO authenticated USING (true);

-- 6. attendance_justifications
ALTER TABLE public.attendance_justifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for attendance_justifications" ON public.attendance_justifications;
DROP POLICY IF EXISTS "Allow public insert for attendance_justifications" ON public.attendance_justifications;
DROP POLICY IF EXISTS "Allow public update for attendance_justifications" ON public.attendance_justifications;
DROP POLICY IF EXISTS "Allow public delete for attendance_justifications" ON public.attendance_justifications;
CREATE POLICY "Allow authenticated select for attendance_justifications" ON public.attendance_justifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert for attendance_justifications" ON public.attendance_justifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for attendance_justifications" ON public.attendance_justifications FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for attendance_justifications" ON public.attendance_justifications FOR DELETE TO authenticated USING (true);

-- 7. resource_bookings (đăng ký xe / phòng họp)
ALTER TABLE public.resource_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for resource_bookings" ON public.resource_bookings;
DROP POLICY IF EXISTS "Allow public insert for resource_bookings" ON public.resource_bookings;
DROP POLICY IF EXISTS "Allow public update for resource_bookings" ON public.resource_bookings;
DROP POLICY IF EXISTS "Allow public delete for resource_bookings" ON public.resource_bookings;
CREATE POLICY "Allow authenticated select for resource_bookings" ON public.resource_bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert for resource_bookings" ON public.resource_bookings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for resource_bookings" ON public.resource_bookings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for resource_bookings" ON public.resource_bookings FOR DELETE TO authenticated USING (true);

-- 8. clerical_documents (văn thư)
ALTER TABLE public.clerical_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for clerical_documents" ON public.clerical_documents;
DROP POLICY IF EXISTS "Allow public insert for clerical_documents" ON public.clerical_documents;
DROP POLICY IF EXISTS "Allow public update for clerical_documents" ON public.clerical_documents;
DROP POLICY IF EXISTS "Allow public delete for clerical_documents" ON public.clerical_documents;
CREATE POLICY "Allow authenticated select for clerical_documents" ON public.clerical_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert for clerical_documents" ON public.clerical_documents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for clerical_documents" ON public.clerical_documents FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for clerical_documents" ON public.clerical_documents FOR DELETE TO authenticated USING (true);

-- 9. suggestions (góp ý) — GIỮ INSERT mở cho anon vì trang /gop-y là route công khai,
--    không bắt đăng nhập, chỉ thực hiện INSERT. SELECT/UPDATE/DELETE (trang quản trị
--    góp ý tại /suggestions) giới hạn authenticated.
ALTER TABLE public.suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public select for suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Allow public insert for suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Allow public update for suggestions" ON public.suggestions;
DROP POLICY IF EXISTS "Allow public delete for suggestions" ON public.suggestions;
CREATE POLICY "Allow authenticated select for suggestions" ON public.suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow anon insert for suggestions" ON public.suggestions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update for suggestions" ON public.suggestions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete for suggestions" ON public.suggestions FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- SAU KHI CHẠY: vào Supabase Dashboard -> Advisors -> Security để xác nhận
-- 9 cảnh báo "rls_disabled_in_public" đã biến mất.
-- ============================================================================
